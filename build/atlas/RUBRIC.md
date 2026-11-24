# RUBRIC: MITRE ATLAS in Aigis

The checker (Fable 5.2, never the maker's session) judges every item with evidence: a command and its output, a file and line, or a diff. "Looks right" is not evidence. A node passes when all of its items and all global items pass.

## Global items (every node)

| Id | Item | Evidence |
|---|---|---|
| G-1 | The node's own test files are green and no previously green check turned red. | `npm test` output, per-file lines |
| G-2 | The diff touches only files the node owns in GRAPH.yaml. | `git diff --name-only <base>...` against `owns_files` |
| G-3 | No locked test or fixture changed. | hashes equal `build/atlas/TESTLOCK` |
| G-4 | No network, LLM, telemetry, timer-based or random behavior was added. | grep of the diff for `http`, `https`, `fetch(`, `net`, `child_process`, `Date.now`, `Math.random` in runtime code |
| G-5 | Output wording follows SPEC S0: no "satisfied", "compliant", "certified" or "covered" as a claim tied to ATLAS; the DISCLAIMER is byte-exact in every output document that renders ATLAS (text and `atlas.disclaimer` in JSON) and is typed only in `lib/atlas.js`. | grep of the diff; one sample output per surface |
| G-6 | If the node edits `content/`, the Python mirror is byte-identical. | `node scripts/check-content-sync.js` |
| G-7 | Nothing outside the spec slice was built (no new flags, keys, files or content). | diff review; extras are logged as `scope-creep` |
| G-8 | New user-facing text has no em dash. | grep for U+2014 in added lines |

## N1 catalog and generator

| Id | Item | Evidence |
|---|---|---|
| R-N1-1 | The catalog was produced by the script from the pinned file, not typed or edited by hand. | `--check` against `/tmp/atlas-src/ATLAS-2026.10.yaml` prints `OK`; sha256 of the source printed |
| R-N1-2 | Counts and spot facts match the pinned source (16, 221, 92, 44, 494, 77, 117/78/26; AML.TA0001 "AI Attack Adaptation"; AML.T0051.001 Realized; AML.M0024 and AML.T0010 names; AML.M0030 links). | T-CAT-03, T-CAT-04 output plus an independent `python3 -I` count |
| R-N1-3 | The file is at most 64,000 bytes, has no description text, and the generator refuses a wrong hash without writing. | `wc -c`, T-CAT-07, T-CAT-10 |
| R-N1-4 | The NOTICE file embeds the upstream notice and the Apache-2.0 text byte for byte between the markers of SPEC S1.3, has the statement of changes, and says the Aigis mappings are not MITRE's. | `shasum -a 256` of both extracted spans equals `fa6c92ab...3047d40` and `cfc7749b...523d30`; T-CAT-09 |

## N2 lib/atlas.js

| Id | Item | Evidence |
|---|---|---|
| R-N2-1 | Every exported function matches SPEC S2 in name, arguments, return shape and error codes. | T-LIB-* output, code read |
| R-N2-2 | Only MITRE's direct `mitigates` links are used anywhere: no parent or child inheritance, no `via` field. The total number of (mitigation, technique) pairs reachable through the lib is 494. | T-LIB-05, T-LIB-11, a count printed by the checker |
| R-N2-3 | Pure and cached: no writes, no globals leaking between calls, results are copies. | T-LIB-13, code read |

## N3 labels, entry points, validator

| Id | Item | Evidence |
|---|---|---|
| R-N3-1 | Every area's `controls.atlas` equals the approved gold file exactly; EU-gated areas have none. | T-FM-02, T-FM-03; `build/atlas/gold/APPROVAL.md` shows Nayan's approval |
| R-N3-2 | Each area file differs from the base commit by exactly one added frontmatter line. | `git diff --stat` and per-file diff |
| R-N3-3 | The validator rejects bad ids, unknown ids, duplicates and `atlas` on jurisdiction-gated areas, and still enforces the old no-deletion baseline; the baseline now protects `atlas`. | T-FM-01, T-FM-04, a manual negative run |
| R-N3-4 | The entry-point file equals its gold file, and `docs/frontmatter-schema.md` explains the key, "implements in part", and the approval rule. | T-FM-06, T-FM-07, file read |

## N4 citation surfaces

| Id | Item | Evidence |
|---|---|---|
| R-N4-1 | classify, verify, report and build show ATLAS exactly as in SPEC S4, each with the DISCLAIMER, and each is fail-soft per S4.5 for all three catalog failure modes and unaffected by a broken entry-point file. | T-SUR-01..09, T-FS-01..05 |
| R-N4-2 | Removing the additive keys or blocks gives back the baseline output byte for byte (version and timestamp masked). | T-SUR-04, T-SUR-08, T-SUR-09, T-REG-01 |
| R-N4-3 | The ATLAS block in verify is separate from "Controls satisfied", and the report bullet and table row carry the "not a standard" wording. | output read |
| R-N4-4 | Brief growth is at most 1,000 characters on all three fixed descriptions in full and compact mode; caps unchanged. | T-SUR-09 numbers |

## N5 aigis threats

| Id | Item | Evidence |
|---|---|---|
| R-N5-1 | JSON key set, order and values match SPEC S5.3 for the test inputs; gaps and counts are computed over all in-scope techniques. | T-THR-01..04 |
| R-N5-2 | Every row of the error table in SPEC S5.6 behaves as written (stdout, stderr, exit code), including exit 2 for each catalog and entry-point failure mode, with and without `--json`. | T-THR-05..07, T-THR-09, T-THR-10, T-THR-19, T-THR-20 |
| R-N5-3 | Text output follows S5.4, has no color codes and no timestamp, and stays inside the caps at default and at `--top 25` with every seeded trait (TS4). | T-THR-11, T-THR-12, T-THR-18 with character counts |
| R-N5-4 | Order is Realized, Demonstrated, Feasible, then case-study count, then id; no number is presented as a risk score. | T-THR-03, output read |
| R-N5-5 | `bin/aigis.js` contains only flag parsing, calls and printing for the new command; all logic is in `lib/threats.js`. Existing commands in `bin/aigis.js` are unchanged except the SHOULD lines of S5.7 and the version literal. | diff read |
| R-N5-6 | All five version strings read `2.2.0` and were changed in one commit; `npm test` version-agreement is green at every commit of the node. | `git log -p` for the five files, T-REL-01 |

## N6 docs and content

| Id | Item | Evidence |
|---|---|---|
| R-N6-1 | `core.md` is at most 4,900 characters, changes only the three places in SPEC S6.1, contains the DISCLAIMER, and mentions neither `--redteam` nor Python. | `wc -m`, diff |
| R-N6-2 | The template has the five steps, the 16 tactics in matrix order, no technique list, at most 4,500 characters. | T-DOC-04, file read |
| R-N6-3 | README (both copies): every number is checked against the catalog and gold; the DISCLAIMER is verbatim; no forbidden phrase; no em dash in new lines; no new performance claim; the Python note is present exactly when the Python port is cut. | T-DOC-02, T-DOC-03, T-DOC-06, T-DOC-07 |
| R-N6-4 | CHANGELOG, CONTRIBUTING and IMPROVEMENTS exist with the content listed in SPEC S6.5. | file read |
| R-N6-5 | Reconcile pass (after 20:00): README (both copies), CHANGELOG and IMPROVEMENTS match the final cut state exactly as in SPEC S6.6; the pass touched no file under `content/`. | the orchestrator's cut-state message, diff of the pass, T-DOC-07, T-DOC-08 |

## PY Python port (optional)

| Id | Item | Evidence |
|---|---|---|
| R-PY-2 | End state `shipped`: ATLAS fields and `threats` output equal Node's on every parity input, including the error exits. End state `cut_complete`: nothing of the port is in the tree (no `atlas.py`, no `threats.py`, no Python CLI file differs from the base commit) and the cut is logged. There is no third state. | T-PY-02 shows RAN and passes, or prints `CUT python port` with `git diff --stat <base> -- cli-python/aigis_cli/*.py` empty |

## INT integration

| Id | Item | Evidence |
|---|---|---|
| R-INT-1 | Clean tree, all checks green, version 2.2.0 in five places (set by N5), mirror identical. INT's own diff touches no product file. | `git status`, `npm test`, T-REL-01, `git diff --name-only` of the INT commits |
| R-PY-1 | Existing Python commands run on the new content (MUST in both PY end states). | T-PY-01 shows RAN, not SKIP |
| R-INT-2 | `--check` regeneration from the pinned source prints `OK`. | command output |
| R-INT-3 | Installed-package journeys pass from the npm tarball and from the wheel; package contents include the catalog and notice and nothing private. | E2E-01..07 logs, `npm pack --dry-run`, wheel file list |
| R-INT-4 | Evals: every target and guard in EVALS.md is met on dev and on held-out (run once). | `build/atlas/evals/results/*.json` and the summary table |
| R-INT-5 | GPT-5.6 Sol's review of the full diff has no open blocker or major finding. | `build/atlas/REVIEW.md` |
| R-INT-6 | Every cut SHOULD is logged, and README, core skill and CHANGELOG describe what actually shipped. | trace entries, file read |

## Honesty checklist for GATE B (the checker fills this in)

- [ ] No output, doc or content says or implies ATLAS compliance, and none presents a risk score: T-HON-01 is green with at least 30 command outputs scanned.
- [ ] Every ATLAS id, name, maturity label and link printed on the eval sets matches the pinned source (M3 = 1.000). Every (technique, mitigation) pair printed is one of MITRE's 494 direct links; nothing is inferred.
- [ ] The disclaimer sentence is present in every output document that renders ATLAS, in text and in `atlas.disclaimer`.
- [ ] The two Aigis-owned mappings are exactly the approved gold files.
- [ ] Routing, trait detection and existing citations are unchanged from the baseline.
- [ ] The README states the limits: catalog not standard, no risk score, no bias or fairness coverage, partial implementation, starting point not proof.
- [ ] Gaps are printed, not hidden: mitigations with no Aigis area appear in `aigis threats`.
