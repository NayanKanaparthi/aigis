# L4 results

## Current: `rejudge-2026-11-25/`

All 18 runs (6 without Aigis, 6 with v2.1.1, 6 with v3.0) were graded in one blind pass by GPT-5.6 Sol with the unchanged `JUDGE-RUBRIC.md`. Each judge input holds the complete change, meaning edits to existing files plus new files. Inputs were built with `../build-judge-inputs.py` (seed 20261126). Outcome:

- Without Aigis: 22/51 (43%)
- v2.1.1: 38/51 (75%)
- v3.0: 46/51 (90%)

## Superseded: `judge-scores.json`, `judge-key.json`, `diffs/` (2026-11-24)

The first pass reported 26/51 (51%) for v2.1.1 and 41/51 (80%) for v3.0. Its inputs were incomplete. The exclude pathspec `':!__pycache__'` is invalid in git ("Unimplemented pathspec magic"), so `git diff` printed nothing, and the judge saw only newly created files. It missed every run's edits to `app.py`, 40 to 120 changed lines per run. The new builder uses `:(exclude)` and stops if any run has an empty diff. These files are kept only for the record.
