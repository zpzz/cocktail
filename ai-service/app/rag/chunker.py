"""把 kb_recipe 拼成一段稳定检索文本。

不调 LLM、不按 token 切块：一条配方对应一段 recipe_full。
字段顺序固定，这样配方没改时 content_hash 不变，ingest 可以跳过。
"""

from __future__ import annotations

import hashlib
import json

from app.core.database import Recipe

SOURCE_LABEL = {
    "mixmyth": "MixMyth 精选库",
    "cocktaildb": "TheCocktailDB 社区库",
}

CHUNK_TYPE_FULL = "recipe_full"


def _tags(recipe: Recipe) -> str:
    try:
        tags = json.loads(recipe.flavor_tags or "[]")
    except json.JSONDecodeError:
        tags = []
    return "、".join(str(tag) for tag in tags if tag)


def _ingredients(recipe: Recipe) -> str:
    parts = []
    for item in recipe.ingredients:
        master = item.ingredient
        name = (master.name if master else "") or ""
        amount = f"{float(item.amount):g}" if item.amount is not None else ""
        parts.append(f"{name} {amount}{item.unit or ''}".strip())
    return "；".join(parts)


def build_recipe_chunk(recipe: Recipe) -> str:
    """给 BGE-M3 和对话 prompt 用的同一段文本。"""
    lines = [
        f"配方名称：{recipe.name} {recipe.name_en or ''}".strip(),
        f"来源：{SOURCE_LABEL.get(recipe.source, recipe.source)}",
        f"分类：{recipe.category or '未知'}  基酒：{recipe.base_spirit or '未知'}",
        f"杯型：{recipe.glass or '未知'}  技法：{recipe.method_label or recipe.method or '未知'}  酒精度：{recipe.abv_range or '未知'}",
    ]
    tags = _tags(recipe)
    if tags:
        lines.append(f"风味：{tags}")
    if recipe.description:
        lines.append(f"简介：{recipe.description}")
    if recipe.description_en:
        lines.append(f"简介英文：{recipe.description_en}")
    ingredients = _ingredients(recipe)
    if ingredients:
        lines.append(f"材料：{ingredients}")
    if recipe.garnish:
        lines.append(f"装饰：{recipe.garnish}")
    if recipe.ice_type:
        lines.append(f"冰型：{recipe.ice_type}")
    if recipe.instructions:
        lines.append(f"做法：{recipe.instructions}")
    return "\n".join(lines)


def content_hash(content: str) -> str:
    """用来判断「配方文本有没有变」，不是用来检索。"""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
