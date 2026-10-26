"""后台跑材料清洗，避免卡住页面。"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from app.core.database import SessionLocal
from app.ingredients.clean import clean_ingredients


class IngredientCleanManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.state: dict[str, Any] = {
            "running": False,
            "progress": "",
            "updated": 0,
            "scanned": 0,
            "unique": 0,
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
                raise RuntimeError("已有材料清洗任务在运行")
            self._stop.clear()
            self.state.update(
                {
                    "running": True,
                    "progress": "准备清洗材料表",
                    "updated": 0,
                    "scanned": 0,
                    "unique": 0,
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

            def on_progress(message: str, done: int, total: int) -> None:
                with self._lock:
                    self.state.update(progress=message, updated=done, total=total)

            result = clean_ingredients(
                db,
                force=force,
                on_progress=on_progress,
                should_stop=self._stop.is_set,
            )
            with self._lock:
                self.state.update(
                    running=False,
                    scanned=result["scanned"],
                    unique=result["unique"],
                    updated=result["updated"],
                    progress=(
                        f"扫描 {result['scanned']} 行，AI 处理 {result['unique']} 种写法，"
                        f"更新 {result['updated']}，归并 {result.get('merged', 0)}"
                    ),
                    finished_at=datetime.now(timezone.utc).isoformat(),
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


ingredient_clean_manager = IngredientCleanManager()
