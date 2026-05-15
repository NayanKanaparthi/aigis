---
id: eu-ai-act-art-13-deployer-transparency
title: EU AI Act Article 13 — Transparency and information for deployers
controls:
  owasp: []
  nist: [MAP-3.4, MAP-4.1, MEASURE-2.9]
  iso42001: [Clause-7.4, Annex-A.8]
  eu_ai_act: [Art-13, Art-13(1), Art-13(2), Art-13(3)]
min_risk_tier: high
system_traits: [is-eu-high-risk]
jurisdiction: [eu]
---

EU AI Act Article 13 requires high-risk AI system providers to deliver structured "instructions for use" to **deployers** — the people/orgs operating the system, not the end users. This is distinct from end-user transparency (Article 50). It addresses what the deployer needs to know to operate the system safely. This area also satisfies NIST MAP-3.4 (system characteristics documented) and ISO 42001 Clause 7.4 (information for interested parties) — single artifact, three frameworks.

## Common incomplete implementations

1. **Deployer docs are out-of-date marketing copy.** The "instructions for use" link is the product's homepage. It describes capabilities aspirationally, doesn't list known limitations, and was last updated when the product launched. Article 13 requires accuracy at time of placing on the market AND updates throughout the lifecycle.
2. **Performance numbers shown without test conditions.** "Our system achieves 95% accuracy" — but on what data? Measured how? Article 13(3)(b)(ii) requires "the level of accuracy, including its metrics" — naked numbers without methodology fail this.
3. **No documented oversight role description.** The deployer isn't told *who* on their side needs to be able to override outputs, what training that person needs, or what the override interface looks like. Article 13(3)(d) requires describing "the human oversight measures referred to in Article 14."
4. **Compute / resource requirements absent.** The deployer doesn't know GPU/CPU/RAM/storage demands, latency expectations, or third-party dependencies. Article 13(3)(e) requires "the computational and hardware resources needed."
5. **Expected lifetime and maintenance schedule absent.** Article 13(3)(g) requires "any necessary maintenance and care measures... including their frequency, to ensure the proper functioning of that AI system, including as regards software updates."
6. **Foreseeable misuse not warned.** Article 13(3)(b)(iii) requires describing "any known and foreseeable circumstance, related to the use of the high-risk AI system in accordance with its intended purpose or under conditions of reasonably foreseeable misuse, which may lead to risks to the health and safety or fundamental rights." A deployer who hasn't been warned about a foreseeable misuse can't prevent it.

## Implementation procedure

### Step 1 — Author the deployer instructions document with all Article 13(3) sections ⚠ CRITICAL

**What to do.** Create a single document (markdown, PDF, or web page — but ONE canonical source) containing all Article 13(3) required sections:

| Section | Article ref | Content |
|---|---|---|
| Provider identity | 13(3)(a) | Name, address, contact of the provider (and authorised representative if applicable) |
| Characteristics, capabilities, limitations | 13(3)(b)(i) | What the system does and explicitly does not do |
| Performance and accuracy | 13(3)(b)(ii) | Metrics + methodology + test data description + known performance gaps for groups |
| Foreseeable misuse warnings | 13(3)(b)(iii) | Known misuse scenarios + harm modes + how to detect attempted misuse |
| Specifications of input data | 13(3)(b)(vi) | What input the system expects, validation rules, format requirements |
| Pre-determined changes / monitoring procedures | 13(3)(b)(v) | Updates the deployer should expect, monitoring obligations |
| Human oversight measures | 13(3)(d) | Who on the deployer's side reviews/overrides; training they need; UI/API for oversight |
| Computational resources | 13(3)(e) | Hardware, latency, throughput, third-party dependencies, costs |
| Lifetime + maintenance | 13(3)(g) | How long the system is supported; maintenance frequency; software update schedule |
| Logging mechanisms | 13(3)(f) | What the system logs and how the deployer accesses logs (Article 12 surface) |

The Aigis Annex IV template (`aigis template eu-ai-act-annex-iv`) provides a structured starting point. Article 13 instructions are a SUBSET of Annex IV technical documentation — what the deployer needs to know, not the full internals.

**Why this matters.** Article 13(1) requires the system to be "accompanied by instructions for use in an appropriate digital format or otherwise that include concise, complete, correct and clear information that is relevant, accessible and comprehensible to deployers." If any Article 13(3) section is missing, the deployer cannot fulfill their own obligations under Articles 26, 27.

**Verification checkpoint.** The instructions document has a section header for each of the ten rows above. No section is empty. Sections that genuinely don't apply (e.g. "computational resources" for a SaaS-only system) have a written explanation, not an absence.

### Step 2 — State performance with measurement methodology, not just numbers

**What to do.** For every performance metric in the instructions:
- State the metric (precision, recall, F1, accuracy, latency p50/p95/p99, etc.)
- State the test data set (size, source, demographic distribution, time window)
- State the methodology (how the measurement was taken)
- State known limitations (groups where performance is lower, conditions where reliability degrades)

Example (good):
> The chatbot resolves 78% of customer support queries without escalation, measured against a held-out set of 2,400 real production queries from Q1 2026 (sampled across English, German, French, with 200+ queries per language). Resolution is defined as the user not opening a follow-up ticket within 7 days. Performance drops to 61% for queries longer than 200 words, and to 54% in Hungarian (due to lower training-data representation).

Example (insufficient):
> The chatbot has 78% resolution accuracy.

