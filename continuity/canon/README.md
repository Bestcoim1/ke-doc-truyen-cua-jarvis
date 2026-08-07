# Reviewed canon

This directory contains human-reviewed canon pages only. The extractor writes candidate states under `continuity/generated/chapter-states/`; it never promotes them automatically.

Review a fact and rebuild these pages with:

```powershell
python .\scripts\continuity.py review FACT_ID provisional --note "Reason for the decision"
python .\scripts\continuity.py canon
```

Allowed statuses are `confirmed`, `provisional`, `disputed`, `retconned`, `obsolete`, and `unknown`. Old facts remain available when a retcon is approved.

