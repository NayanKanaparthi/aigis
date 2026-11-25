# Changelog

## 3.1.0

- Codex support. `aigis init codex` writes the Aigis instructions to `AGENTS.md`, the file Codex reads. If you already have an `AGENTS.md`, Aigis adds its section at the end and leaves your content as it is.
- Safer refresh. `aigis init <ide> --refresh` now replaces only the Aigis section of the file and keeps everything else you wrote, byte for byte. Before, it rewrote the whole file. If the Aigis section can't be found exactly once, refresh stops with an error and changes nothing. Files that contain only the Aigis section refresh exactly as before.

## 3.0.1

Documentation only. No change to commands, content or output.

- Benchmark corrected and extended. The real-agent benchmark now includes a no-Aigis baseline, and all runs were regraded blind on the complete code: no Aigis 43%, Aigis 2.1.1 75%, Aigis 3.0 90% of agent-safety defenses present. The 3.0.0 readme reported 51% and 80% from an earlier grading pass that left out each agent's edits to existing files. Details in BENCHMARKS.md.

## 3.0.0

Additive release. Nothing was removed or renamed.

Aigis now understands how attackers attack AI systems and helps your agent build defenses against them.

### Changed for agentic projects

`aigis classify`, `aigis build`, `aigis audit` and `aigis report` now include `agent-permissions` and `agent-tool-safety` when `is-agentic` is set. Briefs for those projects are larger by the size of the two areas. The effect on what coding agents implement has not been measured yet; agent evals are a later milestone.

### Added

- `agent-permissions`: agent identity, tool permissions and authority limits. Area procedure, verify checklist and auto-verify rules, including an overclaim check for wildcard tool scopes. Cites OWASP LLM01, LLM06 and LLM07, and ATLAS AML.M0026, M0027, M0028, M0037 and M0043.
- `agent-tool-safety`: tool invocation safety, validation of tool inputs and outputs, and scope drift. Area procedure, verify checklist and auto-verify rules, including an overclaim check for an untrusted-input gate that only logs. Cites OWASP LLM01 and LLM06, and ATLAS AML.M0020, M0029, M0030, M0031, M0033, M0037 and M0038.
- The two new areas have no NIST AI RMF, ISO/IEC 42001 or EU AI Act citations yet. Every citation they carry was approved by the owner before release.
- MITRE ATLAS catalog: `content/index/atlas.json`, generated from ATLAS v2026.10 by `scripts/build-atlas-index.js` (16 tactics, 221 techniques, 44 mitigations, 494 MITRE `mitigates` links, case-study counts from 77 case studies). Ids, names, maturity and links only, no descriptions.
- ATLAS labels: area frontmatter gains `controls.atlas`, the ATLAS mitigations each area helps implement (in part), on the 15 existing non-EU areas and the 2 new areas. Aigis areas currently map to 21 of the 44 mitigations. Every label was reviewed and approved before it shipped. EU AI Act areas carry no ATLAS label.
- Entry-point map: `content/index/atlas-entry-points.json` links 9 traits to 29 techniques.
- ATLAS citations in command output: `aigis classify` (JSON `controls.atlas` and an `atlas` block, and an ATLAS count plus a threat model pointer in text output), `aigis verify --auto` (text and JSON), `aigis report` (markdown and JSON), `aigis build` (a Threat model section in the brief and `meta.atlas`). `aigis build --list` ends with a `Threat model:` pointer.
- `aigis threats`: a threat model from `--traits` or a description. It lists attacker techniques for the system's entry points (Realized first, then by number of MITRE case studies), the mitigations MITRE links to each, the Aigis areas that help implement each mitigation (in part), and the gaps (mitigations with no mapped Aigis area). `--top <n>`, `--json`, and `--redteam` for red-team test stubs.
- `aigis template threat-model`: a fill-in threat model worksheet (draw the system, walk the 16 tactics, prioritize, pick defenses and record gaps, red-team).
- Agent instructions: the core skill that `aigis init` writes now instructs the agent to threat-model without being asked when it builds a new AI feature, adds tools, write access, memory or a new data source, prepares a launch, audits a project or responds to an incident. `aigis audit --scan` has a new Phase 3B for the threat model. Whether agents follow these instructions has not been measured yet.

### Fixed

These two bugs were present in 2.1.1 and are fixed in both the npm and Python packages.

- `aigis search --list` listed no areas. It read a directory that no longer exists since areas moved to `content/skills/areas/` in 2.0.
- `aigis audit --traits ...` crashed when a recommended area had no verify checklist. Such areas are now reported as "no checklist yet" and left out of the total-check denominator.

### Unchanged

- Routing for every trait set without `is-agentic`: the same areas, templates and risk tiers as 2.1.1.
- Traits and resolver triggers.
- The OWASP, NIST, ISO and EU AI Act citations and the bodies of the 19 existing areas.
- No command, flag or JSON key was removed or renamed. ATLAS fields are new keys next to the existing ones.

### Notes

- Pinned source: `mitre-atlas/atlas-data` release `v2026.10`, file `dist/v6/ATLAS-2026.10.yaml`, sha256 `ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d`. The generator refuses any other file. No network calls at run time.
- MITRE ATLAS data is Apache-2.0; see `content/index/atlas-NOTICE.md`. The mapping from areas to mitigations and the entry-point map are Aigis's own work, not MITRE's.
- MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.
- A cited mitigation means the area helps implement it (in part). The technique list is a starting point based on your traits, not proof of coverage. `aigis threats` does not attack or test your system.
- Mitigation links are MITRE's direct links only. A sub-technique does not inherit its parent's mitigations.
- If a catalog file is missing or broken, existing commands keep working and omit the ATLAS output; only `aigis threats` fails.
- Python package: `aigis threats` and the ATLAS fields in JSON output are in the Python package too, checked against the npm package on the parity test inputs. The ATLAS count and threat model pointer in the human-readable `aigis classify` output are in the npm package only.
- README: the v2.0 benchmark baseline is now labeled correctly as Aigis v1.0.3.
