"""APP 用的 AI 接口，统一挂在 /api/ai。"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.cabinet.menu import build_cabinet_menu
from app.config import DEEPSEEK_API_KEY, IMAGE_API_KEY
from app.core.database import SessionLocal
from app.ingredients.recognize import recognize_bottle_labels
from app.rag.graph import stream_chat
from app.workbench.analyze import analyze_session
from app.workbench.generate import stream_generate

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatStreamRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=4000)


class CabinetMenuRequest(BaseModel):
    cabinet_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    limit: int = Field(default=5, ge=1, le=50)
    diversity: bool = True


@router.post("/chat/stream")
async def chat_stream(payload: ChatStreamRequest):
    """SSE 流式对话：意图 → 检索或反问 → token → 库内图或定制生图。"""
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="未配置 DEEPSEEK_API_KEY")
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="请输入问题")
    session_id = payload.session_id.strip() or "default"

    async def events():
        async for event in stream_chat(session_id, message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/ingredients/recognize")
async def ingredients_recognize(file: UploadFile = File(...)):
    """
    酒瓶/材料拍照识别。
    返回 labels 供 Java 匹配 kb_ingredient：
    {"labels":[{"name":"...","name_en":"...","confidence":0.9}]}
    """
    if not IMAGE_API_KEY:
        raise HTTPException(status_code=500, detail="未配置 IMAGE_API_KEY")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="请上传图片")
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片过大（上限 12MB）")

    try:
        labels = await recognize_bottle_labels(
            raw,
            filename=file.filename,
            content_type=file.content_type,
        )
    except httpx.HTTPStatusError as exc:
        logger.exception("vision api http error")
        detail = str(exc) or f"识图服务失败: {exc.response.status_code}"
        raise HTTPException(status_code=502, detail=detail) from exc
    except Exception as exc:
        logger.exception("recognize failed")
        raise HTTPException(status_code=502, detail=f"识图失败: {exc}") from exc

    return {"labels": labels}


@router.post("/cabinet/menu")
async def cabinet_menu(payload: CabinetMenuRequest):
    """
    按酒柜库存生成酒单。
    优先匹配基酒 / 利口酒 / 糖浆；装饰忽略；默认 5 条并尽量品类分散。
    """
    db = SessionLocal()
    try:
        return build_cabinet_menu(
            db,
            payload.cabinet_snapshot,
            limit=payload.limit,
            diversity=payload.diversity,
        )
    except Exception as exc:
        logger.exception("cabinet menu failed")
        raise HTTPException(status_code=502, detail=f"酒单生成失败: {exc}") from exc
    finally:
        db.close()


@router.post("/workbench/analyze")
async def workbench_analyze(payload: dict[str, Any]):
    """成杯可行性分析（规则 + 风味摘要）。"""
    try:
        return analyze_session(payload or {})
    except Exception as exc:
        logger.exception("workbench analyze failed")
        raise HTTPException(status_code=502, detail=f"分析失败: {exc}") from exc


@router.post("/workbench/generate")
async def workbench_generate(payload: dict[str, Any]):
    """生成特调：SSE 推送 token / recipe / image / done。"""
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="未配置 DEEPSEEK_API_KEY")

    async def events():
        async for event in stream_generate(payload or {}):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
