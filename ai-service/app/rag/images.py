"""定制特调：调用千问图像生图，再写入 MinIO。"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Callable, Awaitable

import httpx

from app.config import IMAGE_API_KEY, IMAGE_BASE_URL, IMAGE_MODEL
from app.core.storage import upload_bytes

logger = logging.getLogger(__name__)

# 北京 DashScope 原生（文生图）
DASHSCOPE_NATIVE_CN = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)
# 国际站兜底
DASHSCOPE_NATIVE_INTL = (
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)

# 若配置模型不可用，按序尝试
_FALLBACK_MODELS = (
    "qwen-image-2.1-pro",
    "qwen-image-2.1-turbo",
    "qwen-image-2.0-pro",
    "qwen-image-plus",
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


def _models_to_try() -> list[str]:
    primary = (IMAGE_MODEL or "").strip()
    out: list[str] = []
    if primary:
        out.append(primary)
    for m in _FALLBACK_MODELS:
        if m not in out:
            out.append(m)
    return out


def _extract_remote_url(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if isinstance(data, list) and data:
        item = data[0] if isinstance(data[0], dict) else {}
        if item.get("url"):
            return item["url"]
        if item.get("b64_json"):
            return f"b64:{item['b64_json']}"
        # OpenAI 兼容偶发 image_url 字段
        image_url = item.get("image_url")
        if isinstance(image_url, dict) and image_url.get("url"):
            return image_url["url"]
        if isinstance(image_url, str) and image_url.startswith("http"):
            return image_url

    output = payload.get("output") or {}
    choices = output.get("choices") or []
    if choices:
        content = ((choices[0] or {}).get("message") or {}).get("content")
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("image"):
                    return part["image"]
                if part.get("image_url"):
                    url = part["image_url"]
                    if isinstance(url, dict):
                        return url.get("url")
                    if isinstance(url, str):
                        return url
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


async def _openai_compatible(
    client: httpx.AsyncClient,
    prompt: str,
    model: str,
) -> httpx.Response:
    url = f"{IMAGE_BASE_URL.rstrip('/')}/images/generations"
    return await client.post(
        url,
        headers={
            "Authorization": f"Bearer {IMAGE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "prompt": prompt,
            "size": "1024x1024",
            "n": 1,
            "prompt_extend": True,
            "watermark": False,
        },
    )


async def _dashscope_native(
    client: httpx.AsyncClient,
    prompt: str,
    model: str,
    endpoint: str,
) -> httpx.Response:
    # qwen-image-2.1 不支持 negative_prompt
    params: dict[str, Any] = {
        "prompt_extend": True,
        "watermark": False,
        "size": "1024*1024",
        "n": 1,
    }
    return await client.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {IMAGE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": {"messages": [{"role": "user", "content": [{"text": prompt}]}]},
            "parameters": params,
        },
    )


def _http_error_message(label: str, response: httpx.Response) -> str:
    text = (response.text or "").strip()
    code = ""
    message = text[:240] if text else "空响应"
    try:
        payload = response.json()
        if isinstance(payload, dict):
            code = str(
                payload.get("code")
                or (payload.get("error") or {}).get("code")
                or ""
            )
            message = str(
                payload.get("message")
                or (payload.get("error") or {}).get("message")
                or message
            )
    except ValueError:
        pass
    if code in {"Arrearage", "QuotaExceeded", "PrepaidBillOverdue"}:
        return f"{label}: 通义生图账号欠费或余额不足，请到阿里云百炼充值后再试"
    if code in {"InvalidApiKey", "InvalidApiKey.NotFound"}:
        return f"{label}: API Key 无效，请检查 IMAGE_API_KEY"
    if code in {"ModelNotExist", "InvalidModel", "InvalidParameter.ModelNotExist"}:
        return f"{label}: 模型不可用 ({code}: {message})"
    if code:
        return f"{label}: {code}: {message}"
    return f"{label}: HTTP {response.status_code}: {message}"


async def _try_once(
    client: httpx.AsyncClient,
    label: str,
    caller: Callable[[], Awaitable[httpx.Response]],
    errors: list[str],
) -> bytes | None:
    try:
        response = await caller()
    except httpx.HTTPError as exc:
        errors.append(f"{label}: 网络错误 {exc}")
        return None

    if response.status_code >= 400:
        msg = _http_error_message(label, response)
        errors.append(msg)
        try:
            payload = response.json()
            code = str(payload.get("code") or "")
        except ValueError:
            code = ""
        if code in {
            "Arrearage",
            "QuotaExceeded",
            "PrepaidBillOverdue",
            "InvalidApiKey",
            "InvalidApiKey.NotFound",
        }:
            raise RuntimeError(msg)
        return None

    try:
        payload = response.json()
    except ValueError:
        errors.append(f"{label}: 响应不是 JSON")
        return None

    if not isinstance(payload, dict):
        errors.append(f"{label}: 响应格式异常")
        return None

    if payload.get("code") and payload.get("message"):
        errors.append(f"{label}: {payload.get('code')}: {payload.get('message')}")
        return None

    if payload.get("error"):
        err = payload["error"]
        if isinstance(err, dict):
            errors.append(f"{label}: {err.get('message') or err}")
        else:
            errors.append(f"{label}: {err}")
        return None

    remote = _extract_remote_url(payload)
    if not remote:
        errors.append(f"{label}: 响应里没有图片地址")
        logger.warning("image response without url: %s", str(payload)[:500])
        return None

    raw = await _download_bytes(client, remote)
    if not raw:
        errors.append(f"{label}: 下载生成图失败")
        return None
    return raw


async def _fetch_image(prompt: str) -> bytes | None:
    """
    依次尝试：北京原生 → 国际原生 → OpenAI 兼容。
    每个入口再按模型列表回退。
    """
    if not IMAGE_API_KEY:
        raise RuntimeError("未配置 IMAGE_API_KEY")

    timeout = httpx.Timeout(180.0, connect=20.0)
    errors: list[str] = []
    models = _models_to_try()

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for model in models:
            # 1) 北京原生
            raw = await _try_once(
                client,
                f"native-cn/{model}",
                lambda m=model: _dashscope_native(client, prompt, m, DASHSCOPE_NATIVE_CN),
                errors,
            )
            if raw:
                return raw

            # 2) 国际原生
            raw = await _try_once(
                client,
                f"native-intl/{model}",
                lambda m=model: _dashscope_native(client, prompt, m, DASHSCOPE_NATIVE_INTL),
                errors,
            )
            if raw:
                return raw

            # 3) OpenAI 兼容（部分地域/模型支持）
            raw = await _try_once(
                client,
                f"compatible/{model}",
                lambda m=model: _openai_compatible(client, prompt, m),
                errors,
            )
            if raw:
                return raw

    detail = " | ".join(errors[-6:]) if errors else "未知错误"
    logger.error("workbench image all attempts failed: %s", detail)
    raise RuntimeError(f"生图失败: {detail}")
