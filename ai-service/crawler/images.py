"""下载源站配图 / 材料图，上传到 MinIO，并把 URL 换成 MinIO 地址。"""

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
from app.core.database import Ingredient, Recipe
from app.core.storage import find_existing_object, is_minio_url, upload_bytes
from crawler.ingredient_images import ingredient_image_url, resolve_ingredient_image_name

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
    timeout = httpx.Timeout(12.0, connect=5.0)
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
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


def store_ingredient_image(image_url: str | None, *, slug: str = "") -> str:
    """材料图按英文名去重，对象键 ingredients/{slug}.ext。下载失败返回空串。"""
    if not image_url:
        return ""
    if is_minio_url(image_url):
        return image_url
    key_id = _safe_id(slug or Path(urlparse(image_url).path).stem or "ingredient")
    existing = find_existing_object("ingredients", key_id)
    if existing:
        return existing
    try:
        data, content_type = download_image(image_url)
    except Exception:
        return ""
    if not data:
        return ""
    ext = _extension(image_url, content_type)
    object_key = f"ingredients/{key_id}.{ext}"
    try:
        return upload_bytes(object_key, data, content_type.split(";")[0].strip())
    except Exception:
        return ""


def _ingredient_slug(ingredient: dict[str, Any]) -> str:
    name = str(ingredient.get("ingredient_name") or ingredient.get("name") or "")
    resolved = resolve_ingredient_image_name(name, str(ingredient.get("name_en") or ""))
    return _safe_id(resolved or name) or "ingredient"


def attach_ingredient_minio_images(
    recipes: list[dict[str, Any]],
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    """同一英文材料只下一份图，写回各 recipe.ingredients[].image_url。"""
    jobs: dict[str, str] = {}
    for recipe in recipes:
        for item in recipe.get("ingredients") or []:
            remote = str(item.get("image_url") or "").strip()
            if not remote or is_minio_url(remote):
                continue
            slug = _ingredient_slug(item)
            jobs.setdefault(slug, remote)

    total = len(jobs)
    done = 0
    resolved: dict[str, str] = {}
    if jobs:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(store_ingredient_image, url, slug=slug): slug
                for slug, url in jobs.items()
            }
            for future in as_completed(futures):
                if should_stop and should_stop():
                    break
                slug = futures[future]
                resolved[slug] = future.result() or ""
                done += 1
                if on_progress:
                    on_progress("上传材料图到 MinIO", done, total)

    for recipe in recipes:
        for item in recipe.get("ingredients") or []:
            remote = str(item.get("image_url") or "").strip()
            if not remote:
                continue
            if is_minio_url(remote):
                continue
            slug = _ingredient_slug(item)
            item["image_url"] = resolved.get(slug) or ""
    return recipes


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
                for pending in futures:
                    pending.cancel()
                break
            recipe = futures[future]
            try:
                recipe["image_url"] = future.result()
            except Exception:
                pass
            done += 1
            if on_progress:
                on_progress("上传配方图到 MinIO", done, total)
    return attach_ingredient_minio_images(recipes, on_progress=on_progress, should_stop=should_stop)


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


def backfill_ingredient_images(
    db: Session,
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> int:
    """给材料主表补图并上传 MinIO（不必整库重爬）。"""
    rows = (
        db.query(Ingredient)
        .filter((Ingredient.image_url.is_(None)) | (Ingredient.image_url == ""))
        .all()
    )
    jobs: dict[str, list[Ingredient]] = {}
    remotes: dict[str, str] = {}
    for row in rows:
        remote = ingredient_image_url(row.name or "", row.name_en or "")
        if not remote:
            continue
        slug = _safe_id(
            resolve_ingredient_image_name(row.name or "", row.name_en or "")
            or row.slug
            or row.name
            or "ingredient"
        )
        jobs.setdefault(slug, []).append(row)
        remotes[slug] = remote

    total = len(jobs)
    updated = 0
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(store_ingredient_image, remotes[slug], slug=slug): slug for slug in jobs
        }
        for future in as_completed(futures):
            if should_stop and should_stop():
                break
            slug = futures[future]
            url = future.result() or ""
            done += 1
            if url:
                for row in jobs[slug]:
                    row.image_url = url
                    updated += 1
            if on_progress:
                on_progress("回填材料图", done, total)
    db.commit()
    return updated
