# ATLAS test-writer report

Baseline captured before feature implementation: package version `2.1.1`; product commit `07ef537`; capture performed from planning commit `20f7b9c`, whose product tree is unchanged from `07ef537`. There are 58 command/static baseline files under `test/fixtures/atlas/baseline/`.

Red-suite result: 94/94 planned ids fail for an expected missing feature, missing approved gold file, or the documented problem below. The 11 pre-existing checks pass when run directly.

## `test/atlas-catalog.test.js` (11 cases)

- T-CAT-01 FAIL (expected): `content/index/atlas.json` is missing.
- T-CAT-02 FAIL (expected): the pinned catalog source block is missing.
- T-CAT-03 FAIL (expected): the catalog and its recomputable counts are missing.
- T-CAT-04 FAIL (expected): the catalog spot facts are missing.
- T-CAT-05 FAIL (expected): the matrix-ordered tactics are missing.
- T-CAT-06 FAIL (expected): catalog referential-integrity data is missing.
- T-CAT-07 FAIL (expected): the prose-free catalog subset is missing.
- T-CAT-08 FAIL (expected): the deterministically serialized catalog is missing.
- T-CAT-09 FAIL (expected): `content/index/atlas-NOTICE.md` is missing.
- T-CAT-10 FAIL (expected): `scripts/build-atlas-index.js` is missing.
- T-CAT-11 FAIL (expected): `lib/atlas.js` and the other no-network scan targets are not implemented.

## `test/atlas-lib.test.js` (14 cases)

- T-LIB-01 FAIL (expected): `lib/atlas.js` is not implemented.
- T-LIB-02 FAIL (expected): catalog error classification is not implemented.
- T-LIB-03 FAIL (expected): technique lookup is not implemented.
- T-LIB-04 FAIL (expected): mitigation lookup is not implemented.
- T-LIB-05 FAIL (expected): direct mitigation-link lookup is not implemented.
- T-LIB-06 FAIL (expected): empty mitigation lookup behavior is not implemented.
- T-LIB-07 FAIL (expected): mitigation-to-technique union is not implemented.
- T-LIB-08 FAIL (expected): technique ordering is not implemented.
- T-LIB-09 FAIL (expected): area mitigation reading is not implemented.
- T-LIB-10 FAIL (expected): mitigation reverse indexing is not implemented.
- T-LIB-11 FAIL (expected): area summary construction is not implemented.
- T-LIB-12 FAIL (expected): fail-soft wrapper behavior is not implemented.
- T-LIB-13 FAIL (expected): fresh-copy guarantees are not implemented.
- T-LIB-14 FAIL (expected): entry-point loading and validation are not implemented.

## `test/atlas-frontmatter.test.js` (7 cases)

- T-FM-01 FAIL (expected): the validator rejects the new `controls.atlas` key instead of applying the ATLAS rules.
- T-FM-02 FAIL (expected): the 15 universal areas do not yet declare `controls.atlas`.
- T-FM-03 FAIL (expected): approved `area-mitigations.json` is missing.
- T-FM-04 FAIL (expected): old framework arrays match the baseline, then the catalog readiness assertion fails.
- T-FM-05 FAIL (expected): bodies and non-ATLAS frontmatter match the baseline, then the catalog readiness assertion fails.
- T-FM-06 FAIL (expected): approved `entry-points.json` is missing.
- T-FM-07 FAIL (expected): approved area gold is missing before schema/docs/baseline reconciliation can pass.

## `test/atlas-surfaces.test.js` (11 cases)

- T-SUR-01 FAIL (expected): approved area gold and classify ATLAS fields are missing.
- T-SUR-02 FAIL (expected): the empty-area classify result lacks `controls.atlas` and `atlas`.
- T-SUR-03 FAIL (expected): approved area gold and verify JSON ATLAS fields are missing.
- T-SUR-04 FAIL (expected): verify text lacks the MITRE ATLAS block.
- T-SUR-05 FAIL (expected): approved area gold and the empty-mapping verify rendering are missing.
- T-SUR-06 FAIL (expected): the catalog needed for jurisdiction-invariance checks is missing.
- T-SUR-07 FAIL (expected): report JSON lacks its top-level ATLAS object and summary additions.
- T-SUR-08 FAIL (expected): approved area gold and report markdown additions are missing.
- T-SUR-09 FAIL (expected): build output lacks the Threat model section and `meta.atlas`.
- T-SUR-10 FAIL (expected): build list output lacks the Threat model pointer.
- T-SUR-11 FAIL (expected): the catalog needed for ATLAS-surface determinism runs is missing.

