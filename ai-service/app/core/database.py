"""Postgres 表结构。配方主表 + 材料主数据 + 配方用量关联。"""

from datetime import datetime, timezone

import psycopg
from pgvector.psycopg import register_vector
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.config import DATABASE_URL, EMBEDDING_DIM

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _register_vector(dbapi_connection, _connection_record) -> None:
    # 扩展尚未创建时先跳过；init_db 里 CREATE EXTENSION 后再注册
    try:
        register_vector(dbapi_connection)
    except psycopg.ProgrammingError:
        pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Recipe(Base):
    """kb_recipe：一条鸡尾酒配方。image_url 指向 MinIO，不存二进制。"""

    __tablename__ = "kb_recipe"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_kb_recipe_source_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(32), nullable=False, index=True)  # mixmyth / cocktaildb
    source_id = Column(String(128), nullable=False)  # 源站自己的 ID
    name = Column(String(128), nullable=False)
    name_en = Column(String(128), default="")
    glass = Column(String(64), default="")
    method = Column(String(32), default="other")  # shake/stir/... 给程序用
    method_label = Column(String(64), default="")  # 如「Shake 摇荡」，给页面展示
    ice_type = Column(String(32), default="")
    garnish = Column(String(128), default="")
    abv_range = Column(String(32), default="")
    category = Column(String(32), default="")
    base_spirit = Column(String(64), default="")
    description = Column(Text, default="")
    description_en = Column(Text, default="")
    flavor_tags = Column(Text, default="[]")  # JSON 数组字符串
    instructions = Column(Text, default="")
    image_url = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    ingredients = relationship(
        "RecipeIngredient",
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredient.order_index",
    )
    chunks = relationship(
        "RecipeChunk",
        back_populates="recipe",
        cascade="all, delete-orphan",
    )


class Ingredient(Base):
    """kb_ingredient：材料主数据（名称/分类/主单位/图片），配方间共享。"""

    __tablename__ = "kb_ingredient"
    __table_args__ = (UniqueConstraint("slug", name="uq_kb_ingredient_slug"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, default="")
    name_en = Column(String(128), default="")
    slug = Column(String(128), nullable=False)  # 归一化英文键，用于去重
    category = Column(String(32), default="")
    primary_unit = Column(String(16), default="")  # 库存/展示用主单位；配方行仍用自己的 unit
    image_url = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    recipe_links = relationship("RecipeIngredient", back_populates="ingredient")


class RecipeIngredient(Base):
    """kb_recipe_ingredient：配方里的用量行（只存 amount/unit/顺序）。"""

    __tablename__ = "kb_recipe_ingredient"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("kb_recipe.id", ondelete="CASCADE"), nullable=False, index=True)
    ingredient_id = Column(
        Integer, ForeignKey("kb_ingredient.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount = Column(Numeric(10, 2), nullable=True)
    unit = Column(String(16), default="")
    order_index = Column(Integer, default=1)

    recipe = relationship("Recipe", back_populates="ingredients")
    ingredient = relationship("Ingredient", back_populates="recipe_links")


class RecipeChunk(Base):
    """kb_chunk：一条配方一段检索文本 + 向量。对话检索只读这张表。"""

    __tablename__ = "kb_chunk"
    __table_args__ = (UniqueConstraint("recipe_id", "chunk_type", name="uq_kb_chunk_recipe_type"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("kb_recipe.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(32), nullable=False, index=True)
    source_id = Column(String(128), nullable=False)
    chunk_type = Column(String(32), nullable=False, default="recipe_full")
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    recipe = relationship("Recipe", back_populates="chunks")


class CrawlRun(Base):
    """每次点击「开始爬取」记一条，方便排查失败。"""

    __tablename__ = "crawl_run"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default="running")
    fetched = Column(Integer, default=0)
    upserted = Column(Integer, default=0)
    message = Column(Text, default="")
    started_at = Column(DateTime(timezone=True), default=utcnow)
    finished_at = Column(DateTime(timezone=True), nullable=True)


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:table AND column_name=:column"
        ),
        {"table": table, "column": column},
    ).fetchone()
    return row is not None


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:table"
        ),
        {"table": table},
    ).fetchone()
    return row is not None


