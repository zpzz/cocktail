"""Postgres 表结构。配方主表 + 材料子表，用 (source, source_id) 防重复。"""

from datetime import datetime, timezone

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
    text,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


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


class RecipeIngredient(Base):
    __tablename__ = "kb_recipe_ingredient"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("kb_recipe.id", ondelete="CASCADE"), nullable=False, index=True)
    ingredient_name = Column(String(128), nullable=False)
    amount = Column(Numeric(10, 2), nullable=True)
    unit = Column(String(16), default="")
    order_index = Column(Integer, default=1)

    recipe = relationship("Recipe", back_populates="ingredients")


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


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # create_all 不会给已有表加新列，这里补齐后期加上的字段
    statements = [
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS method_label VARCHAR(64) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS category VARCHAR(32) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS base_spirit VARCHAR(64) DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''",
        "ALTER TABLE kb_recipe ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT ''",
        "ALTER TABLE kb_recipe ALTER COLUMN abv_range TYPE VARCHAR(32)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
