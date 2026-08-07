from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .ai_context import build_context_bundle, import_candidate_state
from .config import load_settings
from .pipeline import ContinuityPipeline
from .reporting import generate_canon_pages, generate_report, review_fact
from .rules import run_continuity_rules
from .store import ContinuityStore


def _json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def _settings(args: argparse.Namespace):
    return load_settings(Path(args.repo_root), Path(args.config) if args.config else None)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="continuity",
        description="Traceable, incremental continuity audit for the DOCX manuscript corpus.",
    )
    parser.add_argument("--repo-root", default=str(Path.cwd()), help="Repository root (default: current directory).")
    parser.add_argument("--config", help="Config JSON path (default: continuity/config.json).")
    sub = parser.add_subparsers(dest="command", required=True)

    update = sub.add_parser("update", help="Incrementally extract changed DOCX, rebuild changed states, run checks and report.")
    update.add_argument("--force", action="store_true", help="Reprocess every source and chapter.")

    extract = sub.add_parser("extract", help="Materialize extraction/index/state; skips continuity rules and report.")
    extract.add_argument("--force", action="store_true")

    sub.add_parser("index", help="Alias of incremental extraction/indexing.")

    scan = sub.add_parser("scan", help="Run incremental update and continuity checks.")
    scan.add_argument("--arc", help="Write a report filtered to an arc ID, e.g. arc-04.")
    scan.add_argument("--chapter", help="Write a report filtered to one stable chapter ID.")
    scan.add_argument("--force", action="store_true")

    report = sub.add_parser("report", help="Regenerate Markdown report from indexed issues.")
    report.add_argument("--arc")
    report.add_argument("--chapter")
    report.add_argument("--output")

    search = sub.add_parser("search", help="Full-text search with stable chapter/line references.")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=30)

    character = sub.add_parser("character", help="Query character mentions and candidate/reviewed facts.")
    character.add_argument("name")
    character.add_argument("--limit", type=int, default=100)

    item = sub.add_parser("item", help="Query item state changes across chapters.")
    item.add_argument("name")
    item.add_argument("--limit", type=int, default=100)

    timeline = sub.add_parser("timeline", help="Print indexed timeline events.")
    timeline.add_argument("--chapter")
    timeline.add_argument("--limit", type=int, default=200)

    context = sub.add_parser("context", help="Build a relevance-limited AI context bundle for one chapter.")
    context.add_argument("chapter_id")
    context.add_argument("--output")

    imported = sub.add_parser("import-state", help="Validate and import external AI candidate facts; never confirms canon.")
    imported.add_argument("file")

    review = sub.add_parser("review", help="Human-review one candidate fact and rebuild readable canon pages.")
    review.add_argument("fact_id")
    review.add_argument("status", choices=["confirmed", "provisional", "disputed", "retconned", "obsolete", "unknown"])
    review.add_argument("--note", default="")

    sub.add_parser("canon", help="Regenerate Markdown canon pages from human-reviewed facts only.")
    sub.add_parser("status", help="Show the last incremental run summary.")
    return parser


def _entity_query(store: ContinuityStore, name: str, entity_type: str, limit: int) -> dict[str, Any]:
    entity = store.connection.execute(
        "SELECT * FROM entities WHERE entity_type=? AND canonical_name LIKE ? ORDER BY status='confirmed' DESC LIMIT 1",
        (entity_type, name),
    ).fetchone()
    if not entity:
        return {"query": name, "entity_type": entity_type, "found": False, "mentions": [], "facts": []}
    mentions = store.rows("""
        SELECT m.chapter_id,m.line_start,m.line_end,m.source_quote,m.confidence,c.title,s.source_path
        FROM mentions m JOIN chapters c ON c.chapter_id=m.chapter_id JOIN sources s ON s.source_id=c.source_id
        WHERE m.entity_id=? ORDER BY s.source_order,s.source_path,c.ordinal,m.source_index LIMIT ?
    """, (entity["entity_id"], limit))
    facts = store.rows("""
        SELECT f.fact_id,f.chapter_id,f.predicate,f.object_value,f.epistemic_type,f.confidence,
               f.line_start,f.line_end,f.source_quote,d.status AS canon_status
        FROM facts f LEFT JOIN canon_decisions d ON d.fact_id=f.fact_id
        WHERE f.subject_id=? ORDER BY f.chapter_id,f.source_index LIMIT ?
    """, (entity["entity_id"], limit))
    return {"query": name, "found": True, "entity": dict(entity), "mentions": [dict(row) for row in mentions], "facts": [dict(row) for row in facts]}


