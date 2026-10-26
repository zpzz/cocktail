"""成杯可行性分析：规则 + 可选 LLM 风味摘要。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_openai import ChatOpenAI

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

logger = logging.getLogger(__name__)

_BASE_HINTS = (
    "金酒", "伏特加", "朗姆", "威士忌", "白兰地", "龙舌兰", "梅酒", "清酒",
    "gin", "vodka", "rum", "whisky", "whiskey", "brandy", "tequila", "mezcal",
)
_SWEET_HINTS = ("糖浆", "利口", "liqueur", "syrup", "蜜", "甜")
_SOUR_HINTS = ("柠檬", "青柠", "酸", "lemon", "lime", "柑橘")
_BITTER_HINTS = ("苦精", "苦艾", "bitters", "金巴利", "苏兹", "suze")


def _names(payload: dict[str, Any]) -> list[str]:
    rows = payload.get("ingredients") or []
    out: list[str] = []
    for row in rows:
        if isinstance(row, dict):
            name = str(row.get("name") or "").strip()
            if name:
                out.append(name)
    return out


def _hay(names: list[str]) -> str:
    return " ".join(names).lower()


def analyze_session(payload: dict[str, Any]) -> dict[str, Any]:
    ingredients = payload.get("ingredients") or []
    names = _names(payload)
    hay = _hay(names)
    capacity = payload.get("capacity_ml")
    method = (payload.get("method") or "").strip()
    ice = (payload.get("ice_type") or "").strip()
    feeling = (payload.get("feeling") or "").strip()

    volume = 0.0
    for row in ingredients:
        if isinstance(row, dict) and row.get("amount") is not None:
            try:
                volume += float(row["amount"])
            except (TypeError, ValueError):
                pass

    conflicts: list[dict[str, str]] = []
    suggestions: list[str] = []

    if not names:
        conflicts.append({"level": "error", "message": "还没有选择材料"})
    if not payload.get("glass_code"):
        conflicts.append({"level": "error", "message": "请先选择酒杯"})

    if capacity and volume > float(capacity):
        conflicts.append({
            "level": "error",
            "message": f"材料合计约 {volume:.0f}ml，超过杯容量 {capacity}ml",
        })
    elif capacity and volume > 0 and volume < float(capacity) * 0.35:
        conflicts.append({
            "level": "warn",
            "message": f"液体偏少（约 {volume:.0f}/{capacity}ml），成杯可能显得空",
        })
        suggestions.append("可适量增加基酒或软饮填满杯型")

    has_base = any(h.lower() in hay for h in _BASE_HINTS)
    if names and not has_base:
        conflicts.append({"level": "warn", "message": "未明显识别到基酒，风味可能偏软"})
        suggestions.append("建议加入金酒/伏特加/朗姆等基酒作为骨架")

    if method == "shake" and ice in ("none", ""):
        conflicts.append({"level": "warn", "message": "摇和通常需要冰块降温稀释"})
        suggestions.append("摇和时建议选用标准冰或碎冰")

    if method == "layer" and len(names) < 2:
        conflicts.append({"level": "warn", "message": "分层技法至少需要两种密度不同的液体"})

    sweet = any(h.lower() in hay for h in _SWEET_HINTS)
    sour = any(h.lower() in hay for h in _SOUR_HINTS)
    bitter = any(h.lower() in hay for h in _BITTER_HINTS)

    parts: list[str] = []
    if has_base:
        parts.append("有基酒骨架")
    if sour:
        parts.append("偏酸柑橘")
    if sweet:
        parts.append("带甜感")
    if bitter:
        parts.append("有苦香层次")
    if feeling:
        parts.append(f"期望「{feeling}」")
    flavor = "、".join(parts) if parts else "风味轮廓尚不清晰"

    # 可选：LLM 润色风味摘要
    if DEEPSEEK_API_KEY and names and not any(c["level"] == "error" for c in conflicts):
        try:
            flavor = _llm_flavor(names, method, ice, feeling, flavor) or flavor
        except Exception:
            logger.exception("workbench analyze llm failed")

    feasible = not any(c["level"] == "error" for c in conflicts)
    if feasible and not suggestions:
        suggestions.append("配比看起来可成杯，可以生成特调卡片")

    return {
        "feasible": feasible,
        "flavor_summary": flavor,
        "conflicts": conflicts,
        "suggestions": suggestions,
    }


def _llm_flavor(
    names: list[str],
    method: str,
    ice: str,
    feeling: str,
    fallback: str,
) -> str | None:
    llm = ChatOpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_MODEL,
        temperature=0.4,
    )
    prompt = (
        "你是调酒顾问。根据材料用一句话（不超过 40 字）概括成杯风味，"
        "只输出纯文本，不要引号和解释。\n"
        f"材料：{'、'.join(names)}\n"
        f"技法：{method or '未定'}；冰：{ice or '未定'}；期望：{feeling or '未定'}\n"
        f"参考：{fallback}"
    )
    msg = llm.invoke(prompt)
    text = (msg.content or "").strip() if hasattr(msg, "content") else str(msg).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:80] if text else None
