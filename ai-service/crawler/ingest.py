"""把清洗后的配方写入 Postgres：同一来源同一 ID 则更新，否则插入。"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.database import Recipe, RecipeIngredient
from crawler.images import attach_minio_images


def upsert_recipes(db: Session, recipes: list[dict[str, Any]], **kwargs: Any) -> int:
    recipes = attach_minio_images(recipes, **kwargs)
    upserted = 0
    for raw in recipes:
        payload = dict(raw)
        ingredients = payload.pop("ingredients") or []
        recipe = (
            db.query(Recipe)
            .filter(Recipe.source == payload["source"], Recipe.source_id == payload["source_id"])
            .one_or_none()
        )
        if recipe is None:
            recipe = Recipe(**payload)
            db.add(recipe)
            db.flush()
        else:
            for key, value in payload.items():
                setattr(recipe, key, value)
            recipe.ingredients.clear()
            db.flush()
        for item in ingredients:
            recipe.ingredients.append(RecipeIngredient(**item))
        upserted += 1
    db.commit()
    return upserted
