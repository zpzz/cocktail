"""定制特调：调用 qwen-image-2.1-pro 生图，再写入 MinIO。"""

from __future__ import annotations

import hashlib
import re
from typing import Any

import httpx

from app.config import IMAGE_API_KEY, IMAGE_BASE_URL, IMAGE_MODEL
from app.core.storage import upload_bytes

DASHSCOPE_NATIVE = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)


def image_prompt_from_recipe(answer: str) -> str:
    compact = re.sub(r"\s+", " ", answer).strip()[:400]
    return (
        "Photorealistic cocktail photography, dark luxury bar counter, "
        "soft rim light, condensation on glass, no text, no watermark, "
        f"appetizing custom cocktail: {compact}"
    )


def image_object_key(session_id: str, prompt: str) -> str:
    digest = hashlib.sha256(f"{session_id}:{prompt}".encode()).hexdigest()[:16]
    return f"custom/{digest}"


async def generate_cocktail_image(prompt: str, object_key: str) -> str | None:
    raw = await _fetch_image(prompt)
    if not raw:
        return None
    content_type = "image/jpeg" if raw[:3] == b"\xff\xd8\xff" else "image/png"
    suffix = "jpg" if "jpeg" in content_type else "png"
    if not object_key.endswith((".jpg", ".png", ".webp")):
        object_key = f"{object_key}.{suffix}"
    return upload_bytes(object_key, raw, content_type)


def _extract_remote_url(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if isinstance(data, list) and data:
        item = data[0] if isinstance(data[0], dict) else {}
        if item.get("url"):
            return item["url"]
        if item.get("b64_json"):
            return f"b64:{item['b64_json']}"
    output = payload.get("output") or {}
    choices = output.get("choices") or []
    if choices:
        content = ((choices[0] or {}).get("message") or {}).get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("image"):
                    return part["image"]
        if isinstance(content, str) and content.startswith("http"):
            return content
    results = output.get("results") or payload.get("results") or []
    if results and isinstance(results[0], dict):
        return results[0].get("url") or results[0].get("image")
    return None


async def _download_bytes(client: httpx.AsyncClient, spec: str) -> bytes | None:
    if spec.startswith("b64:"):
        import base64

        return base64.b64decode(spec[4:])
    response = await client.get(spec)
    response.raise_for_status()
    if not response.content or len(response.content) < 1024:
        return None
    return response.content


async def _openai_compatible(client: httpx.AsyncClient, prompt: str) -> httpx.Response:
    url = f"{IMAGE_BASE_URL.rstrip('/')}/images/generations"
    return await client.post(
        url,
        headers={"Authorization": f"Bearer {IMAGE_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": IMAGE_MODEL or "qwen-image-2.1-pro",
            "prompt": prompt,
            "size": "1024x1024",
            "n": 1,
            "prompt_extend": True,
        },
    )


async def _dashscope_native(client: httpx.AsyncClient, prompt: str) -> httpx.Response:
    return await client.post(
        DASHSCOPE_NATIVE,
        headers={"Authorization": f"Bearer {IMAGE_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": IMAGE_MODEL or "qwen-image-2.1-pro",
            "input": {"messages": [{"role": "user", "content": [{"text": prompt}]}]},
            "parameters": {"prompt_extend": True, "size": "1024*1024", "n": 1},
        },
    )


def _http_error_message(response: httpx.Response) -> str:
    text = (response.text or "").strip()
    code = ""
    message = text[:240] if text else "空响应"
    try:
        payload = response.json()
        if isinstance(payload, dict):
            code = str(payload.get("code") or (payload.get("error") or {}).get("code") or "")
            message = str(
                payload.get("message")
                or (payload.get("error") or {}).get("message")
                or message
            )
    except ValueError:
        pass
    if code in {"Arrearage", "QuotaExceeded", "PrepaidBillOverdue"}:
        return "通义生图账号欠费或余额不足，请到阿里云百炼充值后再试"
    if code:
        return f"{code}: {message}"
    if response.status_code == 404 and not text:
        return "生图兼容接口 404（可忽略，已改走 DashScope 原生接口）"
    return f"生图 HTTP {response.status_code}: {message}"


async def _fetch_image(prompt: str) -> bytes | None:
    """先打百炼北京原生接口（免费额度只在该地域），404 再试 OpenAI 兼容 /images/generations。"""
    if not IMAGE_API_KEY:
        raise RuntimeError("未配置 IMAGE_API_KEY")
    timeout = httpx.Timeout(180.0, connect=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        last_error: Exception | None = None
        for caller in (_dashscope_native, _openai_compatible):
            try:
                response = await caller(client, prompt)
            except httpx.HTTPError as exc:
                last_error = exc
                continue
            if response.status_code >= 400:
                last_error = RuntimeError(_http_error_message(response))
                try:
                    payload = response.json()
                    code = str(payload.get("code") or "")
                except ValueError:
                    code = ""
                if code in {"Arrearage", "QuotaExceeded", "PrepaidBillOverdue", "InvalidApiKey"}:
                    raise last_error
                continue
            payload = response.json()
            if payload.get("error"):
                err = payload["error"]
                last_error = RuntimeError(err.get("message") or str(err))
                continue
            remote = _extract_remote_url(payload)
            if not remote:
                last_error = RuntimeError("生图响应里没有图片地址")
                continue
            raw = await _download_bytes(client, remote)
            if raw:
                return raw
            last_error = RuntimeError("下载生成图失败")
        raise last_error or RuntimeError("生图失败")