## `test/atlas-failsoft.test.js` (5 cases)

- T-FS-01 FAIL (expected): the healthy catalog prerequisite for catalog-missing scratch tests is missing.
- T-FS-02 FAIL (expected): the healthy catalog prerequisite for corrupt-catalog scratch tests is missing.
- T-FS-03 FAIL (expected): the healthy catalog prerequisite for pin-mismatch scratch tests is missing.
- T-FS-04 FAIL (expected): the healthy catalog and entry-point prerequisites are missing.
- T-FS-05 FAIL (expected): the healthy scratch-package control prerequisites are missing.

## `test/atlas-regression.test.js` (5 cases)

- T-REG-01 FAIL (expected): every pre-feature matrix output matches after allowed additive removal, then catalog readiness fails.
- T-REG-02 FAIL (expected): universal `aigis get` outputs do not yet add exactly one `atlas:` line.
- T-REG-03 PROBLEM: trigger bytes and the captured ten-description detections match, but the exact external v2-final description file named by EVALS was unavailable; catalog readiness then fails.
- T-REG-04 PROBLEM: classify/build outputs match the substitute captured dev fixture, but the exact external v2-final description file named by EVALS was unavailable; catalog readiness then fails.
- T-REG-05 FAIL (expected): init output preserves the resolver block and size relationship, then catalog readiness fails.

## `test/atlas-threats.test.js` (20 cases)

- T-THR-01 FAIL (expected): catalog, entry points, and `lib/threats.js` are missing.
- T-THR-02 FAIL (expected): the direct-link/gap oracle inputs and threats command are missing.
- T-THR-03 FAIL (expected): ordered threats output is missing.
- T-THR-04 FAIL (expected): `--top` truncation behavior is missing.
- T-THR-05 FAIL (expected): `--top` validation is missing.
- T-THR-06 FAIL (expected): no-input error behavior is missing.
- T-THR-07 FAIL (expected): unknown-trait error behavior is missing.
- T-THR-08 FAIL (expected): description-path threat resolution is missing.
- T-THR-09 FAIL (expected): no-resolved-traits error behavior is missing.
- T-THR-10 FAIL (expected): valid traits with no entry points are not supported.
- T-THR-11 FAIL (expected): capped text and JSON threats output is missing.
- T-THR-12 FAIL (expected): deterministic timestamp-free threats output is missing.
- T-THR-13 FAIL (expected): red-team stubs are missing.
- T-THR-14 FAIL (expected): jurisdiction-neutral technique scope is missing.
- T-THR-15 FAIL (expected): honest threats text/JSON rendering is missing.
- T-THR-16 FAIL (expected): the reserved id is represented by a delegation check to E2E-08, then catalog readiness fails.
- T-THR-17 FAIL (expected): root and command help for `threats` are missing.
- T-THR-18 FAIL (expected): plain piped threats output and `lib/threats.js` are missing.
- T-THR-19 FAIL (expected): healthy files needed to construct catalog-failure scratch packages are missing.
- T-THR-20 FAIL (expected): healthy files needed to construct entry-point-failure scratch packages are missing.

## `test/atlas-version.test.js` (1 case)

- T-REL-01 FAIL (expected): package versions are still `2.1.1`, not `2.2.0`.

## `test/atlas-docs.test.js` (8 cases)

- T-DOC-01 FAIL (expected): the core skill does not mention `aigis threats` or the disclaimer.
- T-DOC-02 FAIL (expected): approved area gold and the README ATLAS sections are missing.
- T-DOC-03 FAIL (expected): both READMEs lack the v2.2 and threat-modeling sections.
- T-DOC-04 FAIL (expected): `content/templates/threat-model.md` is missing.
- T-DOC-05 FAIL (expected): `CHANGELOG.md` is missing.
- T-DOC-06 FAIL (expected): the new threat-model template is missing before the docs honesty scan.
- T-DOC-07 FAIL (expected): the Python cut/shipped note state has not been reconciled.
- T-DOC-08 FAIL (expected): `CHANGELOG.md` and red-team documentation reconciliation are missing.

