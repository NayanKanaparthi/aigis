---
id: eu-ai-act-art-9-risk-management
title: EU AI Act Article 9 — Risk management system (lifecycle)
controls:
  owasp: []
  nist: [GOVERN-1.1, GOVERN-1.2, MANAGE-1.1, MANAGE-2.1]
  iso42001: [Clause-6.1, Clause-6.2, Clause-8.1]
  eu_ai_act: [Art-9, Art-9(2), Art-9(5), Art-9(7)]
min_risk_tier: high
system_traits: [is-eu-high-risk]
jurisdiction: [eu]
---

EU AI Act Article 9 requires high-risk AI systems to have a documented, iterative risk management system that runs across the **entire lifecycle** — not a one-time assessment at launch. This area is for the team responsible for that lifecycle. It also satisfies NIST AI RMF risk management functions (GOVERN-1.1, MANAGE-1.1) and ISO 42001 Clause 6.1 — implementing this once gives you cross-framework coverage.

## Common incomplete implementations

1. **One-shot launch risk assessment, never re-evaluated.** A risk assessment was done before launch, signed off, filed. Six months later the model was upgraded, new prompts added, new use cases enabled — the risk register was never touched. Article 9(2) explicitly requires the system to run "throughout the entire lifecycle of the high-risk AI system, requiring regular systematic review and updating."
2. **Risk register exists but has no owners.** Risks are listed in a spreadsheet but no individual is accountable for the mitigation, the testing of the mitigation, or the timeline. Article 9 is a *system*, not a list — without owners + cadence, it's documentation, not management.
3. **Risks identified, no mitigations defined.** "Bias in outputs" is named as a risk; the next column is empty. Article 9(5) requires "appropriate and targeted risk management measures designed to address the risks identified."
4. **Mitigations defined, never tested.** A mitigation is documented (e.g. "PII redaction reduces leak risk") but no test confirms the mitigation actually works in deployed conditions. Article 9(7) requires testing of risk management measures throughout development and pre-deployment.
5. **Foreseeable misuse not considered.** The risk register covers intended use only. Article 9(2)(b) explicitly requires considering "risks that may emerge when the high-risk AI system is used in accordance with its intended purpose or under conditions of reasonably foreseeable misuse." A coding assistant prompted to write malware is a foreseeable misuse.
6. **No link between risks and post-deployment monitoring.** Risks are tracked in one document; monitoring metrics are tracked in another. When an incident happens, no one can trace the production signal back to which risk it materialized. Article 9(8) requires the risk management system to integrate with post-market monitoring (Article 72).

## Implementation procedure

### Step 1 — Establish the risk management lifecycle owner ⚠ CRITICAL

**What to do.** Name a single person (or role) accountable for the risk management system. They own the risk register, schedule re-evaluations, sign off on risk treatment decisions, and report to leadership. This person does NOT need to perform every assessment — they need to ensure the assessments happen, are documented, and drive action.

**Why this matters.** Article 9 requires a *system*, not a document. Systems require accountability. Without a named owner, the lifecycle review never happens because everyone assumes someone else is doing it. This is the single most common failure mode for Article 9 audits.

**Verification checkpoint.** A person's name (or specific role title) is documented in your team's governance docs as the "AI risk management owner." If the answer to "who owns this?" is a team or a process rather than a person, this checkpoint fails.

### Step 2 — Build the initial risk register covering intended use AND foreseeable misuse

**What to do.** Create a structured risk register with at minimum these columns:
- **Risk ID** — stable identifier (R-001, R-002, ...)
- **Risk description** — what could happen
- **Affected stakeholders** — users, deployers, third parties, society
- **Use mode** — `intended` | `foreseeable misuse`
- **Likelihood** — high / medium / low (with brief rationale)
- **Impact** — high / medium / low (with brief rationale, including impact on fundamental rights)
- **Risk owner** — person accountable for treatment
- **Status** — open / treating / accepted / closed

Populate with risks from at minimum these categories:
1. **Output risks** — incorrect output causing harm (medical misdiagnosis, financial mis-pricing)
2. **Privacy risks** — PII leakage to model, to logs, to other users (cross-tenant)
3. **Bias / discrimination risks** — output that disparately affects groups
4. **Security risks** — prompt injection, model extraction, training data poisoning
5. **Misuse risks** — prompts that get the system to do things outside intended use (jailbreaks, generating malware via coding assistant, generating CSAM via image gen)
6. **Operational risks** — model availability, latency, third-party API failure
7. **Fundamental-rights risks** — the EU AI Act explicitly calls out impact on dignity, non-discrimination, freedom of expression. List these even if they feel abstract.

**Why this matters.** Article 9(2)(a) requires identification of "known and reasonably foreseeable risks that the high-risk AI system can pose to health, safety or fundamental rights." Article 9(2)(b) extends this to foreseeable misuse. A risk register that omits fundamental-rights or misuse categories satisfies neither sub-clause.

**Verification checkpoint.** The register contains at least one risk from each of the seven categories above (or a documented written reason why a category does not apply to your system). The `Use mode` column has at least one entry of `foreseeable misuse` — if it has none, the misuse analysis was not done.

### Step 3 — Define and document risk treatment for each open risk

