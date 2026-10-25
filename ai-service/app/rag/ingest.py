"""扫描 kb_recipe，把变更过的配方写成 kb_chunk。"""

from __future__ import annotations

from collections.abc import Callable, Sequence

from sqlalchemy.orm import Session, selectinload

from app.config import EMBEDDING_BATCH_SIZE
from app.core.database import Recipe, RecipeChunk, utcnow
from app.rag.chunker import CHUNK_TYPE_FULL, build_recipe_chunk, content_hash
from app.rag.embedder import embed_texts


def ingest_recipes(
    db: Session,
    *,
    force: bool = False,
    recipe_ids: Sequence[int] | None = None,
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> dict[str, int]:
    """扫描配方 → 拼文本 → 算 hash → 有变才 embed 写入 kb_chunk。

    force=True 会无视 hash 全量重算（换模型或改了 chunker 时用）。
    """
    query = db.query(Recipe).options(selectinload(Recipe.ingredients), selectinload(Recipe.chunks))
    if recipe_ids:
        query = query.filter(Recipe.id.in_(list(recipe_ids)))
    recipes = query.order_by(Recipe.id).all()

    pending: list[tuple[Recipe, str, str, RecipeChunk | None]] = []
    skipped = 0
    for recipe in recipes:
        content = build_recipe_chunk(recipe)
        digest = content_hash(content)
        existing = next((row for row in recipe.chunks if row.chunk_type == CHUNK_TYPE_FULL), None)
        # 文本没变就沿用旧向量，避免 757 条每次都过一遍 BGE-M3
        if existing and existing.content_hash == digest and not force:
            skipped += 1
            continue
        pending.append((recipe, content, digest, existing))

    upserted = 0
    total = len(pending)
    for start in range(0, total, EMBEDDING_BATCH_SIZE):
        if should_stop and should_stop():
            break
        batch = pending[start : start + EMBEDDING_BATCH_SIZE]
        vectors = embed_texts([item[1] for item in batch])
        for (recipe, content, digest, existing), vector in zip(batch, vectors, strict=True):
            if existing is None:
                db.add(
                    RecipeChunk(
                        recipe_id=recipe.id,
                        source=recipe.source,
                        source_id=recipe.source_id,
                        chunk_type=CHUNK_TYPE_FULL,
                        content=content,
                        content_hash=digest,
                        embedding=vector,
                    )
                )
            else:
                existing.content = content
                existing.content_hash = digest
                existing.embedding = vector
                existing.source = recipe.source
                existing.source_id = recipe.source_id
                existing.updated_at = utcnow()
            upserted += 1
        db.commit()
        if on_progress:
            on_progress("写入向量", upserted, total)

    return {"scanned": len(recipes), "upserted": upserted, "skipped": skipped}
