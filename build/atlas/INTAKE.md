# Intake: MITRE ATLAS in Aigis

Date: 2026-11-24. Requested by Nayan. Target: shipped tonight (stop times below).
Process: `.context/build-system/BUILD-SYSTEM.md` v0.4 in the Conductor workspace (outside this repo).

## The request

Bring MITRE ATLAS into Aigis as a framework. ATLAS is the attacker's view of AI systems: tactics (the attacker's goal at each stage), techniques (how), mitigations (defenses linked to the techniques they stop), case studies (real incidents broken into tactic/technique steps), and a maturity label per technique (Feasible, Demonstrated, Realized).

How it fits with what Aigis already cites: OWASP says what can go wrong, ATLAS says how an attacker does it, NIST is how you govern it.

Nayan's intended use of ATLAS, as a threat-modeling method:
1. Draw the system: every place text gets in (users, emails, documents, tickets, tool outputs) and everything the AI can do (tools, write access, who sees output).
2. Walk the tactics; for each stage ask whether an attacker could do it; go to the techniques for concrete versions.
3. Prioritize by maturity (Realized first) and impact.
4. Pick defenses from the linked mitigations; see the gaps.
5. Turn the top techniques into red-team test cases; rerun when the system changes.

When: designing a new AI feature; adding a capability (tools, write access, memory, a new data source); before launch; after an incident.

Limits Aigis must state honestly: ATLAS is a catalog, not a standard. Nobody is "ATLAS compliant". It doesn't score risk, and it doesn't cover bias or fairness.

## Verified source data (orchestrator, 2026-11-24)

- Repo: `mitre-atlas/atlas-data`, release tag `v2026.10`, released 2026-10-28. License Apache-2.0 (needs attribution/NOTICE if vendored into this MIT repo).
- File: `dist/v6/ATLAS-2026.10.yaml`, format-version 6.1.0, sha256 `ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d`. Local copy: `/tmp/atlas-src/ATLAS-2026.10.yaml`.
- Counts confirmed: 16 tactics, 221 techniques (92 are sub-techniques), 44 mitigations, 77 case studies. Maturity: 117 Realized, 78 Demonstrated, 26 Feasible.
- Mitigation→technique links are MITRE's own, in `relationships[*].mitigates` (all 44 mitigations have links). Example: AML.M0030 → T0053, T0086, T0101, T0143.
- Corrections to the request text: the 16th-tactic label is "AI Attack Adaptation" in 2026.10 (older `dist/ATLAS.yaml` is v5.6.0 and still says "AI Attack Staging"; do not use that file). AML.T0051.001 Indirect prompt injection is **Realized** in 2026.10. AML.M0024 is "AI Telemetry Logging and Monitoring". AML.T0010 is "Supply Chain Compromise".
- Note: `dist/ATLAS.yaml` at repo root is the legacy v5 format (170 techniques, 35 mitigations). Only the v6 2026.10 file is the source of truth.

## Current Aigis state

- v2.1.1, branch `new-york` off main. Readiness gate done: `npm test` (11 checks, ~0.35 s) green, commit 07ef537.
- Frameworks cited today: OWASP LLM Top 10, NIST AI RMF, ISO/IEC 42001, EU AI Act. Citations live in each area's frontmatter `controls:` block and in `lib/classify.js` FILE_CONTROLS; shown by classify, verify `--auto`, report and build.
- 19 areas, 15 verify checklists, auto-verify rules, 4 overclaim recognizers, 66 resolver triggers, 23 traits.

## Constraints that bite here

- No network at runtime: ATLAS data must be vendored, version-pinned, regenerated only by a dev-time script.
- Thin harness: never inline the catalog. The always-loaded core skill grows only with a stated budget. Brief caps hold.
- No silent loss of existing citations. Content parity with the Python package. Backward-compatible JSON.
- Tier R feature (adds a framework and citations): needs gold labels backed by the versioned primary source, with Nayan's approval of the mapping.

## Stop times (ET, today)

| Milestone | By |
|---|---|
| Plan reviewed, GATE A | 16:15 |
| Tests written and locked; baseline evals | 17:00 |
| Feature freeze | 20:30 |
| Integration, end-to-end, evals | 21:30 |
| GATE B | 22:00 |

Publishing needs `npm login` by Nayan (the npm token on this Mac is invalid: E401). PyPI config is present but unverified until upload. If either isn't fixed, tonight's outcome is a tagged release candidate.
