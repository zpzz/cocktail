"""材料主数据 get-or-create。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.database import Ingredient
from app.ingredients.clean import (
    build_canonical_display,
    canonicalize_name_en,
    extract_zh_name,
    normalize_en_key,
    split_name_en,
)


def ingredient_slug(name: str, name_en: str = "") -> str:
    english = canonicalize_name_en(name_en or split_name_en(name)[1])
    return (normalize_en_key(english) or f"raw:{(name or 'unknown').strip().lower()}")[:128]


def get_or_create_ingredient(
    db: Session,
    *,
    name: str,
    name_en: str = "",
    category: str = "",
    primary_unit: str = "",
    image_url: str = "",
) -> Ingredient:
    english = canonicalize_name_en(name_en or split_name_en(name)[1])
    slug = ingredient_slug(name, english)
    zh = extract_zh_name(name)
    display = build_canonical_display(zh, english, name or english or "未命名")
    unit = (primary_unit or "").strip()[:16]

    existing = db.query(Ingredient).filter(Ingredient.slug == slug).one_or_none()
    if existing is None:
        existing = Ingredient(
            name=display[:128],
            name_en=english[:128],
            slug=slug,
            category=(category or "")[:32],
            primary_unit=unit,
            image_url=image_url or "",
        )
        db.add(existing)
        db.flush()
        return existing

    changed = False
    if display and (" (" not in (existing.name or "") and " (" in display):
        existing.name = display[:128]
        changed = True
    if english and not (existing.name_en or "").strip():
        existing.name_en = english[:128]
        changed = True
    if category and not (existing.category or "").strip():
        existing.category = category[:32]
        changed = True
    if unit and not (existing.primary_unit or "").strip():
        existing.primary_unit = unit
        changed = True
    if image_url and not (existing.image_url or "").strip():
        existing.image_url = image_url
        changed = True
    if changed:
        db.flush()
    return existing
