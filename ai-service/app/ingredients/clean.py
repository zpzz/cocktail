"""清洗 kb_ingredient：补英文名、AI 分类，并按 slug 归并重复材料。"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from collections.abc import Callable

from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.core.database import Ingredient, RecipeIngredient

CATEGORIES = ("基酒", "利口酒", "糖浆", "果汁/软饮", "新鲜材料", "苦精", "装饰")
BATCH_SIZE = 40

_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("装饰", ("garnish", "装饰", "twist", "皮", "片", "条", "橄榄", "cherry", "mint", "薄荷", "橙皮", "柠檬皮")),
    ("苦精", ("bitters", "苦精", "angostura", "orange bitters")),
    ("糖浆", ("syrup", "糖浆", "grenadine", "蜜", "honey", "agave", "sugar")),
    ("果汁/软饮", ("juice", "汁", "soda", "苏打", "tonic", "汤力", "可乐", "cola", "ginger beer", "水", "tea", "茶")),
    ("新鲜材料", ("egg", "蛋白", "蛋黄", "cream", "奶油", "milk", "鲜", "cucumber", "黄瓜", "姜", "ginger", "chili", "salt", "盐", "ice", "冰")),
    ("利口酒", ("liqueur", "利口", "vermouth", "味美思", "campari", "金巴利", "aperol", "cointreau", "triple sec", "kahlua", "amaretto", "chartreuse", "benedictine", "chambord", "absinthe", "苦艾")),
    ("基酒", ("gin", "金酒", "vodka", "伏特加", "rum", "朗姆", "whiskey", "whisky", "威士忌", "bourbon", "波本", "tequila", "龙舌兰", "brandy", "白兰地", "cognac", "干邑", "mezcal", "pisco", "cachaca")),
]

_EN_ALIASES = {
    "fresh lime juice": "Lime Juice",
    "lime juice": "Lime Juice",
    "fresh lemon juice": "Lemon Juice",
    "lemon juice": "Lemon Juice",
    "simple syrup": "Simple Syrup",
    "sugar syrup": "Simple Syrup",
    "soda water": "Soda Water",
    "club soda": "Soda Water",
    "sparkling water": "Soda Water",
    "egg white": "Egg White",
    "egg whites": "Egg White",
    "dry vermouth": "Dry Vermouth",
    "sweet vermouth": "Sweet Vermouth",
    "orange bitters": "Orange Bitters",
    "angostura bitters": "Angostura Bitters",
    "triple sec": "Triple Sec",
    "coffee liqueur": "Coffee Liqueur",
    "kahlua": "Coffee Liqueur",
    "kahlúa": "Coffee Liqueur",
}


def _has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))


_OPTIONAL_SUFFIX = re.compile(
    r"\s*[\(（]\s*(optional|to taste|garnish|装饰|或省略|可选)[^）)]*[\)）]\s*$",
    re.I,
)
_PAREN_CHUNK = re.compile(r"[\(（][^（）()]*[\)）]")


def _strip_unbalanced_trailing_parens(text: str) -> str:
    """只去掉多余的右括号，保留 Dry Sherry (Fino) 这类成对括号。"""
    current = (text or "").rstrip()
    while current.endswith(")") or current.endswith("）"):
        opens = current.count("(") + current.count("（")
        closes = current.count(")") + current.count("）")
        if closes <= opens:
            break
        current = current[:-1].rstrip()
    return current


def _strip_paren_chunks(text: str) -> str:
    """反复去掉最内层括号段，避免嵌套英文括号残留。"""
    prev = None
    current = text or ""
    while prev != current:
        prev = current
        current = _PAREN_CHUNK.sub("", current)
    return _strip_unbalanced_trailing_parens(current).strip(" ，,;/")


def extract_zh_name(raw: str) -> str:
    """只保留中文主体，去掉英文括号段和残留 )。"""
    text = (raw or "").strip()
    if not text:
        return ""
    # 已是「中文 (English)」时，取第一个全角/半角左括号前的中文
    for sep in (" (", "（"):
        idx = text.find(sep)
        if idx > 0 and _has_cjk(text[:idx]):
            head = text[:idx].strip()
            # 去掉头里残留的英文括号碎片
            head = _strip_paren_chunks(head)
            head = re.sub(r"[A-Za-z].*$", "", head).strip(" ，,;/") or head
            if _has_cjk(head):
                return head[:64]
    if _has_cjk(text):
        cleaned = _strip_paren_chunks(text)
        # 去掉夹在中间的纯英文词，保留中文与必要符号
        cleaned = re.sub(r"[A-Za-z][A-Za-z0-9 .'\-/&]*", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，,;/")
        return cleaned[:64]
    return ""


def _peel_optional_chunks(text: str) -> str:
    current = text or ""
    for _ in range(6):
        nxt = _OPTIONAL_SUFFIX.sub("", current).strip()
        nxt = re.sub(
            r"[\(（]\s*(optional|to taste|garnish|装饰|或省略|可选)[^）)]*[\)）]",
            "",
            nxt,
            flags=re.I,
        )
        nxt = re.sub(r"\s+", " ", nxt).strip()
        if nxt == current:
            break
        current = nxt
    return current


def _trailing_english_phrase(text: str) -> str:
    """从展示名里抽出英文短语，兼容 Dry Sherry (Fino) 这类品牌括号。"""
    text = _peel_optional_chunks(text)
    best = ""
    for match in re.finditer(r"[\(（]", text):
        chunk = text[match.start() :]
        inner = chunk[1:] if chunk else ""
        # 去掉最外层配对右括号（若有）
        if inner.endswith(")") or inner.endswith("）"):
            # 仅当去掉后括号仍平衡或更合理时剥一层
            candidate = inner[:-1]
            opens = candidate.count("(") + candidate.count("（")
            closes = candidate.count(")") + candidate.count("）")
            if closes >= opens:
                inner = candidate
        inner = _strip_unbalanced_trailing_parens(inner).strip()
        if not inner or _has_cjk(inner):
            continue
        if len(inner) > len(best):
            best = inner
    return best


def split_name_en(raw: str) -> tuple[str, str]:
    text = (raw or "").strip()
    if not text:
        return "", ""
    english = _trailing_english_phrase(text)
    if english:
        return text, canonicalize_name_en(english)
    peeled = _peel_optional_chunks(text)
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 .'\-/&()*]*", peeled):
        return text, canonicalize_name_en(peeled)
    return text, ""


def canonicalize_name_en(name_en: str) -> str:
    text = _peel_optional_chunks((name_en or "").strip())
    text = re.sub(r"^fresh(ly)?\s+", "", text, flags=re.I).strip()
    text = _strip_unbalanced_trailing_parens(text).strip()
    # 去掉末尾再叠一层相同英文：Lime Juice (Lime Juice)
    dup = re.match(r"^(?P<body>.+?)\s*[\(（](?P<inner>.+)[\)）]\s*$", text)
    if dup:
        body, inner = dup.group("body").strip(), dup.group("inner").strip()
        if body.lower() == inner.lower():
            text = body
    key = re.sub(r"\s+", " ", text.lower())
    if key in _EN_ALIASES:
        return _EN_ALIASES[key]
    # 纯 ASCII 再做首字母大写；含 (Fino) 等则原样保留主体大小写
    if key and re.fullmatch(r"[a-z0-9][a-z0-9 .'\-/&]*", key):
        return " ".join(part.capitalize() if part.isalpha() else part for part in text.split(" "))
    return text[:64]


def normalize_en_key(name_en: str) -> str:
    return re.sub(r"\s+", " ", canonicalize_name_en(name_en).lower()).strip()


def build_canonical_display(zh: str, name_en: str = "", fallback: str = "") -> str:
    """name 只存中文；没有中文时才退回纯英文（不拼「中文 (English)」）。"""
    chinese = extract_zh_name(zh) if zh else ""
    if not chinese and fallback:
        chinese = extract_zh_name(fallback)
    if chinese:
        return chinese[:128]
    # 无中文时：name 用英文主体，去掉解释性括号（Calvados (apple brandy) → Calvados）
    english = canonicalize_name_en(name_en or "")
    if not english and fallback:
        _, english = split_name_en(fallback)
        english = canonicalize_name_en(english)
    if english:
        return (_strip_paren_chunks(english) or english)[:128]
    cleaned = _strip_paren_chunks(fallback or "").strip()
    return (cleaned or "未命名")[:128]


def rule_category(name: str, name_en: str = "") -> str:
    hay = f"{name} {name_en}".lower()
    for category, keywords in _RULES:
        if any(key.lower() in hay for key in keywords):
            return category
    return ""


def _llm() -> ChatOpenAI:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY，无法用 AI 分类材料")
    return ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        temperature=0,
    )


def _classify_batch(names: list[str]) -> dict[str, dict[str, str]]:
    categories = " / ".join(CATEGORIES)
    prompt = (
        "你是鸡尾酒材料清洗助手。对下面每条材料给出标准英文名和分类。\n"
        f"分类只能是：{categories}\n"
        "要求：\n"
        "1) name_en 用常见标准英文（如 Lime Juice，不要写 Fresh Lime Juice）\n"
        "2) 「金酒 (Gin)」与「Gin (金酒)」的 name_en 都必须是 Gin\n"
        "3) 装饰类去掉 garnish 说明，只保留主体英文名\n"
        "严格输出 JSON 数组，每项字段：name（原样回传）、name_en、category。不要 markdown。\n\n"
        + "\n".join(f"- {name}" for name in names)
    )
    response = _llm().invoke(prompt)
    content = getattr(response, "content", "") or ""
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    data = json.loads(content)
    result: dict[str, dict[str, str]] = {}
    if not isinstance(data, list):
        return result
    for row in data:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        name_en = canonicalize_name_en(str(row.get("name_en") or ""))
        category = str(row.get("category") or "").strip()
        if category not in CATEGORIES:
            category = rule_category(name, name_en)
        result[name] = {"name_en": name_en, "category": category}
    return result


def _fill_primary_units(db: Session, *, force: bool = False) -> int:
    """用配方用量里出现最多的单位，回填材料主单位（库存用）。"""
    rows = db.query(Ingredient).order_by(Ingredient.id).all()
    updated = 0
    for row in rows:
        if not force and (row.primary_unit or "").strip():
            continue
        votes: dict[str, int] = defaultdict(int)
        for link in row.recipe_links:
            unit = (link.unit or "").strip()
            if unit:
                votes[unit] += 1
        if not votes:
            continue
        best = max(votes.items(), key=lambda item: (item[1], len(item[0])))[0][:16]
        if row.primary_unit != best:
            row.primary_unit = best
            updated += 1
    return updated


def _merge_duplicate_ingredients(db: Session) -> int:
    """同 slug 的材料主数据合并，并把用量行指到保留的那条。"""
    rows = db.query(Ingredient).order_by(Ingredient.id).all()
    groups: dict[str, list[Ingredient]] = defaultdict(list)
    for row in rows:
        key = normalize_en_key(row.name_en or "") or row.slug or f"id:{row.id}"
        groups[key].append(row)

    merged = 0
    for group in groups.values():
        if len(group) < 2:
            # 仍可规范单条显示名
            row = group[0]
            name_en = canonicalize_name_en(row.name_en or "")
            zh = extract_zh_name(row.name)
            display = build_canonical_display(zh, name_en, row.name)
            slug = (normalize_en_key(name_en) or row.slug)[:128]
            if name_en and row.name_en != name_en:
                row.name_en = name_en[:128]
                merged += 1
            if display and row.name != display:
                row.name = display
                merged += 1
            if slug and row.slug != slug:
                # slug 冲突时跳过改 slug
                clash = db.query(Ingredient).filter(Ingredient.slug == slug, Ingredient.id != row.id).first()
                if clash is None:
                    row.slug = slug
                    merged += 1
            continue

        keep = group[0]
        name_en = canonicalize_name_en(keep.name_en or next((g.name_en for g in group if g.name_en), ""))
        zh_votes: dict[str, int] = defaultdict(int)
        cat_votes: dict[str, int] = defaultdict(int)
        best_image = keep.image_url or ""
        for row in group:
            zh = extract_zh_name(row.name)
            if zh:
                zh_votes[zh] += 1
            if row.category:
                cat_votes[row.category] += 1
            if not best_image and row.image_url:
                best_image = row.image_url
            if not name_en and row.name_en:
                name_en = canonicalize_name_en(row.name_en)
        zh = max(zh_votes.items(), key=lambda item: (item[1], len(item[0])))[0] if zh_votes else extract_zh_name(keep.name)
        category = max(cat_votes.items(), key=lambda item: item[1])[0] if cat_votes else (keep.category or "")
        display = build_canonical_display(zh, name_en, keep.name)
        slug = (normalize_en_key(name_en) or keep.slug)[:128]

        unit_votes: dict[str, int] = defaultdict(int)
        for row in group:
            if row.primary_unit:
                unit_votes[row.primary_unit] += 1
        primary_unit = (
            max(unit_votes.items(), key=lambda item: item[1])[0]
            if unit_votes
            else (keep.primary_unit or "")
        )

        keep.name = display
        keep.name_en = name_en[:128]
        keep.category = category[:32]
        keep.primary_unit = (primary_unit or keep.primary_unit or "")[:16]
        keep.image_url = best_image or keep.image_url
        if not db.query(Ingredient).filter(Ingredient.slug == slug, Ingredient.id != keep.id).first():
            keep.slug = slug

        for row in group[1:]:
            db.query(RecipeIngredient).filter(RecipeIngredient.ingredient_id == row.id).update(
                {RecipeIngredient.ingredient_id: keep.id},
                synchronize_session=False,
            )
            db.delete(row)
            merged += 1
    return merged


def _repair_display_names(db: Session) -> int:
    """修复历史脏数据：残留 )、重复 (English)、截断拼接。"""
    rows = db.query(Ingredient).order_by(Ingredient.id).all()
    fixed = 0
    for row in rows:
        english = canonicalize_name_en(row.name_en or "")
        if not english:
            _, english = split_name_en(row.name or "")
            english = canonicalize_name_en(english)
        zh = extract_zh_name(row.name or "")
        display = build_canonical_display(zh, english, row.name or "")
        changed = False
        if english and row.name_en != english[:128]:
            row.name_en = english[:128]
            changed = True
        if display and row.name != display:
            row.name = display
            changed = True
        if changed:
            fixed += 1
    return fixed


def clean_ingredients(
    db: Session,
    *,
    force: bool = False,
    on_progress: Callable[[str, int, int], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> dict[str, int]:
    """清洗材料主表：修复展示名 → 拆英文名 → AI 分类 → 合并重复。"""
    rows = db.query(Ingredient).order_by(Ingredient.id).all()
    if on_progress:
        on_progress("修复中文展示名", 0, len(rows))
    repaired = _repair_display_names(db)
    db.commit()
    rows = db.query(Ingredient).order_by(Ingredient.id).all()
    if on_progress:
        on_progress("拆分英文名", 0, len(rows))
    for row in rows:
        _, parsed_en = split_name_en(row.name)
        parsed_en = canonicalize_name_en(parsed_en or row.name_en or "")
        if parsed_en and (force or not (row.name_en or "").strip()):
            row.name_en = parsed_en[:128]
    db.commit()

    pending_names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = (row.name or "").strip()
        if not name or name in seen:
            continue
        if force or not (row.category or "").strip() or not (row.name_en or "").strip():
            pending_names.append(name)
            seen.add(name)

    classified: dict[str, dict[str, str]] = {}
    total = len(pending_names)
    if on_progress:
        on_progress("准备 AI 分类", 0, total)

    for start in range(0, total, BATCH_SIZE):
        if should_stop and should_stop():
            break
        batch = pending_names[start : start + BATCH_SIZE]
        try:
            classified.update(_classify_batch(batch))
        except Exception:
            for name in batch:
                _, en = split_name_en(name)
                en = canonicalize_name_en(en)
                classified[name] = {"name_en": en, "category": rule_category(name, en)}
        done = min(start + len(batch), total)
        if on_progress:
            on_progress("AI 分类材料", done, total)

    updated = 0
    for row in rows:
        name = (row.name or "").strip()
        info = classified.get(name)
        if not info:
            if force or not (row.category or "").strip():
                cat = rule_category(name, row.name_en or "")
                if cat:
                    row.category = cat
                    updated += 1
            continue
        changed = False
        if info["name_en"] and (force or not (row.name_en or "").strip() or force):
            row.name_en = info["name_en"][:128]
            changed = True
        if info["category"] and (force or not (row.category or "").strip()):
            row.category = info["category"][:32]
            changed = True
        zh = extract_zh_name(row.name)
        display = build_canonical_display(zh, row.name_en or "", row.name)
        if display != row.name:
            row.name = display
            changed = True
        if changed:
            updated += 1
    db.commit()

    if on_progress:
        on_progress("归并重复材料", 0, 1)
    merged = _merge_duplicate_ingredients(db)
    db.commit()
    if on_progress:
        on_progress("归并重复材料", 1, 1)

    if on_progress:
        on_progress("回填主单位", 0, 1)
    filled_units = _fill_primary_units(db, force=force)
    db.commit()
    if on_progress:
        on_progress("回填主单位", 1, 1)

    return {
        "scanned": len(rows),
        "unique": total,
        "updated": updated + merged + filled_units + repaired,
        "merged": merged,
        "primary_units": filled_units,
        "repaired_names": repaired,
    }
