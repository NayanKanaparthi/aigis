# SPEC: MITRE ATLAS in Aigis

One section per graph node. A maker gets S0 plus its own section. Paths are relative to the repo root.

## Design decisions (and why)

| # | Decision | Reason |
|---|---|---|
| D1 | Aigis owns two small judgments: **area to ATLAS mitigations** (`controls.atlas` in area frontmatter) and **trait to entry-point techniques** (`content/index/atlas-entry-points.json`). Everything else (technique names, maturity, tactics, mitigation to technique links) is read from the vendored catalog. | MITRE already publishes mitigation to technique links (494 of them). Deriving them keeps the surface needing gold labels and Nayan's approval to 83 proposed rows (29 plus 54; 23 and 32 of them included in the candidate gold) instead of several hundred. |
| D2 | Frontmatter is the only source for area labels. `FILE_CONTROLS` in `lib/classify.js` is not extended. | `FILE_CONTROLS` already duplicates frontmatter and has drifted (no EU entries). A second copy of the ATLAS mapping would need its own drift check. |
| D3 | The catalog is `content/index/atlas.json`: ids, names, maturity, tactic links, parents, mitigation links, case-study counts. No descriptions. All 221 techniques are kept. | Prototype is 34 KB minified. Keeping every technique means no selection judgment in the data file, and `content/` parity carries it to Python for free. |
| D4 | `aigis threats` is MUST. Red-team stubs are SHOULD. | Without the command ATLAS would be a list of ids on a compliance report, which is the misuse INTAKE warns about. Stubs are templating over the same data and can be cut safely. |
| D5 | Technique scope for `threats` comes from the approved entry-point map (9 traits, 32 links, 29 distinct techniques in the candidate gold; current counts in EVALS §5.1), not from the areas' own mitigations. | Deriving scope from covered mitigations is circular: you would only ever see threats you already cover, and gaps could not appear. |
| D6 | Mitigation links are MITRE's 494 direct `mitigates` links and nothing else. A sub-technique does **not** inherit its parent's mitigations. (Changed in review round 1, ATLAS-02.) | Inheritance would add 124 links that MITRE did not publish, a third judgment surface needing approval, and would make the phrase "MITRE links" untrue. Cost, stated openly: AML.T0051.000 and AML.T0051.001 carry only AML.M0024, M0033 and M0035 directly, so guardrails (AML.M0020, linked to the parent AML.T0051) do not appear next to them. The remedy is in the approved entry-point map (list the parent technique where the parent holds the links), not in inference. Inheritance display is logged in IMPROVEMENTS. |
| D7 | Order: maturity (Realized, Demonstrated, Feasible), then MITRE case-study count descending, then id. | INTAKE step 3. ATLAS has no risk score, so Aigis does not invent one. |
| D8 | ATLAS is universal: never jurisdiction-gated. EU-gated areas carry no `atlas` key. | ATLAS has no jurisdiction. Keeps `--jurisdiction` behavior untouched. |
| D9 | (Amended 15:45: two new areas and one routing change are now in scope, section S7 and S4.6.) No new trait or trigger tonight, and no change to the 19 existing area bodies. | Each changes routing (M1/M2), brief size and the Python port. Routing staying byte-identical is the strongest guard available. Gaps are printed honestly instead. |
| D10 | `threats "<description>"` resolves traits the way `aigis build` does (uncertain traits included and marked). It never prompts. | Recall matters most; build is the path the v2 benchmark measured. A non-interactive command is deterministic and testable. |
| D11 | `threats` text output uses no color and no timestamp. | Same bytes in a terminal and in a pipe; no volatile field to mask. |
| D12 | Catalog load failure is fail-soft for existing commands (ATLAS output omitted, one stderr line, same exit code, stdout equal to the pre-3.0 output) and exit 2 for `threats`. A broken entry-point file affects only `threats`. Exact behavior: S4.5 and S5.6. | A broken install must not take down classify, verify, report or build. |
| D13 | Python: content parity is MUST; CLI-code parity is SHOULD with a JSON-equality test and an honest note if cut. | The Python package has no test suite, so a rushed port is the likeliest regression. The parity test bounds it. |
| D14 | Version 3.0.0 (owner decision 15:45). Everything stays additive: no command, flag or JSON key is removed or renamed. | A launch release that adds a framework, a command, two areas and a deliberate change in what classify recommends for agentic projects. The major number signals that change in recommendations; it does not license a breaking change. |

## S0. Shared constants (all nodes)

```
ATLAS_VERSION  = "2026.10"
ATLAS_SHA256   = "ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d"
DISCLAIMER     = MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.
FORBIDDEN      = /ATLAS[ -]?(compliant|compliance|certified|certification)|complies with ATLAS|risk[ -]?scor(e|es|ed|ing)/i
                 Checked after removing every DISCLAIMER occurrence, on every surface listed in the disclaimer rule below plus README,
                 core skill, template, all of content/, lib/ and bin/ (TESTPLAN T-HON-01). One pre-existing line is allowlisted by exact
                 match: the table header containing `| Risk score |` in content/templates/risk-characterization.md (a risk-register
                 column that predates this feature and is not an ATLAS surface).
MATURITY_RANK  = Realized 0, Demonstrated 1, Feasible 2
```

- Display name of a technique: `<parent name>: <name>` for a sub-technique, else `<name>`. Example: `LLM Prompt Injection: Indirect`.
- Wording rule: ATLAS mitigations are "helped", "implemented in part" or "in scope". Never "satisfied", "compliant", "covered" as a claim about the user's system.
- **Disclaimer rule (AC14).** Every output document that renders ATLAS information contains the DISCLAIMER, byte-exact, at least once: classify (JSON, and text when AC21 ships), verify `--auto` (text and JSON), report (markdown and JSON), build (brief text and `meta`), threats (text and JSON), `aigis template threat-model`. In JSON it is always the field `atlas.disclaimer`, next to `atlas.version`. `lib/atlas.js` exports the constant; no other file retypes it. The only exemptions are raw file fetches that print stored files verbatim (`aigis get`, `aigis search`: the `atlas:` frontmatter line is documented in `docs/frontmatter-schema.md`) and `--help` text (the command description itself says "catalog, not a standard"). The characters count against every size cap.
- "MITRE links" in any output means one of the 494 `mitigates` relationships in the pinned file, never an inferred one (D6).
- New public text (README, CHANGELOG, template, core skill lines, CLI output) contains no em dash.
- Pinned source facts used in tests: 16 tactics, 221 techniques, 92 sub-techniques, 44 mitigations, 494 `mitigates` links, 77 case studies, maturity 117 Realized / 78 Demonstrated / 26 Feasible, 53 techniques with no mitigation link. Matrix order: Reconnaissance, Resource Development, AI Attack Adaptation, Initial Access, AI Model Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Command and Control, Exfiltration, Impact (ids TA0002, TA0003, TA0001, TA0004, TA0000, TA0005, TA0006, TA0012, TA0007, TA0013, TA0008, TA0015, TA0009, TA0014, TA0010, TA0011).

## S1. Catalog and generator (node N1)

Files: `scripts/build-atlas-index.js`, `content/index/atlas.json`, `content/index/atlas-NOTICE.md`, and their mirrors under `cli-python/aigis_cli/content/index/`.

### S1.1 `content/index/atlas.json`

