"""把清洗后的配方写入 Postgres：同一来源同一 ID 则更新，否则插入。"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.database import Recipe, RecipeIngredient
from app.ingredients.catalog import get_or_create_ingredient, ingredient_slug
from app.ingredients.clean import split_name_en
from crawler.images import attach_minio_images


def _write_recipes(db: Session, recipes: list[dict[str, Any]]) -> int:
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
            name = item.get("ingredient_name") or ""
            name_en = (item.get("name_en") or "").strip()
            if not name_en:
                _, name_en = split_name_en(name)
            master = get_or_create_ingredient(
                db,
                name=name,
                name_en=name_en,
                category=(item.get("category") or ""),
                primary_unit=(item.get("unit") or ""),
                image_url=(item.get("image_url") or ""),
            )
            recipe.ingredients.append(
                RecipeIngredient(
                    ingredient_id=master.id,
                    amount=item.get("amount"),
                    unit=item.get("unit") or "",
                    order_index=int(item.get("order_index") or 1),
                )
            )
        upserted += 1
    return upserted


def _sync_image_urls(db: Session, recipes: list[dict[str, Any]]) -> None:
    """把 MinIO 地址写回已入库的配方 / 材料。"""
    from app.core.database import Ingredient

    for raw in recipes:
        recipe = (
            db.query(Recipe)
            .filter(Recipe.source == raw["source"], Recipe.source_id == raw["source_id"])
            .one_or_none()
        )
        if recipe is None:
            continue
        if raw.get("image_url"):
            recipe.image_url = raw["image_url"]
        for item in raw.get("ingredients") or []:
            name = item.get("ingredient_name") or ""
            name_en = (item.get("name_en") or "").strip()
            if not name_en:
                _, name_en = split_name_en(name)
            slug = ingredient_slug(name, name_en)
            image_url = (item.get("image_url") or "").strip()
            if not image_url:
                continue
            master = db.query(Ingredient).filter(Ingredient.slug == slug).one_or_none()
            if master is not None and master.image_url != image_url:
                master.image_url = image_url


def upsert_recipes(db: Session, recipes: list[dict[str, Any]], **kwargs: Any) -> int:
    """先落库（源站图 URL），再尽量上传 MinIO；传图失败不影响已写入的配方。"""
    upserted = _write_recipes(db, recipes)
    db.commit()

    on_progress = kwargs.get("on_progress")
    if on_progress:
        on_progress("配方已写入数据库，继续上传图片", upserted, upserted)

    try:
        attach_minio_images(recipes, **kwargs)
        _sync_image_urls(db, recipes)
        db.commit()
    except Exception:
        db.rollback()
    return upserted
