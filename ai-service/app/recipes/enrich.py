"""知识库配方详情风味补全：摘要 / 口感 / 难度 / 六维画像（不改材料与步骤）。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_openai import ChatOpenAI

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.workbench.analyze import _derive_flavor_profile, _normalize_profile

logger = logging.getLogger(__name__)

_METHOD_DIFFICULTY = {
    "build": "简单",
    "stir": "简单",
    "shake": "中等",
    "layer": "进阶",
}


def _names(ingredients: list[Any]) -> list[str]:
    out: list[str] = []
    for row in ingredients:
        if isinstance(row, dict):
            name = str(row.get("name") or "").strip()
            if name:
                out.append(name)
    return out


def _clamp_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text)[:limit]


def enrich_recipe(payload: dict[str, Any]) -> dict[str, Any]:
    """
    入参为配方快照（name/ingredients/method/...）。
    返回 flavor_summary / abv_range / difficulty / taste / flavor_profile。
    """
    ingredients = payload.get("ingredients") or []
    if not isinstance(ingredients, list):
        ingredients = []
    names = _names(ingredients)
    hay = " ".join(names).lower()
    method = str(payload.get("method") or "").strip().lower()
    ice = str(payload.get("ice_type") or "").strip()
    tags = payload.get("flavor_tags") or []
    if not isinstance(tags, list):
        tags = []
    tag_text = "、".join(str(t).strip() for t in tags if str(t).strip())
    description = _clamp_text(payload.get("description"), 120)
    existing_abv = _clamp_text(payload.get("abv_range"), 32)

    volume = 0.0
    for row in ingredients:
        if isinstance(row, dict) and row.get("amount") is not None:
            try:
                volume += float(row["amount"])
            except (TypeError, ValueError):
                pass

    profile = _derive_flavor_profile(names, hay, volume, None, method, ice)
    difficulty = _METHOD_DIFFICULTY.get(method) or "中等"
    taste = tag_text[:8] if tag_text else ("清爽均衡" if names else "风味待定")
    flavor = description or (f"以{'、'.join(names[:3])}为主" if names else "风味轮廓待分析")
    if tag_text and description:
        flavor = f"{description}（{tag_text}）"[:80]
    elif tag_text and not description:
        flavor = f"{'、'.join(names[:2]) or '本款'}：{tag_text}"[:80]

    abv = existing_abv
    if not abv:
        if volume <= 0:
            abv = "约 15%"
        elif volume < 90:
            abv = "约 22%"
        elif volume < 160:
            abv = "约 14%"
        else:
            abv = "约 10%"

    if DEEPSEEK_API_KEY and names:
        try:
            llm = _llm_enrich(
                name=str(payload.get("name") or "").strip(),
                name_en=str(payload.get("name_en") or "").strip(),
                names=names,
                method=method or str(payload.get("method_label") or ""),
                ice=ice,
                glass=str(payload.get("glass") or ""),
                tags=tag_text,
                description=description,
                fallback_summary=flavor,
                fallback_profile=profile,
                fallback_difficulty=difficulty,
                fallback_taste=taste,
                fallback_abv=abv,
            )
            if llm:
                if llm.get("flavor_summary"):
                    flavor = _clamp_text(llm["flavor_summary"], 80) or flavor
                if llm.get("taste"):
                    taste = _clamp_text(llm["taste"], 12) or taste
                if llm.get("difficulty"):
                    difficulty = _clamp_text(llm["difficulty"], 8) or difficulty
                if not existing_abv and llm.get("abv_range"):
                    abv = _clamp_text(llm["abv_range"], 32) or abv
                profile = _normalize_profile(llm.get("flavor_profile"), profile)
        except Exception:
            logger.exception("recipe enrich llm failed")

    return {
        "flavor_summary": flavor,
        "abv_range": abv,
        "difficulty": difficulty,
        "taste": taste,
        "flavor_profile": profile,
    }


def _llm_enrich(
    *,
    name: str,
    name_en: str,
    names: list[str],
    method: str,
    ice: str,
    glass: str,
    tags: str,
    description: str,
    fallback_summary: str,
    fallback_profile: dict[str, float],
    fallback_difficulty: str,
    fallback_taste: str,
    fallback_abv: str,
) -> dict[str, Any] | None:
    llm = ChatOpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_MODEL,
        temperature=0.35,
    )
    title = name or name_en or "未命名鸡尾酒"
    prompt = (
        "你是鸡尾酒顾问。根据已有经典配方的材料与做法，补全详情页展示字段。\n"
        "不要改材料清单或步骤，只输出风味相关字段。\n"
        "只输出一个 JSON 对象，不要 markdown，不要解释。字段：\n"
        '  "flavor_summary": 一两句风味摘要（中文，不超过60字），\n'
        '  "taste": 口感标签（四字左右，如「清爽酸甜」），\n'
        '  "difficulty": 简单|中等|进阶 三选一，\n'
        '  "abv_range": 如「约 12%」（仅估算），\n'
        '  "flavor_profile": {\n'
        '    "sweetness": 0~1, "alcohol": 0~1, "sourness": 0~1,\n'
        '    "aroma": 0~1, "energy": 0~1, "difficulty": 0~1\n'
        "  }\n"
        "数值需反映真实倾向，不要全部接近 0.5。\n"
        f"酒名：{title}" + (f"（{name_en}）" if name_en and name_en != title else "") + "\n"
        f"材料：{'、'.join(names)}\n"
        f"杯型：{glass or '未定'}；技法：{method or '未定'}；冰：{ice or '未定'}\n"
        f"标签：{tags or '无'}；简介：{description or '无'}\n"
        f"参考摘要：{fallback_summary}\n"
        f"参考口感：{fallback_taste}；参考难度：{fallback_difficulty}；参考酒精度：{fallback_abv}\n"
        f"参考画像：{json.dumps(fallback_profile, ensure_ascii=False)}"
    )
    msg = llm.invoke(prompt)
    text = (msg.content or "").strip() if hasattr(msg, "content") else str(msg).strip()
    if not text:
        return None

    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        cleaned = re.sub(r"\s+", " ", text)[:80]
        return {"flavor_summary": cleaned} if cleaned else None

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("recipe enrich llm json parse failed: %s", text[:200])
        return None
    if not isinstance(data, dict):
        return None
    return data