## `test/atlas-honesty.test.js` (1 case)

- T-HON-01 FAIL (expected): the catalog and ATLAS-bearing surfaces do not exist yet.

## `test/atlas-python-parity.test.js` (2 cases)

- T-PY-01 FAIL (expected): existing Python journeys pass their pre-feature checks, then catalog readiness fails.
- T-PY-02 FAIL (expected): the current cut-complete tree lacks the required README cut note.

## `test/atlas-release.test.js` (1 case)

- T-REL-02 FAIL (expected): required ATLAS package files do not exist in the source tree or npm pack.

## `build/atlas/evals/e2e.sh` (8 cases)

- E2E-01 FAIL (expected): the catalog prerequisite for the packed npm install journey is missing.
- E2E-02 FAIL (expected): the catalog prerequisite for classify/threats/build/template is missing.
- E2E-03 FAIL (expected): the catalog prerequisite for verify/report is missing.
- E2E-04 FAIL (expected): the catalog prerequisite for init integration is missing.
- E2E-05 FAIL (expected): the catalog prerequisite for the wheel journey is missing.
- E2E-06 FAIL (expected): ATLAS package content is missing.
- E2E-07 FAIL (expected): the catalog and generator are missing.
- E2E-08 FAIL (expected): terminal classify ATLAS output is missing.

## Coverage, omissions, and ambiguities

- All 86 `T-*` ids and all 8 `E2E-*` ids in TESTPLAN appear exactly once. No TESTPLAN id was omitted.
- PROBLEM: `build/atlas/evals/dev.json` does not exist, and the documented external `aigis-benchmarks/v2-final/descriptions.json` path is unavailable. T-REG-03 and T-REG-04 therefore use `test/fixtures/atlas/dev.json`, a labeled ten-description regression set captured now. The integration eval owner should replace it with the locked v2-final descriptions if those exact prompts are required.
- Ambiguity: T-THR-16 is explicitly marked “reserved” with no expected behavior, while the request requires every case id to appear. It is implemented as a single delegation assertion that E2E-08 remains present; it does not duplicate the classify-terminal behavior.
- The approved gold filenames intentionally do not exist yet. Tests use only `area-mitigations.json` and `entry-points.json` and report `gold file missing` rather than reading candidate files.

## Round 2 (finished by Sonnet 5.5)

Started from GPT-5.6 Sol's unverified WIP (`be9afad`) after merging `atlas` (HEAD of the merge: NA1, NA2, N3 to N6, E0 in). All 16 `test/atlas-*.test.js` files were run against the merged tree. 118 ids run (every TESTPLAN `T-*` id exactly once, each printed as `PASS|FAIL <id>`, including T-NA-*, T-NB-*, T-NV-*, T-RT-*); E2E-01..09 live in `build/atlas/evals/e2e.sh`, one case each. Result: **101 PASS, 17 FAIL**. No FAIL is a syntax error, import crash or fixture bug. Pre-existing non-atlas tests and `scripts/test-all.js` are untouched and pass (`scripts/test-all.js`: all non-atlas checks PASS; the only red checks are the 7 atlas files below).

### Per-file result

| File | PASS | FAIL | FAIL classification |
|---|---|---|---|
| atlas-catalog | 11 | 0 | |
| atlas-lib | 14 | 0 | |
| atlas-frontmatter | 7 | 0 | |
| atlas-routing | 3 | 0 | |
| atlas-surfaces | 12 | 0 | |
| atlas-failsoft | 5 | 0 | |
| atlas-regression | 5 | 0 | |
| atlas-threats | 20 | 0 | |
| atlas-version | 1 | 0 | |
| atlas-area-permissions | 6 | 1 | (a) T-NA-06: `gold/new-areas.json` not approved yet (G1) |
| atlas-area-tool-safety | 6 | 1 | (a) T-NB-06: same (G1) |
| atlas-docs | 8 | 3 | (a) T-DOC-02 G1 (`new-areas.json` missing); (a) T-DOC-07 PY (neither `cli-python/aigis_cli/threats.py` nor the README cut note exists yet; one of the two must land); (a) T-DOC-09 NV (README says 17 verify checklists, `content/verify` has 15 until NV adds two) |
| atlas-honesty | 0 | 1 | (a) T-HON-01 NV (`verify agent-permissions`, `audit --traits is-agentic` need the new checklists). Everything else in the test was run by hand with those commands removed: PASS |
| atlas-python-parity | 1 | 2 | (a) T-PY-02 PY (README cut note absent, port absent); (a) T-PY-03 PY (Python `classify` does not route `is-agentic` yet, S7.6) |
| atlas-release | 2 | 1 | (a) T-RT-05 NV (`aigis verify agent-permissions` crashes: checklist missing) |
| atlas-verify-new | 0 | 8 | (a) T-NV-01..08, all NV (checklists, rules, `wildcard_tool_scope`, taxonomy rows not built). The assertions cannot be proven right until NV lands; fixtures read and checked by hand against SPEC S7.3 |