```json
{
  "source": {
    "name": "MITRE ATLAS",
    "repository": "https://github.com/mitre-atlas/atlas-data",
    "release_tag": "v2026.10",
    "file": "dist/v6/ATLAS-2026.10.yaml",
    "format_version": "6.1.0",
    "version": "2026.10",
    "modified_date": "2026-10-28",
    "sha256": "<ATLAS_SHA256>",
    "license": "Apache-2.0",
    "notice": "content/index/atlas-NOTICE.md",
    "subset": "ids, names, maturity, tactic links, sub-technique parents, mitigation links, case-study counts; no descriptions"
  },
  "counts": { "tactics": 16, "techniques": 221, "subtechniques": 92, "mitigations": 44, "mitigation_links": 494, "case_studies": 77,
              "maturity": { "Realized": 117, "Demonstrated": 78, "Feasible": 26 } },
  "tactics": [ { "id": "AML.TA0002", "name": "Reconnaissance" } ],
  "techniques": { "AML.T0051.001": { "name": "Indirect", "maturity": "Realized", "tactics": ["AML.TA0005"], "parent": "AML.T0051", "case_studies": 19 } },
  "mitigations": { "AML.M0030": { "name": "Restrict AI Agent Tool Invocation on Untrusted Data",
                                  "techniques": ["AML.T0053", "AML.T0086", "AML.T0101", "AML.T0143"] } }
}
```

Derivation from the source YAML:
- `tactics`: in matrix order from `relationships["ATLAS-matrix"].sequences` sorted by `position`.
- technique `tactics`: targets of `relationships[<tid>].achieves`, sorted. `parent`: target of `specializes` (key omitted for top-level techniques). `name`, `maturity`: verbatim.
- `case_studies`: number of distinct `AML.CS*` sources with an `employs` relationship targeting the technique (0 allowed).
- mitigation `techniques`: targets of `relationships[<mid>].mitigates`, sorted.
- `counts` are computed, not typed in.
- Serialization: `JSON.stringify(value, null, 1) + "\n"`, top-level keys in the order above, `techniques` and `mitigations` keyed in ascending id order. Hard cap 64,000 bytes. If the cap is exceeded, switch to minified output; do not drop fields.

### S1.2 `scripts/build-atlas-index.js`

```
node scripts/build-atlas-index.js --source <path-to-ATLAS-2026.10.yaml> [--check]
```
- Reads the file, computes sha256, compares with the constant `ATLAS_SHA256` in the script. Mismatch: stderr `sha256 mismatch: expected <pinned>, got <actual>. Refusing to generate.`, exit 1, nothing written.
- Missing `--source` or unreadable file: stderr usage or `Cannot read <path>`, exit 1.
- Parses with `js-yaml` (already installed as a dependency of `gray-matter`; `require('js-yaml')`, clear error if it cannot be resolved). No new dependency, no `package.json` change.
- Without `--check`: writes `content/index/atlas.json`, prints `Wrote content/index/atlas.json (<bytes> bytes, ATLAS 2026.10)`.
- With `--check`: generates in memory, compares with the file on disk byte for byte. Equal: `OK`, exit 0. Different or missing: exit 1.
- No network code. The header comment gives the manual download step for a future version (release asset of `mitre-atlas/atlas-data`), and says a version bump changes the constant, regenerates, and needs new gold approval.

### S1.3 `content/index/atlas-NOTICE.md`

Two source texts are embedded byte for byte. Neither is typed or reflowed by the maker; both are copied from the files below and their hashes are checked by T-CAT-09.

| Constant | Source file | Bytes | sha256 |
|---|---|---|---|
| UPSTREAM_NOTICE | `/tmp/atlas-src/LICENSE` (the notice in `mitre-atlas/atlas-data` at tag `v2026.10`; begins "Copyright 2021-2026 MITRE") | 551 | `fa6c92ab3dc75d41413884e8b38cc54cd4e72f4c8f68fc7e77824e48e3047d40` |
| APACHE_2_0_TEXT | `/tmp/atlas-apache/LICENSE-2.0.txt` (canonical text from apache.org) | 11,358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |

File layout, in this order:
1. A short header: what the data is (subset of MITRE ATLAS v2026.10, source file, ATLAS_SHA256); a statement of changes ("reduced to identifiers, names, maturity, relationships and counts; case-study counts are derived; no descriptions included"); a statement that the Aigis mappings (`controls.atlas`, `atlas-entry-points.json`) are Aigis's work and not MITRE's.
2. The line `<!-- BEGIN UPSTREAM NOTICE -->`, a newline, the 551 bytes of UPSTREAM_NOTICE, then the line `<!-- END UPSTREAM NOTICE -->`.
3. The line `<!-- BEGIN APACHE-2.0 LICENSE TEXT -->`, a newline, the 11,358 bytes of APACHE_2_0_TEXT, then the line `<!-- END APACHE-2.0 LICENSE TEXT -->`.

Both source files end with a newline, so each END marker starts on its own line with nothing inserted. The span checked by the test is every byte after the newline that ends the BEGIN line and before the `<` of the END line. No copyright line is written from memory. The file is never printed by any command.

## S2. `lib/atlas.js` (node N2)

Pure, synchronous, cached, no network, no `chalk`. Every function that reads area files takes an optional `{ areasDir }` (default `content/skills/areas`) so tests can use fixtures.

```
PINNED                                  -> { version, sha256 }
DISCLAIMER                              -> the S0 sentence; the only place it is typed in runtime code
class AtlasCatalogError extends Error   -> .file: 'catalog' | 'entry-points'; .code: 'missing' | 'corrupt' | 'pin-mismatch'
loadCatalog({ path }?)                  -> catalog object (cached per path). Throws AtlasCatalogError (file 'catalog'):
                                           file absent -> 'missing'; invalid JSON or missing top-level keys -> 'corrupt';
                                           source.version or source.sha256 differs from PINNED -> 'pin-mismatch'
loadEntryPoints({ path }?)              -> entry-point object (cached per path). Throws AtlasCatalogError (file 'entry-points'):
                                           file absent -> 'missing'; invalid JSON, missing `entry_points`, a trait not in ALL_TRAITS or
                                           a technique id not in the catalog -> 'corrupt'; atlas_version differs from PINNED.version -> 'pin-mismatch'
technique(id)                           -> { id, name, display_name, maturity, tactics:[{id,name}], parent|null, case_studies } | null
mitigation(id)                          -> { id, name, techniques:[ids] } | null
mitigationsForTechnique(id)             -> [{ id, name }] sorted by id: exactly the mitigations whose MITRE `mitigates` list contains this id.
                                           No parent or child inheritance. Unknown id -> [].
techniquesForMitigations(ids)           -> technique ids directly linked by MITRE to any of the mitigations, de-duplicated,
                                           sorted with compareTechniques. Unknown ids are ignored.
compareTechniques(a, b)                 -> by MATURITY_RANK, then case_studies descending, then id ascending (a, b are technique objects)
areaMitigations(areaId, opts?)          -> sorted ids from the area's frontmatter controls.atlas; [] when the key, the file or the area is absent
mitigationAreas(opts?)                  -> { [mitigationId]: [areaIds sorted] } over every area file
summarizeAreas(areaIds, opts?)          -> { version, disclaimer, mitigations:[{id,name}], techniques_addressed:{ total, realized, demonstrated, feasible },
                                             top_techniques:[{ id, name: display_name, maturity }] (at most 2) }
withAtlas(fn, fallback, warn?)          -> returns fn(); on AtlasCatalogError calls warn with
                                           "aigis: ATLAS catalog unavailable (<file> <code>); ATLAS output omitted" and returns fallback.
                                           The default warn writes that line to stderr at most once per process.
```

Rules: returned arrays and objects are fresh copies. `techniques_addressed` counts distinct techniques directly linked to the areas' mitigations (no parent or child expansion). Same input gives the same output.

## S3. Area labels, entry points, validator (node N3)

