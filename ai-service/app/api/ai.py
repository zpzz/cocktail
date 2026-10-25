"""APP 用的 AI 接口，统一挂在 /api/ai。"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import DEEPSEEK_API_KEY
from app.rag.graph import stream_chat

router = APIRouter()


class ChatStreamRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=4000)


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
