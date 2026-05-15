---
id: eu-ai-act-annex-iv
title: EU AI Act — Annex IV Technical Documentation Template
framework: EU AI Act Article 11 + Annex IV
required_when: jurisdiction=EU AND is-eu-high-risk=true
---

# Technical documentation under EU AI Act Article 11 (Annex IV)

> Annex IV specifies the minimum content for the technical documentation that must accompany every high-risk AI system placed on the EU market. This document is provided to notified bodies (during conformity assessment) and to market surveillance authorities (on request). It is the SUPERSET of what's in deployer instructions (Article 13) — not the same document.
>
> Owner: the AI risk management owner from `aigis get eu-ai-act-art-9-risk-management`. The owner does not personally write every section but is accountable for the document's completeness, accuracy, and currency.
>
> Update cadence: at minimum annually, AND whenever a material change occurs (model upgrade, training data refresh, new use case, new deployment region).

---

## 1. General description of the AI system (Annex IV(1))

### 1.1 Intended purpose
[Describe the precise intended purpose of the system. Be specific about what the system does and explicitly does NOT do. Example: "Triages incoming customer support tickets into 4 priority levels (P0–P3). It does not draft replies; it does not close tickets; it does not access customer accounts."]

### 1.2 Provider identity and contact
- Provider legal name:
- Address:
- Authorised representative in EU (if provider is non-EU):
- Contact email for regulatory matters:
- Contact phone for incident reporting:

### 1.3 System version and date
- Version:
- Release date:
- Last technical-doc revision date:

### 1.4 Interaction with other systems
[Describe systems this AI interacts with — upstream data sources, downstream consumers, third-party APIs, hardware. Include a diagram if useful. Note especially any other AI systems in the pipeline.]

### 1.5 Software versions and updates
[Describe the software baseline: foundation model + version, libraries + versions, custom components. Describe how updates are managed and what triggers a re-assessment.]

### 1.6 Forms in which the AI system is placed on the market
[SaaS / on-prem / embedded in hardware / SDK. List each.]

### 1.7 Description of hardware on which the AI system is intended to run
[GPU/CPU/RAM/storage requirements. If SaaS, what the deployer needs on their side.]

### 1.8 Photographs or illustrations (if applicable)
[For systems with physical/visual components — embedded AI in hardware, robotics. Skip if pure software.]

### 1.9 User interface description
[How users interact with the system. Screenshots or mockups.]

### 1.10 Instructions for use for the deployer
[Reference / link to the Article 13 deployer instructions document. The deployer doc IS the Article 13 surface; this section either includes it or links to the canonical version.]

### 1.11 Instructions for installation, where applicable
[For deployable systems, the install procedure.]

---

## 2. Detailed description of the elements of the AI system and the development process (Annex IV(2))

### 2.1 Methods and steps performed for development
[Describe the development methodology. Include: requirements gathering, design choices, prototyping iterations, evaluation methodology, deployment process. Reference your engineering standards or development handbook.]

### 2.2 Use of pre-trained systems or tools provided by third parties
[List foundation models, embedding models, third-party APIs used. For each:]
- Name + version
- Provider
- License
- Whether it was modified (fine-tuned, etc.)
- Documentation reference

### 2.3 Design specifications
[The system's logic, algorithm, key design choices. Describe at the level a notified body's technical reviewer can audit. Include:]
- Model architecture
- Decision logic / business rules layered on top
- Confidence thresholds and how they were chosen
- Pre/post-processing steps

### 2.4 System architecture
[Diagrams + prose. Components, data flows, decision points.]

### 2.5 Data requirements (per Article 10)
[For each data set used in training, validation, testing:]

| Data set | Purpose | Source | Size | Time period | Demographic distribution | Known biases | Quality assurance |
|---|---|---|---|---|---|---|---|
| [name] | training/validation/testing | [where it came from] | [N rows / hours / images] | [date range] | [groups represented; gaps] | [known biases identified] | [QA process applied] |

Reference: `aigis get data-integrity` and `aigis get bias-monitoring` for the procedures that produced this content.

