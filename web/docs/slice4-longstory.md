# Slice 4 · WS4 — Long-story performance & the virtualization decision

Spec §15 (Slice 4) lists *"TOC virtualization hoặc windowing **nếu đo đạc yêu
cầu**"* and an exit gate of *"pass với 500 chương, chương dài và dữ liệu
Unicode tiếng Việt"*. This note records what was measured, the resulting
decision, and how to confirm the part that unit tests can't reach.

## What was measured (data layer)

`tests/longstory-perf.test.ts` runs the reader's hot-path transforms at the
fixture extremes:

| Transform | Scale | Result |
|---|---|---|
| `buildTocTree` + `buildFlatChapterList` | 500 chapters / 60 sections / depth 2 | correct order + paths |
| `assignAnchorIds` + `hashContentBlocks` | ~800 paragraphs (~120k chars) | 800 unique anchors, valid hash |

Both together complete in **single-digit milliseconds** in the test runner.
These are all O(n) over a genuinely small n (hundreds), so there is no
data-layer scaling problem and nothing to optimize here. The time ceilings in
the test are loose tripwires for an accidental O(n²) regression, not a budget.

Vietnamese Unicode is covered separately by `tests/reader-unicode.test.ts`:
NFC vs NFD forms of the same paragraph normalize, fingerprint, hash, and
anchor identically — so resume and re-import matching hold on precomposed and
decomposed Vietnamese alike.

## The part unit tests can't measure (DOM / browser)

Virtualization only ever helps the **render + observer** cost, which lives in
the browser, not in these transforms:

- **Reader** renders one `<p data-anchor-id>` per paragraph and registers a
  single `IntersectionObserver` over all of them (`components/reader/reader-view.tsx`,
  `block-renderer.tsx`). A 100k-char chapter ≈ 400–800 paragraphs ⇒ 400–800
  elements + observer targets.
- **TOC** renders the full tree (≈500 chapter nodes) recursively, with a text
  filter (`components/reader/toc-panel.tsx`).

Why this is expected to be fine, and why we are **not** virtualizing now:

1. The focus-line tracker is a single `IntersectionObserver` (C++-side,
   batched) — **not** a per-scroll-frame handler that flattens the tree, which
   was the Slice 1 exit gate. Adding paragraphs grows the observed-set
   linearly; it does not reintroduce per-event O(n) work.
2. 500–800 DOM nodes is well within what a mobile browser paints smoothly;
   this is roughly one long article, not a 10k-row grid.
3. Windowing the reader would complicate the exact-anchor resume scroll
   (`scrollAnchorToFocusLine` relies on the target paragraph being in the DOM)
   and the end-of-chapter sentinel — real correctness cost for no measured win.

**Decision: defer virtualization.** Revisit only if on-device measurement (or
a real manuscript) crosses a clear threshold — as a starting rule of thumb:
a chapter over ~2,000 paragraphs, a TOC over ~2,000 nodes, or reader TTI /
scroll that misses the §14.1 NFR target on a mid-range phone.

## How to confirm on-device (manual QA)

Unit tests can't produce these numbers; use the seeded fixture:

1. Seed the 500-chapter + long-chapter fixture (needs a Supabase project and
   `SUPABASE_SERVICE_ROLE_KEY` / `KEDOC_SEED_OWNER_EMAIL` in `.env.local`):
   ```powershell
   npm run seed:fixtures
   ```
   It creates *"Fixture — 500 chương + edge cases"*, including a chapter with a
   short body, a chapter #100, and a ~100k-character chapter.
2. Open that story on a mid-range phone (or Chrome DevTools device emulation +
   4× CPU throttle).
3. Record a Performance trace while: opening the TOC (500 nodes), jumping to
   the long chapter, and scrolling it top-to-bottom.
4. Compare against the §14.1 NFR targets. If a target is missed, virtualize the
   surface that missed it (react-window for the TOC; a windowed block list for
   the reader) and re-run this trace — don't virtualize preemptively.
