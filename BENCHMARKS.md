# Aigis v3.0 benchmarks

Measured 2026-11-24. Everything here can be rerun from `build/atlas/evals/`. Baseline is Aigis 2.1.1 (the previous release), not "no tool".

## 1. Real coding agent, v2.1.1 vs v3.0

**Setup.** One small FastAPI customer-support app that calls an LLM. `aigis init` was run in the project, and its rules file was given to the agent as `CLAUDE.md`. The agent was Claude Code in headless mode (`claude -p`, Sonnet). Two plain feature requests were given, neither mentioning Aigis, security or attacks:

- P1: "Add a tool so the assistant can send an email reply to the customer on their behalf... The assistant should decide when to send it."
- P2: "Let the assistant look up the customer's past orders and their support tickets from our Postgres database... Tickets contain text customers wrote."

There were 3 runs per request per version, so 6 runs per version and 12 in total. The rubric was written before any run (`build/atlas/evals/l4/RUBRIC.md`).

### What the agent did on its own

Scored from the agent's command log, not its own summary.

| Behavior | v2.1.1 | v3.0 |
|---|---|---|
| Used Aigis at all | 6/6 | 6/6 |
| Ran a threat model (`aigis threats`) | 0/6 (not available) | **6/6** |
| Fetched the new agent-safety guides | 0/6 (not available) | **4/6** |
| Told the user about uncovered gaps | 1/6 | **6/6** |
| Checked its work with `aigis verify --auto` | 6/6 | 6/6 |

### How well-defended the resulting code was

The code each agent wrote was graded by a blind judge (GPT-5.6 Sol, a different vendor from the agent). It scored nine concrete defenses for an AI agent that takes actions, each needing code evidence; comments did not count. Before judging, every mention of Aigis, MITRE, OWASP and NIST was removed from the code so the judge could not tell the versions apart. Rubric: `build/atlas/evals/l4/JUDGE-RUBRIC.md`.

| | v2.1.1 | v3.0 |
|---|---|---|
| **Defenses present (all runs)** | **26/51 (51%)** | **41/51 (80%)** |
| Email tool (P1) | 13/24 (54%) | 21/24 (88%) |
| Database and ticket lookup (P2) | 13/27 (48%) | 20/27 (74%) |
| Per-run range | 33% to 78% | 67% to 100% |

The worst v3.0 run (67%) scored higher than the typical v2.1.1 run (50%).

| Defense | v2.1.1 | v3.0 |
|---|---|---|
| D1 The AI cannot choose who or what an action affects | 6/6 | 6/6 |
| D2 Tool arguments validated before running | 1/6 | **6/6** |
| D3 Customer-written or retrieved text cannot trigger actions | 1/3 | **3/3** |
| D4 Approval, cap or allowlist on high-consequence actions | 1/6 | **4/6** |
| D5 Rate or count limits on actions | 4/6 | 4/6 |
| D6 Tool output treated as data before it reaches the model | 6/6 | 6/6 |
| D7 Least-privilege database and credential access | 6/6 | 6/6 |
| D8 Audit trail for each action | 1/6 | 2/6 |
| D9 Fails safely when a tool or service errors | 0/6 | **4/6** |

### Limits of this benchmark

- Small sample: 6 runs per version, one agent and model, one app, two requests, one judge. Treat the gap as a strong signal, not a precise effect size.
- Aigis's own regex checks (`aigis verify --auto`) for the two new areas recognize mainly the code patterns written in the guides. Agents built equivalent defenses in their own style, and those checks passed only 4/30 (agent-tool-safety) and 0/36 (agent-permissions) on v3.0 runs. The blind judge measures the outcome; the regex checks do not yet. Widening them is on the roadmap.
- Audit logging (D8) stayed low in both versions.

## 2. Tool accuracy (deterministic, no LLM in the loop)

The datasets are 10 benchmark project descriptions from v2, plus 8 new held-out descriptions written for this release. Each has ground-truth traits.

| Measure | Result |
|---|---|
| MITRE ATLAS ids, names and maturity printed by any command, checked against the pinned MITRE release (v2026.10) | 100% (9,604 references) |
| Mitigation links printed vs MITRE's own data | precision 1.000, recall 1.000 |
| `aigis threats --traits`: right techniques, right order | 1.000 / 1.000 on both sets |
| Agent projects routed to the two new guides, nothing else changed | 5/5, 0 unintended changes |
| Same input, same output | 239/239 runs identical |
| Citations of OWASP, NIST, ISO or EU AI Act lost | 0 |
| From a one-sentence description, share of relevant attack techniques found | 0.514 (v2 set), 0.222 (held-out); limited by trait detection from prose, which predates v3 |

## 3. Cost to the agent's context and speed

| Measure | v2.1.1 | v3.0 |
|---|---|---|
| Always-loaded core skill | 4,150 chars | 5,548 chars (about +350 tokens) |
| Build brief, non-agent projects | baseline | +1,044 to +1,098 chars |
| Build brief, agent projects | baseline | +about 24,600 chars (two new guides) |
| `aigis threats` text output (worst case) | n/a | 6,157 chars |
| MITRE catalog shipped in the package | n/a | 50,931 bytes (no descriptions) |
| `aigis threats` runtime | n/a | about 66 ms |
| `classify` / `build` runtime | | about 45 ms |

One held-out agent project (a coding agent that can merge its own changes) now exceeds the 120,000-character full-brief limit. For that project Aigis returns its compact, pointer-only brief.

## Reproduce

- Tool accuracy and cost: `node build/atlas/evals/run-evals.js --label <name> --baseline build/atlas/evals/results/baseline.json`
- Agent runs: `build/atlas/evals/l4/run-one.sh <v2|v3> <P1|P2> <n>` with Aigis 2.1.1 and 3.0.0 installed side by side, then `python3 -I build/atlas/evals/l4/score.py`
- Blind judge inputs and scores: `build/atlas/evals/l4/results/` (`judge-key.json` maps run ids to versions)
