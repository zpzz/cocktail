"""从仓库根目录 .env 读取配置。"""

from pathlib import Path
import os

from dotenv import load_dotenv

# ai-service/ 与仓库根目录（docker-compose、.env 在根目录）
BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env", override=True)


def _database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL", "")
    user = os.getenv("POSTGRES_USER", "cocktail")
    password = os.getenv("POSTGRES_PASSWORD", "cocktail")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    name = os.getenv("POSTGRES_DB", "cocktail")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"


DATABASE_URL = _database_url()

# 爬虫礼貌间隔，避免打太快
CRAWL_USER_AGENT = os.getenv("CRAWL_USER_AGENT", "CocktailMVP/0.1 (+local ingest; educational)")
MIXMYTH_DELAY_SECONDS = float(os.getenv("MIXMYTH_DELAY_SECONDS", "0.8"))
COCKTAILDB_DELAY_SECONDS = float(os.getenv("COCKTAILDB_DELAY_SECONDS", "0.35"))
COCKTAILDB_API_KEY = os.getenv("COCKTAILDB_API_KEY", "1")  # 官方测试 key

# MinIO：配方图存 bucket，数据库只存 URL
MINIO_ENDPOINT = os.getenv(
    "MINIO_ENDPOINT",
    f"{os.getenv('MINIO_HOST', '127.0.0.1')}:{os.getenv('MINIO_API_PORT', '9000')}",
)
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "cocktail-images")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
MINIO_PUBLIC_BASE = os.getenv(
    "MINIO_PUBLIC_BASE",
    f"{'https' if MINIO_SECURE else 'http'}://{MINIO_ENDPOINT}",
)
