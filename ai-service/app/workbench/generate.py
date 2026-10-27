"""特调生成：LLM 结构化配方 + 生图，SSE 推送。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, IMAGE_API_KEY
from app.rag.images import generate_cocktail_image, image_object_key, image_prompt_from_recipe

logger = logging.getLogger(__name__)

_SYSTEM = """你是鸡尾酒特调师。根据用户已选的杯型、材料用量、技法、冰、装饰和期望感觉，创作一杯新特调。
必须只输出一个 JSON 对象，不要 markdown，不要其它说明。字段如下：
{
  "name": "中文酒名",
  "name_en": "English Name",
  "glass": "杯型编码或中文名",
  "method": "build|stir|shake|layer",
  "ice_type": "none|less|standard|crushed|large",
  "garnishes": ["装饰编码或名称"],
  "feeling": "一句话感觉",
  "flavor_summary": "风味摘要（一两句，给详情页描述用）",
  "abv_range": "约 12%",
  "difficulty": "简单|中等|进阶",
  "taste": "清爽酸甜等口感标签，四字左右",
  "flavor_profile": {
    "sweetness": 0.0,
    "alcohol": 0.0,
    "sourness": 0.0,
    "aroma": 0.0,
    "energy": 0.0,
    "difficulty": 0.0
  },
  "ingredients": [{"name":"材料名","amount":45,"unit":"ml"}],
  "steps": [{"order":1,"text":"步骤说明","duration_sec":null}],
  "instructions": "把步骤连成的完整做法文案"
}
规则：
- ingredients 优先使用用户已给的材料与用量，可微调但不要删光已选料
- steps 3~6 步，可操作
- 酒名要雅致，不要照搬某款经典名
- flavor_profile 六维取值 0~1，反映真实倾向，不要全是 0.5
"""

_PROFILE_KEYS = ("sweetness", "alcohol", "sourness", "aroma", "energy", "difficulty")

_METHOD_DIFFICULTY = {
    "build": "简单",
    "stir": "简单",
    "shake": "中等",
    "layer": "进阶",
}


def _clamp01(v: Any, default: float = 0.35) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, x))


def _normalize_profile(raw: Any, method: str) -> dict[str, float]:
    base_diff = {"build": 0.3, "stir": 0.4, "shake": 0.55, "layer": 0.85}.get(method, 0.45)
    fallback = {
        "sweetness": 0.4,
        "alcohol": 0.5,
        "sourness": 0.35,
        "aroma": 0.4,
        "energy": 0.45,
        "difficulty": base_diff,
    }
    if not isinstance(raw, dict):
        return {k: round(fallback[k], 2) for k in _PROFILE_KEYS}
    out = dict(fallback)
    for key in _PROFILE_KEYS:
        if key in raw:
            out[key] = round(_clamp01(raw[key], fallback[key]), 2)
    return out


def _fallback_abv(ingredients: list[Any]) -> str:
    vol = 0.0
    for row in ingredients:
        if isinstance(row, dict) and row.get("amount") is not None:
            try:
                vol += float(row["amount"])
            except (TypeError, ValueError):
                pass
    if vol <= 0:
        return "约 15%"
    if vol < 90:
        return "约 22%"
    if vol < 160:
        return "约 15%"
    return "约 10%"


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        data = json.loads(match.group(0))
        if isinstance(data, dict):
            return data
    raise ValueError("模型未返回有效 JSON 配方")


def _normalize_recipe(data: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    ingredients = data.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        ingredients = []
        for row in payload.get("ingredients") or []:
            if isinstance(row, dict):
                ingredients.append({
                    "name": row.get("name") or "",
                    "amount": float(row["amount"]) if row.get("amount") is not None else None,
                    "unit": row.get("unit") or "ml",
                })

    steps = data.get("steps")
    if not isinstance(steps, list):
        steps = []
    norm_steps = []
    for i, step in enumerate(steps, start=1):
        if isinstance(step, str):
            norm_steps.append({"order": i, "text": step, "duration_sec": None})
        elif isinstance(step, dict):
            norm_steps.append({
                "order": int(step.get("order") or i),
                "text": str(step.get("text") or "").strip(),
                "duration_sec": step.get("duration_sec"),
            })
    instructions = str(data.get("instructions") or "").strip()
    if not instructions and norm_steps:
        instructions = "\n".join(
            f"{s['order']}. {s['text']}" for s in norm_steps if s.get("text")
        )

    garnishes = data.get("garnishes")
    if not isinstance(garnishes, list):
        garnishes = payload.get("garnishes") or []

    method = str(data.get("method") or payload.get("method") or "").strip()
    abv = str(data.get("abv_range") or data.get("abvRange") or "").strip()
    if not abv:
        abv = _fallback_abv(ingredients)
    difficulty = str(data.get("difficulty") or "").strip()
    if not difficulty:
        difficulty = _METHOD_DIFFICULTY.get(method, "中等")
    taste = str(data.get("taste") or "").strip()
    if not taste:
        taste = str(data.get("feeling") or payload.get("feeling") or "风味均衡").strip()[:8] or "风味均衡"

    profile_raw = data.get("flavor_profile")
    if profile_raw is None:
        profile_raw = data.get("flavorProfile")

    return {
        "name": str(data.get("name") or "未命名特调").strip()[:64],
        "name_en": str(data.get("name_en") or "").strip()[:64],
        "glass": str(data.get("glass") or payload.get("glass_code") or "").strip(),
        "method": method,
        "ice_type": str(data.get("ice_type") or payload.get("ice_type") or "").strip(),
        "garnishes": [str(g) for g in garnishes],
        "feeling": str(data.get("feeling") or payload.get("feeling") or "").strip(),
        "flavor_summary": str(data.get("flavor_summary") or "").strip(),
        "abv_range": abv[:16],
        "difficulty": difficulty[:8],
        "taste": taste[:12],
        "flavor_profile": _normalize_profile(profile_raw, method),
        "ingredients": ingredients,
        "steps": norm_steps,
        "instructions": instructions,
    }


async def stream_generate(payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    if not DEEPSEEK_API_KEY:
        yield {"type": "error", "message": "未配置 DEEPSEEK_API_KEY"}
        return

    session_id = str(payload.get("session_id") or "workbench")
    names = [
        str(r.get("name") or "")
        for r in (payload.get("ingredients") or [])
        if isinstance(r, dict)
    ]
    yield {"type": "token", "text": "正在根据你的选材创作特调…\n"}

    user_blob = json.dumps(payload, ensure_ascii=False)
    try:
        llm = ChatOpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url=DEEPSEEK_BASE_URL,
            model=DEEPSEEK_MODEL,
            temperature=0.7,
        )
        msg = await llm.ainvoke([
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=f"工作台快照：\n{user_blob}"),
        ])
        content = msg.content if hasattr(msg, "content") else str(msg)
        recipe = _normalize_recipe(_extract_json(str(content)), payload)
    except Exception as exc:
        logger.exception("workbench generate failed")
        yield {"type": "error", "message": f"特调生成失败: {exc}"}
        return

    intro = f"为你调制了「{recipe['name']}」"
    if recipe.get("flavor_summary"):
        intro += f"：{recipe['flavor_summary']}"
    yield {"type": "token", "text": intro + "\n"}
    yield {"type": "recipe", "recipe": recipe}

    if IMAGE_API_KEY:
        yield {"type": "image_loading", "text": "正在生成特调配图…"}
        try:
            prompt = image_prompt_from_recipe(
                f"{recipe['name']} {recipe.get('name_en','')} "
                f"{' '.join(names)} {recipe.get('flavor_summary','')} "
                f"glass={recipe.get('glass')} method={recipe.get('method')}"
            )
            key = image_object_key(session_id, prompt)
            url = await generate_cocktail_image(prompt, key)
            if url:
                yield {
                    "type": "image",
                    "url": url,
                    "alt": recipe["name"],
                    "kind": "custom",
                }
            else:
                yield {"type": "image_error", "message": "配图生成失败"}
        except Exception as exc:
            logger.exception("workbench image failed")
            yield {"type": "image_error", "message": str(exc)}
    else:
        yield {"type": "image_error", "message": "未配置 IMAGE_API_KEY，跳过配图"}

    yield {"type": "done"}
