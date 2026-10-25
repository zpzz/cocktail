"""后台跑向量化，避免卡住页面。"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from app.core.database import SessionLocal
from app.rag.ingest import ingest_recipes


class EmbedManager:
    """页面点「向量化入库」后立刻返回，进度轮询 /api/rag/embed/status。"""
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.state: dict[str, Any] = {
            "running": False,
            "progress": "",
            "upserted": 0,
            "skipped": 0,
            "scanned": 0,
            "total": 0,
            "error": None,
            "started_at": None,
            "finished_at": None,
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self.state)

    def start(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            if self.state["running"]:
                raise RuntimeError("已有向量化任务在运行")
            self._stop.clear()
            self.state.update(
                {
                    "running": True,
                    "progress": "准备向量化",
                    "upserted": 0,
                    "skipped": 0,
                    "scanned": 0,
                    "total": 0,
                    "error": None,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "finished_at": None,
                }
            )
        threading.Thread(target=self._run, args=(force,), daemon=True).start()
        return self.snapshot()

    def _run(self, force: bool) -> None:
        db = SessionLocal()
        try:
            def on_progress(message: str, upserted: int, total: int) -> None:
                with self._lock:
                    self.state.update(progress=message, upserted=upserted, total=total)

            result = ingest_recipes(
                db,
                force=force,
                on_progress=on_progress,
                should_stop=self._stop.is_set,
            )
            finished = datetime.now(timezone.utc).isoformat()
            with self._lock:
                self.state.update(
                    running=False,
                    scanned=result["scanned"],
                    upserted=result["upserted"],
                    skipped=result["skipped"],
                    progress=f"扫描 {result['scanned']}，写入 {result['upserted']}，跳过 {result['skipped']}",
                    finished_at=finished,
                )
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                self.state.update(
                    running=False,
                    error=str(exc),
                    progress="失败",
                    finished_at=datetime.now(timezone.utc).isoformat(),
                )
        finally:
            db.close()


embed_manager = EmbedManager()
