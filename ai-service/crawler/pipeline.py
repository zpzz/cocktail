"""把各站点字段收成同一套结构，供入库使用。"""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from crawler.ingredient_images import ingredient_image_url

METHOD_LABELS = {
    "shake": "Shake 摇荡",
    "stir": "Stir 搅拌",
    "build": "Build 兑和",
    "blend": "Blend 搅打",
    "layer": "Layer 分层",
    "other": "Other 其他",
}

METHOD_MAP = {
    "shake": "shake",
    "shaken": "shake",
    "摇和": "shake",
    "stir": "stir",
    "stirred": "stir",
    "搅拌": "stir",
    "build": "build",
    "built": "build",
    "兑和": "build",
    "blend": "blend",
    "blended": "blend",
    "搅打": "blend",
    "layer": "layer",
    "layered": "layer",
    "分层": "layer",
}

UNIT_ALIASES = {
    "毫升": "ml",
    "ml": "ml",
    "cl": "cl",
    "oz": "oz",
    "ounce": "oz",
    "ounces": "oz",
    "dash": "dash",
    "dashes": "dash",
    "tsp": "tsp",
    "tbsp": "tbsp",
    "shot": "shot",
    "shots": "shot",
    "滴": "滴",
    "片": "片",
    "条": "条",
    "颗": "颗",
    "个": "个",
    "适量": "适量",
}


def normalize_method(raw: str | None) -> str:
    """原文里出现 shake/摇和 等关键词，就归到标准技法。"""
    text = (raw or "").strip().lower()
    if not text:
        return "other"
    for key, value in METHOD_MAP.items():
        if key in text:
            return value
    return "other"


def _to_decimal(value: str) -> Decimal | None:
    text = value.strip()
    if not text:
        return None
    if " " in text and "/" in text:
        whole, frac = text.split(" ", 1)
        try:
            num, den = frac.split("/")
            return Decimal(whole) + (Decimal(num) / Decimal(den))
        except (ValueError, InvalidOperation, ZeroDivisionError):
            return None
    if "/" in text:
        try:
            num, den = text.split("/", 1)
            return Decimal(num) / Decimal(den)
        except (ValueError, InvalidOperation, ZeroDivisionError):
            return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_amount(raw: str | None) -> tuple[Decimal | None, str]:
    """'60 ml' / '1 1/2 oz' / '2滴' → (数值, 单位)。解析不了则单位保留原文。"""
    text = re.sub(r"\s+", " ", (raw or "").strip())
    if not text:
        return None, ""
    match = re.match(
        r"^(?P<amount>\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*(?P<unit>[A-Za-z\u4e00-\u9fff]+)?",
        text,
    )
    if not match:
        return None, text[:16]
    amount = _to_decimal(match.group("amount"))
    unit_raw = (match.group("unit") or "").strip().lower()
    unit = UNIT_ALIASES.get(unit_raw, unit_raw[:16])
    return amount, unit


def strip_html(text: str | None) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+\n", "\n", cleaned).strip()


def number_steps(steps: list[str] | str | None) -> str:
    if isinstance(steps, str):
        lines = [line.strip(" -\t") for line in re.split(r"[\r\n]+", steps) if line.strip()]
    else:
        lines = [str(item).strip() for item in (steps or []) if str(item).strip()]
    numbered = []
    for index, line in enumerate(lines, start=1):
        line = re.sub(r"^\d+[\.、]\s*", "", line)
        numbered.append(f"{index}. {line}")
    return "\n".join(numbered)


def canonical_recipe(
    *,
    source: str,
    source_id: str,
    name: str,
    name_en: str = "",
    glass: str = "",
    method: str = "",
    ice_type: str = "",
    garnish: str = "",
    abv_range: str = "",
    category: str = "",
    base_spirit: str = "",
    description: str = "",
    description_en: str = "",
    method_label: str = "",
    flavor_tags: list[str] | None = None,
    instructions: str = "",
    image_url: str = "",
    ingredients: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """输出字段与 kb_recipe + kb_ingredient / kb_recipe_ingredient 对齐。"""
    tags = [str(tag).strip() for tag in (flavor_tags or []) if str(tag).strip()]
    parsed_ingredients = []
    for index, item in enumerate(ingredients or [], start=1):
        amount, unit = parse_amount(str(item.get("amount_raw") or item.get("amount") or ""))
        if item.get("unit"):
            unit = str(item["unit"])[:16]
        ingredient_name = str(item.get("name") or "").strip()[:128]
        name_en = str(item.get("name_en") or "").strip()
        image_url = str(item.get("image_url") or "").strip()
        if not image_url:
            image_url = ingredient_image_url(ingredient_name, name_en, source=source)
        parsed_ingredients.append(
            {
                "ingredient_name": ingredient_name,
                "name_en": name_en[:128],
                "amount": amount,
                "unit": unit,
                "order_index": item.get("order_index") or index,
                "image_url": image_url,
            }
        )
    parsed_ingredients = [row for row in parsed_ingredients if row["ingredient_name"]]
    method_code = normalize_method(method)
    label = (method_label or method or METHOD_LABELS.get(method_code, "")).strip()
    return {
        "source": source,
        "source_id": str(source_id),
        "name": (name or name_en or "未命名配方")[:128],
        "name_en": (name_en or "")[:128],
        "glass": (glass or "")[:64],
        "method": method_code,
        "method_label": label[:64],
        "ice_type": (ice_type or "")[:32],
        "garnish": (garnish or "")[:128],
        "abv_range": (abv_range or "")[:32],
        "category": (category or "")[:32],
        "base_spirit": (base_spirit or "")[:64],
        "description": strip_html(description),
        "description_en": strip_html(description_en),
        "flavor_tags": json.dumps(tags, ensure_ascii=False),
        "instructions": strip_html(instructions),
        "image_url": image_url or "",
        "ingredients": parsed_ingredients,
    }
