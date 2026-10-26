"""酒瓶拍照识别：调用多模态接口，返回供 Java 匹配 kb_ingredient 的 labels。

当前默认 VISION_MODEL=qwen-mt-uni（全模态翻译）：
  请求需 fileUrl + target_lang；图片结果是译后图 URL，没有品牌文字。
酒瓶识别需要视觉理解模型（如 qwen3-vl-plus）；若配置为 *-vl* / 含 vl 的模型名，
走 messages + 图像理解提示词。
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import time
from typing import Any

import httpx

from app.config import IMAGE_API_KEY, IMAGE_BASE_URL, VISION_MODEL
from app.core.storage import upload_bytes

logger = logging.getLogger(__name__)

DASHSCOPE_NATIVE = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)

_SYSTEM = (
    "你是酒类与调酒材料识别助手。根据照片识别画面中出现的酒/基酒/利口酒/糖浆等材料。"
    "只输出 JSON，不要 markdown。"
)

_USER = """请识别图中所有可见的酒瓶或调酒材料。
对每一项给出：
- name: 中文名（品牌+品名，尽量具体，如「孟买蓝宝石金酒」）
- name_en: 英文品牌/品名（如有）
- confidence: 0~1 的置信度

只返回 JSON 对象：
{"labels":[{"name":"...","name_en":"...","confidence":0.9}]}

若无法识别，返回 {"labels":[]}。不要编造看不清的品牌。"""


def _guess_mime(filename: str | None, content_type: str | None) -> str:
    if content_type and content_type.startswith("image/"):
        return content_type
    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _parse_labels(text: str) -> list[dict[str, Any]]:
    raw = (text or "").strip()
    if not raw:
        return []
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return []
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return []

    labels = data.get("labels") if isinstance(data, dict) else None
    if not isinstance(labels, list):
        return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in labels:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        name_en = str(item.get("name_en") or item.get("nameEn") or "").strip()
        if not name and not name_en:
            continue
        key = f"{name_en.lower()}|{name.lower()}"
        if key in seen:
            continue
        seen.add(key)
        conf = item.get("confidence")
        try:
            confidence = float(conf) if conf is not None else 0.7
        except (TypeError, ValueError):
            confidence = 0.7
        out.append(
            {
                "name": name,
                "name_en": name_en,
                "confidence": max(0.0, min(1.0, confidence)),
            }
        )
    return out


def _extract_vl_text(body: dict[str, Any]) -> str:
    choices = body.get("choices")
    if not choices and isinstance(body.get("output"), dict):
        choices = body["output"].get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        return "\n".join(
            str(part.get("text") or "")
            for part in content
            if isinstance(part, dict)
        )
    if isinstance(content, str):
        return content
    return str(content or "")


def _http_error_detail(response: httpx.Response) -> str:
    text = (response.text or "").strip()
    try:
        payload = response.json()
        if isinstance(payload, dict):
            code = str(payload.get("code") or (payload.get("error") or {}).get("code") or "")
            message = str(
                payload.get("message")
                or (payload.get("error") or {}).get("message")
                or text[:240]
                or "空响应"
            )
            return f"{code}: {message}" if code else message
    except ValueError:
        pass
    return text[:240] or f"HTTP {response.status_code}"


def _is_mt_uni(model: str) -> bool:
    return "mt-uni" in model.lower() or model.lower() == "qwen-mt-uni"


async def _recognize_mt_uni(
    client: httpx.AsyncClient,
    *,
    image_bytes: bytes,
    mime: str,
    model: str,
) -> list[dict[str, Any]]:
    """qwen-mt-uni：fileUrl + target_lang（必填）。"""
    digest = hashlib.sha256(image_bytes).hexdigest()[:16]
    ext = "png" if "png" in mime else "jpg"
    object_key = f"recognize/{int(time.time())}-{digest}.{ext}"
    file_url = upload_bytes(object_key, image_bytes, mime)

    response = await client.post(
        DASHSCOPE_NATIVE,
        headers={
            "Authorization": f"Bearer {IMAGE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": {
                "fileUrl": file_url,
                "target_lang": "zh",
                "ext": {
                    "domainHint": (
                        "Liquor bottle labels. Translate brand and product names clearly."
                    ),
                    "format_hint": "image",
                },
            },
        },
    )
    if response.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"识图服务失败: {_http_error_detail(response)}",
            request=response.request,
            response=response,
        )

    body = response.json()
    if isinstance(body.get("code"), str) and body.get("code"):
        raise RuntimeError(f"识图服务失败: {body.get('code')}: {body.get('message')}")

    output = body.get("output") or {}
    if output.get("Success") is False:
        raise RuntimeError(f"识图服务失败: {output.get('Code')}: {output.get('Message')}")

    data = output.get("Data") or {}
    texts = data.get("TranslatedTexts")
    if isinstance(texts, str) and texts.strip():
        return _parse_labels(texts)
    if isinstance(texts, list):
        joined = "\n".join(str(t) for t in texts if t)
        if joined.strip():
            return _parse_labels(joined)

    # 图片翻译只有译后图，没有品牌 JSON
    raise RuntimeError(
        "qwen-mt-uni 是翻译模型，图片只返回译后图，无法识别酒瓶品牌。"
        "请把 .env 里 VISION_MODEL 改为 qwen3-vl-plus"
    )


async def _recognize_vl(
    client: httpx.AsyncClient,
    *,
    image_bytes: bytes,
    mime: str,
    model: str,
) -> list[dict[str, Any]]:
    """视觉理解：原生 messages 优先，失败再试 OpenAI 兼容。"""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    native_payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": data_url},
                        {"text": f"{_SYSTEM}\n\n{_USER}"},
                    ],
                }
            ]
        },
    }
    compatible_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": _USER},
                ],
            },
        ],
        "temperature": 0.1,
    }

    last_error: Exception | None = None
    calls: list[tuple[str, str, dict[str, Any]]] = [
        (DASHSCOPE_NATIVE, "native", native_payload),
        (f"{IMAGE_BASE_URL.rstrip('/')}/chat/completions", "compatible", compatible_payload),
    ]
    for url, name, payload in calls:
        try:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {IMAGE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.HTTPError as exc:
            last_error = exc
            logger.warning("vision %s network error: %s", name, exc)
            continue
        if response.status_code >= 400:
            detail = _http_error_detail(response)
            last_error = httpx.HTTPStatusError(
                f"识图服务失败: {detail}",
                request=response.request,
                response=response,
            )
            logger.warning("vision %s HTTP %s: %s", name, response.status_code, detail)
            continue
        return _parse_labels(_extract_vl_text(response.json()))

    if last_error:
        raise last_error
    raise RuntimeError("识图失败：无可用上游")


async def recognize_bottle_labels(
    image_bytes: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> list[dict[str, Any]]:
    if not IMAGE_API_KEY:
        raise RuntimeError("未配置 IMAGE_API_KEY，无法识图")
    if not image_bytes:
        raise ValueError("空图片")

    mime = _guess_mime(filename, content_type)
    model = (VISION_MODEL or "qwen3.8-omni-flash").strip()

    async with httpx.AsyncClient(timeout=120.0) as client:
        if _is_mt_uni(model):
            return await _recognize_mt_uni(
                client, image_bytes=image_bytes, mime=mime, model=model
            )
        return await _recognize_vl(
            client, image_bytes=image_bytes, mime=mime, model=model
        )
