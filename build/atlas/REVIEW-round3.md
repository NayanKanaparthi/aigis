### Round-2 findings

- **NEW-B1 — PARTIAL:** `APPROVAL-DETAIL.md` adds evidence, but 14 Mapping B `atlas_quote` values are ellipsized and are not normalized substrings of the pinned YAML; five rejected Mapping A proposals named in `APPROVAL-REQUEST.md` are also absent from both candidate and detail.
- **NEW-M1 — CLOSED:** The three unsupported trait mappings and `human-oversight → AML.M0028` are now excluded in the candidate gold.
- **NEW-M2 — CLOSED:** T-HON-01 now applies one risk-score matcher across static content and at least 30 command outputs.

### Checklist

1. **Yes — AC/test completeness:** Every acceptance criterion now has tests, including the widened AC14 honesty scan.
2. **No — consistency/verifiability:** The current gold cannot satisfy EVALS §5.1’s verbatim-quote and one-row-per-proposal rules.
3. **Yes — CLI behavior:** Errors, edge cases, streams, exits, and fail-soft behavior are specified and tested.
4. **Yes — eval rigor:** Metrics, oracle, held-out set, guards, determinism, and kill criteria remain concrete.
5. **Yes — graph integrity:** Ownership is singular, Python is optional, and integration dependencies are coherent.
6. **No — citation/mapping honesty:** Mapping B still contains entries contradicting its labeling protocol.
7. **Yes — compatibility/scope:** Changes remain additive with explicit SHOULD cut states.
8. **Yes — documentation:** All required user, schema, release, and backlog surfaces are assigned.
9. **Yes — risks:** The top risks retain actionable mitigation and escalation rules.
10. **Yes — schedule reconciliation:** Final cut decisions precede the N6 reconcile pass and freeze.

### New findings

- **New blocker:** None beyond partially open NEW-B1.
- **NEW-M3 — major:** Mapping B includes `generates-code → AML.T0060` despite EVALS §5.2 requiring resource-development techniques be skipped; the pinned YAML explicitly links T0060 to `AML.TA0003 Resource Development`. It also maps `is-multimodal`—which permits generation-only systems—to three techniques whose YAML descriptions require multimodal/input ingestion.

Open blockers: 1. Open majors: 1.