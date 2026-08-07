from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_CONFIG_PATH = Path("continuity/config.json")


@dataclass(slots=True)
class Settings:
    repo_root: Path
    source_roots: list[Path]
    work_dir: Path
    reports_dir: Path
    canon_dir: Path
    quote_limit: int = 240
    forgotten_thread_chapters: int = 30
    travel_rules: list[dict[str, Any]] = field(default_factory=list)

    @property
    def extracted_dir(self) -> Path:
        return self.work_dir / "extracted"

    @property
    def states_dir(self) -> Path:
        return self.work_dir / "chapter-states"

    @property
    def database_path(self) -> Path:
        return self.work_dir / "index" / "continuity.db"


def load_settings(repo_root: Path, config_path: Path | None = None) -> Settings:
    repo_root = repo_root.resolve()
    path = (config_path or DEFAULT_CONFIG_PATH)
    if not path.is_absolute():
        path = repo_root / path
    data = json.loads(path.read_text(encoding="utf-8"))

    def resolve(value: str) -> Path:
        candidate = Path(value)
        return candidate.resolve() if candidate.is_absolute() else (repo_root / candidate).resolve()

    return Settings(
        repo_root=repo_root,
        source_roots=[resolve(item) for item in data.get("source_roots", ["LinhTInh"])],
        work_dir=resolve(data.get("work_dir", "continuity/generated")),
        reports_dir=resolve(data.get("reports_dir", "continuity/reports")),
        canon_dir=resolve(data.get("canon_dir", "continuity/canon")),
        quote_limit=int(data.get("quote_limit", 240)),
        forgotten_thread_chapters=int(data.get("forgotten_thread_chapters", 30)),
        travel_rules=list(data.get("travel_rules", [])),
    )


def ensure_output_directories(settings: Settings) -> None:
    for path in (
        settings.extracted_dir,
        settings.states_dir,
        settings.database_path.parent,
        settings.reports_dir,
        settings.canon_dir,
    ):
        path.mkdir(parents=True, exist_ok=True)

