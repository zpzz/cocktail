"""
Web 入口。

启动：
    cd ai-service
    .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

/           管理页（选站点爬取、浏览配方）
/api/*      管理页 JSON 接口，见 app/api/routes.py
/api/ai/*   APP 用 AI 接口，见 app/api/ai.py
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.ai import router as ai_router
from app.api.routes import router
from app.core.database import init_db
from app.core.storage import ensure_bucket

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动时建表、确保 MinIO bucket 存在
    init_db()
    ensure_bucket()
    yield


app = FastAPI(title="Cocktail Knowledge MVP", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api")
app.include_router(ai_router, prefix="/api/ai")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
