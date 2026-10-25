"""后台线程跑爬取，避免卡住页面。同一时间只允许一个任务。"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from app.core.database import CrawlRun, SessionLocal
from crawler.ingest import upsert_recipes
from crawler.spiders import cocktaildb, mixmyth

SOURCES = {
    "mixmyth": mixmyth.fetch_recipes,
    "cocktaildb": cocktaildb.fetch_recipes,
}


class CrawlManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.state: dict[str, Any] = {
            "running": False,
            "source": None,
            "progress": "",
            "fetched": 0,
            "upserted": 0,
            "total": 0,
            "error": None,
            "started_at": None,
            "finished_at": None,
        }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self.state)

    def start(self, source: str) -> dict[str, Any]:
        if source not in {"mixmyth", "cocktaildb", "all"}:
            raise ValueError("source 只能是 mixmyth、cocktaildb 或 all")
        with self._lock:
            if self.state["running"]:
                raise RuntimeError("已有爬取任务在运行")
            self._stop.clear()
            self.state.update(
                {
                    "running": True,
                    "source": source,
                    "progress": "准备开始",
                    "fetched": 0,
                    "upserted": 0,
                    "total": 0,
                    "error": None,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "finished_at": None,
                }
            )
        threading.Thread(target=self._run, args=(source,), daemon=True).start()
        return self.snapshot()

    def _set_progress(self, **fields: Any) -> None:
        with self._lock:
            self.state.update(fields)

    def _run(self, source: str) -> None:
        db = SessionLocal()
        run = CrawlRun(source=source, status="running")
        db.add(run)
        db.commit()
        fetched_all: list[dict[str, Any]] = []
        try:
            targets = ["mixmyth", "cocktaildb"] if source == "all" else [source]
            for target in targets:
                if self._stop.is_set():
                    break

                def on_progress(message: str, fetched: int, total: int, current=target) -> None:
                    self._set_progress(
                        progress=f"[{current}] {message}",
                        fetched=len(fetched_all) + fetched,
                        total=total,
                    )

                fetched_all.extend(
                    SOURCES[target](on_progress=on_progress, should_stop=self._stop.is_set)
                )

            def on_upload(message: str, fetched: int, total: int) -> None:
                self._set_progress(progress=message, fetched=fetched, total=total)

            upserted = (
                upsert_recipes(
                    db,
                    fetched_all,
                    on_progress=on_upload,
                    should_stop=self._stop.is_set,
                )
                if fetched_all
                else 0
            )
            run.fetched = len(fetched_all)
            run.upserted = upserted
            run.status = "cancelled" if self._stop.is_set() else "success"
            run.message = f"抓取 {len(fetched_all)} 条，写入 {upserted} 条"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            self._set_progress(
                running=False,
                fetched=len(fetched_all),
                upserted=upserted,
                progress=run.message,
                finished_at=run.finished_at.isoformat(),
            )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            run.status = "failed"
            run.message = str(exc)
            run.finished_at = datetime.now(timezone.utc)
            db.add(run)
            db.commit()
            self._set_progress(
                running=False,
                error=str(exc),
                progress="失败",
                finished_at=run.finished_at.isoformat(),
            )
        finally:
            db.close()


manager = CrawlManager()
