## Checklist

1. **No** — AC3, AC10, and AC14 contain requirements not exercised by their mapped tests.
2. **No** — AC14 contradicts SPEC S4, and the available license source cannot prove the required full license text.
3. **Yes** — SPEC S1.2/S5.6 define bad, empty, missing/corrupt, non-TTY, stdout/stderr, and exit behavior.
4. **Yes** — EVALS defines metrics, sourced gold approval, baseline, zero noise floor, targets, guards, held-out data, and kill criteria.
5. **No** — `bin/aigis.js` has two owners; optional PY is an unconditional integration dependency.
6. **No** — inherited mitigation links are presented as MITRE links without preserving provenance everywhere, undermining README/citation honesty.
7. **Yes** — additive compatibility, 2.2.0 minor bump, content parity, and optional Python CLI parity are decided.
8. **Yes** — README copies, core skill, template, schema docs, changelog, contributing guide, and improvements backlog are listed.
9. **Yes** — the top three risks each have specific mitigations and escalation/cut behavior.
10. **No** — Python is cut at 20:15, but conditional docs finish at 18:55 with no post-cut reconciliation node before freeze.

Pinned-data verification passed: SHA, 16 tactics, 221 techniques, 92 sub-techniques, 44 mitigations, 494 distinct links, 77 cases, 117/78/26 maturity, 53 techniques without direct mitigation, matrix order, and appendix totals. The specified pretty catalog projects to about 50.9 KB, within 64 KB.

## Findings

| id | severity | file+section | problem | concrete fix |
|---|---|---|---|---|
| ATLAS-01 | blocker | `GOALS.md` AC14; `SPEC.md` S4 | AC14 requires the exact disclaimer wherever command output presents ATLAS. Classify output, verify JSON/text, and report JSON do not contain it; tests also omit these checks. | Add the exact disclaimer to every ATLAS-bearing JSON/text surface and assert it in T-SUR-01..08, or explicitly narrow AC14 and justify the weaker honesty rule. |
| ATLAS-02 | blocker | `SPEC.md` D1/D6, S5.3–S5.4; `EVALS.md` EV-M3b | The YAML contains 494 explicit mitigation links. Parent inheritance creates 124 additional inferred links, for 618 effective pairs. `gaps[].techniques` drops `via`, while headings call them links MITRE makes to those techniques. | Prefer direct links only. Otherwise label inheritance as an Aigis inference, retain direct/parent provenance in gaps and counts, change all MITRE-link wording, and include it in gold approval. |
| ATLAS-03 | major | `GRAPH.yaml` N5, PY, INT; streams | `bin/aigis.js` is owned by N5 and INT. INT depends unconditionally on cuttable PY. N6 must encode AC19/AC20 cut outcomes before those outcomes are known. | Give each file one owner, model PY as optional/cut-complete, and add a post-cut N6 reconciliation step before freeze. |
| ATLAS-04 | major | `SPEC.md` S1.3; `TESTPLAN.md` T-CAT-09 | `/tmp/atlas-src/LICENSE` is a 551-byte notice, not the full Apache-2.0 terms; T-CAT-09 checks only a few substrings. AC3 can falsely pass. | Supply a canonical Apache-2.0 text with a pinned hash and test exact inclusion plus the upstream notice. |
| ATLAS-05 | major | `TESTPLAN.md` T-SUR/T-THR | No CLI test exercises missing/corrupt/pin-mismatched entry points or fail-soft behavior of classify, verify, report, and build. Helper tests do not establish command exits/output. | Add scratch-package CLI tests for every S5.6 failure and each D12 fail-soft command. |

**Open blockers: 2. Open majors: 3.**