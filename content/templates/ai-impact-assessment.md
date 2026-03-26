---
id: ai-impact-assessment
title: AI Impact Assessment Template
framework: ISO 42001 Clause 6.1.4 / Clause 8.4
required_when: risk_tier=HIGH OR jurisdiction-eu OR influences-decisions
---

# AI Impact Assessment

> The agent fills in each section based on the system being built. This document maps to ISO/IEC 42001:2023 Clause 8.4 (AI System Impact Assessment).

## 1. System identification
- **System name:** [Extract the name from the task description or code module name. Example: "Claims Severity Assessment API"]
- **Version:** [Use semantic versioning: 0.1.0 for first deployment]
- **Date:** [Use semantic versioning: 0.1.0 for first deployment]
- **Assessment author:** AI-assisted (review required by [role])

## 2. Intended purpose
- **What does this system do?** [Summarize in 1-2 sentences what the system does, not how it works technically. Example: "Assesses insurance claim severity using NLP to recommend routing to fast-track, standard, or escalated review"]
- **Who are the intended users?** [List the user roles who interact with the system directly. Example: "Claims processing staff (800 users across 6 offices)"]
- **What decisions does it support or make?** [Describe the specific decisions this output influences. Example: "Determines initial routing of insurance claims, affecting speed of resolution and adjuster workload"]

## 3. Affected populations
- **Who is directly affected by this system's output?** [Describe the specific decisions this output influences. Example: "Determines initial routing of insurance claims, affecting speed of resolution and adjuster workload"]
- **Are any vulnerable populations affected?** (minors, elderly, economically disadvantaged) [check traits]
- **Estimated number of affected individuals:** [inferred from scale]

## 4. Potential negative impacts
| Impact | Likelihood | Severity | Affected group | Mitigation |
|--------|-----------|----------|----------------|------------|
| [For each risk, describe: what goes wrong, who is harmed, how severely. Example: "High-severity claim under-assessed → customer experiences delayed payout and potential financial hardship"] | Low/Med/High | Low/Med/High | [group] | [Reference the specific implement file and pattern number. Example: "Input sanitization (input-validation.md P1-P3), PII redaction (pii-handling.md P1)"] |

## 5. Controls implemented
| Control | Implementation | Framework reference |
|---------|---------------|-------------------|
| [List each implement file used, the specific patterns applied, and the function/module that implements them] | [Reference the exact function name and file location. Example: "sanitize_input() in app/middleware/validation.py"] | [Copy the control IDs from the implement file frontmatter. Example: "OWASP LLM01, NIST MEASURE-2.7, ISO Cl.8.2"] |

## 6. Residual risks
- [List risks that controls cannot fully eliminate. For each: describe the risk, why it persists, and why the residual level is acceptable. Example: "Novel prompt injection techniques may bypass pattern detection. Residual risk accepted because output schema validation (P4) limits damage, and human oversight catches anomalies."]

## 7. Human oversight mechanism
- **Override available:** Yes/No
- **Escalation path:** [Describe the specific override mechanism implemented: endpoint URL, who can trigger it, what happens when triggered]
- **Kill switch:** [Describe the kill switch: where the config lives, who has access, what disabling looks like, recovery process]

## 8. Monitoring plan
- **Metrics tracked:** [List the specific metrics from monitoring.md Pattern 1 that are being tracked for this system]
- **Review frequency:** [HIGH: weekly metric review, monthly bias audit, quarterly red-team. MEDIUM: monthly metric review, quarterly bias check. LOW: quarterly metric review]
- **Responsible party:** [role, not auto-filled — requires human input]

## 9. Review and approval
- **Assessment reviewed by:** _________________ (required: human reviewer)
- **Date:** _________________
- **Approved for deployment:** Yes / No / Conditional
