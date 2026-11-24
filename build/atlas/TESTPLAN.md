# TESTPLAN: MITRE ATLAS in Aigis

Written by GPT-5.6 Sol (fresh session) from this file and SPEC.md, before any feature code. Locked in `build/atlas/TESTLOCK` after the test-acceptance gate.

## Conventions

- Plain Node, `assert`, no framework, one process per file, exit non-zero on failure. Files in `test/` named `atlas-*.test.js` are picked up by `npm test` automatically (the harness itself is frozen and not edited).
- Each file runs in under 5 seconds; the whole fast suite stays under 60 seconds.
- CLI tests spawn `process.execPath bin/aigis.js ...` with piped stdout (so `classify` is in JSON mode).
- **Red for the expected reason.** Before code exists every new test must fail on an assertion about missing behavior. Guard missing files with `assert.ok(fs.existsSync(p), '<path> missing')` and wrap `require('../lib/atlas')` / `require('../lib/threats')` in try/catch that calls `assert.fail('lib/atlas.js not implemented')`. A crash, syntax error or missing fixture does not count.
- **Independent expectations.** Outside `atlas-lib.test.js`, tests compute expected values with their own helper code from `content/index/atlas.json`, `content/index/atlas-entry-points.json` and `build/atlas/gold/*.json`. They do not call `lib/atlas.js` or `lib/threats.js` to produce expectations.
- **Baseline fixtures.** The test writer captures outputs from untouched `07ef537` into `test/fixtures/atlas/baseline/` (one file per command in the matrix below) and records the baseline version string. Comparisons mask: the brief header line `> aigis <version> — generated <ts>`, report `generated_at` and `> Generated:`, and every occurrence of the package version.
- **Scratch package (failure tests).** A helper copies `bin/`, `lib/`, `content/` and `package.json` into a fresh temp directory, symlinks the repo's `node_modules` into it, applies one mutation, and spawns `node <scratch>/bin/aigis.js ...`. The repo's own files are never mutated. Mutations: `catalog-missing` (delete `content/index/atlas.json`), `catalog-corrupt` (write `{ not json`), `catalog-nokey` (valid JSON without `techniques`), `catalog-sha` (change one hex digit of `source.sha256`), `catalog-version` (set `source.version` to `2026.09`), `entry-missing`, `entry-corrupt` (invalid JSON), `entry-version` (`atlas_version` `2026.09`), `entry-badtech` (one technique id replaced by `AML.T9999`), `entry-badtrait` (one trait renamed `not-a-trait`). The scratch copy is deleted afterwards.
- **Disclaimer check.** `hasDisclaimer(text)` is true when the text contains the DISCLAIMER of SPEC S0 byte for byte. For JSON the check is `obj.atlas.disclaimer === DISCLAIMER`. The test files hold their own copy of the sentence (they do not import it from `lib/atlas.js`).
- **Fixtures.** `test/fixtures/atlas/areas/` (three fake areas: one with `atlas: [AML.M0030, AML.M0004]`, one with `atlas: []`, one without the key); `test/fixtures/atlas/project/` (a small source tree that makes at least one `input-validation` and one `rate-limiting` auto check pass); `test/fixtures/atlas/bad-catalogs/` (missing key, invalid JSON, wrong sha256).
- **Fixed inputs.**
  - TS1 `uses-llm,accepts-user-input,uses-rag`
  - TS2 `uses-llm,is-agentic,accepts-user-input,is-external,uses-thirdparty-api`
  - TS3 `is-internal` (no areas, no entry points). The test first asserts that this trait has no entry in the entry-point file and no area; if approval ever changes that, it fails with `fixture precondition changed`, not with a misleading assertion
  - TS4 every trait that has an entry in `content/index/atlas-entry-points.json`, built by the test at run time, never typed in (the candidate gold has 9 such traits and 29 in-scope techniques; see EVALS §5.1)
  - TS5 TS1 plus `jurisdiction-eu`
  - DS1 "Build me a customer support chatbot that uses Claude to answer questions about our product. It should remember conversation history." (resolves 4 traits, 1 uncertain on the build path)
  - DS2 "Add a search feature that lets users ask natural-language questions and get answers from our 10,000-page documentation." (resolves no traits today)
  - DS3 "Build a voice assistant for our smart home product that uses an LLM to interpret natural-language commands and decide which IoT devices to control (lights, thermostat, locks)." (3 traits, all uncertain)
- **Nothing from the gold files is hard-coded.** Every count or membership that depends on the two Aigis mappings is computed at run time from the approved `build/atlas/gold/area-mitigations.json` and `build/atlas/gold/entry-points.json` (`include` rows) together with the catalog: links per area, labeled and empty areas, seeded traits, techniques per trait, distinct in-scope techniques, maturity split, mitigations reached, gaps, unmitigated techniques, and the README's "N of the 44". Where a test needs a labeled area, an empty area, a seeded trait or an unseeded trait, the names in this plan (for example `rate-limiting` labeled, `bias-monitoring` empty) are the candidate-gold examples: the test asserts that precondition against the approved gold first, or selects a suitable one at run time. Only three kinds of literal are allowed: pinned MITRE facts (SPEC S0, T-CAT-*, T-LIB-05), design caps (sizes, `--top` 1 to 25, at most 6 techniques per trait), and the fixed inputs TS1, TS2, TS5, DS1 to DS3, whose expected outputs are still computed from the gold.