def _item_query(store: ContinuityStore, name: str, limit: int) -> dict[str, Any]:
    entity = store.connection.execute(
        "SELECT * FROM entities WHERE entity_type='item' AND canonical_name LIKE ? LIMIT 1", (name,)
    ).fetchone()
    if not entity:
        return {"query": name, "entity_type": "item", "found": False, "state_changes": []}
    rows = store.rows("""
        SELECT v.event_id,v.event_type,v.chapter_id,v.line_start,v.line_end,v.source_quote,
               v.certainty,v.epistemic_type,v.metadata_json,c.title,c.arc_id,c.branch,s.source_path
        FROM events v JOIN chapters c ON c.chapter_id=v.chapter_id JOIN sources s ON s.source_id=c.source_id
        WHERE v.subject_id=? AND c.active=1
        ORDER BY s.source_order,s.source_path,c.ordinal,v.relative_order LIMIT ?
    """, (entity["entity_id"], limit))
    return {"query": name, "found": True, "entity": dict(entity), "state_changes": [dict(row) for row in rows]}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = build_parser()
    args = parser.parse_args(argv)
    settings = _settings(args)
    pipeline = ContinuityPipeline(settings)
    if args.command in {"update", "extract", "index", "scan"}:
        summary = pipeline.run(
            force=bool(getattr(args, "force", False)),
            rules=args.command not in {"extract", "index"},
            report=args.command not in {"extract", "index"},
        )
        if args.command == "scan" and (args.arc or args.chapter):
            suffix = args.chapter or args.arc
            with ContinuityStore(settings.database_path) as store:
                generate_report(
                    store, settings.reports_dir / f"CONTINUITY-AUDIT-{suffix}.md",
                    arc_filter=args.arc, chapter_filter=args.chapter,
                )
        _json(summary.as_dict())
        return 2 if summary.errors else 0
    with ContinuityStore(settings.database_path) as store:
        if args.command == "report":
            output = Path(args.output) if args.output else settings.reports_dir / "CONTINUITY-AUDIT.md"
            counts = generate_report(store, output, arc_filter=args.arc, chapter_filter=args.chapter)
            _json({"output": str(output), "counts": counts})
        elif args.command == "search":
            rows = store.rows("""
                SELECT p.chapter_id,p.source_index,p.plain_text,c.title,s.source_path,p2.line_start,p2.line_end
                FROM paragraph_fts p JOIN chapters c ON c.chapter_id=p.chapter_id
                JOIN sources s ON s.source_id=c.source_id
                JOIN paragraphs p2 ON p2.chapter_id=p.chapter_id AND p2.source_index=p.source_index
                WHERE paragraph_fts MATCH ? AND c.active=1 LIMIT ?
            """, (args.query, args.limit))
            _json([dict(row) for row in rows])
        elif args.command == "character":
            _json(_entity_query(store, args.name, "character", args.limit))
        elif args.command == "item":
            _json(_item_query(store, args.name, args.limit))
        elif args.command == "timeline":
            where = "AND e.chapter_id=?" if args.chapter else ""
            params = (args.chapter, args.limit) if args.chapter else (args.limit,)
            rows = store.rows(f"""
                SELECT e.event_id,e.chapter_id,e.event_type,e.subject_id,e.object_value,e.story_time,
                       e.certainty,e.epistemic_type,e.line_start,e.line_end,e.source_quote
                FROM events e JOIN chapters c ON c.chapter_id=e.chapter_id WHERE c.active=1 {where}
                ORDER BY e.chapter_id,e.relative_order LIMIT ?
            """, params)
            _json([dict(row) for row in rows])
        elif args.command == "context":
            bundle = build_context_bundle(store, settings.repo_root, args.chapter_id)
            if args.output:
                output = Path(args.output)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
                _json({"output": str(output), "chapter_id": args.chapter_id})
            else:
                _json(bundle)
        elif args.command == "import-state":
            count = import_candidate_state(store, settings.repo_root, Path(args.file))
            run_id = store.begin_run("import-state")
            issues = run_continuity_rules(store, run_id, settings.forgotten_thread_chapters)
            store.finish_run(run_id, {"imported_candidate_facts": count, "issues": len(issues)})
            _json({"imported_candidate_facts": count, "issues": len(issues)})
        elif args.command == "review":
            review_fact(store, args.fact_id, args.status, args.note)
            pages = generate_canon_pages(store, settings.canon_dir)
            _json({"reviewed": args.fact_id, "status": args.status, "canon_pages": pages})
        elif args.command == "canon":
            _json({"canon_pages": generate_canon_pages(store, settings.canon_dir)})
        elif args.command == "status":
            row = store.connection.execute("SELECT * FROM processing_runs ORDER BY run_id DESC LIMIT 1").fetchone()
            _json(dict(row) if row else {"status": "not-indexed"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
