"""成杯可行性分析：规则 + 可选 LLM 风味摘要与六维画像。"""

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
_AROMA_HINTS = ("橙花", "薄荷", "香草", "咖啡", "巧克力", "茴香", "肉桂", "elderflower", "mint")

# 雷达图六维，取值 0~1
_PROFILE_KEYS = ("sweetness", "alcohol", "sourness", "aroma", "energy", "difficulty")


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


def _clamp01(v: Any, default: float = 0.2) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, x))


def _derive_flavor_profile(
    names: list[str],
    hay: str,
    volume: float,
    capacity: Any,
    method: str,
    ice: str,
) -> dict[str, float]:
    """规则侧六维画像，无 LLM 或 LLM 失败时使用。"""
    count = len(names)
    fill = 0.4
    if capacity:
        try:
            cap = float(capacity)
            if cap > 0 and volume > 0:
                fill = min(1.0, volume / cap)
        except (TypeError, ValueError):
            pass

    has_base = any(h.lower() in hay for h in _BASE_HINTS)
    sweet = any(h.lower() in hay for h in _SWEET_HINTS)
    sour = any(h.lower() in hay for h in _SOUR_HINTS)
    bitter = any(h.lower() in hay for h in _BITTER_HINTS)
    aroma_hit = any(h.lower() in hay for h in _AROMA_HINTS)

    sweetness = 0.72 if sweet else (0.35 if count else 0.2)
    sourness = 0.78 if sour else 0.25
    alcohol = min(0.95, 0.45 + fill * 0.5) if has_base else (0.3 if count else 0.15)
    aroma = min(0.9, 0.25 + count * 0.1 + (0.2 if aroma_hit else 0) + (0.1 if bitter else 0))
    energy = min(0.95, fill * 0.7 + (0.2 if has_base else 0) + (0.15 if ice in ("crushed", "less") else 0))
    difficulty = 0.35
    if method == "layer":
        difficulty = 0.85
    elif method == "shake":
        difficulty = 0.55
    elif method == "stir":
        difficulty = 0.45
    elif method == "build":
        difficulty = 0.3
    if bitter:
        difficulty = max(difficulty, 0.5)
    if count >= 5:
        difficulty = min(0.95, difficulty + 0.15)

    return {
        "sweetness": round(sweetness, 2),
        "alcohol": round(alcohol, 2),
        "sourness": round(sourness, 2),
        "aroma": round(aroma, 2),
        "energy": round(energy, 2),
        "difficulty": round(difficulty, 2),
    }


def _normalize_profile(raw: Any, fallback: dict[str, float]) -> dict[str, float]:
    if not isinstance(raw, dict):
        return fallback
    out = dict(fallback)
    for key in _PROFILE_KEYS:
        if key in raw:
            out[key] = round(_clamp01(raw[key], fallback[key]), 2)
        # 兼容中文键
    zh_map = {
        "甜度": "sweetness",
        "酒精感": "alcohol",
        "酒精": "alcohol",
        "酸度": "sourness",
        "香气": "aroma",
        "能量": "energy",
        "难度": "difficulty",
    }
    for zh, en in zh_map.items():
        if zh in raw:
            out[en] = round(_clamp01(raw[zh], fallback[en]), 2)
    return out


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

    profile = _derive_flavor_profile(names, hay, volume, capacity, method, ice)

    # 可选：LLM 同时返回摘要 + 六维画像
    if DEEPSEEK_API_KEY and names and not any(c["level"] == "error" for c in conflicts):
        try:
            llm_result = _llm_analyze(names, method, ice, feeling, flavor, profile)
            if llm_result:
                if llm_result.get("flavor_summary"):
                    flavor = str(llm_result["flavor_summary"]).strip()[:80] or flavor
                profile = _normalize_profile(llm_result.get("flavor_profile"), profile)
        except Exception:
            logger.exception("workbench analyze llm failed")

    feasible = not any(c["level"] == "error" for c in conflicts)
    if feasible and not suggestions:
        suggestions.append("配比看起来可成杯，可以生成特调卡片")

    return {
        "feasible": feasible,
        "flavor_summary": flavor,
        "flavor_profile": profile,
        "conflicts": conflicts,
        "suggestions": suggestions,
    }


def _llm_analyze(
    names: list[str],
    method: str,
    ice: str,
    feeling: str,
    fallback_summary: str,
    fallback_profile: dict[str, float],
) -> dict[str, Any] | None:
    llm = ChatOpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_MODEL,
        temperature=0.3,
    )
    prompt = (
        "你是调酒顾问。根据材料与技法，评估成杯风味画像。\n"
        "只输出一个 JSON 对象，不要 markdown，不要解释。字段：\n"
        '  "flavor_summary": 一句话风味概括（不超过40字，中文），\n'
        '  "flavor_profile": {\n'
        '    "sweetness": 0~1 甜度,\n'
        '    "alcohol": 0~1 酒精感,\n'
        '    "sourness": 0~1 酸度,\n'
        '    "aroma": 0~1 香气,\n'
        '    "energy": 0~1 能量/体感,\n'
        '    "difficulty": 0~1 调制难度\n'
        "  }\n"
        "数值需反映材料真实倾向，不要全部接近 0.5。\n"
        f"材料：{'、'.join(names)}\n"
        f"技法：{method or '未定'}；冰：{ice or '未定'}；期望：{feeling or '未定'}\n"
        f"参考摘要：{fallback_summary}\n"
        f"参考画像：{json.dumps(fallback_profile, ensure_ascii=False)}"
    )
    msg = llm.invoke(prompt)
    text = (msg.content or "").strip() if hasattr(msg, "content") else str(msg).strip()
    if not text:
        return None

    # 抽取 JSON（兼容偶发 ```json 包裹）
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        # 退化为纯文本摘要
        cleaned = re.sub(r"\s+", " ", text)[:80]
        return {"flavor_summary": cleaned, "flavor_profile": fallback_profile} if cleaned else None

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        logger.warning("workbench analyze llm json parse failed: %s", text[:200])
        return None
    if not isinstance(data, dict):
        return None
    return data
