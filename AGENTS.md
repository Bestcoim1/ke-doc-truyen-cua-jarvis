# Repository instructions

`web/` is the production application; `src/` is the legacy prototype. Preserve unrelated working-tree changes.

## Story and continuity work

1. Never overwrite, rename, or delete manuscript `.docx` files from an automated continuity workflow.
2. Treat extracted facts as candidates. Do not silently promote inference, claims, dreams, rumors, or unreliable narration to confirmed canon.
3. Before changing story content, query the continuity index for affected characters, items, rules, knowledge, and open threads.
4. Cite a stable chapter ID plus extracted Markdown line range when reporting a contradiction.
5. Distinguish deliberate retcons from accidental contradictions and retain the superseded fact with an explicit status.
6. Do not rewrite prose automatically to fix continuity unless the author asks for that separately.
7. After story changes, run `python scripts/continuity.py update` and review the generated report.
8. Keep `Tuyển tập` multiverse material separate from the main/side-story canon domain.

