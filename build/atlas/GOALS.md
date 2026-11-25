# GOALS: MITRE ATLAS in Aigis (feature id `atlas`)

Tier: **R** (adds a framework, citations, two areas and a routing change). Target version: **3.0.0** (launch). Scope changed by the owner at 15:45 ET: read the section "Scope change 15:45" at the end; where it differs from the text above it, it wins. Planner: Fable 5.2, 2026-11-24.
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
| AC8 | MUST | `aigis build` briefs (full and compact) gain one `## Threat model (MITRE ATLAS)` section with the exact `aigis threats --traits ...` command and numbered instructions telling the agent to run it and act on the result (AC32); the brief grows by at most 1,500 characters; `meta.atlas` is added. | T-SUR-09, T-SUR-11, T-SUR-12 |
| AC9 | MUST | `aigis threats --traits <list> [--top N] [--json]` and `aigis threats "<description>"` print the threat model defined in SPEC S5: techniques from the approved entry-point map, ordered Realized, Demonstrated, Feasible; the mitigations MITRE links directly to each technique (the 494 published links only, no inheritance from parent techniques); the Aigis areas citing each mitigation; gaps. Exit 0. No timestamp. Byte-identical on rerun. | T-THR-01..04, T-THR-08, T-THR-12, T-THR-14 |
| AC10 | MUST | `aigis threats` error and edge behavior: no input, empty description, unknown trait, description with no traits, bad `--top`, traits with no entry points, piped stdout. Each has the exit code and message in SPEC S5.6, including exit 2 when the catalog or the entry-point file is missing, corrupt or does not match the pin. | T-THR-05..07, T-THR-09, T-THR-10, T-THR-17..20 |
| AC11 | MUST | Size caps: `threats` text at most 7,000 chars by default and 16,000 at `--top 25`; JSON at most 20,000 and 45,000; `--top` above 25 is refused. No command prints more than 25 techniques. | T-THR-05, T-THR-11 |
| AC12 | MUST | `content/skills/core.md` is at most 5,650 characters (4,180 today; budget raised from +720 to +1,470 at 16:00 because the when-and-how instructions of AC32 are what make an agent run the command at all; the specified text measures +1,377). The resolver block and its checksum are unchanged. | T-DOC-01, T-REG-05 |
| AC13 | MUST | `aigis template threat-model` prints a fill-in template of at most 4,500 characters with the five method steps and the 16 tactic names in MITRE's matrix order. It is not auto-recommended by classify. | T-DOC-04, T-REG-01 |
| AC14 | MUST | Honesty. The exact disclaimer sentence (SPEC S0) appears at least once in every output document that renders ATLAS information: classify (JSON; text if AC21 ships), verify `--auto` (text and JSON), report (markdown and JSON), build (brief and `meta`), threats (text and JSON), `aigis template threat-model`; and in README (both copies) and the core skill. In JSON it is always `atlas.disclaimer`. Only raw file fetches (`aigis get`, `aigis search`) and `--help` are exempt. None of these contain "ATLAS compliant", "ATLAS compliance", "ATLAS certified" or "risk score" outside that sentence. Every mitigation shown for a technique is one of MITRE's published links. README numbers match the catalog and the gold file. New README text has no em dash. | T-HON-01 (one scan of every surface for every forbidden phrase), T-SUR-01, T-SUR-03..09, T-THR-01, T-THR-15, T-DOC-01, T-DOC-02, T-DOC-04, T-DOC-06, E2E-08 |
| AC15 | MUST | Guards (amended 15:45). Trait detection, the bodies and existing citations of the 19 existing areas, and every pre-existing command output on the fixed matrix are identical to the baseline captured on `07ef537`, apart from the additive fields listed in SPEC and exactly one routing delta: when the trait set contains `is-agentic`, `implement_files` gains `agent-permissions` and `agent-tool-safety`, and `controls` gains those two areas' citations. For every other trait set the area list is byte-identical. Risk tier, reason, templates, guardrails and warnings never change. | T-REG-01..05, T-RT-01..03, T-FM-04, T-FM-05 |
| AC16 | MUST | Release hygiene: version `3.0.0` in all five places, `CHANGELOG.md` entry, `content/` and the Python copy byte-identical, npm tarball and wheel contain the catalog and notice and nothing private, installed-package journeys pass. | T-REL-01, T-REL-02, T-DOC-05, E2E-01..06 |
| AC17 | MUST | The Python package's existing commands still work with the new content (classify, get, verify `--auto`, report). | T-PY-01 |
| AC18 | MUST | Eval targets in EVALS.md are met on the dev set and the held-out set. | EV-M1..M6 |
| AC19 | SHOULD | `aigis threats ... --redteam` adds at most 5 red-team test stubs built from the top techniques (SPEC S5.5), at most 4,000 extra characters, with no attack payloads. | T-THR-13 |
| AC20 | SHOULD | Python CLI parity: `aigis classify/verify/report/build` ATLAS fields and `aigis threats --json` from the Python package equal the Node output on the parity inputs. It ends in one of two states by 20:30: shipped, or cut-complete (nothing of the ATLAS port merged, both READMEs carry the one-line note in SPEC S6.4). Python routing parity for the new areas is separate and MUST (AC29). | T-PY-02, T-DOC-07 |
| AC21 | SHOULD | `aigis classify` human-readable output shows the ATLAS count on the Controls line and a `Threat model:` pointer. | E2E-08 |
| AC22 | SHOULD | `aigis build --list` ends with the `Threat model:` pointer lines. | T-SUR-10 |
| AC23 | MUST | Fail-soft. With `content/index/atlas.json` missing, corrupt or not matching the pin, classify, verify `--auto`, report and build exit as before, print exactly the pre-3.0 output (no ATLAS key, block, row or section) and one stderr line; `aigis threats` exits 2 with nothing on stdout. A broken `atlas-entry-points.json` changes nothing for those four commands and makes `threats` exit 2. | T-FS-01..05, T-THR-19, T-THR-20, T-LIB-02, T-LIB-12, T-LIB-14 |

