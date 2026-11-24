# Improvements backlog

Known gaps and next steps, each with the evidence behind it. Nothing here has shipped. Items move to `CHANGELOG.md` when they do.

## MITRE ATLAS

- **Show a parent technique's mitigations next to its sub-techniques, labeled as inferred.** Aigis shows only MITRE's 494 direct `mitigates` links. Inheriting from the parent would add 124 links MITRE did not publish, so it needs its own label in the output and its own approval. Example of the cost today: AML.T0051.000 and AML.T0051.001 (prompt injection, direct and indirect) carry only AML.M0024, M0033 and M0035 directly, so guardrails (AML.M0020, linked to the parent AML.T0051) do not appear next to them.
- **Agent tool safety beyond 3.0.** 3.0 adds `agent-permissions` and `agent-tool-safety`. The mitigations proposed for agent tool safety were AML.M0026, M0027, M0028, M0030, M0032, M0033, M0037 and M0038; any of them not in the approved new-area labels stays a printed gap until an area implements it.
- **Memory hardening** (AML.M0031). Not implemented by any area; `agent-tool-safety` has a judgment check for memory writes only when the system has persistent memory.
- **Supply-chain depth** (AML.M0011, M0013, M0014, M0016, M0023). Mitigations a deeper supply-chain area could implement; any not in the approved labels stays a printed gap.
- **Surface traits.** Some entry points have no trait that implies their precondition, so they were removed from the entry-point map:
  - review round 2: agent memory (AML.T0080.000), client-side rendering (AML.T0077), conversation context (AML.T0085.002), and the area link from `human-oversight` to AML.M0028 for the same kind of reason;
  - review round 3: `generates-code` to AML.T0060 (a resource-development technique the labeling protocol skips), and all three `is-multimodal` entries, because the trait also covers generation-only systems while those techniques need multimodal input.
  New traits (for example agent memory, rendered output, multimodal input) would let these come back with approval.
- **Resolver recall on prose.** Through the CLI resolver, trait recall on the v2 benchmark descriptions is 0.48, so `aigis threats "<description>"` can look thin. `--traits` is the documented path. The README's v2 numbers were measured with an agent in the IDE, which is a different path.
- **`aigis threats --confirm/--reject`** to accept or drop uncertain traits without rerunning with `--traits`.
- **Python parity**, if the Python port of `aigis threats` and the ATLAS fields is cut from a release.

## New areas (3.0)

- **EU AI Act extensions** for `agent-permissions` and `agent-tool-safety`. Both ship without `eu_ai_act` citations.
- **`--tight` and single-trait areas.** `--tight` requires two trait matches per area. Check how it treats areas that a single trait such as `is-agentic` selects, and decide whether it should keep them.
- **No-deletion baseline entries** for the two new areas, so a later edit that drops a step or check is caught like it is for the existing areas.
- **Agent evals.** Whether coding agents implement the new areas, and whether they threat-model when the core skill instructs them to, has not been measured.
- Anything cut under "What is cut first" in the release plan is added here at the reconcile pass.

## Other

- **`aigis traits` prints 22 traits but there are 23.**
- **README benchmark label.** Fixed in 3.0: the v2.0 benchmark baseline is labeled Aigis v1.0.3 instead of "no Aigis".