(b) test bugs left: 0. (c) real ATLAS product bugs: 0. `build/atlas/evals/e2e.sh` was started but did not finish within 400 s (the proxy is pointed at a dead port, so `npm install` of the tarball stalls offline); E2E ids are therefore unverified here and belong to INT.

### Pre-existing product bugs found (not caused by ATLAS; reported, not fixed)

1. `aigis search --list` prints an empty "Implement files" list, and `aigis search <area-id>` finds nothing. `lib/search.js` reads `content/implement`, which no longer exists. Command: `node bin/aigis.js search --list`. Output: the heading `Implement files (governance patterns):` followed directly by the Templates heading. Baseline fixture `reg-search-list.json` records the same. TESTPLAN T-NA-07 / T-NB-07 ("`search --list` lists the area") and T-REG-01 ("gains the two areas") cannot hold until this is fixed. The two tests now assert exit 0 only (comment in the test names the bug).
2. `aigis audit --traits uses-llm,accepts-user-input,uses-rag --json` crashes with `Error: File not found: verify/checklist-eu-ai-act-art-50-transparency-disclosure.md` (stack trace, exit 1). Baseline fixture `reg-audit-ts1.json` records the crash on 2.1.1.

### TEST-WRONG items

1. T-SUR-04 path baked in baseline: **accepted.** Verify text is now compared after `maskVolatile` on both sides (worktree and baseline root both become `<ROOT>`).
2. T-SUR-10 / T-REG-01 `--list` strip: **accepted.** Strip now replaces the block with `""`; T-SUR-10 additionally asserts the blank line before `Threat model:` (SPEC S4.4: empty line plus two lines).
3. Unmasked build timestamp (T-SUR-11, T-FS-01/02/03/05): **accepted.** The timestamp lives in the brief header (`> aigis <v> — generated <ISO>`, which JSON escapes inside `brief`) and in `meta.generated_at`. `maskVolatile` now masks both forms; T-SUR-09 compares `meta` through the same mask. A second masking bug found on the way: the version mask used `\b`, which does not match `(v2.1.1)`; it now uses digit/dot lookarounds.
4. T-FS-04 / T-HON-01 / T-THR-15 JSON escaping: **accepted.** New helpers `outputHasDisclaimer` and `assertNoForbidden` parse JSON first, check the disclaimer in parsed string values, remove the exact sentence from each parsed string, then scan. T-HON-01 static `.json` files go through the same path. T-FS-04 also compared raw build stdout to the healthy run, which carries a timestamp, so it now masks; and `--format json` commands (C4) are now treated as JSON in T-FS-01..05 (stronger: no ATLAS keys is now also checked on report JSON).
5. T-REG-04 additive ATLAS fields: **accepted, already fixed in `be9afad`** (`normalizeClassify` strips them). Verified passing. The real remaining T-REG-04 failure was a different test bug, see 6.
6. T-RT-04 DS3: **accepted, and extended.** DS3 resolves `accepts-user-input, is-multimodal, uses-llm` in the 2.1.1 baseline too, so it must gain no new area; T-RT-04 now asserts exactly that (areas, traits equal baseline, growth at most 1,500). The agentic case now uses a description that the unchanged baseline triggers resolve as `is-agentic` (high confidence "coding agent"), with a new fixture `baseline/rt04-agentic-build.json` captured from the pre-feature commit `07ef537`. Finding: that build exceeds 120,000 characters once both new areas are inlined (95,761 + about 23.8k), so the default run correctly auto-falls back to compact; the test checks the growth cap on `--full` and checks the mode rule (full if total at most 120,000, else compact with `auto_fallback: true`). T-REG-04's D9 expectation had the same wrong assumption (D9 is DS3) and now adds the new areas only when the built traits include `is-agentic`, and asserts `is-agentic` is never resolved unless baseline detection offered it.
7. T-SUR-09 growth cap: **accepted, already 1,500 in `be9afad`** (also T-SUR-12). Verified.
8. T-REG-01 root `--help` wrap: **accepted.** The strip now removes the `threats` row plus its indented continuation lines.
9. 2.2.0 versus 3.0.0: **accepted, already fixed in `be9afad`** (T-REL-01, `e2e.sh` E2E-01 and E2E-05 expect 3.0.0). Verified: all five version sources read 3.0.0.
10. `audit --traits TS1` crash: **rejected as a test bug.** It is a pre-existing product bug (see above). The claim that it affects T-NV-06 is wrong: T-NV-06 runs `audit --traits is-agentic`, which routes no EU area, and today fails only because the two new checklists are missing (NV). No test change; T-REG-01 keeps asserting the baseline crash exit code.

