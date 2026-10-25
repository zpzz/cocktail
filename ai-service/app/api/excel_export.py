"""把配方表导出为带缩略图的 Excel。图片嵌在单元格上，不写 URL。"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from urllib.parse import unquote, urlparse

import httpx
from openpyxl import Workbook
from openpyxl.drawing.image import Image as ExcelImage
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage
from sqlalchemy.orm import Session, selectinload

from app.config import MINIO_BUCKET
from app.core.database import Recipe
from app.core.storage import is_minio_url, minio_client

THUMB_PX = 96
HEADERS = [
    "来源",
    "源站ID",
    "中文名",
    "英文名",
    "分类",
    "基酒",
    "杯型",
    "技法",
    "技法展示",
    "酒精度",
    "冰型",
    "装饰",
    "风味标签",
    "简介",
    "英文简介",
    "材料",
    "步骤",
    "图片",
]


def _ingredient_text(recipe: Recipe) -> str:
    parts = []
    for item in recipe.ingredients:
        amount = f"{item.amount:g}" if item.amount is not None else ""
        parts.append(f"{item.ingredient_name} {amount}{item.unit or ''}".strip())
    return "；".join(parts)


def _object_key_from_url(url: str) -> str | None:
    path = unquote(urlparse(url).path).lstrip("/")
    prefix = f"{MINIO_BUCKET}/"
    if path.startswith(prefix):
        return path[len(prefix) :]
    return None


def _load_image_bytes(url: str) -> bytes | None:
    if not url:
        return None
    try:
        if is_minio_url(url):
            key = _object_key_from_url(url)
            if key:
                response = minio_client().get_object(MINIO_BUCKET, key)
                try:
                    return response.read()
                finally:
                    response.close()
                    response.release_conn()
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.content
    except Exception:
        return None


def _thumbnail(data: bytes) -> BytesIO | None:
    try:
        image = PILImage.open(BytesIO(data))
        image = image.convert("RGB")
        image.thumbnail((THUMB_PX, THUMB_PX))
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=80)
        buffer.seek(0)
        return buffer
    except Exception:
        return None


def build_recipes_workbook(db: Session) -> BytesIO:
    recipes = (
        db.query(Recipe)
        .options(selectinload(Recipe.ingredients))
        .order_by(Recipe.source, Recipe.id)
        .all()
    )
    def load_thumb(recipe: Recipe) -> BytesIO | None:
        data = _load_image_bytes(recipe.image_url)
        return _thumbnail(data) if data else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        thumbs = list(pool.map(load_thumb, recipes))

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "配方"
    sheet.append(HEADERS)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    sheet.row_dimensions[1].height = 22
    sheet.column_dimensions[get_column_letter(len(HEADERS))].width = 16

    # ExcelImage 会引用 buffer，必须保存到 save 之后
    image_handles: list[BytesIO] = []
    image_col = get_column_letter(len(HEADERS))
    wrap = Alignment(wrap_text=True, vertical="center")

    for index, recipe in enumerate(recipes, start=2):
        try:
            tags = json.loads(recipe.flavor_tags or "[]")
        except json.JSONDecodeError:
            tags = []
        sheet.append(
            [
                recipe.source,
                recipe.source_id,
                recipe.name,
                recipe.name_en,
                recipe.category,
                recipe.base_spirit,
                recipe.glass,
                recipe.method,
                recipe.method_label,
                recipe.abv_range,
                recipe.ice_type,
                recipe.garnish,
                "、".join(tags) if isinstance(tags, list) else "",
                recipe.description,
                recipe.description_en,
                _ingredient_text(recipe),
                recipe.instructions,
                "",
            ]
        )
        sheet.row_dimensions[index].height = 78
        for cell in sheet[index]:
            cell.alignment = wrap
        thumb = thumbs[index - 2]
        if thumb:
            image_handles.append(thumb)
            excel_image = ExcelImage(thumb)
            excel_image.width = THUMB_PX
            excel_image.height = THUMB_PX
            sheet.add_image(excel_image, f"{image_col}{index}")

    sheet.auto_filter.ref = sheet.dimensions
    sheet.freeze_panes = "A2"
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output