Files: frontmatter of the 15 non-EU area files in `content/skills/areas/` (bodies untouched), `content/index/atlas-entry-points.json`, `scripts/validate-area-frontmatter.js`, `scripts/area-frontmatter.schema.json`, `scripts/area-controls-baseline.json`, `docs/frontmatter-schema.md`, plus mirrors of the content files.

### S3.1 Frontmatter

```yaml
controls:
  owasp: [LLM10]
  nist: [MEASURE-2.6, MANAGE-2.4]
  iso42001: [Clause-8.2]
  atlas: [AML.M0004, AML.M0036]      # ATLAS mitigation ids this area's procedure implements in part. May be [].
```

- Added as the last key of `controls` (after `eu_ai_act` when present). One line, flow style, ids ascending.
- Values come from `build/atlas/gold/area-mitigations.json` (entries with `decision: "include"`), exactly. That file is the approved copy of `area-mitigations.candidate.json`; the maker reads only the approved file and does not add, drop or reinterpret links. Candidate state for sizing: 23 links, 12 distinct mitigations, at most 3 per area, three areas empty (bias-monitoring, explainability, fallback-patterns).
- The 15 areas: audit-logging, bias-monitoring, confidence-scoring, data-integrity, explainability, fallback-patterns, human-oversight, input-validation, monitoring, output-sanitization, pii-handling, prompt-security, rag-security, rate-limiting, supply-chain. Areas with no approved link get `atlas: []`.
- The four `eu-ai-act-*` areas get no `atlas` key.
- No other byte of any area file changes.

### S3.2 Validator, schema, docs

- `controls.atlas` is optional; when present it must be an array of strings matching `^AML\.M\d{4}$` (error: `controls.atlas value "<v>" does not match AML.M####`), each present in `content/index/atlas.json` (error: `controls.atlas value "<v>" is not a mitigation in ATLAS 2026.10`), with no duplicates.
- `atlas` joins the allowed keys under `controls`. An area that declares `jurisdiction:` must not declare `atlas` (error names the rule).
- No-deletion: `scripts/area-controls-baseline.json` gains an `atlas` array per baseline area (the approved lists), and the validator checks it like the other three. Existing baseline arrays are not edited.
- If the catalog file is missing the validator fails with a clear message (exit 1).
- `scripts/area-frontmatter.schema.json` gains the `atlas` property. `docs/frontmatter-schema.md` gains a row and a short section: what the key means ("implements in part"), that ids are mitigations not techniques, that techniques are derived, that it is never jurisdiction-gated, and how a mapping change is approved (gold file plus Nayan).

### S3.3 `content/index/atlas-entry-points.json`

```json
{
  "atlas_version": "2026.10",
  "note": "Aigis judgment, not MITRE data: the ATLAS techniques worth checking first for a system with a given trait.",
  "entry_points": {
    "uses-rag": { "surface": "Retrieved documents and knowledge-base content", "techniques": ["AML.T0051.001", "AML.T0070"] }
  }
}
```

- Trait and technique content equals `build/atlas/gold/entry-points.json` (`decision: "include"` rows; the approved copy of `entry-points.candidate.json`), traits in ascending order, techniques ascending. At most 6 techniques per trait, at most 3,000 bytes. Candidate state for sizing only (snapshot after review round 3; the approved file is authoritative and no code or test may hard-code these): 32 links, 9 traits, at most 5 per trait, 29 distinct techniques (17 Realized, 12 Demonstrated, none Feasible), about 1,800 bytes.
- Every trait is in `ALL_TRAITS`; every technique id is in the catalog.
- `surface` is a display label only (no ATLAS claim) and is not in the gold file. Use exactly these strings; a trait that the approved file adds beyond this table gets its trait id as the label, and the maker reports it:

| Trait | `surface` |
|---|---|
| accepts-user-input | User-supplied prompts and files |
| generates-content | Generated content that others read or reuse |
| is-agentic | Tools and actions the model can invoke |
| is-external | Public-facing AI endpoint |
| multi-model-pipeline | Model-to-model handoffs |
| uses-finetuned | Training data and model artifacts |
| uses-llm | Prompts and system instructions of the LLM |
| uses-rag | Retrieved documents and knowledge-base content |
| uses-thirdparty-api | Third-party models, packages and hosted AI services |

## S4. Citation surfaces (node N4)

Files: `lib/classify.js`, `lib/auto-verify.js`, `lib/report.js`, `lib/build.js`. `bin/aigis.js` is not edited by this node; the JSON paths already print these objects. All ATLAS reads go through `withAtlas` (fail-soft: keys omitted, block omitted, exit code unchanged).

### S4.1 classify (`lib/classify.js`)

`classify()` result gains:
```json
"controls": { "owasp": [], "nist": [], "iso": [], "atlas": ["AML.M0004", "AML.M0020"] },
"atlas": { "version": "2026.10",
           "disclaimer": "<DISCLAIMER>",
           "techniques_addressed": { "total": 61, "realized": 30, "demonstrated": 25, "feasible": 6 },
           "threats_command": "aigis threats --traits accepts-user-input,uses-llm" }
```
`controls.atlas` is the sorted union of `areaMitigations` over `implement_files`. `threats_command` uses the result's traits sorted ascending. No area: `atlas: []`, totals 0. Everything else in the result is unchanged.

### S4.2 verify `--auto` (`lib/auto-verify.js`)

Result gains `cited_controls.atlas` (ids; `[]` when none) and a top-level `atlas` block equal to `summarizeAreas([areaId])`, which includes `disclaimer`. Never gated by jurisdiction. `formatTextReport` inserts, immediately before `── AUTO CHECKS ──` (after the existing controls block when that is printed):

```
── MITRE ATLAS v2026.10 (threat catalog, not a compliance standard) ──
  Mitigations this area helps implement (in part): AML.M0004 Limit AI Service Query Volume and Rate; AML.M0036 Limit AI Workload Resource Consumption
  Techniques MITRE links to those mitigations: 17 (7 Realized, 5 Demonstrated, 5 Feasible)
  Highest maturity: AML.T0024 Exfiltration via AI Inference API; AML.T0005.001 Replicate AI Model Behavior: Replicate Behavior from Model Outputs
  <DISCLAIMER>
<empty line>
```
With no mapped mitigation the three detail lines are replaced by `  No ATLAS mitigation is mapped to this area.`; the DISCLAIMER line stays. The block is at most 1,000 characters including the disclaimer. The existing "Controls satisfied / in scope" block and its `totalCited` logic are not changed and do not include ATLAS. (Numbers above are illustrative; real ones come from the catalog.)

### S4.3 report (`lib/report.js`)

- JSON: top-level `atlas: { "version": "2026.10", "disclaimer": "<DISCLAIMER>" }`; `summary.cross_framework_coverage.atlas_count`; `summary.cross_framework_citations.atlas` (sorted union); `per_area[i].cited_controls.atlas` arrives from verify.
- Markdown, cross-framework table, new last row: `| MITRE ATLAS mitigations (threat catalog, not a standard) | <n> |`. The DISCLAIMER appears in the Methodology bullet below, once per report.
- Markdown, per area, inside the existing "Controls in scope" list when the area has any: `- MITRE ATLAS mitigations (helps implement, in part): \`AML.M0004\`, \`AML.M0036\``
- Markdown, Methodology, new bullet after the Determinism bullet: `- **MITRE ATLAS**: mitigation ids come from each area's \`controls.atlas\` frontmatter (Aigis's own mapping, pinned to ATLAS v2026.10). A cited mitigation means the area implements part of it. <DISCLAIMER>`
- Area status, counts and all other lines are unchanged.

