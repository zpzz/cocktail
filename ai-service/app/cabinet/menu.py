"""按酒柜库存生成酒单。

匹配规则：
- 刚性材料（基酒 / 利口酒 / 糖浆）必须尽量命中，缺料只统计这类
- 装饰等软性材料忽略，不进入 missing，也不影响 full/partial
- diversity=true 时按基酒 / 品类 / 技法分散选取
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.core.database import Ingredient, Recipe, RecipeIngredient

logger = logging.getLogger(__name__)

# 决定「能不能做」的刚性材料
RIGID_CATEGORIES = frozenset({"基酒", "利口酒", "糖浆"})
# 完全忽略：不参与匹配、不进缺料
SOFT_CATEGORIES = frozenset({"装饰"})


def _norm(text: str | None) -> str:
    if not text:
        return ""
    s = text.strip().lower()
    s = s.replace("白加得", "百加得")
    s = s.replace("辣姆", "朗姆").replace("蓝姆", "朗姆").replace("兰姆", "朗姆")
    s = re.sub(r"[\s\-_/·•]+", "", s)
    return s


def _score_name(a: str, b: str) -> float:
    """双向包含 / 相等打分；无重叠为 0。"""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
        return len(shorter) / len(longer)
    return 0.0


def _cabinet_keys(snapshot: list[dict[str, Any]]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for row in snapshot:
        for field_name in ("name", "name_en", "nameEn"):
            key = _norm(str(row.get(field_name) or ""))
            if key and key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def _best_cabinet_hit(cabinet_keys: list[str], name: str, name_en: str) -> float:
    targets = [_norm(name), _norm(name_en)]
    best = 0.0
    for target in targets:
        if not target:
            continue
        for key in cabinet_keys:
            best = max(best, _score_name(target, key))
            if best >= 1.0:
                return best
    return best


@dataclass
class _Candidate:
    recipe: Recipe
    match_type: str
    missing: list[str]
    rigid_total: int
    rigid_hit: int
    score: float
    substitutes: list[str] = field(default_factory=list)


def _evaluate_recipe(recipe: Recipe, cabinet_keys: list[str]) -> _Candidate | None:
    rigid_rows: list[Ingredient] = []
    for link in recipe.ingredients or []:
        ing = link.ingredient
        if ing is None:
            continue
        cat = (ing.category or "").strip()
        if cat in SOFT_CATEGORIES:
            continue
        if cat in RIGID_CATEGORIES:
            rigid_rows.append(ing)

    # 没有刚性材料的配方对「用库存做酒」参考价值低，跳过
    if not rigid_rows:
        return None

    missing: list[str] = []
    hit = 0
    for ing in rigid_rows:
        score = _best_cabinet_hit(cabinet_keys, ing.name or "", ing.name_en or "")
        if score >= 0.45:
            hit += 1
        else:
            label = (ing.name or ing.name_en or "").strip()
            if label:
                missing.append(label)

    total = len(rigid_rows)
    # 至少命中 1 个刚性材料才进候选（避免全缺料刷屏）
    if hit <= 0:
        return None

    coverage = hit / total
    # full：刚性材料全部命中；partial：部分命中
    match_type = "full" if not missing else "partial"
    # 排序：全匹配优先，再覆盖率，再命中数量
    rank = (2.0 if match_type == "full" else 0.0) + coverage + hit * 0.01
    return _Candidate(
        recipe=recipe,
        match_type=match_type,
        missing=missing,
        rigid_total=total,
        rigid_hit=hit,
        score=rank,
    )


def _diversify(candidates: list[_Candidate], limit: int) -> list[_Candidate]:
    """贪心选酒：优先高分，并打散 base_spirit / category / method。"""
    if limit <= 0 or not candidates:
        return []

    ordered = sorted(candidates, key=lambda c: c.score, reverse=True)
    picked: list[_Candidate] = []
    used_spirit: set[str] = set()
    used_category: set[str] = set()
    used_method: set[str] = set()

    def key_of(c: _Candidate) -> tuple[str, str, str]:
        r = c.recipe
        return (
            (r.base_spirit or "").strip().lower(),
            (r.category or "").strip().lower(),
            (r.method or "").strip().lower(),
        )

    # 第一轮：尽量不撞基酒/品类/技法
    for c in ordered:
        if len(picked) >= limit:
            break
        spirit, cat, method = key_of(c)
        if spirit and spirit in used_spirit:
            continue
        if cat and cat in used_category:
            continue
        if method and method in used_method:
            continue
        picked.append(c)
        if spirit:
            used_spirit.add(spirit)
        if cat:
            used_category.add(cat)
        if method:
            used_method.add(method)

    # 第二轮：只避开基酒重复
    if len(picked) < limit:
        picked_ids = {c.recipe.id for c in picked}
        for c in ordered:
            if len(picked) >= limit:
                break
            if c.recipe.id in picked_ids:
                continue
            spirit, _, _ = key_of(c)
            if spirit and spirit in used_spirit:
                continue
            picked.append(c)
            picked_ids.add(c.recipe.id)
            if spirit:
                used_spirit.add(spirit)

    # 第三轮：按分数补齐
    if len(picked) < limit:
        picked_ids = {c.recipe.id for c in picked}
        for c in ordered:
            if len(picked) >= limit:
                break
            if c.recipe.id in picked_ids:
                continue
            picked.append(c)
            picked_ids.add(c.recipe.id)

    return picked


def _ingredient_rows(recipe: Recipe) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for link in recipe.ingredients or []:
        ing = link.ingredient
        if ing is None:
            continue
        amount = link.amount
        rows.append(
            {
                "name": ing.name or "",
                "name_en": ing.name_en or "",
                "amount": float(amount) if amount is not None else None,
                "unit": link.unit or "",
            }
        )
    return rows


def _to_recipe_dict(c: _Candidate) -> dict[str, Any]:
    r = c.recipe
    return {
        "recipe_id": r.id,
        "name": r.name or "",
        "name_en": r.name_en or "",
        "category": r.category or "",
        "base_spirit": r.base_spirit or "",
        "glass": r.glass or "",
        "method": r.method_label or r.method or "",
        "image_url": r.image_url or "",
        "match_type": c.match_type,
        "missing": c.missing,
        "substitutes": c.substitutes,
        "instructions": r.instructions or "",
        "ingredients": _ingredient_rows(r),
    }


def build_cabinet_menu(
    db: Session,
    snapshot: list[dict[str, Any]],
    *,
    limit: int = 5,
    diversity: bool = True,
) -> dict[str, Any]:
    """根据库存快照生成酒单。"""
    limit = max(1, min(int(limit or 5), 50))
    cabinet_keys = _cabinet_keys(snapshot or [])
    if not cabinet_keys:
        return {"recipes": []}

    # 只拉含刚性材料的配方，减少扫描量
    rigid_recipe_ids = (
        db.query(RecipeIngredient.recipe_id)
        .join(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id)
        .filter(Ingredient.category.in_(tuple(RIGID_CATEGORIES)))
        .distinct()
        .all()
    )
    ids = [row[0] for row in rigid_recipe_ids]
    if not ids:
        return {"recipes": []}

    recipes = (
        db.query(Recipe)
        .options(
            joinedload(Recipe.ingredients).joinedload(RecipeIngredient.ingredient),
        )
        .filter(Recipe.id.in_(ids))
        .all()
    )

    candidates: list[_Candidate] = []
    for recipe in recipes:
        evaluated = _evaluate_recipe(recipe, cabinet_keys)
        if evaluated is not None:
            candidates.append(evaluated)

    if not candidates:
        return {"recipes": []}

    # 过采样后再做多样性挑选，保证分散时还有余量
    pool_size = limit * 5 if diversity else limit
    top = sorted(candidates, key=lambda c: c.score, reverse=True)[: max(pool_size, limit)]
    selected = _diversify(top, limit) if diversity else top[:limit]

    # 最终仍按分数排一下，full 靠前更符合「尽量先匹配刚性」
    selected = sorted(selected, key=lambda c: c.score, reverse=True)
    return {"recipes": [_to_recipe_dict(c) for c in selected]}
