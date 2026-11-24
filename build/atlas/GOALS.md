# GOALS: MITRE ATLAS in Aigis (feature id `atlas`)

Tier: **R** (adds a framework and citations). Target version: **2.2.0**. Planner: Fable 5.2, 2026-11-24.
Source of truth for ATLAS facts: `dist/v6/ATLAS-2026.10.yaml`, tag `v2026.10`, sha256 `ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d` (re-verified by the planner with `python3 -I`).

## Problem and user

Aigis tells a coding agent what to build (areas) and which governance frameworks ask for it (OWASP, NIST, ISO, EU AI Act). It says nothing about how an attacker would actually go after the system. Evidence in the repo today:

- `grep -ri atlas content lib bin README.md` returns nothing.
- ATLAS 2026.10 has 44 mitigations. The candidate gold mapping (23 area links, pending Nayan's approval) reaches 12 of them. The agentic cluster (AML.M0026, M0027, M0028, M0030, M0031, M0033, M0037, M0038, M0043) has no Aigis area at all, while AML.T0051.001 Indirect prompt injection and AML.T0086 Exfiltration via AI Agent Tool Invocation are both **Realized**.
- Nayan's threat-modeling method (INTAKE) has five steps. Aigis supports none of them.

User: a developer (through their coding agent) who is designing an AI feature, adding a capability (tools, write access, memory, a new data source), preparing a launch, or responding to an incident.

## Outcomes

- **O1** ATLAS data ships inside Aigis: pinned, small, attributed, offline.
- **O2** Every existing surface that cites frameworks also cites ATLAS mitigations, without claiming compliance.
- **O3** One command turns a system description or trait list into a threat model: entry points, techniques ordered by maturity, MITRE's linked mitigations, the Aigis area that implements each, and the gaps.
- **O4** The agent learns when and how to use it, inside a stated context budget.
- **O5** Nothing that worked before changes: routing, existing citations, brief caps, JSON keys, jurisdiction gating.
- **O6** Every ATLAS identifier and link Aigis prints is correct against the pinned source, and the mapping Aigis owns is approved by Nayan.

## Acceptance criteria

Test ids refer to TESTPLAN.md. Exact strings and shapes are in SPEC.md.

| AC | Tier | Criterion (checkable by a stranger) | Tests |
|---|---|---|---|
| AC1 | MUST | `content/index/atlas.json` exists, is at most 64,000 bytes, records version `2026.10` and the pinned sha256, and contains exactly 16 tactics, 221 techniques (92 with a parent), 44 mitigations, 494 mitigation links, maturity 117/78/26, and no description text. | T-CAT-01..08 |
| AC2 | MUST | `node scripts/build-atlas-index.js --source <file>` exits 1 and writes nothing when the file's sha256 is not the pinned one; with the pinned file it reproduces `atlas.json` byte for byte (`--check` exits 0). The script and `lib/` contain no network code. | T-CAT-10, T-CAT-11, E2E-07 |
| AC3 | MUST | `content/index/atlas-NOTICE.md` ships in both packages and embeds, byte for byte, the upstream MITRE notice (551 bytes, sha256 `fa6c92ab...`) and the full Apache-2.0 text (11,358 bytes, sha256 `cfc7749b...`), plus the release tag, the data sha256 and a statement of what was changed. README's License section points to it. | T-CAT-09, T-DOC-02, T-REL-02, E2E-06 |
| AC4 | MUST | The 15 non-EU areas each declare `controls.atlas` (ATLAS mitigation ids, may be empty) equal to the `include` rows of the Nayan-approved gold file `build/atlas/gold/area-mitigations.json` (the approved copy of `area-mitigations.candidate.json`: 23 links to 12 mitigations across 12 areas in the candidate; bias-monitoring, explainability and fallback-patterns are empty); the 4 EU-gated areas declare none. The validator rejects malformed ids and ids not in the catalog. No existing OWASP/NIST/ISO/EU citation and no area body changes. | T-FM-01..05, T-FM-07 |
| AC5 | MUST | `aigis classify ... --json` adds `controls.atlas` (sorted mitigation ids for the recommended areas) and an `atlas` summary block; every pre-existing key and value is unchanged. | T-SUR-01, T-SUR-02, T-REG-01 |
| AC6 | MUST | `aigis verify <area> --auto <path>` shows a separate "MITRE ATLAS" block (text) and `cited_controls.atlas` plus an `atlas` block (JSON). The block contains the disclaimer sentence, never says "satisfied", is at most 1,000 characters, is identical with and without `--jurisdiction eu`, and removing it leaves the old output byte for byte. | T-SUR-03..06 |
| AC7 | MUST | `aigis report` adds ATLAS mitigations per area, an ATLAS row in the cross-framework table, `atlas_count` / `atlas` in the JSON summary, and one methodology bullet containing the disclaimer sentence. Everything else is unchanged. | T-SUR-07, T-SUR-08 |
| AC8 | MUST | `aigis build` briefs (full and compact) gain one `## Threat model (MITRE ATLAS)` section with the exact `aigis threats --traits ...` command; the brief grows by at most 1,000 characters; `meta.atlas` is added. | T-SUR-09, T-SUR-11 |
| AC9 | MUST | `aigis threats --traits <list> [--top N] [--json]` and `aigis threats "<description>"` print the threat model defined in SPEC S5: techniques from the approved entry-point map, ordered Realized, Demonstrated, Feasible; the mitigations MITRE links directly to each technique (the 494 published links only, no inheritance from parent techniques); the Aigis areas citing each mitigation; gaps. Exit 0. No timestamp. Byte-identical on rerun. | T-THR-01..04, T-THR-08, T-THR-12, T-THR-14 |
| AC10 | MUST | `aigis threats` error and edge behavior: no input, empty description, unknown trait, description with no traits, bad `--top`, traits with no entry points, piped stdout. Each has the exit code and message in SPEC S5.6, including exit 2 when the catalog or the entry-point file is missing, corrupt or does not match the pin. | T-THR-05..07, T-THR-09, T-THR-10, T-THR-17..20 |
| AC11 | MUST | Size caps: `threats` text at most 7,000 chars by default and 16,000 at `--top 25`; JSON at most 20,000 and 45,000; `--top` above 25 is refused. No command prints more than 25 techniques. | T-THR-05, T-THR-11 |
| AC12 | MUST | `content/skills/core.md` is at most 4,900 characters (4,180 today, budget +720) and tells the agent when to run `aigis threats`. The resolver block and its checksum are unchanged. | T-DOC-01, T-REG-05 |
| AC13 | MUST | `aigis template threat-model` prints a fill-in template of at most 4,500 characters with the five method steps and the 16 tactic names in MITRE's matrix order. It is not auto-recommended by classify. | T-DOC-04, T-REG-01 |
| AC14 | MUST | Honesty. The exact disclaimer sentence (SPEC S0) appears at least once in every output document that renders ATLAS information: classify (JSON; text if AC21 ships), verify `--auto` (text and JSON), report (markdown and JSON), build (brief and `meta`), threats (text and JSON), `aigis template threat-model`; and in README (both copies) and the core skill. In JSON it is always `atlas.disclaimer`. Only raw file fetches (`aigis get`, `aigis search`) and `--help` are exempt. None of these contain "ATLAS compliant", "ATLAS compliance", "ATLAS certified" or "risk score" outside that sentence. Every mitigation shown for a technique is one of MITRE's published links. README numbers match the catalog and the gold file. New README text has no em dash. | T-HON-01 (one scan of every surface for every forbidden phrase), T-SUR-01, T-SUR-03..09, T-THR-01, T-THR-15, T-DOC-01, T-DOC-02, T-DOC-04, T-DOC-06, E2E-08 |
| AC15 | MUST | Guards: trait detection, `implement_files`, existing `controls`, `aigis get` bodies and every pre-existing command output on the fixed matrix are identical to the baseline captured on `07ef537`, apart from the additive fields listed in SPEC. | T-REG-01..05, T-FM-04, T-FM-05 |
| AC16 | MUST | Release hygiene: version `2.2.0` in all five places, `CHANGELOG.md` entry, `content/` and the Python copy byte-identical, npm tarball and wheel contain the catalog and notice and nothing private, installed-package journeys pass. | T-REL-01, T-REL-02, T-DOC-05, E2E-01..06 |
| AC17 | MUST | The Python package's existing commands still work with the new content (classify, get, verify `--auto`, report). | T-PY-01 |
| AC18 | MUST | Eval targets in EVALS.md are met on the dev set and the held-out set. | EV-M1..M6 |
| AC19 | SHOULD | `aigis threats ... --redteam` adds at most 5 red-team test stubs built from the top techniques (SPEC S5.5), at most 4,000 extra characters, with no attack payloads. | T-THR-13 |
| AC20 | SHOULD | Python CLI parity: `aigis classify/verify/report/build` ATLAS fields and `aigis threats --json` from the Python package equal the Node output on the parity inputs. It ends in one of two states by 20:00: shipped, or cut-complete (nothing of the port merged, both READMEs carry the one-line note in SPEC S6.4). | T-PY-02, T-DOC-07 |
| AC21 | SHOULD | `aigis classify` human-readable output shows the ATLAS count on the Controls line and a `Threat model:` pointer. | E2E-08 |
| AC22 | SHOULD | `aigis build --list` ends with the `Threat model:` pointer lines. | T-SUR-10 |
| AC23 | MUST | Fail-soft. With `content/index/atlas.json` missing, corrupt or not matching the pin, classify, verify `--auto`, report and build exit as before, print exactly the pre-2.2 output (no ATLAS key, block, row or section) and one stderr line; `aigis threats` exits 2 with nothing on stdout. A broken `atlas-entry-points.json` changes nothing for those four commands and makes `threats` exit 2. | T-FS-01..05, T-THR-19, T-THR-20, T-LIB-02, T-LIB-12, T-LIB-14 |

SHOULD cut order if a reserve is threatened (first cut first): AC21, AC19, AC20, AC22. Cuts are logged. Every cut decision is final by 20:00; the docs node then runs a 15 minute reconcile pass (SPEC S6.6) so README and CHANGELOG describe what actually shipped. No MUST is cut without Nayan.

## Eval targets (detail in EVALS.md)

- Primary, M3 citation accuracy: 1.000 precision and recall on (a) ids, names and maturity, (b) mitigation to technique links, against an independent oracle built from the pinned YAML; area labels and entry points equal to the approved gold files.
- Coverage on the `--traits` path (ground-truth traits): technique recall 1.000, precision 1.000 against the gold entry-point map. Baseline is 0 (the capability does not exist).
- Description path: equal to the `--traits` path for the traits the resolver finds (no extra loss). Reported, not gated: planner measured trait recall 0.481 on the v2 descriptions through the CLI resolver, which gives technique recall 0.554 (precision 1.000) with the candidate gold map (36 links, 11 traits).
- Guards: M1/M2 area selection and trait detection unchanged (delta 0); brief growth at most 1,000 characters; core skill at most 4,900 characters.
- M6: deterministic, all tests green. M4 (agent in the loop) is milestone only, not tonight.

## Non-goals (tonight)

1. No new area content. The agentic gaps (tool invocation on untrusted data, tool poisoning, memory hardening, agent access management) are shown honestly by `aigis threats` and go to IMPROVEMENTS as the first 2.3 item.
2. No new traits and no trigger changes. Surface traits such as `ingests-untrusted-content`, `has-memory`, `has-write-access` go to IMPROVEMENTS.
3. No resolver fix for long descriptions (known item). `--traits` is the documented primary path for `threats`.
4. No case-study text, technique descriptions or attack payloads in the package. No full-catalog dump command.
5. No predictive-ML entry points (evasion, model extraction, physical attacks) in the entry-point map.
6. No risk scoring. Ordering uses MITRE's maturity label and case-study counts only.
7. No `--confirm/--reject` on `threats`, no auto-verify rules for ATLAS, no change to `--tight`.
8. No M4 agent evals. No change to the benchmark claims in README.

## Inherited invariants (constitution, BUILD-SYSTEM §8)

| Rule | Status | How |
|---|---|---|
| 1 No LLM or network at runtime | pass | Vendored JSON; static no-network test (T-CAT-11) |
| 2 Deterministic | pass | No new volatile field. `threats` has no timestamp (T-THR-12, T-SUR-11) |
| 3 Thin harness | pass | Catalog never inlined; caps in AC8, AC11, AC12 |
| 4 Content is procedures, ids in frontmatter | pass | `controls.atlas` in frontmatter; area bodies untouched |
| 5 No silent loss | pass | T-FM-04; baseline file extended to protect `atlas` from now on |
| 6 Jurisdiction gating | pass | ATLAS is universal and never gated; EU gating untouched (T-SUR-06, existing jurisdiction tests) |
| 7 Content parity | pass | Every content-owning node syncs the mirror; existing check stays on |
| 8 Backward compatible | pass | Additive JSON keys, one new command, minor version bump |
| 9 Tests | pass | Existing suite green; new tests locked before code |
| 10 Version agreement | pass | N5 (owner of `bin/aigis.js`) sets all five strings in one commit (T-REL-01) |
| 11 README claims backed | pass | T-DOC-02 checks numbers; no new performance claim |

Amendments proposed: none required. One optional addition for the retro (not blocking): "Vendored framework data is pinned by sha256 and regenerated only by a script."

## Budget

| Phase | Window (ET) | Timebox |
|---|---|---|
| Plan review, GATE A | to 16:15 | |
| T0 tests locked, E0 baseline, G0 gold approved | 16:15 to 17:00 | 45 min each, parallel |
| N1 catalog | 17:00 | 35 min |
| N2 lib, N3 labels (parallel) | 17:35 | 45 / 40 min |
| N4 surfaces, N5 threats, N6 docs, PY (parallel) | 18:20 | 50 / 60 / 40 / 90 min |
| Cut decisions final; N6 reconcile pass | 20:00 to 20:15 | 15 min |
| Reserve | 19:50 to 20:30 | 40 min (includes the reconcile pass) |
| Feature freeze | 20:30 | |
| INT, end to end, evals, Sol review | 20:30 to 21:30 | 60 min |
| GATE B | 22:00 | |

Critical path: N1, N2, N5 (140 min of 210). Eval budget: seconds per run (deterministic CLI), 2 runs each on 10 dev and 8 held-out descriptions, no agent runs.

## Top risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Gold approval is on the critical path: two mappings (area to mitigation, trait to technique) need a second independent draft and Nayan's approval by 17:00. | Both drafts are merged into candidate files (23 area links, 36 entry-point links) with every row quoted in `gold/APPROVAL-DETAIL.md`. Nayan approves from `gold/APPROVAL-REQUEST.md`. Rows he rejects become `exclude` and are logged. N1 and N2 do not depend on gold. |
| 2 | Overclaim: ATLAS inside "Compliance Report" or next to "Controls satisfied" reads as compliance. | Separate block, fixed disclaimer sentence, "helps implement" wording, forbidden-phrase test over content, code, README and outputs (AC14). |
| 3 | `threats "<description>"` inherits the CLI resolver's low recall on prose (0.48 trait recall on the v2 set), so the list can look thin. | `--traits` is the primary documented path (the agent already picks traits from the resolver block). Output echoes the traits used and tells the user to add missing ones. Resolver fix stays in IMPROVEMENTS. |
| 4 | Schedule: seven nodes in 3.5 hours; `bin/aigis.js` is a contention point. | One owner per file: N4 is lib-only, N5 owns `bin/aigis.js` and the version strings, INT owns no product file. The Python port is optional with a defined cut-complete state. SHOULD items cut in a fixed order, final at 20:00. 40 minute reserve before freeze. |

## Open questions for GATE A

1. Approve the two candidate mappings in `gold/APPROVAL-REQUEST.md` (A: 23 area to mitigation links; B: 36 trait to technique links; evidence in `gold/APPROVAL-DETAIL.md`). Default: approve as merged; anything you doubt is excluded tonight.
2. `aigis threats` is MUST, red-team stubs are SHOULD. Default: yes.
3. New area for the agentic gap tonight? Default: no, first item for 2.3; `threats` prints the gap.
4. Python CLI parity is SHOULD with an honest one-line README note if cut. Default: yes.
5. Bundle Apache-2.0 ATLAS data in the MIT package with a NOTICE file. Default: yes.
6. Ship `threats "<description>"` knowing it inherits resolver recall. Default: yes, with `--traits` documented as primary.
7. Resolved in the candidate map, no action needed unless you object: with direct MITRE links only, AML.T0051.000 and AML.T0051.001 show only AML.M0024, M0033 and M0035. The candidate map lists the parent AML.T0051 LLM Prompt Injection under `uses-llm`, so guardrails (AML.M0020) and `input-validation` appear against prompt injection without any inferred link.
