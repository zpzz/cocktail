"""下载源站配图，上传到 MinIO，并把配方上的 image_url 换成 MinIO 地址。"""

from __future__ import annotations

import mimetypes
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.config import CRAWL_USER_AGENT
from app.core.database import Recipe
from app.core.storage import find_existing_object, is_minio_url, upload_bytes

CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _safe_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value)).strip("-._")
    return cleaned or "unknown"


def _extension(url: str, content_type: str | None) -> str:
    if content_type:
        mapped = CONTENT_TYPE_EXT.get(content_type.split(";")[0].strip().lower())
        if mapped:
            return mapped
    suffix = Path(urlparse(url).path).suffix.lower().lstrip(".")
    if suffix == "jpeg":
        return "jpg"
    if suffix in {"jpg", "png", "webp", "gif"}:
        return suffix
    guessed = mimetypes.guess_extension(content_type or "")
    return (guessed or ".jpg").lstrip(".")


def download_image(url: str) -> tuple[bytes, str]:
    headers = {
        "User-Agent": CRAWL_USER_AGENT,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}/",
    }
    with httpx.Client(timeout=30.0, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "image/jpeg")
        return response.content, content_type


def store_image(source: str, source_id: str, image_url: str | None) -> str:
    if not image_url:
        return ""
    if is_minio_url(image_url):
        return image_url
    existing = find_existing_object(source, _safe_id(source_id))
    if existing:
        return existing
    data, content_type = download_image(image_url)
    if not data:
        return image_url
    ext = _extension(image_url, content_type)
    object_key = f"{source}/{_safe_id(source_id)}.{ext}"
    return upload_bytes(object_key, data, content_type.split(";")[0].strip())


def _store_or_keep(source: str, source_id: str, image_url: str) -> str:
    """上传失败时仍保留原 URL，避免整次爬取失败。"""
    if not image_url:
        return ""
    try:
        return store_image(source, source_id, image_url)
    except Exception:
        return image_url


def attach_minio_images(
    recipes: list[dict[str, Any]],
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    total = len(recipes)
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(
                _store_or_keep,
                recipe["source"],
                recipe["source_id"],
                recipe.get("image_url") or "",
            ): recipe
            for recipe in recipes
        }
        for future in as_completed(futures):
            if should_stop and should_stop():
                break
            recipe = futures[future]
            recipe["image_url"] = future.result()
            done += 1
            if on_progress:
                on_progress("上传图片到 MinIO", done, total)
    return recipes


def backfill_existing(db: Session, on_progress: Callable[[str, int, int], None] | None = None) -> int:
    """把库里还指向源站的图片迁到 MinIO（一次性补数据用）。"""
    recipes = [row for row in db.query(Recipe).all() if row.image_url and not is_minio_url(row.image_url)]
    total = len(recipes)
    updated = 0

    def work(recipe: Recipe) -> tuple[int, str]:
        return recipe.id, _store_or_keep(recipe.source, recipe.source_id, recipe.image_url)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(work, recipe) for recipe in recipes]
        by_id = {recipe.id: recipe for recipe in recipes}
        for index, future in enumerate(as_completed(futures), start=1):
            recipe_id, url = future.result()
            recipe = by_id[recipe_id]
            if url and url != recipe.image_url:
                recipe.image_url = url
                updated += 1
            if on_progress:
                on_progress("回填已有图片", index, total)
    db.commit()
    return updated