SHOULD cut order if a reserve is threatened (first cut first): AC21, AC30, AC19, AC20, AC22. Cuts are logged. Every cut decision is final by 20:30; the docs node then runs a 15 minute reconcile pass (SPEC S6.6) so README and CHANGELOG describe what actually shipped. No MUST is cut without Nayan.

## Eval targets (detail in EVALS.md)

- Primary, M3 citation accuracy: 1.000 precision and recall on (a) ids, names and maturity, (b) mitigation to technique links, against an independent oracle built from the pinned YAML; area labels and entry points equal to the approved gold files.
- Coverage on the `--traits` path (ground-truth traits): technique recall 1.000, precision 1.000 against the gold entry-point map. Baseline is 0 (the capability does not exist).
- Description path: equal to the `--traits` path for the traits the resolver finds (no extra loss). Reported, not gated: planner measured trait recall 0.481 on the v2 descriptions through the CLI resolver, which gives technique recall 0.541 (precision 1.000) with the candidate gold map after review round 3 (32 links, 9 traits). The current counts live in one place, EVALS §5.1.
- Guards: M1/M2 area selection and trait detection unchanged (delta 0); brief growth at most 1,500 characters; core skill at most 5,650 characters.
- M6: deterministic, all tests green. M4 (agent in the loop) is milestone only, not tonight.

## Non-goals (tonight)

1. (Replaced 15:45: two new areas are now in scope, see the end of this file.) Still out: EU AI Act citations and EU extension sections for the new areas, areas beyond these two, and any change to the 19 existing area bodies.
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

