"""
MixMyth：没有公开开发者文档，数据来自网站前端同一套 JSON。

    GET https://mixmyth.com/api/recipes?page=1
    每页 20 条，字段已含材料、步骤、杯型、基酒、酒精度。
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import httpx

from app.config import CRAWL_USER_AGENT, MIXMYTH_DELAY_SECONDS
from crawler.pipeline import canonical_recipe, number_steps

BASE_URL = "https://mixmyth.com"
LIST_URL = f"{BASE_URL}/api/recipes"
PAGE_SIZE = 20


def _absolute_image(path: str | None) -> str:
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{BASE_URL}{path}"


def _ingredient_rows(raw_items: list[Any] | None, names_en: list[Any] | None = None) -> list[dict[str, Any]]:
    rows = []
    for index, item in enumerate(raw_items or []):
        if isinstance(item, (list, tuple)) and item:
            name = str(item[0]).strip()
            amount_raw = str(item[1]).strip() if len(item) > 1 else ""
        elif isinstance(item, dict):
            name = str(item.get("name") or item.get("ingredient") or "").strip()
            amount_raw = str(item.get("amount") or item.get("measure") or "").strip()
        else:
            continue
        english = ""
        if names_en and index < len(names_en) and names_en[index]:
            english = str(names_en[index]).strip()
        if english and english.lower() not in name.lower():
            name = f"{name} ({english})"
        rows.append({"name": name, "amount_raw": amount_raw})
    return rows


def _garnish(steps: list[Any] | None, ingredients: list[dict[str, Any]]) -> str:
    for item in reversed(ingredients):
        name = item.get("name") or ""
        if "装饰" in name or "garnish" in name.lower():
            return name[:128]
    for step in reversed(steps or []):
        text = str(step)
        if "装饰" in text:
            return text.replace("装饰", "").strip(" ，,")[:128] or text[:128]
    return ""


def fetch_recipes(
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    headers = {"User-Agent": CRAWL_USER_AGENT, "Accept": "application/json"}
    recipes: list[dict[str, Any]] = []
    page = 1
    total = None

    with httpx.Client(timeout=30.0, headers=headers, follow_redirects=True) as client:
        while True:
            if should_stop and should_stop():
                break
            response = client.get(LIST_URL, params={"page": page})
            response.raise_for_status()
            payload = response.json()
            items = payload.get("items") or []
            total = int(payload.get("total") or total or 0)
            if on_progress:
                on_progress(f"MixMyth 第 {page} 页", len(recipes) + len(items), total)
            for item in items:
                ingredients = _ingredient_rows(item.get("ingredients"), item.get("ingredients_en"))
                recipes.append(
                    canonical_recipe(
                        source="mixmyth",
                        source_id=str(item.get("id")),
                        name=item.get("name") or "",
                        name_en=item.get("name_en") or "",
                        glass=item.get("glass_cn") or item.get("glass") or "",
                        method=item.get("method") or "",
                        method_label=item.get("method") or "",
                        garnish=_garnish(item.get("steps"), ingredients),
                        abv_range=str(item.get("abv") or ""),
                        category=item.get("category") or "",
                        base_spirit=item.get("base_spirit") or "",
                        description=item.get("description") or "",
                        description_en=item.get("description_en") or "",
                        flavor_tags=list(item.get("flavor") or []) + list(item.get("tags") or []),
                        instructions=number_steps(item.get("steps") or []),
                        image_url=_absolute_image(item.get("image_url")),
                        ingredients=ingredients,
                    )
                )
            if not items:
                break
            if total and page * PAGE_SIZE >= total:
                break
            page += 1
            time.sleep(MIXMYTH_DELAY_SECONDS)
    return recipes
