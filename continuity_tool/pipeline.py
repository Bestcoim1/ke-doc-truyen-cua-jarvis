from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .analyzer import analyze_chapter
from .config import Settings, ensure_output_directories
from .docx_reader import parse_docx
from .model import empty_chapter_state
from .reporting import generate_report
from .rules import run_continuity_rules
from .splitter import classify_source, render_chapter, split_document
from .store import ContinuityStore


EXTRACTOR_VERSION = "2026-07-30.1"
ANALYZER_VERSION = "2026-07-30.2"


@contextmanager
def _run_lock(path: Path):
    """Prevent overlapping writers; OS locks are released even after a killed process."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+b")
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b"0")
        handle.flush()
    handle.seek(0)
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        handle.close()
        raise RuntimeError("Another continuity update is already running") from error
    try:
        yield
    finally:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_filename(value: str) -> str:
    if len(value) <= 110:
        return value
    suffix = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return value[:96].rstrip("-") + "-" + suffix


def discover_docx(settings: Settings) -> list[Path]:
    files: list[Path] = []
    for root in settings.source_roots:
        if not root.exists():
            continue
        files.extend(path for path in root.rglob("*.docx") if path.is_file() and not path.name.startswith("~$"))
    return sorted(set(path.resolve() for path in files), key=lambda path: path.as_posix().casefold())


@dataclass(slots=True)
class RunSummary:
    discovered_sources: int = 0
    parsed_sources: int = 0
    skipped_sources: int = 0
    metadata_only_sources: int = 0
    missing_sources: int = 0
    changed_chapters: int = 0
    skipped_chapters: int = 0
    removed_chapters: int = 0
    removed_artifacts: int = 0
    facts: int = 0
    mentions: int = 0
    issues: int = 0
    errors: list[str] = field(default_factory=list)
    changed_chapter_ids: list[str] = field(default_factory=list)
    changed_chapter_ids_truncated: int = 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class ContinuityPipeline:
    def __init__(self, settings: Settings):
        self.settings = settings
        ensure_output_directories(settings)

    def _relative(self, path: Path) -> str:
        try:
            return path.relative_to(self.settings.repo_root).as_posix()
        except ValueError:
            return path.as_posix()

    def _output_paths(self, branch: str, source_id: str, chapter_id: str) -> tuple[Path, Path]:
        filename = _safe_filename(chapter_id)
        return (
            self.settings.extracted_dir / branch / source_id / f"{filename}.md",
            self.settings.states_dir / branch / source_id / f"{filename}.json",
        )

    def _prune_generated_artifacts(self, store: ContinuityStore) -> int:
        expected = {
            (self.settings.repo_root / str(row["artifact_path"])).resolve()
            for row in store.rows(
                """
                SELECT extracted_path AS artifact_path FROM chapters WHERE active=1
                UNION
                SELECT state_path AS artifact_path FROM chapters WHERE active=1
                """
            )
            if row["artifact_path"]
        }
        work_dir = self.settings.work_dir.resolve()
        removed = 0
        for root, pattern in (
            (self.settings.extracted_dir, "*.md"),
            (self.settings.states_dir, "*.json"),
        ):
            if not root.exists():
                continue
            for path in root.rglob(pattern):
                resolved = path.resolve()
                if not resolved.is_relative_to(work_dir):
                    raise RuntimeError(f"Refusing to prune artifact outside work_dir: {resolved}")
                if resolved not in expected:
                    path.unlink()
                    removed += 1
        return removed

    def run(self, *, force: bool = False, rules: bool = True, report: bool = True) -> RunSummary:
        with _run_lock(self.settings.work_dir / "continuity.lock"):
            return self._run_locked(force=force, rules=rules, report=report)

    def _run_locked(self, *, force: bool = False, rules: bool = True, report: bool = True) -> RunSummary:
        summary = RunSummary()
        sources = discover_docx(self.settings)
        summary.discovered_sources = len(sources)
        source_id_paths: dict[str, str] = {}
        with ContinuityStore(self.settings.database_path) as store:
            run_id = store.begin_run("update --force" if force else "update")
            for source_path in sources:
                relative_path = self._relative(source_path)
                try:
                    policy_hint = classify_source(source_path, relative_path)
                    prior_path = source_id_paths.get(policy_hint.source_id)
                    if prior_path and prior_path != relative_path:
                        raise ValueError(
                            f"duplicate stable source identity for {prior_path!r} and {relative_path!r}; rename one file"
                        )
                    source_id_paths[policy_hint.source_id] = relative_path
                    package_hash = _sha256(source_path)
                    existing = store.source_record(relative_path)
                    if not existing:
                        existing = store.source_record_by_id(policy_hint.source_id)
                    same_path = bool(existing and existing["source_path"] == relative_path)
                    extractor_current = bool(existing and existing["extractor_version"] == EXTRACTOR_VERSION)
                    analyzer_current = bool(existing and existing["analyzer_version"] == ANALYZER_VERSION)
                    if (
                        existing and same_path and existing["package_hash"] == package_hash
                        and extractor_current and analyzer_current and not force
                    ):
                        store.mark_source_seen(str(existing["source_id"]), run_id)
                        summary.skipped_sources += 1
                        continue
                    if (
                        existing and same_path and existing["package_hash"] == package_hash and extractor_current
                        and existing["source_kind"] == "compilation" and not force
                    ):
                        store.mark_analyzer_current(str(existing["source_id"]), run_id, ANALYZER_VERSION)
                        summary.metadata_only_sources += 1
                        continue
                    document = parse_docx(source_path)
                    summary.parsed_sources += 1
                    policy, chapters = split_document(document, self.settings.repo_root)
                    store.upsert_source(
                        source_id=policy.source_id,
                        source_path=relative_path,
                        branch=policy.branch,
                        source_kind=policy.kind,
                        audit_enabled=policy.audit_enabled,
                        source_order=policy.order,
                        package_hash=document.package_hash,
                        content_hash=document.content_hash,
                        run_id=run_id,
                        warnings=document.warnings,
                        extractor_version=EXTRACTOR_VERSION,
                        analyzer_version=ANALYZER_VERSION,
                    )
                    if (
                        existing and same_path and existing["content_hash"] == document.content_hash
                        and extractor_current and analyzer_current and not force
                    ):
                        summary.metadata_only_sources += 1
                        store.connection.commit()
                        continue
                    old_hashes = store.chapter_hashes(policy.source_id)
                    current_ids = {chapter.chapter_id for chapter in chapters}
                    summary.removed_chapters += store.remove_absent_chapters(policy.source_id, current_ids)
                    for chapter in chapters:
                        extracted_path, state_path = self._output_paths(policy.branch, policy.source_id, chapter.chapter_id)
                        extracted_path.parent.mkdir(parents=True, exist_ok=True)
                        state_path.parent.mkdir(parents=True, exist_ok=True)
                        markdown, mapping = render_chapter(chapter)
                        extracted_relative = self._relative(extracted_path)
                        state_relative = self._relative(state_path)
                        if old_hashes.get(chapter.chapter_id) == chapter.chapter_hash and extractor_current and analyzer_current and not force:
                            # Refresh file-level provenance only; semantic state and facts remain valid.
                            extracted_path.write_text(markdown, encoding="utf-8", newline="\n")
                            store.connection.execute(
                                """UPDATE chapters
                                   SET source_id=?,branch=?,source_kind=?,audit_enabled=?,arc_id=?,section_id=?,
                                       ordinal=?,source_hash=?,title=?,word_count=?,extracted_path=?,state_path=?,active=1
                                   WHERE chapter_id=?""",
                                (
                                    chapter.source_id, chapter.branch, chapter.source_kind, int(chapter.audit_enabled),
                                    chapter.arc_id, chapter.section_id, chapter.ordinal, chapter.source_hash,
                                    chapter.title, chapter.word_count, extracted_relative, state_relative,
                                    chapter.chapter_id,
                                ),
                            )
                            if state_path.exists():
                                state = json.loads(state_path.read_text(encoding="utf-8"))
                                state["source_hash"] = chapter.source_hash
                                state["provenance"] = {
                                    "source": chapter.source_path,
                                    "branch": chapter.branch,
                                    "arc": chapter.arc_id,
                                    "section": chapter.section_id,
                                }
                                state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
                            summary.skipped_chapters += 1
                            continue
                        paragraph_rows = []
                        for paragraph, line in mapping:
                            quote = " ".join(paragraph.plain_text.split())[: self.settings.quote_limit]
                            temporal_mode = "flashback" if paragraph.plain_text.lstrip().upper().startswith("[FLASHBACK]") else "dream" if paragraph.plain_text.lstrip().upper().startswith("[DREAM]") else "present"
                            paragraph_rows.append((
                                paragraph.source_index, line, line, paragraph.plain_text, quote,
                                paragraph.style_name, temporal_mode,
                            ))
                        store.save_chapter(chapter, extracted_relative, state_relative, paragraph_rows)
                        if chapter.source_kind == "compilation":
                            state = empty_chapter_state(chapter.chapter_id)
                            state.update({
                                "source_hash": chapter.source_hash,
                                "chapter_hash": chapter.chapter_hash,
                                "analysis_skipped": "duplicate compilation; use individual Ngoại truyện sources for semantic audit",
                            })
                            analysis_facts = 0
                            analysis_mentions = 0
                        else:
                            analysis = analyze_chapter(store, chapter, mapping, self.settings.quote_limit)
                            state = analysis.state
                            analysis_facts = analysis.facts
                            analysis_mentions = analysis.mentions
                        extracted_path.write_text(markdown, encoding="utf-8", newline="\n")
                        state_path.write_text(
                            json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                            encoding="utf-8", newline="\n",
                        )
                        summary.changed_chapters += 1
                        if len(summary.changed_chapter_ids) < 50:
                            summary.changed_chapter_ids.append(chapter.chapter_id)
                        else:
                            summary.changed_chapter_ids_truncated += 1
                        summary.facts += analysis_facts
                        summary.mentions += analysis_mentions
                    store.connection.commit()
                except Exception as error:  # continue to inventory all bad sources in one run
                    summary.errors.append(f"{relative_path}: {type(error).__name__}: {error}")
                    store.connection.rollback()
            summary.missing_sources = store.mark_unseen_sources_missing(run_id)
            summary.removed_artifacts = self._prune_generated_artifacts(store)
            store.prune_orphan_candidate_entities()
            if rules:
                issues = run_continuity_rules(store, run_id, self.settings.forgotten_thread_chapters)
                summary.issues = len(issues)
            if report:
                generate_report(store, self.settings.reports_dir / "CONTINUITY-AUDIT.md")
            store.finish_run(run_id, summary.as_dict())
        manifest_path = self.settings.work_dir / "last-run.json"
        manifest_path.write_text(json.dumps(summary.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        return summary
