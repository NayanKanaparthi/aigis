---
id: eu-ai-act-art-73-incident-reporting
title: EU AI Act Article 73 — Reporting of serious incidents
controls:
  owasp: []
  nist: [MANAGE-4.1, MANAGE-4.3]
  iso42001: [Clause-10.1, Clause-10.2]
  eu_ai_act: [Art-73, Art-73(1), Art-73(2), Art-73(3), Art-73(7), Art-73(8)]
min_risk_tier: high
system_traits: [is-eu-high-risk]
jurisdiction: [eu]
---

EU AI Act Article 73 obligates providers of high-risk AI systems to report **serious incidents** to the market surveillance authority of the Member State where the incident occurred — within strict timelines (15 days for most; 2 days for incidents involving widespread infringement; immediately for incidents involving death). This area defines the workflow that meets those deadlines.

This area also satisfies NIST MANAGE-4.1 (post-deployment monitoring + incident response) and ISO 42001 Clause 10.1 (nonconformity and corrective action) — single workflow, three frameworks.

## Common incomplete implementations

1. **No defined incident escalation path.** When something goes wrong, the engineer who notices doesn't know who to tell. By the time it reaches the right person, the 15-day clock has burned through more than half its time.
2. **Incident detection doesn't include AI-specific triggers.** The incident management system is wired for conventional outages (5xx errors, latency spikes) but not for AI-specific failure modes: hallucination causing user harm, biased output flagged by users, model decision contributing to a rights infringement. These don't always show up in conventional monitoring.
3. **Reporting delayed past the 15-day window.** The team treats the incident as an internal triage exercise and only reports once a remediation is in place. Article 73(2) requires reporting "immediately after the provider has established a causal link... or the reasonable likelihood of such a link, and, in any event, not later than 15 days." The clock starts at causal-link knowledge, not at remediation completion.
4. **"Serious incident" not defined operationally.** The team isn't sure what counts. Article 73(1) and (2) define it precisely; if engineers can't recognize it, they can't escalate it.
5. **Report format unknown until needed.** When the incident happens, the team has to figure out what to send, in what format, to which authority. That figuring-out time pushes past the 15-day window. Pre-staging the report template + authority contacts is critical.
6. **Incident not fed back into Article 9 risk register.** The incident is reported to the authority and closed internally — but the risk register isn't updated, the mitigation isn't strengthened, and the next similar incident is just as likely. Article 73(7) requires investigations and corrective actions; the risk management feedback loop is implicit.

## Implementation procedure

### Step 1 — Define operationally what counts as a "serious incident" for your system ⚠ CRITICAL

**What to do.** Article 73(1) defines serious incident as any incident or malfunctioning of an AI system that directly or indirectly leads to:

- (a) the death of a person, or serious harm to a person's health
- (b) a serious and irreversible disruption of the management or operation of critical infrastructure
- (c) infringement of obligations under Union law intended to protect fundamental rights
- (d) serious harm to property or the environment

For YOUR system, document concrete examples of each category. This is operational — it tells engineers "this incident type = report under (a)" without requiring legal interpretation in the moment.

Examples by system type:

| System | Category (a) example | Category (c) example |
|---|---|---|
| Medical triage chatbot | Patient delays seeking care due to false reassurance | Discriminatory triage routing by protected characteristic |
| Hiring AI | (rare; secondary harm) | Discriminatory candidate filtering by protected characteristic |
| Credit scoring | (no direct (a)) | Discriminatory denial; right-to-explanation violation |
| Critical infra control | Operator misled by AI signal causing safety event | Infringement of safety regulations |

If a system has no plausible incident category mapping (some categories may genuinely not apply), document the reasoning. An empty mapping triggers Step 1 review every quarter alongside Article 9 risk re-evaluation.

**Why this matters.** Engineers cannot escalate what they don't recognize. The most common failure pattern is: incident occurs, engineer triages as a "bug," reaches the regulatory team weeks later. By then 15 days is gone.

**Verification checkpoint.** A document titled "Serious Incident Definitions for [system]" exists. Each Article 73(1) category has at least one concrete example specific to your system or a documented "not applicable" rationale. Engineers on call can describe at least one example per category.

### Step 2 — Wire incident detection into your monitoring stack

**What to do.** Add to the monitoring infrastructure (`aigis get monitoring`) signals that flag potential serious incidents, in addition to conventional reliability metrics:

- **User complaints with AI-output context** — support tickets mentioning the AI output by id; cluster + alert if rate exceeds baseline
- **High-impact decision flags** — for systems making consequential decisions, sample a fraction of decisions for review by a human; alert on patterns
- **Bias drift signals** — periodic group-fairness checks against monitored slices; alert on drift past threshold
- **Safety-relevant content flags** — for content generation, automated flagging of outputs in restricted domains (medical, financial advice) where the system shouldn't be operating
- **Override audit signals** — if Article 14 override events spike (operators correcting AI more than usual), that's a leading signal of incident-causing output

The signal does NOT need to confirm an incident; it needs to surface candidates fast enough that human review fits inside 15 days.

**Why this matters.** Article 73 timelines start at "causal-link awareness." Without monitoring signals, awareness comes only when an external complaint reaches engineering — which can take weeks of forwarding. Internal detection is hours-to-days; external is weeks.

**Verification checkpoint.** The monitoring dashboard has at least one signal per applicable Article 73(1) category. Each signal has a defined alert threshold and a notification target (the role that will triage it).

