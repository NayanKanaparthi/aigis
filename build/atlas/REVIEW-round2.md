### Round 1 findings

- **ATLAS-01 — CLOSED:** `GOALS.md` AC14 and `TESTPLAN.md` AC14 map now require/assert the disclaimer on every ATLAS-rendering surface.
- **ATLAS-02 — CLOSED:** `SPEC.md` D6/S5.3–S5.4 restrict output to MITRE’s 494 direct links; `TESTPLAN.md` T-THR-02 verifies no inheritance.
- **ATLAS-03 — CLOSED:** `GRAPH.yaml` N5/N6/PY/INT gives `bin/aigis.js` one owner, makes PY optional, and adds the post-cut reconcile pass.
- **ATLAS-04 — CLOSED:** `SPEC.md` S1.3 pins both complete texts by byte count/hash; `TESTPLAN.md` T-CAT-09 checks exact embedded spans.
- **ATLAS-05 — CLOSED:** `TESTPLAN.md` T-FS-01..05 and T-THR-19..20 exercise command-level missing, corrupt, and pin-mismatch behavior.

### 10-item checklist

1. **No — AC/test completeness:** `GOALS.md` AC14 bans “risk score” everywhere, but `TESTPLAN.md` T-DOC-06 omits it and T-THR-15 checks only threats text.
2. **Yes — consistency/verifiability:** `SPEC.md` S0/D6/S1.3 is consistent with the pinned YAML and verified notice/license hashes.
3. **Yes — CLI behavior:** `SPEC.md` S5.6 and T-THR-05..20 cover all stated errors and edges.
4. **Yes — eval rigor:** `EVALS.md` §§2–7 defines oracle, metrics, guards, held-out data, and kill criteria.
5. **Yes — graph integrity:** `GRAPH.yaml` nodes/streams now have single ownership and optional-PY semantics.
6. **No — citation/mapping honesty:** `gold/APPROVAL-REQUEST.md` contains mappings whose cited trait/area does not implement the ATLAS precondition.
7. **Yes — compatibility/scope:** `GOALS.md` AC15–AC20 fixes additive compatibility, versioning, and cut states.
8. **Yes — documentation:** `SPEC.md` S6 covers both READMEs, skill, template, schema, changelog, contributing, and backlog.
9. **Yes — risks:** `GOALS.md` “Top risks” provides concrete mitigation and escalation/cut rules.
10. **Yes — schedule reconciliation:** `GRAPH.yaml` N6 reconcile runs after final cuts and before freeze.

### New findings

- **NEW-B1:** `EVALS.md` §5.1 requires the owner to see disagreements, quotes, and evidence, but `gold/APPROVAL-REQUEST.md` Mapping B provides none; the gold hard gate is not approvable as specified.
- **NEW-M1:** Mapping B includes `is-agentic → AML.T0080.000`, `uses-llm → AML.T0077`, and `processes-pii → AML.T0085.002`; the pinned YAML respectively requires memory, client rendering, and conversation context/memory, none implied by those taxonomy traits. Mapping A’s `human-oversight → AML.M0028` similarly substitutes a static tool allowlist for MITRE’s caller-specific authorization.
- **NEW-M2:** AC14’s global “risk score” prohibition lacks a comprehensive test, as noted in checklist item 1.

Open blockers: 1. Open majors: 2.