def _migrate_ingredient_schema() -> None:
    """旧版材料字段在用量表时，迁到 kb_ingredient 并瘦身关联表。

    兼容几种中间态：
    - 仅有 ingredient_name（可能还没有 name_en / category / image_url）
    - 已有 ingredient_id、旧列已删 → 直接跳过
    """
    from app.ingredients.clean import (
        build_canonical_display,
        canonicalize_name_en,
        extract_zh_name,
        normalize_en_key,
        split_name_en,
    )

    with engine.begin() as conn:
        if not _table_exists(conn, "kb_recipe_ingredient"):
            return
        has_legacy_name = _column_exists(conn, "kb_recipe_ingredient", "ingredient_name")
        has_ingredient_id = _column_exists(conn, "kb_recipe_ingredient", "ingredient_id")
        if not has_legacy_name:
            # 已是新结构，或空壳表
            return

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS kb_ingredient (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(128) NOT NULL DEFAULT '',
                    name_en VARCHAR(128) DEFAULT '',
                    slug VARCHAR(128) NOT NULL,
                    category VARCHAR(32) DEFAULT '',
                    primary_unit VARCHAR(16) DEFAULT '',
                    image_url TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_ingredient_slug ON kb_ingredient (slug)")
        )
        if not has_ingredient_id:
            conn.execute(
                text("ALTER TABLE kb_recipe_ingredient ADD COLUMN ingredient_id INTEGER")
            )

        # 按实际存在的列拼 SELECT，避免半迁移库缺 name_en 等列
        select_parts = ["id", "ingredient_name"]
        for optional in ("name_en", "category", "image_url"):
            if _column_exists(conn, "kb_recipe_ingredient", optional):
                select_parts.append(f"COALESCE({optional}, '') AS {optional}")
            else:
                select_parts.append(f"'' AS {optional}")
        old_rows = conn.execute(
            text(f"SELECT {', '.join(select_parts)} FROM kb_recipe_ingredient")
        ).fetchall()

        slug_to_id: dict[str, int] = {}
        for row in old_rows:
            raw_name = (row.ingredient_name or "").strip()
            name_en = (row.name_en or "").strip()
            if not name_en:
                _, name_en = split_name_en(raw_name)
            name_en = canonicalize_name_en(name_en)
            slug = (normalize_en_key(name_en) or f"raw:{(raw_name or 'unknown').lower()}")[:128]
            category = (row.category or "")[:32]
            image_url = row.image_url or ""

            if slug in slug_to_id:
                ingredient_id = slug_to_id[slug]
                if image_url or category or name_en:
                    conn.execute(
                        text(
                            """
                            UPDATE kb_ingredient SET
                              image_url = CASE WHEN image_url = '' OR image_url IS NULL
                                THEN :image_url ELSE image_url END,
                              category = CASE WHEN category = '' OR category IS NULL
                                THEN :category ELSE category END,
                              name_en = CASE WHEN name_en = '' OR name_en IS NULL
                                THEN :name_en ELSE name_en END,
                              updated_at = NOW()
                            WHERE id = :id
                            """
                        ),
                        {
                            "id": ingredient_id,
                            "image_url": image_url,
                            "category": category,
                            "name_en": name_en[:128],
                        },
                    )
            else:
                zh = extract_zh_name(raw_name)
                display = build_canonical_display(zh, name_en, raw_name or name_en or "未命名")
                ingredient_id = conn.execute(
                    text(
                        """
                        INSERT INTO kb_ingredient (name, name_en, slug, category, image_url)
                        VALUES (:name, :name_en, :slug, :category, :image_url)
                        RETURNING id
                        """
                    ),
                    {
                        "name": display[:128],
                        "name_en": name_en[:128],
                        "slug": slug,
                        "category": category,
                        "image_url": image_url,
                    },
                ).scalar_one()
                slug_to_id[slug] = ingredient_id

            conn.execute(
                text("UPDATE kb_recipe_ingredient SET ingredient_id = :iid WHERE id = :id"),
                {"iid": ingredient_id, "id": row.id},
            )

        # 没有名字、无法映射的行丢掉
        conn.execute(text("DELETE FROM kb_recipe_ingredient WHERE ingredient_id IS NULL"))
        conn.execute(
            text("ALTER TABLE kb_recipe_ingredient ALTER COLUMN ingredient_id SET NOT NULL")
        )
        conn.execute(
            text(
                """
                DO $$ BEGIN
                  ALTER TABLE kb_recipe_ingredient
                    ADD CONSTRAINT fk_kb_recipe_ingredient_ingredient
                    FOREIGN KEY (ingredient_id) REFERENCES kb_ingredient(id)
                    ON DELETE RESTRICT;
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$;
                """
            )
        )
        for column in ("ingredient_name", "name_en", "category", "image_url"):
            conn.execute(
                text(f"ALTER TABLE kb_recipe_ingredient DROP COLUMN IF EXISTS {column}")
            )


def init_db() -> None:
    with engine.begin() as conn:
        # PG15+ 或误删后可能没有 public，先建好再装扩展/建表
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        conn.execute(text("SET search_path TO public"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public"))
        # 当前连接在 CREATE EXTENSION 前就连上了，补一次注册
        register_vector(conn.connection.dbapi_connection)
    Base.metadata.create_all(bind=engine)
    statements = [
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS method_label VARCHAR(64) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS category VARCHAR(32) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS base_spirit VARCHAR(64) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT ''",
        "ALTER TABLE kb_recipe ALTER COLUMN abv_range TYPE VARCHAR(32)",
        "ALTER TABLE kb_ingredient ADD COLUMN IF NOT EXISTS primary_unit VARCHAR(16) DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_kb_chunk_embedding ON kb_chunk USING hnsw (embedding vector_cosine_ops)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
    # 先迁列再建索引，避免旧库尚无 ingredient_id 时建索引失败
    _migrate_ingredient_schema()
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_kb_recipe_ingredient_ingredient_id "
                "ON kb_recipe_ingredient (ingredient_id)"
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
