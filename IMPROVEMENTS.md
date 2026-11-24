# Improvements backlog

Known gaps and next steps, each with the evidence behind it. Nothing here has shipped. Items move to `CHANGELOG.md` when they do.

## Trait detection and routing

- **Description-path trait recall is low. Fix the resolver.** Through the CLI resolver, `aigis threats "<description>"` and `aigis build "<description>"` find 0.514 of the expected traits on the dev set and 0.222 on the held-out set (3.0 integration evals). `--traits` is the documented path for now. The README's v2 numbers were measured with an agent in the IDE, which is a different path.
- **A `has-memory` trait.** Persistent agent memory has no trait, so the memory entry point (AML.T0080.000) was removed from the entry-point map in review round 2, and `agent-tool-safety` has to ask whether memory exists (its memory check is a judgment item). A trait would let the entry point come back and make the check routable.
- **Other surface traits.** Entry points removed because no current trait implies their precondition: client-side rendering (AML.T0077) and conversation context (AML.T0085.002) in review round 2; `generates-code` to AML.T0060 (a resource-development technique the labeling protocol skips) and all three `is-multimodal` entries (the trait also covers generation-only systems, while those techniques need multimodal input) in review round 3. Each needs a trait and a new approval.
- **`aigis threats --confirm/--reject`** to accept or drop uncertain traits without rerunning with `--traits`.
- **`aigis traits` prints 22 traits but there are 23.**

## MITRE ATLAS

- **Parent to sub-technique inheritance, as a labeled Aigis inference.** Aigis shows only MITRE's 494 direct `mitigates` links. Showing a parent technique's mitigations next to its sub-techniques would add 124 links MITRE did not publish, so the output must label them as Aigis's inference, and they need their own approval. Example of the cost today: AML.T0051.000 and AML.T0051.001 (prompt injection, direct and indirect) carry only AML.M0024, M0033 and M0035 directly, so guardrails (AML.M0020, linked to the parent AML.T0051) do not appear next to them.
- **Supply-chain depth** (AML.M0011, M0013, M0016, M0023). No Aigis area is mapped to these yet, so they stay printed gaps.

## Areas and checklists

- **Verify checklists for the four EU AI Act areas.** There are 21 areas and 17 checklists; the four `eu-ai-act-*` areas have none, so `aigis audit` reports them as "no checklist yet" and leaves them out of the denominator.
- **ISO/IEC 42001 citations for `agent-permissions` and `agent-tool-safety`** once the standard text is available to label against. Both ship with an empty `iso42001` list.
- **EU AI Act extensions** for the two new areas. Both ship without `eu_ai_act` citations.
- **`--tight` and single-trait areas.** `--tight` requires two trait matches per area. Check how it treats areas that a single trait such as `is-agentic` selects, and decide whether it should keep them.
- **Citations removed from the two new areas before 3.0.** The final audit found that the evidence did not support seven citations, so they were removed: OWASP LLM02 and LLM05 and NIST MEASURE 2.7 from both areas, and NIST MANAGE 2.4 from `agent-tool-safety`. Re-add each one only after the area earns it: the area must actually do what the source sentence requires (for example, LLM05 needs path checks that reject `..` after normalizing, LLM02 needs real PII redaction patterns, MEASURE 2.7 needs the documentation NIST asks for, MANAGE 2.4 needs the responsibility assignment), the quote must be a complete source sentence, and the row needs a new approval.
- **No-deletion baseline entries** for the two new areas, so a later edit that drops a step or check is caught like it is for the existing areas.

## Briefs

- **Agentic briefs that cross the 120k auto cap.** With the two new areas, the full brief for held-out description H3 (a coding agent that runs shell commands and merges its own changes) is 120,411 characters, over the 120,000 cap, so `aigis build` fell back to the compact brief. Options: trim the area bodies, raise the cap, or drop the largest optional sections first.

## Evals

- **L4 agent eval for unprompted threat modeling.** The core skill instructs the agent to run `aigis threats` without being asked, and `aigis audit --scan` has a threat model phase. Whether agents actually do it, and whether they implement the new areas, has not been measured.

## Python package

- **`aigis classify` text output.** The npm package prints the ATLAS count on the Controls line and a threat model pointer; the Python package does not yet. JSON output and `aigis threats` match.

## Verify and report semantics

- **Unresolved JUDGMENT checks still count as passing.** This is 2.1 behavior, not new in 3.0. `aigis verify <area> --auto` prints "Controls satisfied (all auto checks PASS)" and `aigis report` marks the area PASS (and counts it in `areas_fully_passing`) when every auto check passes, even if JUDGMENT checks are still open. Both new areas always have two JUDGMENT checks, so they can show as satisfied without that proof. Change it in a later release: keep the controls "in scope" until every JUDGMENT check is resolved, and leave such areas out of `areas_fully_passing`. Ship it with a deprecation note, because scripts may read the current output.