(Superseded by the stop times in "Scope change 15:45". Kept for the original streams' timeboxes.)

| Phase | Window (ET) | Timebox |
|---|---|---|
| Plan review, GATE A | to 16:15 | |
| T0 tests locked, E0 baseline, G0 gold approved | 16:15 to 17:00 | 45 min each, parallel |
| N1 catalog | 17:00 | 35 min |
| N2 lib, N3 labels (parallel) | 17:35 | 45 / 40 min |
| N4 surfaces, N5 threats, N6 docs, PY (parallel) | 18:20 | 50 / 60 / 40 / 90 min |
| Cut decisions final; N6 reconcile pass | 20:30 to 20:45 | 15 min |
| Reserve | inside 19:25 to 21:00 | see the new stop times |
| Feature freeze | 21:00 | |
| INT, end to end, evals, Sol review | 21:00 to 22:15 | 75 min |
| GATE B | 22:45 | |

Critical path: N1, N2, N5 (140 min of 210). Eval budget: seconds per run (deterministic CLI), 2 runs each on 10 dev and 8 held-out descriptions, no agent runs.

## Top risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Gold approval is on the critical path: two mappings (area to mitigation, trait to technique) need a second independent draft and Nayan's approval by 17:00. | Both drafts are merged into candidate files, one row per proposed link (A: 29 rows, 23 included; B: 54 rows, 32 included), every quote verbatim from the pinned YAML and shown in `gold/APPROVAL-DETAIL.md`. Nayan approves from `gold/APPROVAL-REQUEST.md`. Rows he rejects become `exclude` and are logged. N1 and N2 do not depend on gold. |
| 2 | Overclaim: ATLAS inside "Compliance Report" or next to "Controls satisfied" reads as compliance. | Separate block, fixed disclaimer sentence, "helps implement" wording, forbidden-phrase test over content, code, README and outputs (AC14). |
| 3 | `threats "<description>"` inherits the CLI resolver's low recall on prose (0.48 trait recall on the v2 set), so the list can look thin. | `--traits` is the primary documented path (the agent already picks traits from the resolver block). Output echoes the traits used and tells the user to add missing ones. Resolver fix stays in IMPROVEMENTS. |
| 4 | Schedule: seven nodes in 3.5 hours; `bin/aigis.js` is a contention point. | One owner per file: N4 is lib-only, N5 owns `bin/aigis.js` and the version strings, INT owns no product file. The Python port is optional with a defined cut-complete state. SHOULD items cut in a fixed order, final at 20:30. Reserve before the 21:00 freeze. |

## Open questions for GATE A

1. Approve the two candidate mappings in `gold/APPROVAL-REQUEST.md` (A: 23 area to mitigation links included of 29 proposed; B: 32 trait to technique links included of 54 proposed, covering 9 traits; evidence in `gold/APPROVAL-DETAIL.md`). Default: approve as merged; anything you doubt is excluded tonight.
2. `aigis threats` is MUST, red-team stubs are SHOULD. Default: yes.
3. Decided by Nayan at 15:45: yes, two new areas tonight.
4. Python CLI parity is SHOULD with an honest one-line README note if cut. Default: yes.
5. Bundle Apache-2.0 ATLAS data in the MIT package with a NOTICE file. Default: yes.
6. Ship `threats "<description>"` knowing it inherits resolver recall. Default: yes, with `--traits` documented as primary.
7. Resolved in the candidate map, no action needed unless you object: with direct MITRE links only, AML.T0051.000 and AML.T0051.001 show only AML.M0024, M0033 and M0035. The candidate map lists the parent AML.T0051 LLM Prompt Injection under `uses-llm`, so guardrails (AML.M0020) and `input-validation` appear against prompt injection without any inferred link.
---

## Scope change 15:45 ET (owner decision): v3.0.0 launch, agent-security gaps filled tonight

Launch line: "Aigis now understands how attackers attack AI systems and helps your agent build defenses against them."

What changes: the release is 3.0.0; two new areas close the nine ATLAS agent mitigations no area covered (AML.M0026, M0027, M0028, M0030, M0031, M0033, M0037, M0038, M0043); `is-agentic` routes to them. Everything stays additive: no command, flag or JSON key is removed or renamed. The major version is used because classify output changes on purpose for agentic projects and because this is a launch, not because anything breaks.

### Decisions

| # | Decision | Reason |
|---|---|---|
| S1 | Two areas, grouped as the orchestrator proposed. `agent-permissions`: who the agent acts as and what it may reach (M0026, M0027, M0028, M0037, M0043). `agent-tool-safety`: what flows through tools at run time (M0030, M0033, M0038, and M0031 as a conditional step for agents with persistent memory). | One area is about identity and authorization fixed before and enforced during a run; the other is about data-driven control inside a run. A single area would be over 20,000 characters and would bury the Realized path (untrusted data triggering tools). |
| S2 | Route `is-agentic` only. Not `generates-code`, not `uses-thirdparty-api`, not `uses-rag`. | All nine mitigations name AI agents or agent memory; `is-agentic` is their precondition. A code-suggestion tool or a plain API caller has no tools or delegated permissions, so routing them would add two roughly 11,000-character areas of irrelevant context. |
| S3 | Citations for the new areas (ATLAS, OWASP, NIST, ISO) go through the same gold method, after the bodies are written, at a second approval gate (GATE A2, about 19:00). No EU AI Act citation tonight. | Evidence is a quoted step heading, so labels cannot precede the content. Existing areas pair every EU citation with a gated extension section and checkpoint; writing and verifying those is out of reach tonight. |
| S4 | The new area bodies are designed against the mitigation text up front: each step names the MITRE sentence it implements (SPEC S7). | Review round 2 removed `human-oversight` to AML.M0028 because a static allowlist is not caller-specific authorization. Designing to the sentence avoids writing content that cannot honestly carry the citation. |
| S5 | Python routing parity becomes MUST (pass 1 of node PY). The ATLAS port stays SHOULD (pass 2). | `TRAIT_FILES` and the overclaim recognizers are code in both packages. Without pass 1, `pip install aigis-cli` at 3.0.0 would route agentic projects differently from npm. |

### Outcomes added

- **O7** An agentic project gets two new procedures that implement the ATLAS agent mitigations, at the same content bar as the existing procedure areas.
- **O8** `aigis threats` shows those mitigations as implemented by an Aigis area instead of as gaps, backed by approved links.

### Acceptance criteria added

| AC | Tier | Criterion (checkable by a stranger) | Tests |
|---|---|---|---|
| AC24 | MUST | `content/skills/areas/agent-permissions.md` and `agent-tool-safety.md` exist, pass the frontmatter validator, have `system_traits: [is-agentic]`, no `jurisdiction`, no `eu_ai_act`, follow the procedure format (Common incomplete implementations; Implementation procedure with the numbered steps of SPEC S7.1 and S7.2, each with "What to do" and "Verification checkpoint"; Complete working example in Python and JavaScript; What this does not cover), are at most 12,000 characters each, and every code block compiles. | T-NA-01..05, T-NA-07, T-NB-01..05, T-NB-07 |
| AC25 | MUST | Both areas pass the content rubric C-1 to C-11 in RUBRIC.md, judged by the Fable checker with evidence, including mitigation fidelity (each step does what its MITRE sentence says for the object it names). | rubric C-1..C-11 |
| AC26 | MUST | Verify assets: a checklist per area with one row per step; auto-verify rules for both; `aigis verify <area>`, `aigis verify <area> --auto <path>` and `aigis audit --traits is-agentic` work; each area's own complete example passes all of its auto checks; a project with none of the controls fails all of them; the overclaim recognizer `wildcard_tool_scope` is raised on a wildcard grant and not otherwise. | T-NV-01..06, T-NV-08 |
| AC27 | MUST | Routing: `classify` recommends both new areas exactly when the trait set contains `is-agentic` (no other trait alone routes to them), build, audit and report follow, and the delta against baseline is exactly the one in AC15. | T-RT-01..05, EV-RT |
| AC28 | MUST | The `controls` of the two new areas (owasp, nist, iso42001, atlas) equal the `include` rows of the Nayan-approved `build/atlas/gold/new-areas.json`; every ATLAS row has a verbatim MITRE quote and a step heading; no framework id appears in a body that is not in its frontmatter. | T-NA-06, T-NB-06 |
| AC29 | MUST | Python routing parity: the Python package recommends the same areas as Node for the routing matrix, and `verify --auto` on the new areas gives the same JSON as Node, including the recognizer result. | T-PY-03 |
| AC30 | SHOULD | Second recognizer `untrusted_gate_log_only` for `agent-tool-safety` (trust label checked but only logged). If cut, that check is a JUDGMENT item with the same wording. | T-NV-07 |
| AC31 | MUST | Launch docs: both READMEs carry the launch line, a `What's new in v3.0` section naming the two areas and the routing change, and area and checklist counts that equal the repo (computed by the test); `content/index/taxonomy.md` lists the two areas for `is-agentic`; CHANGELOG `## 3.0.0` says the release is additive and what changes for agentic projects. | T-DOC-09, T-DOC-02, T-DOC-05 |

AC16 now means version `3.0.0`. AC4, AC9 and AC14 apply to the new areas unchanged (their `atlas` labels come from gold; `threats` reads them; the honesty scan covers them).

### Eval targets added (detail in EVALS §9)

- EV-RT routing: on the ground-truth-traits path, recall 1.000 and precision 1.000 for the two new areas against an independent per-description label "does this system let the model take actions or call tools" (5 of 18 descriptions in the planner draft: D9, H1, H3, H6, H8). On the description path: reported, with the floor "no loss beyond the resolver's `is-agentic` detection".
- Exact-delta guard (AC15) on all 18 descriptions and the fixed matrix.
- Context: each new area at most 12,000 characters; an agentic brief grows by at most 1,500 plus the two area bodies; no eval description crosses from full to compact fallback unless its baseline was within 26,000 characters of the 120,000 cap (reported per description).
- Citation accuracy for the new areas: equal to approved gold (EV-M3c extended).

### Stop times (ET), honest

| Milestone | Time |
|---|---|
| Pre-build starts (T0, E0, G0) | 16:15 |
| Rev 3 delta approved (review plus owner) | 16:40 assumed |
| Original tests locked (T0) / new-area tests locked (T0b) | 17:00 / 17:15 |
| New areas authored and content-approved (NA1, NA2); verify assets built (NV) | 18:25 |
| NV join check done | 18:45 |
| GATE A2: Nayan approves citations for the new areas (about 15 minutes of his time) | 19:15 |
| Label pass; N4 and N5 done | 19:25 |
| Cut decisions final | 20:30 |
| N6 reconcile done | 20:45 |
| **Feature freeze** | **21:00** (was 20:30) |
| Integration, end to end, evals, Sol review of the full diff | 21:00 to 22:15 |
| **GATE B** | **22:45** (was 22:00). Realistic range 22:45 to 23:15: one extra content fix loop or a late GATE A2 costs about 30 minutes. |
| Publish (needs `npm login`), post-publish smoke | about 30 minutes after GATE B |

### The three biggest risks of the added scope

| # | Risk | Mitigation |
|---|---|---|
| A | Content quality under time pressure. Two procedure areas are the kind of work that took days in v2. A rushed area can give wrong security guidance, or ship regex rules that pass bad code, which is an overclaim in the product itself. | Steps designed against the MITRE sentences before writing (SPEC S7); a written content rubric judged by a different model than the author; the self-consistency tests (own example passes, empty project fails, wildcard raises the overclaim); JUDGMENT instead of a weak regex wherever a check cannot be made honest; a "What this does not cover" section; the M0031 step is conditional and droppable. |
| B | A second owner approval in the middle of the build (GATE A2, about 19:00), now on the critical path, covering ATLAS links plus OWASP, NIST and ISO ids for content that does not exist yet. ISO/IEC 42001 text is not available to quote. | The intended links are fixed in the design, so the labeler confirms rather than discovers; OWASP and NIST ids need a fetched public quote; ISO ids only by precedent from the nearest approved area and flagged as such, or left empty; rule if approval is late: no unapproved citation ships (EVALS §9.5). |
| C | The release no longer has the "routing is byte-identical" safety net. Classify changes for every agentic project, their briefs grow by about 20,000 to 24,000 characters, Python must mirror the routing, and v2.1 showed that bigger briefs can reduce what agents implement. | Exact-delta guard (only `is-agentic`, only these two areas); 12,000-character cap per area; per-description brief sizes and fallback reported; Python pass 1 is MUST with a JSON-equality test; M4 agent evals stay milestone-only, so the effect on agent behavior is stated as unmeasured in the CHANGELOG, not claimed. |

### What is cut first if late

1. AC21 classify text line.
2. AC30 second recognizer (becomes a JUDGMENT item).
3. AC19 red-team stubs.
4. AC20 Python ATLAS port (pass 2). Routing parity stays.
5. AC22 `build --list` pointer.
6. Needs Nayan, pre-agreed at the delta approval: the conditional memory step (AML.M0031 stays a printed gap).
7. Needs Nayan, pre-agreed: ship one new area instead of two. Keep `agent-tool-safety` (it covers the Realized path from untrusted data to tool calls); `agent-permissions` moves to the next release and its mitigations stay printed gaps. The launch line still holds, with a smaller claim.

Never cut: the gold approval of any citation that ships, the honesty scan, the exact-delta guard, the content rubric.

### Open questions for the delta approval

8. Grouping and routing as in S1 and S2 (two areas, `is-agentic` only). Default: yes.
9. GATE A2 at about 19:00 needs about 15 minutes from Nayan. Default if he is unavailable by 20:00: the areas ship with only the citations both labelers proposed and he pre-approves that rule now; otherwise with empty citation arrays, and `threats` keeps printing those mitigations as gaps.
10. ISO/IEC 42001 ids for the new areas cannot be checked against the standard's text tonight. Default: cite only ids already carried by `human-oversight` (the nearest approved area), marked "by precedent" in the gold file; say no to leave `iso42001: []`.
11. Pre-agree fallbacks 6 and 7 above so a late decision is one word. Default: yes.
12. 3.0.0 with no breaking change. Default: yes, and the CHANGELOG says so in its first line.
---

## Owner requirement 16:00 ET: ATLAS works through the agent, in natural language

GATE A is approved ("yes to all", recorded in `gold/APPROVAL.md`, decisions 1 to 7): both gold mappings (23 of 29, 32 of 54), `threats` MUST, v3.0.0 with the new areas, Python parity SHOULD, the notice file, the description path, and a ship time that may move to about midnight to 1am ET. Still open, because the record does not list them: questions 9, 10 and 11 above (the GATE A2 fallback rule, ISO ids by precedent, the two pre-agreed fallbacks).

The requirement: a user never has to remember a command. After `aigis init <ide>` the agent decides when to threat-model, derives the traits itself, runs `aigis threats --traits`, fetches and implements the areas it names, verifies, and reports gaps. Same pattern as classify, build and verify today.

| AC | Tier | Criterion (checkable by a stranger) | Tests |
|---|---|---|---|
| AC32 | MUST | (a) `content/skills/core.md` has a `## Threat modeling (MITRE ATLAS)` section that states when to run it without being asked (new AI feature; adding tools, write access, memory or a new data source; before launch; auditing an existing project; after an incident) and how (derive traits from the codebase and the request; `aigis threats --traits <traits>` first, the description form only as fallback; `aigis get <area>` then implement and `aigis verify <area> --auto .` for every area it names; report every gap as not covered, never as handled; rerun on change), and both workflows (build, audit) point to it. (b) `aigis init` for cursor, windsurf, copilot and claude-code writes that section into the rules or skill file, with the resolver block and checksum unchanged. (c) `aigis audit --scan` prints a threat-model phase after trait detection and before the control evaluation handoff. (d) The Threat model section of every brief is a numbered instruction list (run, fetch and implement named areas, report gaps, rerun), referenced from the brief's "Instructions for the agent" and "Verification" lists. | T-DOC-01, T-DOC-10, T-DOC-11, T-SUR-12, T-REG-05, E2E-04 |

Budgets, with the reason required by constitution rule 3:
- Core skill: cap 5,650 characters (was 4,900). The always-loaded text grows by 1,377 characters instead of 654. Reason: an agent that is not told when to threat-model will not do it; the trigger list and the five-step loop are the feature for most users, who never type a command. Nothing else is added to the always-loaded text, and the resolver block is untouched.
- Brief: growth cap 1,500 characters (was 1,000). The mitigation id list is dropped from the brief to pay for the instructions (the count stays; ids are in `meta.atlas` and in the `threats` output). Measured 1,092 characters with six traits; a long trait list adds up to about 300.
- `content/index/audit-scan.md`: one inserted phase, at most 800 characters (measured 644). Owner: N6.

Not tonight, recorded as a milestone eval (EVALS §10): whether a real coding agent, given only a natural-language request and the rules file, runs `aigis threats` unprompted and acts on it. Until that is measured, README and CHANGELOG say the agent "is instructed to", not that it "does".

### Stop times after the 16:00 decisions (ET)

Planned times are unchanged from the scope-change table: freeze 21:00, integration done 22:15, GATE B 22:45 (likely range to 23:15), publish about 30 minutes later. The owner's later ship window is used as reserve, not as extra scope:

| Bound | Time |
|---|---|
| Latest feature freeze | 22:30 |
| Latest integration green | 23:45 |
| Latest GATE B for a ship by 01:00 | 00:15 |
| After that | tag a release candidate, publish in the morning. No new decision is taken after 00:15. |