### 2.6 Validation and testing procedures used
[How the system was validated against requirements. Include test data sets, metrics, results, documented limitations.]

### 2.7 Cybersecurity measures
[Reference: `aigis get input-validation`, `aigis get prompt-security`. Summarize the cybersecurity measures implemented. Article 15 cross-reference.]

---

## 3. Detailed information about the monitoring, functioning and control of the AI system (Annex IV(3))

### 3.1 Capabilities and limitations in performance
[For each major capability claim, the methodology + metric + known limitation. Reference: `aigis get eu-ai-act-art-13-deployer-transparency` Step 2 — the deployer-doc performance section is a SUMMARY of this.]

### 3.2 Foreseeable unintended outcomes
[List all foreseeable unintended outcomes from the Article 9 risk register. Reference: `aigis get eu-ai-act-art-9-risk-management`.]

### 3.3 Sources of risks to health, safety, or fundamental rights
[From the Article 9 risk register, surface those risks where the impact category includes health, safety, or fundamental rights. For each: description, mitigation, residual risk.]

### 3.4 Human oversight measures (Article 14)
[Describe the operational human oversight in place. Reference: `aigis get human-oversight` for the procedure. Include:]
- Roles and competence requirements
- Interface(s) for oversight
- Override / interrupt mechanisms
- Audit log of oversight events

### 3.5 Specifications on input data
[What input the system accepts, validation rules, format requirements. Reference: `aigis get input-validation`.]

---

## 4. Description of the appropriateness of the performance metrics for the specific AI system (Annex IV(4))

[Justify why the chosen metrics are appropriate. Examples:]
- Why F1 vs accuracy for a classification system
- Why precision matters more than recall (or vice versa) for this use case
- Why latency p99 matters for user-facing systems
- How metrics map to user-experienced quality

This section addresses why your KPIs reflect what the system is actually for, not just what's easy to measure.

---

## 5. Detailed description of the risk management system (Annex IV(5))

[Reference: `aigis get eu-ai-act-art-9-risk-management`. Summarize:]
- Who owns the risk management system
- Re-evaluation cadence
- Risk register summary (high-level — full register stays in the operational document)
- Integration with post-market monitoring (Article 72) and incident reporting (Article 73)

---

## 6. Description of relevant changes made by the provider through the lifecycle (Annex IV(6))

[A change log of material changes since the system was first placed on the market. Each entry:]

| Date | Change description | Why | Risk re-evaluation triggered? | Annex IV section(s) updated |
|---|---|---|---|---|
| [date] | [description] | [reason] | yes/no + reference | [sections] |

This is the audit trail of the lifecycle obligation in Article 9(2) and Article 11.

---

## 7. List of harmonised standards applied (Annex IV(7))

[List each harmonised standard the system claims conformity with. EU AI Act references will appear here as standards are published — at v2.1 of this template, the harmonised standards are still being developed by CEN/CENELEC. Examples that may be relevant:]
- ISO/IEC 42001:2023 — AI Management System
- ISO/IEC 23053 — Framework for AI systems using ML
- ISO/IEC TR 24028 — Trustworthiness in AI

[For each standard listed: which clauses are claimed, evidence of conformity.]

---

## 8. Copy of the EU declaration of conformity (Annex IV(8))

[Reference: the separate EU Declaration of Conformity document. Include here as appendix or by reference.]

---

## 9. Detailed description of the system in place to evaluate the AI system performance in the post-market phase (Annex IV(9))

[Reference: `aigis get monitoring` and `aigis get eu-ai-act-art-73-incident-reporting`. Summarize:]
- Post-market monitoring plan (Article 72) — what's monitored, how often, by whom
- Incident detection and reporting workflow (Article 73)
- Feedback loop into the risk register (Article 9)
- Update mechanism for this technical documentation

---

## Appendices (recommended)

- A. Full Article 9 risk register (snapshot at this revision)
- B. Article 13 deployer instructions document
- C. Validation and testing reports
- D. Data-set documentation (data sheets per Article 10)
- E. Software bill of materials (SBOM)
- F. Architecture diagrams
- G. Change log (full detail for Section 6)