### S4.4 build (`lib/build.js`)

(Section text, size and the Verification rule are superseded by S4.4a below, 16:00. The placement, `<csv>` rule, `meta.atlas` and the caps stay.) Full and compact briefs get this section immediately before `## Verification`:

```
## Threat model (MITRE ATLAS)

The areas above help implement <n> ATLAS mitigations: `AML.M0004`, `AML.M0020`.

Run `aigis threats --traits <csv>` to see attacker techniques for this system's entry points (Realized first), the mitigations MITRE links to each, which Aigis area implements them, and the gaps no area covers. Rerun it when you add tools, write access, memory or a data source.

<DISCLAIMER>

```
- `<csv>` is the trait set passed to classify, ascending. When n is 0 the first sentence is `None of the areas above maps to an ATLAS mitigation.`
- Size and removal rule: see S4.4a.
- `meta.atlas = { version, disclaimer, mitigations: [ids], threats_command }`. Caps `AUTO_FULL_CAP` and `FULL_HARD_CAP` are unchanged.
- SHOULD (AC22): `buildList` output ends with an empty line, `Threat model:` and `  aigis threats --traits <csv>`. These lines name a command and render no ATLAS information, so they carry no disclaimer.

### S4.4a Brief text that makes the agent act (AC8, AC32; supersedes the section text of S4.4)

The section, in full and compact briefs, immediately before `## Verification`:

```
## Threat model (MITRE ATLAS)

The areas above help implement <n> ATLAS mitigations.

Do this before you finish, without waiting to be asked:

1. Run `aigis threats --traits <csv>`. It lists attacker techniques for this system's entry points (Realized first), the mitigations MITRE links to each, the Aigis area that implements them, and gaps.
2. For every area it names that is not in this brief, run `aigis get <area>`, implement it and verify it.
3. Tell the user about every gap (a mitigation no Aigis area implements). Never report a gap as handled.
4. Rerun it when tools, write access, memory or data sources change.

<DISCLAIMER>

```
- When n is 0 the first sentence is `None of the areas above maps to an ATLAS mitigation.` The mitigation ids are not listed in the brief (they are in `meta.atlas.mitigations` and in the `threats` output).
- "Instructions for the agent" gains item 6: `6. Run the threat model in the "Threat model (MITRE ATLAS)" section before you finish, and act on what it lists.`
- "Verification" gains one checkbox, placed after the per-area `aigis verify` lines: `- [ ] \`aigis threats\` was run; every area it named is implemented or skipped with a written reason; every gap was reported to the user.`
- Total growth (section plus the two lines) is at most 1,500 characters. Removing the section and exactly those two lines must give back the previous brief (header line masked).
- Fail-soft (S4.5): with the catalog unavailable none of the three additions is printed.

### S4.5 Fail-soft (D12, AC23)

"Catalog failure" means `content/index/atlas.json` is missing, is not valid JSON or lacks a top-level key, or has a `source.sha256` or `source.version` different from PINNED. In that state, for classify, verify `--auto`, report and build:

- exit code is what it would have been without ATLAS;
- stdout contains no ATLAS output at all: no `controls.atlas`, no `cited_controls.atlas`, no `atlas` key, no `meta.atlas`, no `atlas_count`, no ATLAS block, row, bullet or brief section. It equals the pre-3.0 baseline output (version and timestamp masked). Keys are omitted, never set to empty, so that nobody reads an empty list as "no mitigations apply";
- stderr has exactly one line per process: `aigis: ATLAS catalog unavailable (catalog <code>); ATLAS output omitted`.

A missing, corrupt or mismatched `content/index/atlas-entry-points.json` does not affect these four commands: their output is identical to the healthy output and stderr is empty.

### S4.6 Routing for the new areas (node N4, `lib/classify.js`, AC27)

- `TRAIT_FILES['is-agentic']` becomes its current list plus `'agent-permissions', 'agent-tool-safety'`. No other trait entry changes. No new guardrail. No new trait.
- `FILE_CONTROLS` is not extended. In the "collect control IDs" step, an area in the fixed list `FRONTMATTER_CONTROL_AREAS = ['agent-permissions', 'agent-tool-safety']` has its `owasp`, `nist` and `iso42001` arrays read from its frontmatter (missing file or key: nothing added). The fallback must not apply to any other area: the EU areas have no `FILE_CONTROLS` entry today and must keep contributing nothing, or existing output would change.
- Result: for a trait set containing `is-agentic`, `implement_files` gains exactly the two ids (sorted into place) and `controls.owasp/nist/iso` gain exactly those areas' frontmatter ids. For every other trait set the result is byte-identical to before (apart from the ATLAS keys of S4.1). Build, audit, report and the classify text follow from this without code changes.
- Known and documented, not changed: `--tight` keeps an area only when at least two of the user's traits are in its `system_traits`; the new areas have one, so `--tight` drops them, as it already drops `rag-security`. Logged in IMPROVEMENTS.

## S5. `aigis threats` (node N5)

Files: `lib/threats.js`, `bin/aigis.js`, and the version strings (`package.json`, `package-lock.json` two places, `cli-python/pyproject.toml`, the `.version('...')` line of `bin/aigis.js`): N5 sets all five to `3.0.0` in one commit, because the frozen version-agreement check parses the literal in `bin/aigis.js`.

Command description shown in `--help`: `Threat model for your system's entry points (MITRE ATLAS: a catalog, not a standard)`.

### S5.1 Interface

```
aigis threats [description] [--traits <list>] [--top <n>] [--json] [--redteam]
```
`lib/threats.js` exposes `resolveThreatTraits({ description, traitsFlag })`, `buildThreatModel({ traits, uncertainTraits, description, traitsFlag, top, redteam })`, `formatThreatsText(model)`, `formatThreatsJSON(model)` (2-space indent). `bin/aigis.js` only parses flags, calls these, prints, and sets the exit code. No `chalk` in `lib/threats.js`. Help text for the command names all four flags.

### S5.2 Trait resolution

1. `--traits`: split on commas, trim, drop empties. Unknown trait: exit 1.
2. Description (non-empty after `normalizeDescription`): `detectTraitsFromText(normalized)`, `assignUniqueSlugs`, `resolveTraits(..., {}, { uncertainAsIncluded: true })`. Confirmed and uncertain traits are both used; uncertain ones are marked. No prompt, no `--confirm/--reject`.
3. Final traits: ascending union of 1 and 2. A trait given in `--traits` is never uncertain.
4. `recommended_areas`: `classify(finalTraits).implement_files` after `filterAreasByJurisdiction`, as the classify command does.

### S5.3 Model (JSON keys in this order)

```json
{
  "atlas": { "version": "2026.10", "disclaimer": "<DISCLAIMER>", "source_sha256": "<ATLAS_SHA256>", "license": "Apache-2.0" },
  "input": { "description": "normalized text or null", "traits_flag": ["uses-rag"] },
  "traits": ["accepts-user-input", "uses-llm", "uses-rag"],
  "uncertain_traits": [],
  "entry_points": [ { "trait": "uses-rag", "surface": "Retrieved documents and knowledge-base content", "uncertain": false,
                      "techniques": ["AML.T0051.001", "AML.T0070"] } ],
  "techniques_in_scope": 8,
  "techniques_shown": 8,
  "techniques": [ { "id": "AML.T0051.001", "name": "LLM Prompt Injection: Indirect", "maturity": "Realized",
                    "tactics": [ { "id": "AML.TA0005", "name": "Execution" } ], "entry_traits": ["uses-rag"], "case_studies": 19,
                    "mitigations": [ { "id": "AML.M0024", "areas": [ { "id": "audit-logging", "recommended": true } ] },
                                     { "id": "AML.M0033", "areas": [] } ] } ],
  "mitigation_names": { "AML.M0024": "AI Telemetry Logging and Monitoring", "AML.M0033": "Input and Output Validation for AI Agent Components" },
  "gaps": [ { "id": "AML.M0033", "techniques": ["AML.T0051.001"] } ],
  "unmitigated_techniques": [],
  "mitigation_counts": { "in_scope": 9, "with_area": 4, "without_area": 5 },
  "recommended_areas": ["audit-logging", "input-validation"]
}
```

