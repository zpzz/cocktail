"""管理页用到的 JSON 接口。"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.database import Recipe, get_db
from crawler.scheduler import manager

router = APIRouter()


class CrawlRequest(BaseModel):
    source: str  # mixmyth | cocktaildb | all


def _recipe_to_dict(recipe: Recipe) -> dict:
    try:
        tags = json.loads(recipe.flavor_tags or "[]")
    except json.JSONDecodeError:
        tags = []
    return {
        "id": recipe.id,
        "source": recipe.source,
        "source_id": recipe.source_id,
        "name": recipe.name,
        "name_en": recipe.name_en,
        "glass": recipe.glass,
        "method": recipe.method,
        "method_label": recipe.method_label or recipe.method,
        "ice_type": recipe.ice_type,
        "garnish": recipe.garnish,
        "abv_range": recipe.abv_range,
        "category": recipe.category,
        "base_spirit": recipe.base_spirit,
        "description": recipe.description,
        "description_en": recipe.description_en,
        "flavor_tags": tags,
        "instructions": recipe.instructions,
        "image_url": recipe.image_url,
        "ingredients": [
            {
                "name": item.ingredient_name,
                "amount": float(item.amount) if item.amount is not None else None,
                "unit": item.unit,
                "order_index": item.order_index,
            }
            for item in recipe.ingredients
        ],
    }


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    rows = db.query(Recipe.source).all()
    counts: dict[str, int] = {}
    for (source,) in rows:
        counts[source] = counts.get(source, 0) + 1
    return {"total": sum(counts.values()), "by_source": counts}


@router.get("/crawl/status")
def crawl_status():
    return manager.snapshot()


@router.post("/crawl")
def start_crawl(payload: CrawlRequest):
    """后台启动爬取，立刻返回，进度轮询 /crawl/status。"""
    try:
        return manager.start(payload.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/recipes")
def list_recipes(
    source: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Recipe).options(selectinload(Recipe.ingredients))
    if source in {"mixmyth", "cocktaildb"}:
        query = query.filter(Recipe.source == source)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Recipe.name.ilike(like), Recipe.name_en.ilike(like)))
    total = query.count()
    recipes = query.order_by(Recipe.id.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [_recipe_to_dict(recipe) for recipe in recipes]}


@router.get("/recipes/{recipe_id}")
def recipe_detail(recipe_id: int, db: Session = Depends(get_db)):
    recipe = (
        db.query(Recipe)
        .options(selectinload(Recipe.ingredients))
        .filter(Recipe.id == recipe_id)
        .one_or_none()
    )
    if recipe is None:
        raise HTTPException(status_code=404, detail="配方不存在")
    return _recipe_to_dict(recipe)
