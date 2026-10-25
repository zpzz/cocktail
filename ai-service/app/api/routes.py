"""管理页用到的 JSON 接口。"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from minio.error import S3Error
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.api.excel_export import build_recipes_workbook
from app.config import MINIO_BUCKET
from app.core.database import Recipe, RecipeChunk, get_db
from app.core.storage import minio_client
from app.rag.retriever import search_recipes
from app.rag.scheduler import embed_manager
from crawler.scheduler import manager

router = APIRouter()


class CrawlRequest(BaseModel):
    source: str  # mixmyth | cocktaildb | all


class EmbedRequest(BaseModel):
    force: bool = False


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


@router.get("/media/{object_path:path}")
def get_media(object_path: str):
    """把 MinIO 对象转成同源 URL，方便 Expo 真机/Web 加载图片。"""
    key = object_path.lstrip("/")
    prefix = f"{MINIO_BUCKET}/"
    if key.startswith(prefix):
        key = key[len(prefix) :]
    if not key or ".." in key.split("/"):
        raise HTTPException(status_code=404, detail="图片不存在")
    try:
        obj = minio_client().get_object(MINIO_BUCKET, key)
    except S3Error as exc:
        raise HTTPException(status_code=404, detail="图片不存在") from exc
    content_type = obj.headers.get("Content-Type", "application/octet-stream")

    def chunks():
        try:
            yield from obj.stream(32 * 1024)
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        chunks(),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    rows = db.query(Recipe.source).all()
    counts: dict[str, int] = {}
    for (source,) in rows:
        counts[source] = counts.get(source, 0) + 1
    chunk_total = db.query(RecipeChunk).count()
    return {"total": sum(counts.values()), "by_source": counts, "chunks": chunk_total}


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


@router.get("/recipes/export.xlsx")
def export_recipes_excel(db: Session = Depends(get_db)):
    """导出库中全部配方；最后一列嵌入缩略图。"""
    buffer = build_recipes_workbook(db)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="cocktail-recipes.xlsx"'},
    )


@router.post("/rag/embed")
def start_embed(payload: EmbedRequest):
    """后台把 kb_recipe 写成 kb_chunk，不阻塞页面。"""
    try:
        return embed_manager.start(force=payload.force)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/rag/embed/status")
def embed_status():
    return embed_manager.snapshot()


@router.get("/rag/search")
def rag_search(
    q: str = Query(..., min_length=1),
    k: int = Query(default=8, ge=1, le=20),
    source: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """页面「语义检索」：只查向量，不走 LLM。"""
    hits = search_recipes(db, q, k=k, source=source)
    return {
        "query": q,
        "items": [
            {**_recipe_to_dict(recipe), "score": round(1 - distance, 4)}
            for recipe, distance in hits
        ],
    }


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
