# Slice 4 · WS5 — Import error handling & recovery (FR-12 / AC-IMP-03)

FR-12 audit: what each clause requires, where it's handled, and what this
workstream added.

| FR-12 clause | Status | Where |
|---|---|---|
| Every import error has a code, plain explanation, next action | mostly | `lib/import/file-validation.ts` (size / magic-byte / extension / strict-UTF-8 / NUL), server actions return Vietnamese messages with a next step; error codes go to `logEvent` |
| Non-blocking warnings list skipped content | done (Slice 2) | `import_jobs.warnings`, surfaced in the review editor |
| Losing network during review keeps the last saved draft | done by design | review "save" persists `draft_json` server-side; an offline save just fails its fetch and the last persisted draft stays intact |
| Commit retry is idempotent (no duplicate version/chapter) | done (Slice 2/3) | `commit_import_job` / `commit_reimport_job` completed-branch + row locks |
| Loading old-schema stored data shows a recovery state, not a blank screen | **added here** | see below |

## Added in this workstream

The review page already degraded a malformed `draft_json` to a recovery card
(try/catch around `normalizeImportDraft`). The **reader** did not: it cast
`chapter_revisions.content_blocks` straight to its type
(`content_blocks as ChapterRevisionContent`) and called `blocks.map` /
`.length` on it. A legacy or corrupt blob (missing `blocks`, wrong
`schema_version`, malformed block) would throw and fall through to the generic
error boundary — the blank-ish screen FR-12 §5 explicitly rules out.

- `lib/reader/content.ts` — `parseChapterContent(raw)` runtime-validates the
  blob (`schema_version === 1`, `blocks` is a non-empty array, every block has
  a valid `anchor_id` / `type` / `text`; decorative marks are sanitized rather
  than fatal). Returns `null` when it can't be safely rendered.
- `getChapterRevisionContent` now returns `content: ChapterRevisionContent | null`,
  so callers distinguish **revision row missing** (→ `notFound()`) from
  **row present but unrenderable** (→ recovery). Both re-import progress remap
  and the reader's resume fallback handle the null case (they leave progress on
  the old, still-valid revision).
- `components/reader/chapter-recovery-notice.tsx` + the reader page render a
  per-chapter recovery card ("Không mở được chương này" + re-import / back-to-
  library actions) instead of crashing. The rest of the story stays readable;
  `reader.chapter_content_invalid` is logged for telemetry.
- `tests/reader-content.test.ts` — 14 cases covering the valid blob, mark
  sanitization, and every rejection path.

## Still manual / follow-up

- **Temporary offline during read** (not review): progress writes already use
  `fetch(keepalive)` and fail silently, re-observing on the next scroll — no
  data loss, but a "you're offline" affordance is a P1 nicety, not built here.
- **Source-file cleanup after commit**: uploads are held in memory for parsing
  (no Storage object is persisted for paste/txt/docx today), so there is no
  temporary object to garbage-collect; revisit if uploads move to Storage.
- **Corrupt-content E2E**: the recovery path is unit-tested at the validator
  level; an end-to-end assertion (seed a bad `content_blocks`, load the
  chapter, expect the recovery card) belongs in the Playwright journey once
  PR #4 lands.
