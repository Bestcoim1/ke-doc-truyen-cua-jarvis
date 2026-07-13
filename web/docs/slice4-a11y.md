# Slice 4 · WS3 — Accessibility audit (AC-A11Y-01 / NFR §14.3)

Target: WCAG 2.2 AA for the Reader and P0 flows. This note records the audit,
the fixes applied in this workstream, and the manual checks that remain
(automated tools can't cover keyboard/screen-reader smoke — the spec requires
those to stay manual).

## Already in good shape (before this WS)

- **Dialog semantics.** Both overlays (TOC, Settings) use Radix `Dialog`, so
  they get focus trap, `aria-modal`, `Escape`-to-close, and focus return to the
  trigger for free — the four things AC-A11Y-01 calls out. Each has a
  `Dialog.Title`.
- **Control roles/state.** Settings uses `role="radiogroup"`/`role="radio"` +
  `aria-checked`; the current TOC chapter carries `aria-current`; read/unread
  state is exposed to SRs via an `sr-only` label, not color alone.
- **Zoom 200%.** No `maximum-scale` in the viewport (fixed in WS2), so pinch/
  text zoom works.

## Fixed in this workstream

1. **Visible keyboard focus (was missing).** The Reader's controls are raw
   `<button>`/`<input>` elements with no focus style, so keyboard focus was
   invisible — a direct AC-A11Y-01 failure. Added a global `:focus-visible`
   outline in `globals.css`, with a Reader-scoped override that draws it in the
   theme accent for contrast on the sepia/dark reading surfaces. shadcn
   Buttons/Inputs keep their own ring (they set `focus-visible:outline-none`),
   so there's no double ring.
2. **TOC search input had no accessible name** — only a placeholder. Added
   `aria-label="Tìm chương"`.
3. **Touch targets < 44 px.** Header icon buttons (~34 px), dialog close
   buttons (~30 px), footer prev/next, TOC chapter rows, and Settings option
   chips were under the 44×44 CSS-px target. All bumped to a ≥44 px hit area
   (`h-11 w-11` for icon buttons, `min-h-11` for text controls) without
   resizing the glyphs.
4. **Radix "missing Description" warning** silenced with
   `aria-describedby={undefined}` on both `Dialog.Content`s (the title alone is
   the intended accessible name here).

## Still manual (required by NFR §14.3, cannot be automated here)

- **Keyboard smoke:** Tab through Library → Reader → open TOC → navigate a
  chapter → open Settings → change theme/size, using only the keyboard. Confirm
  focus never leaves an open overlay, `Escape` closes it, and focus returns to
  the button that opened it.
- **Screen-reader smoke:** VoiceOver (iOS Safari) and TalkBack (Chrome
  Android) over the same path. Confirm every control announces a name + state,
  and the reading progress / current-chapter / read-state are perceivable.
- **Contrast:** verify text ≥ 4.5:1 and UI components ≥ 3:1 in all three Reader
  themes (light, dark, sepia) — the accent/foreground token pairs in
  `globals.css` were chosen for this but should be spot-checked with a contrast
  tool on real content.
- **Automated scan (follow-up):** wire `@axe-core/playwright` into the E2E
  suite (PR #4) — assert no critical/serious violations on `/auth/login`,
  `/auth/sign-up` (smoke tier) and the Reader/TOC (authenticated journey). Left
  out of this PR to avoid depending on the not-yet-merged E2E harness; it slots
  in as one `expect(await new AxeBuilder(...).analyze()).…` per page once #4
  lands.
