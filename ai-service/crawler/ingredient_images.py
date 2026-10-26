"""材料图：优先 MixMyth /uploads/ings/{slug}.jpg（与官网 ingImg 同一套映射）。"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

MIXMYTH_ING_IMAGE = "https://mixmyth.com/uploads/ings/{slug}.jpg?v=2"
MIXMYTH_ING_FALLBACK = "https://mixmyth.com/uploads/ings/generic.jpg?v=2"
COCKTAILDB_INGREDIENT_IMAGE = "https://www.thecocktaildb.com/images/ingredients/{name}.png"

MAP_PATH = Path(__file__).resolve().parent / "data" / "mixmyth_ing_img_map.json"

COCKTAILDB_ALIASES = {
    "simple syrup": "Sugar syrup",
    "sugar syrup": "Sugar syrup",
    "soda": "Soda water",
    "club soda": "Soda water",
    "eggwhite": "Egg White",
    "egg whites": "Egg White",
    "coffee liqueur": "Coffee liqueur",
    "kahlua": "Coffee liqueur",
    "kahlúa": "Coffee liqueur",
    "triple sec": "Triple sec",
    "dry vermouth": "Dry Vermouth",
    "sweet vermouth": "Sweet Vermouth",
    "rye whiskey": "Rye whiskey",
}


@lru_cache(maxsize=1)
def _mixmyth_map() -> list[dict[str, object]]:
    if not MAP_PATH.is_file():
        return []
    return json.loads(MAP_PATH.read_text(encoding="utf-8"))


def english_ingredient_name(name: str, name_en: str = "") -> str:
    text = (name_en or "").strip()
    if text:
        return text
    raw = (name or "").strip()
    match = re.search(r"\(([^)]+)\)\s*$", raw)
    if match:
        return match.group(1).strip()
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 .'\-/&]*", raw):
        return raw
    return ""


def mixmyth_ingredient_slug(name: str, name_en: str = "") -> str:
    """复刻官网 ingImg：对材料名做关键词包含匹配，顺序优先。"""
    haystack = f"{name or ''} {name_en or ''}".strip().lower()
    if not haystack:
        return "generic"
    for entry in _mixmyth_map():
        keywords = entry.get("keywords") or []
        slug = str(entry.get("slug") or "").strip()
        if not slug:
            continue
        for keyword in keywords:
            key = str(keyword).strip().lower()
            if key and key in haystack:
                return slug
    return "generic"


def mixmyth_ingredient_image_url(name: str, name_en: str = "") -> str:
    slug = mixmyth_ingredient_slug(name, name_en)
    if slug == "generic":
        return MIXMYTH_ING_FALLBACK
    return MIXMYTH_ING_IMAGE.format(slug=slug)


def resolve_ingredient_image_name(name: str, name_en: str = "") -> str:
    """用于 MinIO 对象名去重：优先 MixMyth slug。"""
    return mixmyth_ingredient_slug(name, name_en)


def cocktail_db_ingredient_image_url(name: str, name_en: str = "") -> str:
    english = english_ingredient_name(name, name_en)
    if not english:
        return ""
    english = re.sub(r"\s*\([^)]*(garnish|装饰)[^)]*\)\s*$", "", english, flags=re.I).strip()
    paren = re.search(r"^([^(]+)\s*\(", english)
    if paren and len(paren.group(1).strip()) >= 3:
        english = paren.group(1).strip()
    resolved = COCKTAILDB_ALIASES.get(english.lower(), english)
    return COCKTAILDB_INGREDIENT_IMAGE.format(name=quote(resolved, safe=" "))


def ingredient_image_url(name: str, name_en: str = "", *, source: str = "") -> str:
    """默认走 MixMyth 静态图；CocktailDB 源且映射落到 generic 时改用 CocktailDB CDN。"""
    mixmyth = mixmyth_ingredient_image_url(name, name_en)
    if source == "cocktaildb" and mixmyth_ingredient_slug(name, name_en) == "generic":
        fallback = cocktail_db_ingredient_image_url(name, name_en)
        return fallback or mixmyth
    return mixmyth
