"""稠密向量：默认走千问 OpenAI 兼容接口；也可回退本地 BGE-M3。输出做 L2 归一化便于余弦检索。"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Sequence

import httpx

from app.config import (
    BASE_DIR,
    EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL,
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    EMBEDDING_PROVIDER,
    ROOT_DIR,
)

# 本地模型进程内只加载一次；api 模式不使用
_local_model = None


def _l2_normalize(vectors: list[list[float]]) -> list[list[float]]:
    normalized: list[list[float]] = []
    for vec in vectors:
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        normalized.append([x / norm for x in vec])
    return normalized


def _local_model_path() -> str:
    """EMBEDDING_MODEL 可以是相对路径（相对 ai-service/ 或仓库根）。找不到目录则原样当 Hub id。"""
    raw = EMBEDDING_MODEL
    path = Path(raw).expanduser()
    candidates = [path] if path.is_absolute() else [BASE_DIR / raw, ROOT_DIR / raw, Path.cwd() / raw]
    for candidate in candidates:
        if candidate.is_dir() and (candidate / "config.json").is_file():
            return str(candidate.resolve())
    return raw


def _encode_local(texts: list[str]) -> list[list[float]]:
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer

        model_path = _local_model_path()
        local_only = Path(model_path).is_dir()
        # local_files_only：目录存在时禁止再访问 Hugging Face
        _local_model = SentenceTransformer(model_path, local_files_only=local_only)
    vectors = _local_model.encode(
        texts,
        batch_size=EMBEDDING_BATCH_SIZE,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [row.tolist() for row in vectors]


def _encode_api(texts: list[str]) -> list[list[float]]:
    if not EMBEDDING_BASE_URL:
        raise RuntimeError("EMBEDDING_PROVIDER=api 时需要配置 EMBEDDING_BASE_URL")
    if not EMBEDDING_API_KEY:
        raise RuntimeError("EMBEDDING_PROVIDER=api 时需要 EMBEDDING_API_KEY 或 IMAGE_API_KEY")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {EMBEDDING_API_KEY}",
    }
    url = f"{EMBEDDING_BASE_URL}/embeddings"
    body = {
        "model": EMBEDDING_MODEL,
        "input": texts,
        "encoding_format": "float",
        "dimensions": EMBEDDING_DIM,
    }
    with httpx.Client(timeout=120.0) as client:
        response = client.post(url, headers=headers, json=body)
        response.raise_for_status()
        payload = response.json()
    items = sorted(payload["data"], key=lambda row: row["index"])
    vectors = [row["embedding"] for row in items]
    if any(len(vec) != EMBEDDING_DIM for vec in vectors):
        raise RuntimeError(
            f"向量维度不是 {EMBEDDING_DIM}，请核对 EMBEDDING_MODEL / EMBEDDING_DIM（当前模型 {EMBEDDING_MODEL}）"
        )
    return _l2_normalize(vectors)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """入库和检索共用。默认 api（千问）；EMBEDDING_PROVIDER=local 时走本机模型。"""
    cleaned = [text if text.strip() else " " for text in texts]
    if not cleaned:
        return []
    if EMBEDDING_PROVIDER == "api":
        return _encode_api(cleaned)
    return _encode_local(cleaned)
