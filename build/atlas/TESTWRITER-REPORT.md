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