## L0 `test/atlas-catalog.test.js` (node N1; AC1, AC2, AC3)

| Id | Input | Expected | AC |
|---|---|---|---|
| T-CAT-01 | `content/index/atlas.json` | exists, valid JSON, at most 64,000 bytes, ends with a newline | AC1 |
| T-CAT-02 | `source` block | `version` "2026.10", `format_version` "6.1.0", `release_tag` "v2026.10", `sha256` equals ATLAS_SHA256, `license` "Apache-2.0", `modified_date` "2026-10-28" | AC1 |
| T-CAT-03 | counts, recomputed by the test from the arrays and compared with `counts` | 16 tactics; 221 techniques; 92 with `parent`; 44 mitigations; 494 links; maturity 117/78/26; `case_studies` 77; 53 techniques appear in no mitigation list | AC1 |
| T-CAT-04 | spot facts | AML.TA0001 name "AI Attack Adaptation"; AML.T0051.001 name "Indirect", Realized, parent AML.T0051, tactics [AML.TA0005], case_studies 19; AML.T0053 Demonstrated, three tactics (TA0005, TA0012, TA0015), case_studies 18; AML.M0024 "AI Telemetry Logging and Monitoring"; AML.T0010 "Supply Chain Compromise"; AML.M0030 techniques exactly [AML.T0053, AML.T0086, AML.T0101, AML.T0143]; AML.T0110 is in no mitigation list | AC1 |
| T-CAT-05 | `tactics` order | TA0002, TA0003, TA0001, TA0004, TA0000, TA0005, TA0006, TA0012, TA0007, TA0013, TA0008, TA0015, TA0009, TA0014, TA0010, TA0011 with the names in SPEC S0 | AC1 |
| T-CAT-06 | referential integrity | every tactic id, parent id and mitigation technique id resolves; every technique has at least one tactic; every mitigation has at least one technique; ids match `^AML\.(TA\d{4}|T\d{4}(\.\d{3})?|M\d{4})$` | AC1 |
| T-CAT-07 | no prose | no key named `description` or `references` anywhere; no string longer than 120 characters outside `source` | AC1 |
| T-CAT-08 | ordering | `techniques` and `mitigations` keys ascending; `tactics` arrays and `techniques` arrays ascending; file equals `JSON.stringify(parsed, null, 1) + "\n"` or its minified form | AC1 |
| T-CAT-09 | `content/index/atlas-NOTICE.md` | exists; (a) the bytes between the line `<!-- BEGIN UPSTREAM NOTICE -->` and the line `<!-- END UPSTREAM NOTICE -->` (span defined in SPEC S1.3) are 551 bytes with sha256 `fa6c92ab3dc75d41413884e8b38cc54cd4e72f4c8f68fc7e77824e48e3047d40`; (b) the bytes between `<!-- BEGIN APACHE-2.0 LICENSE TEXT -->` and `<!-- END APACHE-2.0 LICENSE TEXT -->` are 11,358 bytes with sha256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`; (c) each marker appears exactly once and in that order; (d) the header before the first marker contains "v2026.10", ATLAS_SHA256, the words "no descriptions", and a sentence that the Aigis mappings are not MITRE's; (e) the mirror copy under `cli-python/aigis_cli/content/index/` is byte-identical | AC3 |
| T-CAT-10 | generator | (a) `--source /nonexistent` exits 1; (b) `--source <temp file with other bytes>` exits 1, stderr contains "sha256 mismatch", and the sha256 of `atlas.json` is unchanged; (c) no arguments exits 1 with usage; (d) when env `ATLAS_SRC` points to an existing file, `--source $ATLAS_SRC --check` exits 0 and prints `OK`, otherwise print `SKIP check (ATLAS_SRC not set)` | AC2 |
| T-CAT-11 | static scan of `lib/atlas.js`, `lib/threats.js`, `scripts/build-atlas-index.js` | none contains `require('http')`, `require('https')`, `require('net')`, `fetch(`, `XMLHttpRequest`; the two lib files also contain no `child_process`, `Math.random`, `Date.now`, `new Date` | AC2 |

## L1 `test/atlas-lib.test.js` (node N2)

| Id | Input | Expected |
|---|---|---|
| T-LIB-01 | `loadCatalog()` twice | pinned version and sha256; the same cached object |
| T-LIB-02 | `loadCatalog({ path })` on a missing path, invalid JSON, a file without `techniques`, a file with a different `source.sha256` | throws `AtlasCatalogError` with code `missing`, `corrupt`, `corrupt`, `pin-mismatch` |
| T-LIB-03 | `technique('AML.T0051.001')`, `technique('AML.T0051')`, `technique('AML.T9999')`, `technique('')` | display_name "LLM Prompt Injection: Indirect", maturity Realized, tactics `[{id:'AML.TA0005',name:'Execution'}]`, parent "AML.T0051", case_studies 19; parent null and display_name "LLM Prompt Injection" for the parent; null; null |
| T-LIB-04 | `mitigation('AML.M0030')`, `mitigation('AML.M9999')` | name and the four technique ids; null |
| T-LIB-05 | `mitigationsForTechnique('AML.T0051.001')`; `('AML.T0051')`; `('AML.T0053')`; and the sum of result lengths over all 221 techniques | exactly AML.M0024, M0033, M0035 (direct links only: AML.M0020 is linked to the parent and must NOT appear); exactly M0008, M0019, M0020, M0021, M0022, M0024, M0033, M0035; 13 ids; the sum is 494. No element has a `via` key |
| T-LIB-06 | `mitigationsForTechnique('AML.T0110')`, unknown id | `[]`, `[]` |
| T-LIB-07 | `techniquesForMitigations(['AML.M0030'])`; `(['AML.M0030','AML.M0029','AML.M9999'])`; `([])` | the four ids ordered by the comparison rule; union without duplicates (AML.T0124 added); `[]` |
| T-LIB-08 | `compareTechniques` on synthetic objects (table of 8 pairs) | Realized before Demonstrated before Feasible; then higher `case_studies` first; then lower id first; equal objects give 0 |
| T-LIB-09 | `areaMitigations` with the fixture `areasDir`: area with a list, area with `[]`, area without the key, unknown area | sorted list `['AML.M0004','AML.M0030']`; `[]`; `[]`; `[]` |
| T-LIB-10 | `mitigationAreas({ areasDir: fixture })` | exactly `{ 'AML.M0004': [a], 'AML.M0030': [a] }`; consistent with T-LIB-09 |
| T-LIB-11 | `summarizeAreas([], opts)`; `summarizeAreas([fixtureArea], opts)` | both have `version` "2026.10" and `disclaimer` equal to the DISCLAIMER; zeros and empty arrays; mitigations with names, `techniques_addressed` equal to the test's own recount from the catalog (direct links only), `top_techniques` length at most 2 and ordered |
| T-LIB-12 | `withAtlas(() => { throw new AtlasCatalogError(...) }, 'fb', warnSpy)`; `withAtlas(() => 42, 'fb', warnSpy)`; a non-catalog error | returns 'fb' and calls warn once with `aigis: ATLAS catalog unavailable (catalog missing); ATLAS output omitted` (file and code taken from the error); returns 42 with no warn; rethrows. With the default warn, two failing calls in one process write one stderr line in total |
| T-LIB-13 | call each read function twice, mutate the first result | second result is unaffected and deep-equal to a third call |
| T-LIB-14 | `loadEntryPoints()`; `loadEntryPoints({ path })` on: a missing path; invalid JSON; JSON without `entry_points`; a trait not in `ALL_TRAITS`; a technique id not in the catalog; `atlas_version` "2026.09" | the pinned-version object; then `AtlasCatalogError` with `file` "entry-points" and code `missing`, `corrupt`, `corrupt`, `corrupt`, `corrupt`, `pin-mismatch`. `loadCatalog` errors carry `file` "catalog" |

## L0 `test/atlas-frontmatter.test.js` (node N3; AC4)

| Id | Input | Expected |
|---|---|---|
| T-FM-01 | `validateOne` on temp copies of an area with `atlas` set to `[AML.M0020]`, `[AML.T0051]`, `[M0020]`, `"AML.M0020"`, `[AML.M9999]`, `[AML.M0020, AML.M0020]`, and on an EU-gated area with `atlas: [AML.M0020]` | no error; pattern error; pattern error; "must be an array"; "is not a mitigation in ATLAS 2026.10"; duplicate error; jurisdiction rule error |
| T-FM-02 | the 19 area files | the 15 listed in SPEC S3.1 have `controls.atlas` as an array; the 4 `eu-ai-act-*` files have no `atlas` key |
| T-FM-03 | frontmatter against `build/atlas/gold/area-mitigations.json` | for each of the 15 areas the set equals the rows with `decision: "include"` in the approved file `build/atlas/gold/area-mitigations.json` (not the `.candidate.json`); that file has `approved_by` and `approved_at` set; no `exclude` row appears in any frontmatter |
| T-FM-04 | `owasp`, `nist`, `iso42001`, `eu_ai_act` of all 19 areas against the baseline fixture | identical arrays (order included) |
| T-FM-05 | area bodies (text after the closing `---`) and every non-`atlas` frontmatter line against baseline | sha256 equal for all 19; `git`-free check via fixtures |
| T-FM-06 | `content/index/atlas-entry-points.json` | at most 3,000 bytes; `atlas_version` "2026.10"; each trait in `ALL_TRAITS`; at most 6 techniques per trait, all in the catalog; traits and technique lists equal the `include` rows of the approved `build/atlas/gold/entry-points.json` (which has `approved_by` and `approved_at`), and no `exclude` row appears; `surface` equals the SPEC S3.3 table for each trait and is at most 70 characters |
| T-FM-07 | `scripts/area-frontmatter.schema.json`, `docs/frontmatter-schema.md`, `scripts/area-controls-baseline.json` | schema has `controls.properties.atlas` with the pattern; doc mentions `atlas`, "in part" and "AML.M"; baseline has an `atlas` array for each of the 15 areas equal to gold, and its old arrays equal the baseline fixture |

## L2 `test/atlas-surfaces.test.js` (node N4; AC5 to AC8, AC22)

| Id | Command | Expected |
|---|---|---|
| T-SUR-01 | `classify --traits TS1 --json` | `controls.atlas` equals the sorted union of gold lists for `implement_files`; `atlas.version` "2026.10"; `atlas.disclaimer` equals the DISCLAIMER; `atlas.techniques_addressed` equals the test's recount; `atlas.threats_command` is `aigis threats --traits accepts-user-input,uses-llm,uses-rag`; after deleting `controls.atlas` and `atlas` the object deep-equals the baseline fixture |
| T-SUR-02 | `classify --traits TS3 --json` | `implement_files` empty; `controls.atlas` `[]`; totals 0; `atlas.disclaimer` equals the DISCLAIMER; exit 0 |
| T-SUR-03 | `verify rate-limiting --auto <fixture project> --json` | `cited_controls.atlas` equals gold; `atlas.mitigations` ids equal it with catalog names; counts equal recount; `atlas.disclaimer` equals the DISCLAIMER; deleting the two new keys gives the baseline fixture |
| T-SUR-04 | same without `--json` | contains the exact header line `── MITRE ATLAS v2026.10 (threat catalog, not a compliance standard) ──` once; the block sits after any "Controls" block and before `── AUTO CHECKS ──`; the block's last non-empty line is two spaces plus the DISCLAIMER; block at most 1,000 characters; block does not contain "satisfied"; removing the block gives the baseline text exactly |
| T-SUR-05 | `verify bias-monitoring --auto <fixture> ` text and JSON (or the first area whose gold list is empty) | block is the header, `  No ATLAS mitigation is mapped to this area.` and the DISCLAIMER line; JSON arrays empty, totals 0, `atlas.disclaimer` present |
| T-SUR-06 | `verify input-validation --auto <fixture> --json` with and without `--jurisdiction eu` | `cited_controls.atlas` and `atlas` (including `disclaimer`) identical in both; `eu_ai_act` behaves as in baseline |
| T-SUR-07 | `report --areas input-validation,rate-limiting,bias-monitoring --project <fixture> --format json` | top-level `atlas` equals `{ version: "2026.10", disclaimer: DISCLAIMER }`; `summary.cross_framework_coverage.atlas_count` equals the size of the union; `summary.cross_framework_citations.atlas` sorted union; `per_area[i].cited_controls.atlas`; deleting the new keys gives the baseline (masked) |
| T-SUR-08 | same with markdown | table row `| MITRE ATLAS mitigations (threat catalog, not a standard) | <n> |`; a per-area bullet exactly for the areas whose approved gold list is non-empty, listing exactly those ids; the document contains the DISCLAIMER exactly once, in the Methodology bullet; removing those lines gives the baseline (masked). Also run with `--areas bias-monitoring` only (no labeled area): the table row shows 0 and the DISCLAIMER is still present |
| T-SUR-09 | `build "<DS1>" --json`, `build "<DS1>" --compact --json`, `build "<DS3>" --json`, `build "<DS1>" --jurisdiction eu --json` | brief contains `## Threat model (MITRE ATLAS)` exactly once, before `## Verification`; contains `` `aigis threats --traits <sorted traits passed to classify>` `` and the DISCLAIMER; `meta.char_count` minus baseline is greater than 0 and at most 1,000; `meta.atlas` has `version`, `disclaimer` (equal to the DISCLAIMER), `mitigations`, `threats_command`; removing the section gives the baseline brief (masked); other meta keys equal baseline except `char_count`, `version` |
| T-SUR-10 | `build "<DS1>" --list` (SHOULD, AC22) | last three lines are an empty line, `Threat model:`, `  aigis threats --traits ...`; everything before equals baseline |
| T-SUR-11 | each command above run twice | byte-identical after masking the two listed volatile fields |

## L2 `test/atlas-failsoft.test.js` (node N4; AC23, SPEC S4.5; scratch package)

Commands C1 to C7, each run in the scratch package: C1 `classify --traits TS1 --json`; C2 `verify rate-limiting --auto <fixture project> --json`; C3 the same without `--json`; C4 `report --areas input-validation,rate-limiting --project <fixture> --format json`; C5 the same with markdown; C6 `build "<DS1>" --json`; C7 `build "<DS1>" --compact --json`.

| Id | Mutation | Expected for every command C1 to C7 |
|---|---|---|
| T-FS-01 | `catalog-missing` | exit code equals the healthy run's (0); stdout equals the baseline fixture after masking version and timestamp, and contains neither "ATLAS" nor "AML."; no `atlas`, `controls.atlas`, `cited_controls.atlas`, `meta.atlas`, `atlas_count` key anywhere in the JSON; stderr is exactly one line: `aigis: ATLAS catalog unavailable (catalog missing); ATLAS output omitted` |
| T-FS-02 | `catalog-corrupt`, `catalog-nokey` | same, with `(catalog corrupt)` |
| T-FS-03 | `catalog-sha`, `catalog-version` | same, with `(catalog pin-mismatch)` |
| T-FS-04 | `entry-missing`, `entry-corrupt`, `entry-version`, `entry-badtech`, `entry-badtrait` | stdout byte-identical to the healthy scratch run (full ATLAS output, DISCLAIMER present); stderr empty; exit 0 |
| T-FS-05 | no mutation (control) | the scratch package's output equals the repo's own output for C1 to C7, proving the scratch harness itself changes nothing; report (C4, C5) over three areas with `catalog-missing` still writes one stderr line, not three |

## L2 `test/atlas-regression.test.js` (node N4; AC15)

| Id | Check | Expected |
|---|---|---|
| T-REG-01 | command matrix against baseline fixtures: `classify --traits TS2 --json`, `classify "<DS1>" --json`, `get input-validation`, `get rag-security --no-frontmatter`, `verify pii-handling`, `template ai-impact-assessment`, `workflow fastapi-llm`, `infra rate-limiting`, `audit --traits TS1 --json`, `search --list`, `traits`, `build "<DS1>" --list`, `--help` | exit codes equal; stdout equal after removing the additive items: `controls.atlas`, `atlas`, the one `atlas:` frontmatter line, the Threat model lines of `--list`, the new `threats` line in `--help`, the new template in `search --list` |
| T-REG-02 | `get <area>` for all 15 labeled areas | differs from baseline by exactly one added line matching `^  atlas: \[.*\]$` |
| T-REG-03 | `content/resolvers/triggers.json` sha256; `detectTraitsFromText` on the 10 dev descriptions | equal to baseline fixture |
| T-REG-04 | `implement_files` for the 10 dev descriptions on the classify path and on the build path (`meta.areas`), and `classify(ground_truth_traits)` | equal to baseline fixture |
| T-REG-05 | `init cursor` in a temp dir | resolver block and its checksum equal baseline; file length minus baseline equals `core.md` length minus baseline `core.md` length |

## L2 `test/atlas-threats.test.js` (node N5; AC9, AC10, AC11, AC14, AC19)

| Id | Command | Expected |
|---|---|---|
| T-THR-01 | `threats --traits TS1 --json` | exit 0; top-level keys exactly as SPEC S5.3 in order (no `redteam`); `atlas.version`; `atlas.disclaimer` equals the DISCLAIMER (there is no top-level `disclaimer` key); `traits` sorted; `entry_points` equal the entry-point file rows for those traits; `techniques` ids equal the union ordered by the rule; each technique has name (display name), maturity, tactics with names, `entry_traits`, `case_studies` from the catalog; `mitigations` equal the test's own computation from the catalog's direct links (the mitigations whose `techniques` list contains the id), with no `via` key and no parent inheritance; `areas` equal the reverse index of gold with `recommended` matching `classify(TS1).implement_files` |
| T-THR-02 | same, and `threats --traits TS4 --top 25 --json` | every (technique, mitigation) pair in the output is in the catalog's direct links, and for each shown technique the list is complete (precision and recall 1 against the catalog); if AML.T0051.001 is in scope its mitigations are exactly M0024, M0033, M0035; `gaps` are exactly the mitigations directly linked to in-scope techniques with no gold area, each listing its in-scope techniques, sorted by count descending then id; `unmitigated_techniques` exact; `mitigation_counts.in_scope = with_area + without_area` and matches the recount; `mitigation_names` covers every id used |
| T-THR-03 | `threats --traits TS4 --top 25 --json` | maturity rank is non-decreasing down the list; within equal maturity `case_studies` is non-increasing; ties in id order |
| T-THR-04 | `threats --traits TS4 --top 3 --json` vs `--top 25` | `techniques_shown` 3, `techniques` length 3 and equal to the first 3 of the long list; `techniques_in_scope`, `gaps`, `unmitigated_techniques`, `mitigation_counts` identical in both; `techniques_in_scope` equals the size of the union the test computes from the entry-point file, and with `--top 25` `techniques_shown` equals `min(25, techniques_in_scope)` |
| T-THR-05 | `--top 0`, `--top -1`, `--top abc`, `--top 2.5`, `--top 26` with TS1 | exit 1; stdout empty; stderr contains `--top must be an integer from 1 to 25` |
| T-THR-06 | `threats`; `threats ""`; `threats "   "` | exit 1; stdout empty; stderr first line `Provide --traits, a quoted description, or both.` |
| T-THR-07 | `threats --traits uses-llm,not-a-trait` | exit 1; stderr `Unknown traits: not-a-trait.` followed by the hint |
| T-THR-08 | `threats "<DS1>" --json` and `threats "<DS3>" --json` | exit 0; `input.description` is the normalized text; `uncertain_traits` equal the build path's; entry points of uncertain traits have `uncertain: true`; the result equals `threats --traits <traits> --json` in every key except `input`, `uncertain_traits` and the `uncertain` flags; `threats "<DS1>" --traits uses-rag --json` adds `uses-rag` as a certain trait |
| T-THR-09 | `threats "<DS2>"` | exit 1; stderr starts `No traits resolved from description.` |
| T-THR-10 | `threats --traits TS3` text and `--json` | exit 0; `techniques` `[]`, `gaps` `[]`, `techniques_in_scope` 0; text contains `No ATLAS entry points are mapped for these traits.` |
| T-THR-11 | text and JSON sizes for TS1, TS2, TS4 at default and `--top 25` | text at most 7,000 (default) and 16,000 (`--top 25`); JSON at most 20,000 and 45,000; at most 25 numbered technique entries; at most 4 mitigation lines per technique; at most 8 gap lines |
| T-THR-12 | TS2 text and JSON run twice | byte-identical; no match for an ISO timestamp or a date |
| T-THR-13 | `threats --traits TS2 --redteam --json` and text (SHOULD) | `redteam` length `min(5, techniques_shown)`; ids RT-01 upward; keys as SPEC S5.5; `expected_defenses` only mitigations with areas; text has `## Red-team test stubs (n)` before `## Next`; size increase at most 4,000; without the flag the key and section are absent; `--traits TS3 --redteam` gives `redteam: []` |
| T-THR-14 | TS5 vs TS1 `--json` | `techniques`, `gaps`, `entry_points`, `mitigation_counts` identical; only `traits`, `recommended_areas` and `recommended` flags may differ |
| T-THR-15 | all text outputs produced above, including the TS3 (no entry points) and `--redteam` outputs | first lines are the title and `> <DISCLAIMER>`; early check for N5 with the same matcher as T-HON-01, on the text and the JSON of every threats run above: after removing the DISCLAIMER no FORBIDDEN match (all four patterns, including the risk-score one); no "satisfied" |
| T-THR-16 | reserved (classify text line is checked in E2E-08) | |
| T-THR-17 | `--help` and `threats --help` | exit 0; root help lists `threats`; command help names `--traits`, `--top`, `--json`, `--redteam` (the last only if AC19 shipped) |
| T-THR-18 | TS2 text with stdout piped | no ANSI escape sequence (`\x1b[`); JSON is printed only with `--json`; `lib/threats.js` does not require `chalk` |
| T-THR-19 | scratch package, `threats --traits TS1` and `threats --traits TS1 --json`, with each of `catalog-missing`, `catalog-corrupt`, `catalog-nokey`, `catalog-sha`, `catalog-version` | exit 2; stdout empty (zero bytes, also with `--json`); stderr is the single line `ATLAS catalog unavailable: catalog <code>. Reinstall the aigis package.` with code `missing`, `corrupt`, `corrupt`, `pin-mismatch`, `pin-mismatch` |
| T-THR-20 | scratch package, same two commands plus `threats "<DS1>"`, with each of `entry-missing`, `entry-corrupt`, `entry-version`, `entry-badtech`, `entry-badtrait` | exit 2; stdout empty; stderr `ATLAS catalog unavailable: entry-points <code>. Reinstall the aigis package.` with code `missing`, `corrupt`, `pin-mismatch`, `corrupt`, `corrupt`. Input errors still win when both apply: `threats --top 26 --traits TS1` and `threats` with no arguments exit 1 in a mutated package |

## L0 `test/atlas-version.test.js` (node N5; AC16)

| Id | Check | Expected |
|---|---|---|
| T-REL-01 | version in `package.json`, `package-lock.json` (two places), `bin/aigis.js`, `cli-python/pyproject.toml` | all `2.2.0` |

## L0 `test/atlas-docs.test.js` (node N6; AC12, AC13, AC14)

| Id | Target | Expected |
|---|---|---|
| T-DOC-01 | `content/skills/core.md` | at most 4,900 characters; contains `aigis threats`, the DISCLAIMER byte for byte, and the workflow step numbered 5; contains neither `--redteam` nor "Python"; diff against the baseline fixture touches at most 3 hunks |
| T-DOC-02 | `README.md` | has `## Threat modeling with MITRE ATLAS` and `## What's new in v2.2`; DISCLAIMER verbatim; the numbers 16, 221, 44, 77 in the "What ships" sentence equal the catalog counts; "map to N of the 44 mitigations" where N equals the number of distinct ids in the gold file; CLI reference has `aigis threats`; License mentions `content/index/atlas-NOTICE.md` and "Apache-2.0"; lines not present in the baseline README contain no U+2014; no FORBIDDEN match after removing the DISCLAIMER; the baseline benchmark numbers are unchanged |
| T-DOC-03 | `cli-python/README.md` | contains the same two sections with identical text |
| T-DOC-04 | `content/templates/threat-model.md` and `aigis template threat-model` | file at most 4,500 characters; contains the 16 tactic names in catalog order, the DISCLAIMER, five numbered steps, and the words "tools", "write access", "memory", "data source"; no technique id (`AML.T`); no mention of `--redteam`; the command exits 0 and prints the file; `classify --traits TS2 --json` `templates` does not include `threat-model` |
| T-DOC-05 | `CHANGELOG.md` | has a `## 2.2.0` heading and mentions "ATLAS" and "2026.10" |
| T-DOC-06 | early check for N6 with the same matcher as T-HON-01: both READMEs, `CHANGELOG.md`, `content/skills/core.md`, `content/templates/threat-model.md` | no FORBIDDEN match (all four patterns of SPEC S0, including the risk-score one) after removing DISCLAIMER occurrences |
| T-DOC-07 | Python note consistency | if `cli-python/aigis_cli/threats.py` exists, neither README contains the Python note sentence; otherwise both contain it |
| T-DOC-08 | red-team consistency | `aigis threats --help` lists `--redteam` if and only if both READMEs mention `--redteam`; `CHANGELOG.md` mentions it under the same condition |

## L2 `test/atlas-honesty.test.js` (checked at INT; AC14)

One test, one matcher, every ATLAS-bearing surface. Expected red until N4, N5 and N6 are merged. FORBIDDEN is the single regex of SPEC S0 (ATLAS compliant/compliance/certified/certification, "complies with ATLAS", and risk score/scores/scored/scoring, case-insensitive). Each text is scanned after removing every byte-exact DISCLAIMER occurrence.

| Id | Surfaces scanned | Expected |
|---|---|---|
| T-HON-01 | **Static:** `README.md`, `cli-python/README.md`, `CHANGELOG.md`, `content/skills/core.md`, `content/templates/threat-model.md`, every other file under `content/` (including `content/index/atlas.json`, `atlas-entry-points.json`, `atlas-NOTICE.md`), every file under `lib/` and `bin/`, `docs/frontmatter-schema.md`. **Command output, stdout of each, text and JSON:** `classify --traits TS1 --json`, `classify --traits TS2 --json`; `verify rate-limiting --auto <fixture>` and `--json`, `verify bias-monitoring --auto <fixture>` and `--json`; `report --areas input-validation,rate-limiting,bias-monitoring --project <fixture>` in markdown and `--format json`; `build "<DS1>"`, `build "<DS1>" --compact`, `build "<DS1>" --json`, `build "<DS1>" --list`; `threats --traits` TS1, TS2, TS3, TS4 as text and `--json`, `threats --traits TS4 --top 25`, `threats "<DS1>"`, `threats --traits TS2 --redteam` text and JSON (when AC19 shipped); `template threat-model`; `threats --help` | zero FORBIDDEN matches in total. The only allowlisted match is the pre-existing table-header line containing `\| Risk score \|` in `content/templates/risk-characterization.md`, matched by file and exact line; a second occurrence in that file, or any occurrence elsewhere, fails. The test prints the number of surfaces scanned (at least 30 command outputs) and, on failure, the surface and the matching text |

## `test/atlas-python-parity.test.js` (T-PY-01 at INT, T-PY-02 node PY; AC17, AC20)

Runs `python3 -c "from aigis_cli.cli import cli; cli()" <args>` with cwd `cli-python`. If `python3 -c "import click, frontmatter"` fails, print `SKIP python deps unavailable` and exit 0; otherwise print `RAN`. INT requires `RAN`.

| Id | Check | Expected |
|---|---|---|
| T-PY-01 (MUST, checked at INT in both PY end states) | Python `classify --traits TS1 --json`, `get input-validation`, `verify rate-limiting --auto <fixture> --json`, `report --areas input-validation --project <fixture> --format json` | exit 0; valid output; pre-existing keys equal the Node baseline fixture where the baseline had parity (compare `implement_files`, `risk_tier`, `controls.owasp/nist/iso`) |
| T-PY-02 (SHOULD) | Node vs Python, parsed JSON equality: `classify --traits TS1 --json` (`controls.atlas`, `atlas`); `verify input-validation --auto <fixture> --json` (`cited_controls.atlas`, `atlas`); `report ... --format json` (top-level `atlas`, both summary keys); `build "<DS1>" --json` (`meta.atlas` and the Threat model section text); `threats --traits TS1/TS2/TS4 --json` (whole document); `threats --traits TS2` text (bytes); errors `--top 26`, unknown trait, no arguments (exit code and first stderr line) | all equal, and every Python JSON document carries `atlas.disclaimer`. If `threats.py` does not exist the test prints `CUT python port`, asserts that `atlas.py` is absent too (cut-complete, no partial port), and passes; T-DOC-07 then enforces the README note |

## `test/atlas-release.test.js` (checked at INT; AC16)

| Id | Check | Expected |
|---|---|---|
| T-REL-02 | `npm pack --dry-run --json` file list | includes `content/index/atlas.json`, `content/index/atlas-NOTICE.md`, `content/index/atlas-entry-points.json`, `content/templates/threat-model.md`, `lib/atlas.js`, `lib/threats.js`; includes nothing under `build/`, `test/`, `.context/`, `.claude/`, `cli-python/`, and no `*.tgz` |

## L3 end to end (INT, `build/atlas/evals/e2e.sh`, about a minute)

Run with `HTTP_PROXY` and `HTTPS_PROXY` set to a dead address to show nothing needs the network.

| Id | Journey | Pass when |
|---|---|---|
| E2E-01 | `npm pack`, install the tarball in a clean temp dir | `aigis --version` prints 2.2.0 |
| E2E-02 | Design a feature: `aigis classify --traits TS2 --json`, run the printed `atlas.threats_command`, `aigis build "<DS1>"`, `aigis template threat-model` | every step exits 0; threats output starts with the title; the brief has the Threat model section |
| E2E-03 | Verify and report on a copy of the fixture project | verify shows the ATLAS block; the markdown report has the ATLAS table row and the disclaimer |
| E2E-04 | `aigis init cursor` in a temp project | `.cursorrules` contains `aigis threats`; resolver block checksum equals baseline |
| E2E-05 | Build the wheel from `cli-python`, install in a fresh venv | `aigis --version` 2.2.0; `aigis classify --traits TS1 --json` exits 0; if the port shipped, `aigis threats --traits TS1 --json` equals Node's |
| E2E-06 | Package contents | tarball and wheel contain the catalog, notice, entry points and template; nothing private (`.claude/`, `.context/`, recovery codes, `*.tgz`, `build/`) |
| E2E-07 | `node scripts/build-atlas-index.js --source /tmp/atlas-src/ATLAS-2026.10.yaml --check` | prints `OK`, exit 0 |
| E2E-08 (SHOULD) | `script -q /dev/null aigis classify --traits TS1` (a real terminal) | output contains `ATLAS mitigations` on the Controls line, `Threat model (MITRE ATLAS):` and the DISCLAIMER |

L4 agent evals are milestone only and not part of this plan.

## AC to test map

| AC | Tests |
|---|---|
| AC1 | T-CAT-01 to T-CAT-08 |
| AC2 | T-CAT-10, T-CAT-11, E2E-07 |
| AC3 | T-CAT-09 (both embedded texts hash-checked), T-DOC-02, T-REL-02, E2E-06 |
| AC4 | T-FM-01 to T-FM-05, T-FM-07 |
| AC5 | T-SUR-01, T-SUR-02, T-REG-01 |
| AC6 | T-SUR-03 to T-SUR-06 |
| AC7 | T-SUR-07, T-SUR-08 |
| AC8 | T-SUR-09, T-SUR-11 |
| AC9 | T-THR-01 to T-THR-04, T-THR-08, T-THR-12, T-THR-14, T-FM-06 |
| AC10 | T-THR-05, T-THR-06, T-THR-07, T-THR-09, T-THR-10, T-THR-17, T-THR-18, T-THR-19, T-THR-20 |
| AC11 | T-THR-05, T-THR-11 |
| AC12 | T-DOC-01, T-REG-05 |
| AC13 | T-DOC-04, T-REG-01 |
| AC14 | disclaimer per surface: classify JSON T-SUR-01, T-SUR-02; verify JSON T-SUR-03, T-SUR-05, T-SUR-06; verify text T-SUR-04, T-SUR-05; report JSON T-SUR-07; report markdown T-SUR-08; brief and meta T-SUR-09; threats JSON T-THR-01; threats text T-THR-15; template T-DOC-04; core skill T-DOC-01; READMEs T-DOC-02, T-DOC-03; classify text E2E-08. Forbidden phrases, all patterns on every surface: T-HON-01 (early per-node checks with the same matcher: T-DOC-06, T-THR-15). Published links only: T-LIB-05, T-THR-02 |
| AC15 | T-REG-01 to T-REG-05, T-FM-04, T-FM-05 |
| AC16 | T-REL-01 (N5), T-REL-02, T-DOC-05, E2E-01 to E2E-06 |
| AC17 | T-PY-01 |
| AC18 | EV-M1, EV-M2, EV-M3, EV-M5, EV-M6 (EVALS.md) |
| AC19 | T-THR-13 |
| AC20 | T-PY-02, T-DOC-07 |
| AC23 | T-FS-01 to T-FS-05, T-THR-19, T-THR-20, T-LIB-02, T-LIB-12, T-LIB-14 |
| AC21 | E2E-08 |
| AC22 | T-SUR-10 |