### Other test changes (not from TEST-WRONG)

- T-NA-04 / T-NB-04 required every spelling of every contract identifier (snake, camel, UPPER). SPEC S7.3 lists alternates ("matched in snake_case and camelCase"). Now: each identifier group must have at least one spelling in the Python module and in the JavaScript module of the complete example. Not weaker for the contract: a missing identifier still fails.
- T-DOC-04: `aigis template threat-model` prints the file plus one newline, exactly like every existing template. The test now derives the expected trailing newline from `ai-impact-assessment` instead of demanding byte equality.
- `build/atlas/TESTLOCK` written: sha256 of every `test/atlas-*.js`, every file under `test/fixtures/atlas/`, and `build/atlas/evals/e2e.sh` (92 files, `shasum -a 256` format).

### Round 2 addendum: rerun against `atlas` at 5d53483 and later (merged again before locking)

Result: **115 PASS, 3 FAIL** of 118 ids (`scripts/test-all.js`: 24/27 checks pass; non-atlas checks all pass). Per file: area-permissions 6/1, area-tool-safety 6/1, docs 10/1, every other atlas file all PASS (catalog 11, lib 14, frontmatter 7, routing 3, surfaces 12, failsoft 5, regression 5, threats 20, version 1, honesty 1, python-parity 3, release 3, verify-new 8).

The 3 FAILs are all (a) expected, G1 (`build/atlas/gold/new-areas.json` not approved yet): T-NA-06, T-NB-06, T-DOC-02. No (b), no (c) ATLAS bugs. T-NV-01..08 and T-PY-01..03 now pass (T-PY-03 prints `RAN`). The two pre-existing bugs above (`search --list`, `audit` EU checklist crash) are still present.

- TEST-WRONG 11 (T-PY-02 timestamps): **accepted.** The test compared whole report and build JSON across Node and Python runs, so `generated_at`, `meta.generated_at` and the brief "generated" line could never match. It now compares only what TESTPLAN says: classify `controls.atlas` and `atlas`; verify `cited_controls.atlas` and `atlas`; report top-level `atlas`, both summary keys and per-area `cited_controls.atlas`; build `meta.atlas` and the Threat model section text; the whole `threats` document (TS1, TS2, seeded TS4); plus `atlas.disclaimer` in every Python document. The `threats` text bytes and the error cases are unchanged.
- New test bug found: T-RT-05 ran `report --from-classify <DS3>`, the same DS3 assumption as TEST-WRONG 6 (DS3 resolves no confirmed trait, so the command exits with "No traits resolved"; `bin/aigis.js` is unchanged from 2.1.1 there). It now uses the agentic description from `baseline/rt04-agentic-build.json`.
- TESTLOCK regenerated after these edits (92 files).

## Round 3 (stricter new-area verify tests, search/audit regressions)

Merged `atlas` first (already up to date). Result on the current product: 113 PASS, 11 FAIL of 124 ids (118 plus six new ids: T-NV-09 to T-NV-12, T-REG-06, T-REG-07). All 11 FAILs are expected, none is a test bug. `scripts/test-all.js`: 22/27 (the 5 red files are the atlas files below).