- `entry_points`: one entry per final trait that appears in the entry-point file, trait ascending.
- In-scope techniques: union over entry points. `entry_traits` ascending. Sorted with `compareTechniques`. `techniques` holds the first `top` (default 10, allowed 1 to 25).
- `mitigations` per technique: `mitigationsForTechnique` (MITRE's direct links only), each with `areas` from `mitigationAreas()` (ascending) and `recommended` true when the area is in `recommended_areas`.
- `gaps`, `unmitigated_techniques` and `mitigation_counts` are computed over **all** in-scope techniques, not only the shown ones. A gap is a mitigation that MITRE links directly to at least one in-scope technique and that no area cites; `techniques` lists those in-scope ids ascending; gaps sort by number of techniques descending, then id. `unmitigated_techniques` are in-scope ids that appear in no mitigation's `mitigates` list. Every (technique, mitigation) pair in the output is therefore one of MITRE's 494 links.
- `mitigation_names` covers every mitigation id present in `techniques[].mitigations` and `gaps`.
- `redteam` appears only with `--redteam` (S5.5).

### S5.4 Text output (plain markdown, no color)

```
# Aigis threat model (MITRE ATLAS v2026.10)

> <DISCLAIMER>
> This is a starting list from your traits, not proof of coverage. Method: `aigis template threat-model`.

Traits (3): accepts-user-input, uses-llm, uses-rag
Uncertain traits (1, marked ⚠): is-agentic
Missing a trait? Rerun with --traits (see `aigis traits`).

## Entry points (2)

- accepts-user-input: User-supplied prompts and files (3 techniques)
- ⚠ is-agentic: Tools and actions the model can invoke (5 techniques)

## Techniques (showing 8 of 8; Realized first, then by number of MITRE case studies)

1. AML.T0053 AI Agent Tool Invocation [Demonstrated] | tactic: Execution, Privilege Escalation, Lateral Movement | entry: is-agentic | case studies: 18
   - AML.M0020 Generative AI Guardrails -> input-validation, rag-security (not in your brief)
   - AML.M0029 Human In-the-Loop for AI Agent Actions -> human-oversight
   - AML.M0030 Restrict AI Agent Tool Invocation on Untrusted Data -> no Aigis area
   - +10 more mitigations (use --json)

## Gaps: mitigations MITRE links to these techniques that no Aigis area implements (5)

- AML.M0030 Restrict AI Agent Tool Invocation on Untrusted Data (MITRE links it to AML.T0053)
- +1 more (use --json)

## Next

- Fetch the areas named above with `aigis get <area>`. "(not in your brief)" means classify did not recommend that area for these traits.
- Fill in the method: `aigis template threat-model`.
- Test-case stubs: rerun with `--redteam`.
- Rerun when you add tools, write access, memory or a data source, before launch, and after an incident.
```

- The "Uncertain traits" line appears only when there are any.
- Per technique: at most 4 mitigation lines, those with an area first (id ascending), then those without; then `+N more mitigations (use --json)` when truncated. A technique with none prints `   - No mitigation listed by MITRE for this technique.` (The example above is illustrative; real rows come from the catalog and the approved labels.)
- Gaps: at most 8 lines, then `+N more (use --json)`. With no gaps: `- None for these techniques.`
- The `--redteam` line in Next is printed only when the flag was not passed and AC19 shipped.
- Caps: at most 7,000 characters at the default top, at most 16,000 at `--top 25`. JSON: at most 20,000 and 45,000.

### S5.5 Red-team stubs (SHOULD, AC19)

For the first `min(5, techniques_shown)` techniques:
```json
{ "id": "RT-01", "technique": "AML.T0051.001", "name": "LLM Prompt Injection: Indirect", "maturity": "Realized", "tactics": ["Execution"],
  "entry_point": { "trait": "uses-rag", "surface": "Retrieved documents and knowledge-base content" },
  "attempt": "TODO: write the concrete attack input for this system through this entry point.",
  "expected_defenses": [ { "mitigation": "AML.M0020", "areas": ["input-validation"] } ],
  "pass_criteria": "Blocked or contained, no unauthorized tool call or data leaves the system, and the attempt appears in the audit log.",
  "rerun_when": "Tools, write access, memory, data sources or the model change." }
```
`entry_point` is the first entry trait alphabetically. `expected_defenses` lists only mitigations that have an area. Text: a `## Red-team test stubs (<n>)` section before `## Next`, five lines per stub. Adds at most 4,000 characters. No attack payloads are shipped.

### S5.6 Errors and edges

| Case | stdout | stderr | exit |
|---|---|---|---|
| No description and no `--traits`, or description empty after normalization and no `--traits` | empty | `Provide --traits, a quoted description, or both.` plus two example lines | 1 |
| Unknown trait in `--traits` | empty | `Unknown traits: <list>. Run "aigis traits" to see available traits.` | 1 |
| Description resolves no traits and no `--traits` | empty | `No traits resolved from description. Pass --traits <list> (run "aigis traits" to see them).` | 1 |
| `--top` not an integer from 1 to 25 | empty | `--top must be an integer from 1 to 25. The full catalog is at https://atlas.mitre.org.` | 1 |
| Traits valid but none has an entry point (for example `is-internal`) | full output with `techniques: []`, `gaps: []`; text says `No ATLAS entry points are mapped for these traits.` under Entry points | empty | 0 |
| `atlas.json` missing, not valid JSON or lacking a top-level key, or `source.sha256` / `source.version` not equal to PINNED | empty | `ATLAS catalog unavailable: catalog <missing|corrupt|pin-mismatch>. Reinstall the aigis package.` | 2 |
| `atlas-entry-points.json` missing; not valid JSON, lacking `entry_points`, naming an unknown trait or a technique id not in the catalog; or `atlas_version` not equal to PINNED.version | empty | `ATLAS catalog unavailable: entry-points <missing|corrupt|pin-mismatch>. Reinstall the aigis package.` | 2 |
| Either of the two rows above with `--json` | empty (no partial JSON) | same line | 2 |
| stdout is a pipe or file | same bytes as in a terminal; JSON only with `--json` | | |
| `--redteam` with zero techniques | `redteam: []`; text section omitted | | 0 |

### S5.7 classify text (SHOULD, AC21)

In `bin/aigis.js`, the human-readable classify output changes its last controls line to `Controls: <o> OWASP, <n> NIST, <i> ISO, <a> ATLAS mitigations` and prints, after it, `Threat model (MITRE ATLAS):`, `  <atlas.threats_command>` and `  <DISCLAIMER>`. JSON mode is unaffected. Skip both when `result.atlas` is absent.

## S6. Core skill, template, README, changelog (node N6)

Files: `content/skills/core.md`, `content/templates/threat-model.md`, `content/index/audit-scan.md` (plus mirrors), `README.md`, `cli-python/README.md`, `CHANGELOG.md` (new), `CONTRIBUTING.md`, `IMPROVEMENTS.md` (new).

### S6.1 `content/skills/core.md` (at most 5,650 characters in total; rev 16:00, AC12 and AC32)

Five edits: item 1 is below, items 2 to 5 are here. Exact text, because the budget is measured on it.

2. In "The workflow (build a new feature)", new step 5: `5. **Threat model.** Follow "Threat modeling (MITRE ATLAS)" below.`
3. In "The workflow (audit an existing project)", new step 5: `5. Threat model the project: follow "Threat modeling (MITRE ATLAS)" below.`
4. A new section placed after "How to read `aigis verify <area> --auto` output" and before "How to pick traits":

```
## Threat modeling (MITRE ATLAS)

Run this yourself, without being asked, when you: build a new AI feature; add tools, write access, memory or a new data source; prepare a launch; audit an existing project; respond to an incident.

1. Derive the traits from the codebase and the user's request (the same traits you give classify).
2. `aigis threats --traits <traits>`. It lists attacker techniques for this system's entry points (Realized first), the mitigations MITRE links to each, the Aigis area that implements them, and gaps. If you cannot name traits, fall back to `aigis threats "<description>"`.
3. For every area it names: `aigis get <area>`, implement it, then `aigis verify <area> --auto .`.
4. For every gap (a mitigation no Aigis area implements): tell the user it is not covered and propose a control. Never report a gap as handled.
5. Rerun when tools, permissions, memory or data sources change.
```

5. New line in "Available commands": ``- `aigis threats --traits <list>` (or `"<description>"`): ATLAS threat model: techniques, MITRE mitigations, gaps (`--json` for scripts)``


1. After sentence 1 of the intro (unchanged), add: ` Areas also map to MITRE ATLAS mitigations. <DISCLAIMER>`
Nothing else changes. The resolver block is not part of this file. The file does not mention `--redteam` or Python, so it is independent of every cut decision and is never touched after the draft pass. Measured growth of the five edits: 1,377 characters (185 + 67 + 75 + 913 + 137), giving 5,557; cap 5,650. `aigis init` writes this file into the rules or skill file of every supported IDE, so the section reaches the agent without any change to `lib/init.js`.

### S6.2 `content/templates/threat-model.md` (at most 4,500 characters)

A fill-in document, frontmatter in the same shape as the other templates. Sections: (1) Draw the system: a table of every place text gets in (users, emails, documents, tickets, tool outputs, retrieved content) and everything the AI can do (tools, write access, who sees output); (2) Walk the tactics: a 16-row checklist with the tactic names in matrix order and the question "could an attacker do this here?"; (3) Prioritize: Realized first, then impact, with a pointer to `aigis threats`; (4) Pick defenses and record gaps: columns mitigation, Aigis area, status, accepted or planned; (5) Red-team: one test case per top technique from `aigis threats` (entry point, attempt, expected defense, pass criteria), with result and date. The template does not mention `--redteam`, so it is independent of the AC19 cut; a "Rerun when" list (new tools, write access, memory, data source, before launch, after an incident); the DISCLAIMER. No technique list, no descriptions copied from ATLAS.

### S6.3 README (same edits in `README.md` and `cli-python/README.md`; no em dash in any new line)

- Intro sentence: append `, with threat modeling from MITRE ATLAS`.
- New section `## What's new in v3.0` above v2.1: ATLAS mitigations cited by classify, verify, report and build; `aigis threats`; `aigis template threat-model`; pinned ATLAS v2026.10 data, offline.
- New section `## Threat modeling with MITRE ATLAS` after "What's new":
  - `OWASP says what can go wrong. MITRE ATLAS says how an attacker does it. NIST AI RMF says how you govern it.`
  - A code block with `aigis threats --traits uses-llm,uses-rag,is-agentic` and `aigis threats "<description>"`, and one sentence saying `--traits` is the reliable path and the description path only finds traits the resolver recognizes.
  - What you get: techniques for your entry points with Realized first, the mitigations MITRE links to each, the Aigis area that implements each mitigation, the gaps where no Aigis area exists yet. `--redteam` for stubs, `--json` for scripts.
  - When: designing an AI feature; adding a capability (tools, write access, memory, a new data source); before launch; after an incident.
  - What ships: `a pinned subset of ATLAS v2026.10 (16 tactics, 221 techniques, 44 mitigations, counts from 77 case studies). No network calls. Aigis areas currently map to <N> of the 44 mitigations.` N is the number of distinct mitigation ids in the gold file. `The mapping from areas to mitigations is ours. The links from mitigations to techniques are MITRE's.`
  - Limits: the DISCLAIMER verbatim, then `A cited mitigation means the area implements part of it. The technique list is a starting point based on your traits, not proof of coverage.`
- CLI reference: add `aigis threats --traits <list>`, `aigis threats "<description>" --redteam`, `aigis template threat-model`.
- "Honest about what this isn't": add `- **Not a penetration test.** \`aigis threats\` lists known techniques for your traits. It does not attack or test your system.`
- License: `MIT. Bundles a subset of MITRE ATLAS data under Apache-2.0; see \`content/index/atlas-NOTICE.md\`.`
- No new benchmark or performance claim.

### S6.4 Python note (only if AC20 is cut)

Add to both READMEs, under the new section: `Python package note: in 3.0.0 \`aigis threats\` and the ATLAS fields in command output are in the npm package only.` If AC20 ships, this sentence must not be present.

### S6.5 Other docs

- `CHANGELOG.md`: `## 3.0.0` with Added (catalog, labels, surfaces, `threats`, template), Unchanged (routing, traits, triggers, existing citations), Notes (pinned source and sha256, Apache-2.0 notice, limits).
- `CONTRIBUTING.md`: a short "Updating MITRE ATLAS" section (download the release file, update the pinned sha256, run the generator, re-approve mappings).
- `IMPROVEMENTS.md`: backlog with evidence: showing a parent technique's mitigations next to its sub-techniques, clearly labeled as inferred (124 such links; needs its own approval); new area for agent tool safety (AML.M0026, M0027, M0028, M0030, M0032, M0033, M0037, M0038); memory hardening (AML.M0031); supply-chain depth (AML.M0011, M0013, M0014, M0016, M0023); surface traits, including the three entry points removed from the map in review round 2 because no current trait implies their precondition (agent memory AML.T0080.000, client-side rendering AML.T0077, conversation context AML.T0085.002) the area link removed for the same kind of reason (human-oversight to AML.M0028), and the entries removed in review round 3 (generates-code to AML.T0060, a resource-development technique the labeling protocol skips; all three is-multimodal entries, because the trait also covers generation-only systems while the techniques need multimodal input); resolver recall on prose (0.48 on the v2 set through the CLI); `threats --confirm/--reject`; Python parity if cut; `aigis traits` prints 22 but there are 23; README benchmark label.

### S6.6 Reconcile pass (20:30 to 20:45, after every cut decision is final)

N6 writes the draft for the state "every SHOULD shipped". At 20:30 the orchestrator gives N6 the final state of AC19, AC20, AC21, AC22, AC30, the fallbacks of GOALS (memory step, one area only) and the approved `gold/new-areas.json`, and N6 applies only these fixed edits, in `README.md`, `cli-python/README.md`, `CHANGELOG.md` and `IMPROVEMENTS.md`:

| If cut | Edit |
|---|---|
| AC19 red-team stubs | Remove every mention of `--redteam` from both READMEs and the CHANGELOG (the sentence "`--redteam` for stubs" and the CLI reference line); add the item to IMPROVEMENTS. |
| AC20 Python port | Add the S6.4 note to both READMEs; add a CHANGELOG note; add the item to IMPROVEMENTS. |
| AC21 classify text line, AC22 `--list` pointer | Remove them from the CHANGELOG "Added" list if mentioned; no README change. |

Then rerun T-DOC-01 to T-DOC-08. If nothing was cut the pass is a no-op and only the tests run. `content/` is not edited in this pass.

## SPY. Python port (node PY, optional, AC20)

This section is pass 2 of node PY (optional). Pass 1 (routing parity, S7.6) is required and is tagged when approved. End states (GRAPH.yaml): `shipped` or `cut_complete`. A partial port is never merged. In `cut_complete` the tree has no `cli-python/aigis_cli/atlas.py` or `threats.py`, `report.py`, `build.py` and `cli.py` equal the base commit, and `classify.py` and `auto_verify.py` equal the pass-1 tag.


Files: `cli-python/aigis_cli/atlas.py`, `threats.py` (new), `classify.py`, `auto_verify.py`, `report.py`, `build.py`, `cli.py`. Same behavior, strings, key order and exit codes as S2, S4, S5. Run from source as `python3 -c "from aigis_cli.cli import cli; cli()" <args>` with cwd `cli-python`. JSON output must be equal to Node's on the parity inputs in TESTPLAN (compared as parsed JSON, plus byte comparison for `threats` text). MUST regardless of the port (AC17): existing Python commands keep working with the new content.

## SINT. Integration (node INT)

1. Merge in graph order: N1, N2, N3, N4, N5, PY (only in end state `shipped`), N6 (after its reconcile pass). Run `npm test` after each merge.
2. Check the mirror: `node scripts/check-content-sync.js`. If it fails, the node that owns the differing file re-syncs it; INT does not edit it.
3. Check the version: T-REL-01 green (N5 set all five strings).
4. `node scripts/build-atlas-index.js --source /tmp/atlas-src/ATLAS-2026.10.yaml --check` must print `OK`.
5. End-to-end journeys (TESTPLAN E2E), evals on dev and held-out (EVALS), GPT-5.6 Sol review of the full diff, release checklist items 1 to 4 of BUILD-SYSTEM §12.
INT owns no product file and writes no product code. Any fix goes back to the owning node.
---

## S6.7 Launch docs (node N6; AC31; added 15:45)

Additions to S6.3, same rules (both READMEs identical, no em dash in new lines, numbers computed):
- Directly under the title tagline, the launch line: `Aigis now understands how attackers attack AI systems and helps your agent build defenses against them.`
- The section is `## What's new in v3.0` and adds, first in its list: the two new areas by id and one phrase each; `aigis classify` now recommends them when a system is agentic (`is-agentic`); `3.0 is additive: no command, flag or JSON key was removed or renamed.`
- One sentence with counts, both computed from the repo by T-DOC-09: number of area files in `content/skills/areas/` and number of checklists in `content/verify/`.
- In "Threat modeling with MITRE ATLAS": `Aigis areas currently map to <N> of the 44 mitigations.` now reflects the final approved gold including the new areas (the reconcile pass sets N).
- CHANGELOG `## 3.0.0`, first line: `Additive release. Nothing was removed or renamed.` Then "Changed for agentic projects": classify, build, audit and report now include `agent-permissions` and `agent-tool-safety` when `is-agentic` is set; briefs for those projects are larger by the size of the two areas; the effect on what coding agents implement has not been measured yet (agent evals are a later milestone).
- IMPROVEMENTS additions: EU AI Act extensions for the new areas; `--tight` and single-trait areas; no-deletion baseline entries for the new areas; anything cut under GOALS "What is cut first".

## S7. New areas (nodes NA1, NA2, NV, PY pass 1; added 15:45)

### S7.0 Common format and rules (NA1, NA2)

Model: `content/skills/areas/fallback-patterns.md` and `input-validation.md` (procedure format), not the older pattern format.

```
---
id: <area-id>
title: <title from S7.1 / S7.2>
controls:
  owasp: []
  nist: []
  iso42001: []
  atlas: []
min_risk_tier: all
system_traits: [is-agentic]
---

<one paragraph: what this protects, and that it applies when the model can call tools or act with someone's permissions>

## Common incomplete implementations
<at least 4 numbered failure modes; each ends by naming the step that prevents it>

## Implementation procedure
### Step N — <exact title from the table below>          (append " ⚠ CRITICAL" where the table says so)
**What to do.** <imperative, concrete, with Python and JavaScript code where code helps>
**Verification checkpoint.** <one concrete check: a grep, a test to run, an observable response>

## Complete working example
<one Python module, then one JavaScript module, each self-contained>

## What this does not cover
## Related patterns
```

Rules:
1. The author pass leaves the four `controls` arrays empty. The label pass (S7.5) fills them from approved gold. The body never names a framework id.
2. Enforcement is outside the model: in the tool layer, gateway or dispatcher. Deny by default. Fail closed. Nothing relies on prompt text for enforcement, and the area says so.
3. Each step that has a target sentence must do what that sentence says for the object it names. The maker reads the full mitigation text in `/tmp/atlas-src/ATLAS-2026.10.yaml` (data only). If a step cannot honestly do it, the maker reports that instead of approximating; the link is then not claimed.
4. Code uses the identifiers of the S7.3 contract so the auto-verify rules match the area's own example.
5. At most 12,000 characters per file. No attack payloads beyond a one-line benign marker string in a test. No claim to prevent prompt injection: the area limits what an injection can do.
6. Cross-reference, do not repeat: human approval is `human-oversight`; logging is `audit-logging`; user-prompt injection detection is `input-validation`; generic output encoding is `output-sanitization`.

### S7.1 `agent-permissions` (NA1). Title: `Agent identity, tool permissions and authority limits`

| Step | Exact title | Target MITRE sentence (design brief; the citation still needs gold approval) |
|---|---|---|
| 1 | `Step 1 — Declare each agent identity as service or user-delegated ⚠ CRITICAL` | Scoping for AML.M0026 ("service AI agents--agents using independently assigned service or workload permissions") and AML.M0027 (user-delegated agents) |
| 2 | `Step 2 — Bind every service identity to an explicit list of authorized workflows` | AML.M0026: "Limit service AI agents ... to explicitly authorized workflows." |
| 3 | `Step 3 — Cap a delegated agent at the intersection of the user's permissions and the task scope` | AML.M0027: "The user's permissions establish an upper bound" and "the agent receives only the access required for its designated tasks" |
| 4 | `Step 4 — Authorize every tool call per caller inside the tool layer ⚠ CRITICAL` | AML.M0028: "Limit AI agent tool access to each caller's authorized, task-required operations and resources, including when tools are shared across agents, users, or tenants." and "Enforce controls outside the model" |
| 5 | `Step 5 — Fix the maximum authority before the run and block self-granting` | AML.M0037: "The maximum authority available to the agent should be explicitly granted prior to runtime." |
| 6 | `Step 6 — Register, attribute and expire every external resource the agent creates` | AML.M0043: "treating those resources as attributable, lifecycle-managed assets" |
| 7 | `Step 7 — Prove the denials with negative tests` | (no target; makes steps 2 to 6 checkable) |

Content notes: step 4 must be caller-specific (user, tenant, agent identity in the decision), not a static tool allowlist; review round 2 rejected the allowlist reading of AML.M0028. Step 5 lists what counts as self-granting: creating credentials, API keys, roles or service accounts, editing the agent's own allowlist or scopes, without an out-of-band human grant. Step 6 covers cloud resources, accounts, tokens, webhooks, scheduled jobs, with owner, task id and TTL, and a sweep that revokes on task end or expiry. Common incomplete implementations must include: the agent runs with the developer's or a shared admin credential; authorization written into the system prompt; a shared tool that checks the tool's own privilege instead of the caller's; resources that outlive the task.

### S7.2 `agent-tool-safety` (NA2). Title: `Tool invocation safety, tool input and output validation, scope drift`

| Step | Exact title | Target MITRE sentence |
|---|---|---|
| 1 | `Step 1 — Label every item entering the model context as trusted or untrusted ⚠ CRITICAL` | Precondition for AML.M0030 ("when untrusted data enters the LLM's context") |
| 2 | `Step 2 — Restrict tool invocation while untrusted data is in context ⚠ CRITICAL` | AML.M0030: "It is recommended that tool invocation be restricted or limited when untrusted data enters the LLM's context" |
| 3 | `Step 3 — Validate tool arguments against a schema before execution` | AML.M0033: "Validation includes enforcing a common data format, schema validation" (inputs of tools) |
| 4 | `Step 4 — Validate and sanitize tool outputs and retrieved data before they re-enter the context` | AML.M0033: "checks for sensitive or prohibited information leakage, and data sanitization" (outputs of tools and data sources) |
| 5 | `Step 5 — Check each planned action against the authorized objective` | AML.M0038: "Continuously evaluate whether an AI Agent's planned actions remain consistent with its current authorized objective throughout execution." |
| 6 | `Step 6 — If the agent has persistent memory: harden what gets written and recalled` | AML.M0031 Memory Hardening ("protects persistent state used by AI agents") |
| 7 | `Step 7 — Prove it with injection and drift tests` | (no target) |

Content notes: untrusted means tool results, retrieved documents, emails, web pages, file contents and anything another agent wrote; the label travels with the item for the whole turn. Step 2 gives two allowed restrictions: drop to tools without side effects, or require human approval for side-effect tools (pointing to `human-oversight`); logging alone is not a restriction. Step 5 records the objective and allowed action classes at task start and stops and escalates on mismatch. Step 6 opens with "Skip this step if the agent keeps no state between sessions." and covers: attribute each write (source and trust label), never store untrusted content as instructions, isolate per user or tenant, expiry and rollback. Common incomplete implementations must include: the trust label is computed but only logged; validation of tool arguments but not of tool results; the same tool set regardless of what is in context; memory writes copied straight from tool output.

### S7.3 Verify assets (node NV; AC26, AC30)

Checklists `content/verify/checklist-<area>.md`: same frontmatter and table as `checklist-human-oversight.md`; one row per step (V1 to V7, in step order) plus V8 for `agent-permissions`; the Control column is the step reference (`S1` to `S7`), never a framework id (ids arrive only through approved gold).

Contract between the area examples (NA1, NA2) and the rules (NV). Identifiers are matched in snake_case and camelCase. NV may add alternates but may not drop these.

| Area | Check | Step | Kind | Signal |
|---|---|---|---|---|
| agent-permissions | V1 | S1 | auto | `agent_identity` / `agentIdentity` / `AGENT_IDENTITY` |
| | V2 | S2 | auto | `authorized_workflows` / `authorizedWorkflows` / `AUTHORIZED_WORKFLOWS` |
| | V3 | S3 | auto | `effective_permissions` / `effectivePermissions` |
| | V4 | S4 | auto, plus overclaim `wildcard_tool_scope` (`also_auto: V4`) | `authorize_tool_call` / `authorizeToolCall` |
| | V5 | S5 | auto | `max_authority` / `maxAuthority` / `MAX_AUTHORITY` |
| | V6 | S6 | auto | `register_agent_resource` / `registerAgentResource` |
| | V7 | S7 | judgment | whether the negative tests exist and exercise real denials |
| | V8 | S4 | judgment | whether authorization runs in the tool layer or gateway rather than in prompt text |
| agent-tool-safety | V1 | S1 | auto | `trust_level` / `trustLevel` / `TrustLevel` |
| | V2 | S2 | auto, plus overclaim `untrusted_gate_log_only` (`also_auto: V2`) if AC30 ships, else also a judgment line | `gate_tool_call` / `gateToolCall` |
| | V3 | S3 | auto | `validate_tool_args` / `validateToolArgs` |
| | V4 | S4 | auto | `sanitize_tool_output` / `sanitizeToolOutput` / `validate_tool_output` / `validateToolOutput` |
| | V5 | S5 | auto | `check_scope_drift` / `checkScopeDrift` |
| | V6 | S6 | judgment | applies only with persistent memory; whether writes are attributed and validated |
| | V7 | S7 | judgment | whether the injection and drift tests exist and fail when the control is removed |

Recognizers in `lib/special-recognizers.js`, same signature and return shape as the existing four, registered in `REGISTRY`:
- `wildcard_tool_scope` (MUST): flagged when a scanned source file grants everything: a string literal `"*"` or `'*'` on a line that also mentions `scope`, `tool`, `allow` or `permission` (any case), or `allow_all` / `allowAll` / `ALLOW_ALL` set to a true value. Evidence: file, line, snippet (at most 3). Raised only when V4 passes (existing `also_auto` behavior).
- `untrusted_gate_log_only` (SHOULD, AC30): modeled on `injection_log_only`. Flagged when a block that tests the trust label (`trust_level`, `trustLevel`, `untrusted`) contains a logging call and, within the next 8 lines, no blocking construct (`raise`, `throw`, `return` of a denial, `require_approval` / `requireApproval`).

A regex that a comment or an unused constant would satisfy is not acceptable for a check the checklist words as behavior; such a check is JUDGMENT instead (rubric C-11).

### S7.4 Index files (node NV)

- `content/index/taxonomy.md`: the `is-agentic` row lists the two new areas after the existing ones.
- `content/index/context-rules.json`: no entry is needed (a file without rules is returned whole for every `--context`). Edit only if T-NA-07 fails.
- If `content/index/frameworks.md` or `guardrails.json` turn out to enumerate areas per control, NV reports it; they are not edited tonight.

### S7.5 Label pass (NA1, NA2; after GATE A2)

Replace the four empty arrays with the `include` rows of `build/atlas/gold/new-areas.json` for that area: `owasp`, `nist`, `iso42001` in the id formats of `docs/frontmatter-schema.md`, `atlas` ascending. No `eu_ai_act` key. No other byte changes. If a framework has no approved row its array stays empty. Then sync the mirror and rerun the area tests.

### S7.6 Python routing parity (node PY, pass 1; AC29)

In `cli-python/aigis_cli/classify.py`: the same `TRAIT_FILES['is-agentic']` addition and the same two-area frontmatter fallback for owasp, nist, iso as S4.6. In `auto_verify.py`: `wildcard_tool_scope` (and `untrusted_gate_log_only` if AC30 shipped in Node) in `_SPECIAL_REGISTRY`, same flags and evidence as Node. Nothing else in the Python package changes in this pass. Tag the commit.
---

## S6.8 Audit flow (node N6; AC32c; added 16:00)

File: `content/index/audit-scan.md` (what `aigis audit --scan` prints) plus its mirror. One insertion, nothing else changes: a new H2 placed after the `## PHASE 3: TRAIT SUMMARY` section and before `## PHASE 4: SCOPED CONTROL EVALUATION (handoff)`.

```
## PHASE 3B: THREAT MODEL (MITRE ATLAS)

With the traits you just detected, run `aigis threats --traits <detected-traits>`. It lists attacker techniques for this system's entry points (Realized first), the mitigations MITRE links to each, the Aigis area that implements them, and gaps. Add every area it names to the audit scope. Report every gap (a mitigation no Aigis area implements) to the user as not covered. If you could not detect traits, fall back to `aigis threats "<description>"`.

<DISCLAIMER>

```
At most 800 characters added. The sentence in the file's introduction that counts the phases is not edited.
