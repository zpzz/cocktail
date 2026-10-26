"""用问题向量在 kb_chunk 里做余弦近邻，再带回完整配方。"""

from __future__ import annotations

from sqlalchemy.orm import Session, selectinload

from app.core.database import Recipe, RecipeChunk, RecipeIngredient
from app.rag.chunker import CHUNK_TYPE_FULL
from app.rag.embedder import embed_texts


def search_recipes(
    db: Session,
    query: str,
    *,
    k: int = 8,
    source: str | None = None,
) -> list[tuple[Recipe, float]]:
    """问题 → BGE-M3 → pgvector cosine_distance 越小越相似。

    返回 (Recipe, distance)。页面相关度展示用 1 - distance。
    未指定 source 时多取一些，再把 MixMyth 排到 CocktailDB 前面。
    """
    query = (query or "").strip()
    if not query:
        return []
    vector = embed_texts([query])[0]  # 与入库同一套归一化向量
    distance = RecipeChunk.embedding.cosine_distance(vector)
    fetch_k = k if source in {"mixmyth", "cocktaildb"} else k * 2
    statement = (
        db.query(Recipe, distance.label("distance"))
        .join(RecipeChunk, RecipeChunk.recipe_id == Recipe.id)
        .options(selectinload(Recipe.ingredients).selectinload(RecipeIngredient.ingredient))
        .filter(RecipeChunk.chunk_type == CHUNK_TYPE_FULL)
        .order_by(distance)
        .limit(fetch_k)
    )
    if source in {"mixmyth", "cocktaildb"}:
        statement = statement.filter(RecipeChunk.source == source)
    hits = [(recipe, float(dist)) for recipe, dist in statement.all()]
    if source not in {"mixmyth", "cocktaildb"}:
        hits.sort(key=lambda item: (0 if item[0].source == "mixmyth" else 1, item[1]))
    return hits[:k]