**Why this matters.** Article 13(3)(b)(ii) requires "the level of accuracy, including its metrics, robustness and cybersecurity referred to in Article 15 against which the high-risk AI system has been tested and validated." A naked number is not a metric — methodology is part of the metric. Article 15(3) reinforces: "the levels of accuracy and the relevant accuracy metrics... shall be declared in the accompanying instructions for use."

**Verification checkpoint.** Every performance number in the document has methodology + test data description + known limitations adjacent. If a number is shown bare ("78%"), this checkpoint fails.

### Step 3 — Document foreseeable misuse from the risk register (Article 9 cross-reference)

**What to do.** From the Article 9 risk register (`aigis get eu-ai-act-art-9-risk-management`), surface every risk where the `Use mode` column is `foreseeable misuse`. For each one, the deployer instructions section "Foreseeable misuse warnings" describes:
- What the misuse looks like (e.g. "users prompting the chatbot to generate content for unrelated topics — investment advice, medical diagnoses")
- Why it's harmful (e.g. "system has not been validated for these domains; outputs may be plausible but wrong")
- How the deployer can detect attempted misuse (e.g. "monitor input topic distribution; alert on out-of-domain queries via X")
- How the deployer should respond (refuse, escalate, log)

**Why this matters.** Article 13(3)(b)(iii) explicitly requires foreseeable misuse warnings. Article 26(3) requires deployers to use the system in accordance with the instructions — but they can't do that if the instructions don't tell them what to watch for.

**Verification checkpoint.** Every `foreseeable misuse` risk in the Article 9 register has a corresponding entry in the deployer instructions Foreseeable Misuse Warnings section. The two documents stay in sync — quarterly risk register updates trigger updates here.

### Step 4 — Specify the human oversight role the deployer must staff

**What to do.** Article 14 requires natural-person oversight. Article 13(3)(d) requires the provider to tell the deployer what that oversight role looks like for *this* system. Document:
- **Who** — what role/seniority on the deployer's side is suitable (e.g. "trained customer support lead" vs. "anyone in the company")
- **What training** — what knowledge they need (e.g. "system limitations described in Section 3, escalation playbook in Section 7")
- **When they engage** — passive monitoring vs. active review of every output vs. spot-check
- **Override interface** — UI/API the deployer uses to interrupt, override, reverse outputs (cite the actual menu/endpoint, not "contact support")
- **Time expectation** — typical override decisions take how long; what's the SLA back to the user

**Why this matters.** Without this section, the deployer doesn't know what they're staffing. They may assign oversight to an unqualified person, or assume "the system is reliable so no one needs to watch" — both fail Article 14 obligations on the deployer side, and the provider is partly responsible for that failure.

**Verification checkpoint.** The Human Oversight section names a role profile (not just "trained personnel"), specifies the override interface (with screenshots or API specs), and gives a time-to-override expectation. If the section just says "the deployer must provide human oversight" without operational detail, this checkpoint fails.

### Step 5 — Publish the document version-controlled, with change history visible to deployers

**What to do.** The document is published with:
- A version number (e.g. v2.3)
- A "last updated" date
- A change log showing what changed in this version vs prior versions
- A subscription mechanism (RSS, mailing list, in-app notification) so deployers learn of updates without polling

**Why this matters.** Article 13 requires instructions "to be kept up-to-date." Without versioning, deployers cannot tell if their copy is current, and providers cannot prove they updated. Without notifications, deployers operate against stale instructions.

**Verification checkpoint.** Pull the latest version of the instructions doc. It has a version, a date within the last 6 months (or a documented reason why no updates needed), and a change log. There is a documented mechanism by which the deployer is notified of updates.

### Step 6 — Ensure language and accessibility match deployer audience

**What to do.** Article 13(1) requires instructions to be "concise, complete, correct and clear information that is relevant, accessible and comprehensible to deployers." This means:
- **Language**: published in the official language(s) of every Member State where the system is offered (or English with provider's commitment to translate on request, depending on member state policy)
- **Accessibility**: meets WCAG 2.1 AA if published as a web page; PDF version is accessible (text not images, alt text on diagrams)
- **Complexity**: written for a business/technical deployer audience, not for legal teams

**Why this matters.** A deployer in Germany who can only read German cannot operate against English-only instructions. An accessibility-non-compliant document fails to reach deployers with disabilities, which is itself an Article 13 transparency failure and a fundamental-rights issue.

**Verification checkpoint.** Confirm the language coverage matches your offered jurisdictions. Run an accessibility audit on the published format. Have a non-legal-team deployer review for clarity.

## Cross-framework satisfaction

Implementing this procedure also satisfies:
- **NIST AI RMF MAP-3.4**: "Documentation of capabilities and limitations is communicated to relevant AI actors."
- **NIST AI RMF MAP-4.1**: "Approaches for mapping AI technology and legal risks are followed."
- **NIST AI RMF MEASURE-2.9**: "The AI model is explained, validated, and documented, and AI system output is interpreted within its context."
- **ISO/IEC 42001 Clause 7.4**: Communication — internal and external communications relevant to the AI management system.
- **ISO/IEC 42001 Annex A.8**: Information for interested parties.

## Related patterns

- `eu-ai-act-art-9-risk-management.md` — Step 3 of this area (foreseeable misuse warnings) sources content from the Article 9 risk register.
- `human-oversight.md` — Step 4 here documents what the deployer must staff; that area documents the provider-side oversight infrastructure.
- `explainability.md` — end-user transparency (different audience). Article 13 is for deployers; explainability is for end users impacted by AI decisions.

## Related templates

- `aigis template eu-ai-act-annex-iv` — the Annex IV technical documentation is the SUPERSET of what's in deployer instructions. Author Annex IV first; derive the deployer doc from it.