### New and changed cases (test/atlas-verify-new.test.js and fixtures)

| Id | What it checks | Result now | Reason |
|---|---|---|---|
| T-NV-02 (changed) | Item 6: no bare-identifier pattern is forced. Every rule's patterns must compile and name each snake_case and camelCase identifier of the S7.3 contract (UPPER and Pascal spellings are alternates) | PASS | |
| T-NV-04 (changed) | Item 5: for both areas, `empty-agent` and a new keyword-only fixture per area (`keyword-only-agent-permissions`, `keyword-only-agent-tool-safety`: comments plus unused constants carrying every identifier, in `.py` and `.js`) must FAIL every AUTO check | PASS | |
| T-NV-05 (changed) | Item 3: `scoped` must PASS V4 and read the caller; `wildcard-scope` still passes V4 with the overclaim raised on line 2, and also reads the caller. Both fixtures rewritten (per-caller map lookup instead of truthiness of `caller`) | PASS | |
| T-NV-09 (new) | Item 1: for both areas, the own JavaScript example alone passes every AUTO check (sanity), and each of these FAIL every AUTO check: Python example in a triple-quoted string, JavaScript example in `/* */` (an inner `*/` is neutralised), Python example in `/* */`, JavaScript example in a triple-quoted string, and both wrapped together | FAIL (a: NV scanner) | every AUTO check currently passes on all wrapped variants: the scanner does not skip comments or string literals |
| T-NV-10 (new) | Item 2: tool-safety V2 FAILS on `noop-gate` (`def gate_tool_call(ctx, name): untrusted = False; return True`, never called) and its JavaScript twin | FAIL (a: NV) | V2 passes on the no-op gate |
| T-NV-11 (new) | Item 3: permissions V4 FAILS on `static-allowlist` (unused `caller`, `return tool_name in ALLOWED`) and its JavaScript twin | FAIL (a: NV) | V4 passes on the static allowlist |
| T-NV-12 (new) | Item 4: the own Python example passes every AUTO check for both areas when six other files (three `.py`, three `.js`) that only import the identifiers sort before it (`a1`..`a6` versus `z_example.py`) and after it (`z1`..`z6` versus `0_example.py`) | FAIL (a: NV) | the rules only look at the last occurrence of an identifier, so importer files that sort earlier or later break the example (permissions: V1, V2, V3, V5, V6 fail) |

### Pre-existing bug regressions (node NV is fixing them tonight)

| Id | Where | What it checks | Result now |
|---|---|---|---|
| T-NA-07, T-NB-07 (restored) | area test files | `aigis search --list` has a row `  <area-id>  <title>` for the area (the round 1 deviation is removed) | FAIL (a: NV) |
| T-REG-06 (new) | atlas-regression | `search --list` exits 0 and lists a row with the frontmatter title for all 21 area files | FAIL (a: NV): `search --list does not list agent-permissions` |
| T-REG-07 (new) | atlas-regression | `audit --traits uses-llm,accepts-user-input,uses-rag --json` exits 0; areas without a checklist show "no checklist yet" in `checklists` and are absent from `per_area_check_count`; `total_checks` equals the sum of the V rows of areas that have a checklist; the score line uses the same denominator; the text mode also exits 0, says "no checklist yet" and prints the same denominator | FAIL (a: NV): the command still crashes with `File not found: verify/checklist-eu-ai-act-art-50-transparency-disclosure.md` |

T-REG-01 no longer compares the `audit --traits TS1` baseline (it recorded the crash; T-REG-07 replaces it) and now strips the whole "Implement files" section from `search --list` before comparing, so it keeps passing before and after the fix.

### Per-file result

area-permissions 5/2 (T-NA-06 G1, T-NA-07 NV), area-tool-safety 5/2 (T-NB-06 G1, T-NB-07 NV), docs 10/1 (T-DOC-02 G1), verify-new 8/4 (T-NV-09 to T-NV-12, all NV), regression 5/2 (T-REG-06, T-REG-07, both NV). Every other atlas file is all PASS (catalog 11, lib 14, frontmatter 7, routing 3, surfaces 12, failsoft 5, threats 20, version 1, honesty 1, python-parity 3, release 3). TESTLOCK regenerated.
