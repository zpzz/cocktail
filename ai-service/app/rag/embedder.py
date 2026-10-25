"""BGE-M3 稠密向量，输出 1024 维并做 L2 归一化，便于 pgvector 余弦距离。"""

from __future__ import annotations

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

# 进程内只加载一次，约 2GB；不要在每次检索时重新 new
_local_model = None


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
    headers = {"Content-Type": "application/json"}
    if EMBEDDING_API_KEY:
        headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"
    url = f"{EMBEDDING_BASE_URL}/embeddings"
    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            url,
            headers=headers,
            json={"model": EMBEDDING_MODEL, "input": texts, "encoding_format": "float"},
        )
        response.raise_for_status()
        payload = response.json()
    items = sorted(payload["data"], key=lambda row: row["index"])
    vectors = [row["embedding"] for row in items]
    if any(len(vec) != EMBEDDING_DIM for vec in vectors):
        raise RuntimeError(f"向量维度不是 {EMBEDDING_DIM}，请确认模型是 BGE-M3")
    return vectors


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """入库和检索共用。默认本地 BGE-M3；EMBEDDING_PROVIDER=api 时走 OpenAI 兼容接口。"""
    cleaned = [text if text.strip() else " " for text in texts]
    if not cleaned:
        return []
    if EMBEDDING_PROVIDER == "api":
        return _encode_api(cleaned)
    return _encode_local(cleaned)