### Step 3 — Establish the escalation path with named owners and time budget

**What to do.** Document the incident workflow with named owners and time targets at each step, working back from the 15-day Article 73 deadline:

| Phase | Owner | Time target | Output |
|---|---|---|---|
| 0. Detection | On-call engineer | t = 0 | Incident ticket created with severity = "AI-potential-serious" |
| 1. Initial triage | Incident commander (named role) | t + 4 hours | Determination: (a) confirmed not-Article-73 | (b) needs deeper investigation | (c) confirmed Article 73 |
| 2. Investigation if (b) | Designated investigator | t + 3 days | Causal link confirmed or ruled out |
| 3. Notify regulatory team | Risk management owner (Article 9 owner) | t + 5 days | Regulatory team has full incident package |
| 4. Prepare authority report | Regulatory team | t + 10 days | Report drafted in Article 73 format |
| 5. Submit to authority | Regulatory team / legal | t + 13 days | Submission acknowledgment received from authority |
| 6. Investigation + corrective action | Risk management owner | ongoing | Article 73(7) investigation report; risk register updated |

The workflow lives in the incident management tool (Linear, Jira, PagerDuty, etc.) as a runbook. Engineers don't read it during the incident — they follow the incident-tool path that embeds it.

**Why this matters.** Article 73(2) requires reporting "not later than 15 days" from causal-link awareness. Article 73(3) tightens to 2 days for incidents involving widespread infringement (Article 3(45)) and immediate notification for incidents involving death. Without a pre-staged workflow, these timelines are missed.

**Verification checkpoint.** The runbook document exists. A simulated incident drill has been run within the last 12 months and ended with a submitted report (or a documented decision that the simulated incident did not meet Article 73 thresholds).

### Step 4 — Pre-stage the report template and authority contacts

**What to do.** For each Member State where your system operates, pre-document:

- **Market surveillance authority contact** — name, address, electronic submission portal URL, format requirements
- **Report template** — Article 73 doesn't yet have a fully harmonized EU-wide template (national authorities accept their own forms). Pre-fill the parts that don't change per incident: provider identity, system identity, system version, intended purpose
- **Per-incident fields** that the report must include (per Article 73 + national guidance):
  - Description of the incident
  - Date and place
  - Description of the affected persons
  - Causal analysis (or stated reasonable likelihood)
  - Remedial action taken or planned
  - Information about the AI system and its components

**Why this matters.** Article 73 requires reporting in the format prescribed by the authority. Different Member States may accept slightly different formats. Pre-staging the template means the regulatory team is filling in incident-specific fields, not assembling the document structure under deadline pressure.

**Verification checkpoint.** A folder exists with one report template per Member State of operation. Each template has been reviewed against the current authority requirements within the last 12 months.

### Step 5 — Run quarterly incident response drills

**What to do.** Once per quarter, the risk management owner runs a tabletop incident drill:
- Pick a plausible serious-incident scenario (rotate categories)
- Walk through Steps 1–6 of the operational workflow
- Time-box each phase against the budget
- End with a post-drill review: what would have been the actual time-to-report? What needs to improve?

**Why this matters.** The incident workflow is exercised rarely (real serious incidents are uncommon, by design). Without drills, the team forgets the steps, the runbook goes stale, and the first real incident becomes the first dry run — failing the 15-day window.

**Verification checkpoint.** The most recent drill is dated within the last 90 days. The drill report identifies at least one improvement, and the improvement is tracked to closure.

### Step 6 — Integrate post-incident corrective action into Article 9 risk register

**What to do.** After every reported incident (and after every drill), the risk management owner updates the Article 9 risk register:
- The risk that materialized: re-rate likelihood/impact based on the incident
- The mitigation: was it ineffective? Was it absent? Strengthen or add it
- Cross-reference: the risk register entry now points to the incident report; the incident report points back to the risk

**Why this matters.** Article 73(7) requires "all necessary corrective actions" after a serious incident. Article 9(2)(c) requires risk re-evaluation as a continuous process. Without the feedback loop, the same incident type recurs.

**Verification checkpoint.** Pull the most recent Article 73 report. Locate the corresponding entry in the Article 9 risk register. The register entry references the incident, the likelihood/impact has been re-rated, and the mitigation has been updated.

## Cross-framework satisfaction

Implementing this procedure also satisfies:
- **NIST AI RMF MANAGE-4.1**: "Post-deployment AI system monitoring plans are implemented, including mechanisms for capturing and evaluating input from users and other relevant AI actors, appeal and override, decommissioning, incident response, recovery, and change management."
- **NIST AI RMF MANAGE-4.3**: "Incidents and errors are communicated to relevant AI actors, including affected communities. Processes for tracking, responding to, and recovering from incidents and errors are followed and documented."
- **ISO/IEC 42001 Clause 10.1**: Continual improvement.
- **ISO/IEC 42001 Clause 10.2**: Nonconformity and corrective action.

## Related patterns

- `monitoring.md` — Step 2 wires AI-specific incident detection signals into the monitoring stack.
- `eu-ai-act-art-9-risk-management.md` — Step 6 closes the loop with the Article 9 risk register.
- `audit-logging.md` — Article 12 logs are the evidence base for incident causal analysis.
- `human-oversight.md` — Article 14 override events are a leading signal for Step 2 detection.

## Related infrastructure

- `aigis infra logging` — log retention determines how far back incident causal analysis can reach. EU AI Act recommends 6 months minimum; some Member States require longer.
