"""
TheCocktailDB 官方 V1 API（测试 key 默认 1）。

    GET /api/json/v1/1/search.php?f=a
    按首字母列出配方，响应里已是完整详情。
"""

from __future__ import annotations

import string
import time
from collections.abc import Callable
from typing import Any

import httpx

from app.config import COCKTAILDB_API_KEY, COCKTAILDB_DELAY_SECONDS, CRAWL_USER_AGENT
from crawler.pipeline import canonical_recipe, number_steps, strip_html

BASE_URL = f"https://www.thecocktaildb.com/api/json/v1/{COCKTAILDB_API_KEY}"
LETTERS = list(string.ascii_lowercase) + [str(n) for n in range(10)]


def _ingredient_rows(drink: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for index in range(1, 16):
        name = (drink.get(f"strIngredient{index}") or "").strip()
        if not name:
            continue
        rows.append(
            {
                "name": name,
                "amount_raw": (drink.get(f"strMeasure{index}") or "").strip(),
            }
        )
    return rows


def fetch_recipes(
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    headers = {"User-Agent": CRAWL_USER_AGENT, "Accept": "application/json"}
    recipes: list[dict[str, Any]] = []
    seen: set[str] = set()

    with httpx.Client(timeout=30.0, headers=headers, follow_redirects=True) as client:
        for index, letter in enumerate(LETTERS, start=1):
            if should_stop and should_stop():
                break
            response = client.get(f"{BASE_URL}/search.php", params={"f": letter})
            response.raise_for_status()
            payload = response.json()
            drinks = payload.get("drinks") or []
            for drink in drinks:
                source_id = str(drink.get("idDrink") or "")
                if not source_id or source_id in seen:
                    continue
                seen.add(source_id)
                tags = [
                    tag.strip()
                    for tag in (drink.get("strTags") or "").split(",")
                    if tag.strip()
                ]
                if drink.get("strCategory"):
                    tags.append(drink["strCategory"])
                instructions = strip_html(drink.get("strInstructions") or "")
                garnish = ""
                if "Garnish" in instructions:
                    garnish = instructions.split("Garnish")[-1].strip(" .:")[:128]
                recipes.append(
                    canonical_recipe(
                        source="cocktaildb",
                        source_id=source_id,
                        name=drink.get("strDrink") or "",
                        name_en=drink.get("strDrink") or "",
                        glass=drink.get("strGlass") or "",
                        method=instructions,  # 没有独立技法字段，从步骤文案里猜 shake/stir
                        category=drink.get("strCategory") or "",
                        base_spirit=(drink.get("strIngredient1") or ""),
                        description=instructions[:200],
                        garnish=garnish,
                        abv_range="",
                        flavor_tags=tags,
                        instructions=number_steps(instructions),
                        image_url=drink.get("strDrinkThumb") or "",
                        ingredients=_ingredient_rows(drink),
                    )
                )
            if on_progress:
                on_progress(f"CocktailDB 字母 {letter}", len(recipes), len(LETTERS))
            if index < len(LETTERS):
                time.sleep(COCKTAILDB_DELAY_SECONDS)
    return recipes