**What to do.** For every risk where status is `open`, define a treatment:
- **Mitigation** — controls that reduce likelihood or impact (e.g. "input validation blocks prompt-injection patterns" reduces security risk likelihood)
- **Acceptance** — the team accepts the residual risk (must be approved at a defined level — typically requires sign-off above the risk owner)
- **Transfer** — risk is transferred to a third party (insurance, contract terms with a provider)
- **Avoidance** — change the design to remove the risk (e.g. don't use the LLM for legal advice generation)

Each treatment cites the specific Aigis area or external control implementing it. For example:
- R-007 "PII leakage to LLM" — Mitigation: implement `aigis get pii-handling` Steps 1–6
- R-013 "Prompt injection" — Mitigation: implement `aigis get input-validation` Steps 1–4 + `aigis get prompt-security`

**Why this matters.** Article 9(5) requires "appropriate and targeted risk management measures designed to address the risks identified." A risk treatment that says "training" or "awareness" without a specific control is not a risk management measure — it's a hope.

**Verification checkpoint.** Every risk with status `open` has a non-empty treatment column. Every mitigation cites either an Aigis area, a specific code module, or a specific external control. Vague treatments ("monitor closely", "be careful") fail this checkpoint.

### Step 4 — Test each mitigation before considering the risk treated

**What to do.** For each mitigation, define a test that confirms the mitigation actually works. The test outcome (PASS / FAIL) and the evidence (test file:line, test run timestamp) is recorded against the risk.

Examples:
- Mitigation: "input validation blocks prompt-injection" → Test: run `aigis verify input-validation --auto .`. PASS evidence: scanner output captured.
- Mitigation: "PII redaction on LLM input path" → Test: unit test that asserts known PII patterns are replaced with `[REDACTED]` labels in the redactor's output.
- Mitigation: "rate limit prevents budget exhaustion" → Test: load test that confirms 429s are returned at the configured threshold.

**Why this matters.** Article 9(7) requires "testing of risk management measures... before that high-risk AI system is placed on the market or put into service" and Article 9(8) extends testing to "throughout the development process." Without test evidence, a mitigation is unverified — which means the risk is not actually treated.

**Verification checkpoint.** Every risk with status `treating` or `closed` has at least one test result attached. Risks without test evidence stay at `open` until tests are run.

### Step 5 — Schedule periodic re-evaluation (at minimum quarterly + on every material change)

**What to do.** Calendar a recurring re-evaluation — at minimum every 90 days — where the risk owner walks the entire register: are any new risks emerging? Are existing mitigations still effective? Has model behavior changed? Have new use cases been enabled? Have there been incidents (Article 73 reports) that should feed back into risk identification?

In addition, trigger an out-of-cycle review on any of these material changes:
- Model upgrade (e.g. moving from one foundation model version to another)
- Training data refresh
- New tool added to an agent's available tool set
- New prompt template or system prompt revision
- New deployment region or new user population
- Any incident reported under Article 73

**Why this matters.** Article 9(2) requires the system to "be a continuous iterative process planned and run throughout the entire lifecycle." The most common audit finding is a risk register that hasn't been updated in months.

**Verification checkpoint.** A recurring calendar event exists with the risk owner as attendee. The most recent review is dated within the last 90 days. A change log on the risk register documents the most recent material-change-triggered review.

### Step 6 — Wire risk register into post-market monitoring (Article 72) and incident reporting (Article 73)

**What to do.** When a post-market monitoring signal fires (drift detected, performance degradation, user complaint volume spike), the risk owner is notified and evaluates whether the signal corresponds to a known risk (re-evaluate mitigation effectiveness) or a new risk (add to register). When a serious incident is reported under Article 73, the corresponding risk is updated — likelihood/impact may need re-rating, mitigation may need strengthening.

**Why this matters.** Article 9(8) explicitly integrates risk management with post-market monitoring: "the risk management measures shall give due consideration to the effects and possible interaction resulting from the combined application of the requirements set out in this Section." Without the feedback loop, the risk register is a static document — not a management system.

**Verification checkpoint.** The risk owner is on the notification list for post-market monitoring alerts (`aigis get monitoring`'s alerting setup). When a serious incident is reported (`aigis get eu-ai-act-art-73-incident-reporting`), the incident report references the risk it materialized.

## Cross-framework satisfaction

Implementing this procedure also satisfies:
- **NIST AI RMF GOVERN-1.1**: "Legal and regulatory requirements involving AI are understood, managed, and documented."
- **NIST AI RMF GOVERN-1.2**: "The characteristics of trustworthy AI are integrated into organizational policies, processes, procedures, and practices."
- **NIST AI RMF MANAGE-1.1**: "A determination is made as to whether the AI system achieves its intended purpose and stated objectives and whether its development or deployment should proceed."
- **NIST AI RMF MANAGE-2.1**: "Resources required to manage AI risks are taken into account."
- **ISO/IEC 42001 Clause 6.1**: Actions to address risks and opportunities for the AI management system.
- **ISO/IEC 42001 Clause 6.2**: AI objectives and planning to achieve them.
- **ISO/IEC 42001 Clause 8.1**: Operational planning and control.

A single risk management system satisfies all of these. Audit reports generated via `aigis report` will cite all four frameworks for each implemented step.

## Related patterns

- `monitoring.md` — post-market monitoring signals feed Step 6's re-evaluation trigger.
- `audit-logging.md` — Article 12 record-keeping provides the evidence base for risk re-evaluation.
- `human-oversight.md` — Article 14 oversight role is one of the risk treatment options for many risks.
- `eu-ai-act-art-73-incident-reporting.md` — incidents feed back into risk re-evaluation.

## Related infrastructure

- `aigis infra logging` — structured log retention is what the risk owner reviews quarterly.
- `aigis infra secrets` — credential rotation cadence is itself a risk treatment for several common risks.

## Related templates

- `aigis template eu-ai-act-annex-iv` — the Annex IV technical documentation includes a section that summarizes the risk management system; its content comes from this register.
- `aigis template risk-characterization` — the broader risk-characterization template (NIST-flavored) feeds into the EU AI Act register; same source data, two output formats.
