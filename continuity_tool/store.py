from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .model import Chapter


SCHEMA_VERSION = 1

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processing_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL UNIQUE,
    branch TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    audit_enabled INTEGER NOT NULL,
    source_order REAL NOT NULL,
    package_hash TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    last_seen_run INTEGER,
    warning_json TEXT NOT NULL DEFAULT '[]',
    extractor_version TEXT NOT NULL DEFAULT '0',
    analyzer_version TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS chapters (
    chapter_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    branch TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    audit_enabled INTEGER NOT NULL,
    arc_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    title TEXT NOT NULL,
    chapter_hash TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    extracted_path TEXT NOT NULL,
    state_path TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(source_id, ordinal)
);

CREATE TABLE IF NOT EXISTS paragraphs (
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    plain_text TEXT NOT NULL,
    source_quote TEXT NOT NULL,
    style_name TEXT NOT NULL DEFAULT '',
    temporal_mode TEXT NOT NULL DEFAULT 'present',
    PRIMARY KEY(chapter_id, source_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS paragraph_fts USING fts5(
    chapter_id UNINDEXED,
    source_index UNINDEXED,
    plain_text,
    tokenize='unicode61 remove_diacritics 0'
);

CREATE TABLE IF NOT EXISTS entities (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    UNIQUE(entity_type, canonical_name)
);

CREATE TABLE IF NOT EXISTS aliases (
    entity_id TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    PRIMARY KEY(entity_id, alias)
);

CREATE TABLE IF NOT EXISTS mentions (
    mention_id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    source_quote TEXT NOT NULL,
    confidence REAL NOT NULL,
    UNIQUE(chapter_id, source_index, entity_id)
);

CREATE TABLE IF NOT EXISTS facts (
    fact_id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    subject_id TEXT NOT NULL REFERENCES entities(entity_id),
    predicate TEXT NOT NULL,
    object_value TEXT NOT NULL,
    epistemic_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'candidate',
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    source_quote TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS facts_subject_predicate ON facts(subject_id, predicate);
CREATE INDEX IF NOT EXISTS facts_chapter ON facts(chapter_id);

CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    subject_id TEXT NOT NULL REFERENCES entities(entity_id),
    object_value TEXT NOT NULL DEFAULT '',
    story_time INTEGER,
    relative_order INTEGER NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    certainty REAL NOT NULL,
    epistemic_type TEXT NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    source_quote TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS events_subject_type ON events(subject_id, event_type);

CREATE TABLE IF NOT EXISTS character_states (
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    state_json TEXT NOT NULL,
    PRIMARY KEY(chapter_id, entity_id)
);

CREATE TABLE IF NOT EXISTS relationships (
    relationship_id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    source_entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    target_entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    relationship_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge (
    knowledge_id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    knowledge_key TEXT NOT NULL,
    change_type TEXT NOT NULL,
    epistemic_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_states (
    item_state_id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities(entity_id),
    holder_id TEXT REFERENCES entities(entity_id),
    state_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plot_threads (
    thread_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL,
    PRIMARY KEY(thread_id, chapter_id, action)
);

CREATE TABLE IF NOT EXISTS dependencies (
    from_chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL,
    dependency_key TEXT NOT NULL,
    PRIMARY KEY(from_chapter_id, dependency_type, dependency_key)
);

CREATE INDEX IF NOT EXISTS dependency_lookup ON dependencies(dependency_type, dependency_key);

CREATE TABLE IF NOT EXISTS issues (
    issue_id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    audit_level TEXT NOT NULL,
    branch TEXT NOT NULL,
    entity_id TEXT,
    current_chapter_id TEXT NOT NULL,
    prior_chapter_id TEXT,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    current_evidence_json TEXT NOT NULL,
    prior_evidence_json TEXT NOT NULL DEFAULT '{}',
    alternatives_json TEXT NOT NULL DEFAULT '[]',
    review_status TEXT NOT NULL DEFAULT 'open',
    created_run INTEGER
);

CREATE INDEX IF NOT EXISTS issues_priority ON issues(severity, confidence DESC);

CREATE TABLE IF NOT EXISTS canon_decisions (
    fact_id TEXT PRIMARY KEY REFERENCES facts(fact_id),
    status TEXT NOT NULL,
    reviewer_note TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


class ContinuityStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.executescript(SCHEMA)
        source_columns = {row[1] for row in self.connection.execute("PRAGMA table_info(sources)")}
        if "extractor_version" not in source_columns:
            self.connection.execute("ALTER TABLE sources ADD COLUMN extractor_version TEXT NOT NULL DEFAULT '0'")
        if "analyzer_version" not in source_columns:
            self.connection.execute("ALTER TABLE sources ADD COLUMN analyzer_version TEXT NOT NULL DEFAULT '0'")
        self.connection.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)", (SCHEMA_VERSION,))
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "ContinuityStore":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        try:
            yield self.connection
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def begin_run(self, command: str) -> int:
        cursor = self.connection.execute("INSERT INTO processing_runs(command) VALUES (?)", (command,))
        self.connection.commit()
        return int(cursor.lastrowid)

    def finish_run(self, run_id: int, summary: dict[str, Any]) -> None:
        self.connection.execute(
            "UPDATE processing_runs SET finished_at=CURRENT_TIMESTAMP, summary_json=? WHERE run_id=?",
            (json.dumps(summary, ensure_ascii=False, sort_keys=True), run_id),
        )
        self.connection.commit()

    def source_hash(self, source_path: str) -> str | None:
        row = self.connection.execute(
            "SELECT content_hash FROM sources WHERE source_path=? AND status='active'", (source_path,)
        ).fetchone()
        return str(row[0]) if row else None

    def source_record(self, source_path: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT * FROM sources WHERE source_path=?", (source_path,)
        ).fetchone()

    def source_record_by_id(self, source_id: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT * FROM sources WHERE source_id=?", (source_id,)
        ).fetchone()

    def mark_source_seen(self, source_id: str, run_id: int) -> None:
        self.connection.execute(
            "UPDATE sources SET status='active',last_seen_run=? WHERE source_id=?", (run_id, source_id)
        )
        self.connection.execute("UPDATE chapters SET active=1 WHERE source_id=?", (source_id,))

    def upsert_source(
        self,
        *,
        source_id: str,
        source_path: str,
        branch: str,
        source_kind: str,
        audit_enabled: bool,
        source_order: float,
        package_hash: str,
        content_hash: str,
        run_id: int,
        warnings: list[str],
        extractor_version: str,
        analyzer_version: str,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO sources(source_id,source_path,branch,source_kind,audit_enabled,source_order,
                                package_hash,content_hash,status,last_seen_run,warning_json,extractor_version,analyzer_version)
            VALUES(?,?,?,?,?,?,?,?, 'active',?,?,?,?)
            ON CONFLICT(source_id) DO UPDATE SET
                source_path=excluded.source_path, branch=excluded.branch, source_kind=excluded.source_kind,
                audit_enabled=excluded.audit_enabled, source_order=excluded.source_order,
                package_hash=excluded.package_hash, content_hash=excluded.content_hash,
                status='active', last_seen_run=excluded.last_seen_run, warning_json=excluded.warning_json,
                extractor_version=excluded.extractor_version, analyzer_version=excluded.analyzer_version
            """,
            (
                source_id, source_path, branch, source_kind, int(audit_enabled), source_order,
                package_hash, content_hash, run_id, json.dumps(warnings, ensure_ascii=False), extractor_version, analyzer_version,
            ),
        )

    def mark_analyzer_current(self, source_id: str, run_id: int, analyzer_version: str) -> None:
        self.connection.execute(
            "UPDATE sources SET status='active',last_seen_run=?,analyzer_version=? WHERE source_id=?",
            (run_id, analyzer_version, source_id),
        )
        self.connection.execute("UPDATE chapters SET active=1 WHERE source_id=?", (source_id,))

    def mark_unseen_sources_missing(self, run_id: int) -> int:
        cursor = self.connection.execute(
            "UPDATE sources SET status='missing' WHERE status='active' AND COALESCE(last_seen_run,-1)<>?", (run_id,)
        )
        self.connection.execute(
            "UPDATE chapters SET active=0 WHERE source_id IN (SELECT source_id FROM sources WHERE status='missing')"
        )
        return cursor.rowcount

    def chapter_hashes(self, source_id: str) -> dict[str, str]:
        return {
            str(row["chapter_id"]): str(row["chapter_hash"])
            for row in self.connection.execute(
                "SELECT chapter_id,chapter_hash FROM chapters WHERE source_id=?", (source_id,)
            )
        }

    def remove_absent_chapters(self, source_id: str, chapter_ids: set[str]) -> int:
        rows = self.connection.execute("SELECT chapter_id FROM chapters WHERE source_id=?", (source_id,)).fetchall()
        absent = [str(row[0]) for row in rows if str(row[0]) not in chapter_ids]
        for chapter_id in absent:
            self._delete_chapter_data(chapter_id)
            self.connection.execute("DELETE FROM chapters WHERE chapter_id=?", (chapter_id,))
        return len(absent)

    def _delete_chapter_data(self, chapter_id: str) -> None:
        self.connection.execute("DELETE FROM paragraph_fts WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM paragraphs WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM mentions WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM facts WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM events WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM character_states WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM relationships WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM knowledge WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM item_states WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM plot_threads WHERE chapter_id=?", (chapter_id,))
        self.connection.execute("DELETE FROM dependencies WHERE from_chapter_id=?", (chapter_id,))

    def save_chapter(
        self,
        chapter: Chapter,
        extracted_path: str,
        state_path: str,
        paragraph_lines: list[tuple[int, int, int, str, str, str, str]],
    ) -> None:
        self._delete_chapter_data(chapter.chapter_id)
        self.connection.execute(
            """
            INSERT INTO chapters(chapter_id,source_id,branch,source_kind,audit_enabled,arc_id,section_id,
                                 ordinal,title,chapter_hash,source_hash,word_count,extracted_path,state_path,active)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
            ON CONFLICT(chapter_id) DO UPDATE SET
                source_id=excluded.source_id, branch=excluded.branch, source_kind=excluded.source_kind,
                audit_enabled=excluded.audit_enabled, arc_id=excluded.arc_id, section_id=excluded.section_id,
                ordinal=excluded.ordinal, title=excluded.title, chapter_hash=excluded.chapter_hash,
                source_hash=excluded.source_hash, word_count=excluded.word_count,
                extracted_path=excluded.extracted_path, state_path=excluded.state_path, active=1
            """,
            (
                chapter.chapter_id, chapter.source_id, chapter.branch, chapter.source_kind,
                int(chapter.audit_enabled), chapter.arc_id, chapter.section_id, chapter.ordinal,
                chapter.title, chapter.chapter_hash, chapter.source_hash, chapter.word_count,
                extracted_path, state_path,
            ),
        )
        for source_index, line_start, line_end, plain, quote, style, temporal_mode in paragraph_lines:
            self.connection.execute(
                """INSERT INTO paragraphs(chapter_id,source_index,line_start,line_end,plain_text,source_quote,style_name,temporal_mode)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (chapter.chapter_id, source_index, line_start, line_end, plain, quote, style, temporal_mode),
            )
            if plain.strip():
                self.connection.execute(
                    "INSERT INTO paragraph_fts(chapter_id,source_index,plain_text) VALUES(?,?,?)",
                    (chapter.chapter_id, source_index, plain),
                )

    def ensure_entity(self, entity_id: str, entity_type: str, name: str, status: str = "candidate") -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO entities(entity_id,entity_type,canonical_name,status) VALUES(?,?,?,?)",
            (entity_id, entity_type, name, status),
        )

    def save_mention(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR IGNORE INTO mentions(chapter_id,source_index,entity_id,line_start,line_end,source_quote,confidence)
               VALUES(:chapter_id,:source_index,:entity_id,:line_start,:line_end,:source_quote,:confidence)""",
            row,
        )

    def save_fact(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR REPLACE INTO facts(fact_id,chapter_id,source_index,subject_id,predicate,object_value,
                   epistemic_type,confidence,review_status,line_start,line_end,source_quote,metadata_json)
               VALUES(:fact_id,:chapter_id,:source_index,:subject_id,:predicate,:object_value,
                   :epistemic_type,:confidence,:review_status,:line_start,:line_end,:source_quote,:metadata_json)""",
            row,
        )

    def save_event(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR REPLACE INTO events(event_id,chapter_id,source_index,event_type,subject_id,object_value,
                   story_time,relative_order,location,certainty,epistemic_type,line_start,line_end,source_quote,metadata_json)
               VALUES(:event_id,:chapter_id,:source_index,:event_type,:subject_id,:object_value,
                   :story_time,:relative_order,:location,:certainty,:epistemic_type,:line_start,:line_end,:source_quote,:metadata_json)""",
            row,
        )

    def save_dependency(self, chapter_id: str, dependency_type: str, dependency_key: str) -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO dependencies(from_chapter_id,dependency_type,dependency_key) VALUES(?,?,?)",
            (chapter_id, dependency_type, dependency_key),
        )

    def save_issue(self, row: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR REPLACE INTO issues(issue_id,rule_id,severity,confidence,audit_level,branch,entity_id,
                   current_chapter_id,prior_chapter_id,title,explanation,current_evidence_json,prior_evidence_json,
                   alternatives_json,review_status,created_run)
               VALUES(:issue_id,:rule_id,:severity,:confidence,:audit_level,:branch,:entity_id,
                   :current_chapter_id,:prior_chapter_id,:title,:explanation,:current_evidence_json,:prior_evidence_json,
                   :alternatives_json,:review_status,:created_run)""",
            row,
        )

    def prune_orphan_candidate_entities(self) -> int:
        cursor = self.connection.execute("""
            DELETE FROM entities
            WHERE status='candidate'
              AND entity_id NOT IN (
                  SELECT entity_id FROM mentions
                  UNION SELECT subject_id FROM facts
                  UNION SELECT subject_id FROM events
                  UNION SELECT entity_id FROM character_states
                  UNION SELECT source_entity_id FROM relationships
                  UNION SELECT target_entity_id FROM relationships
                  UNION SELECT entity_id FROM knowledge
                  UNION SELECT entity_id FROM item_states
                  UNION SELECT holder_id FROM item_states WHERE holder_id IS NOT NULL
              )
        """)
        self.connection.execute("""
            DELETE FROM dependencies
            WHERE dependency_type='entity'
              AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.entity_id=dependencies.dependency_key)
        """)
        return cursor.rowcount

    def clear_open_issues(self, chapter_ids: set[str] | None = None) -> None:
        if not chapter_ids:
            self.connection.execute("DELETE FROM issues WHERE review_status='open'")
            return
        placeholders = ",".join("?" for _ in chapter_ids)
        values = tuple(chapter_ids)
        self.connection.execute(
            f"DELETE FROM issues WHERE review_status='open' AND (current_chapter_id IN ({placeholders}) OR prior_chapter_id IN ({placeholders}))",
            values + values,
        )

    def rows(self, query: str, parameters: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        return list(self.connection.execute(query, parameters))
