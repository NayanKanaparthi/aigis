---
id: risk-characterization
title: Risk Characterization Template
framework: NIST MAP 5.1
required_when: risk_tier=HIGH
---

# Risk characterization

> Maps to NIST AI RMF MAP 5.1. Documents likelihood and magnitude of identified impacts.

## Identified risks

| # | Risk description | Likelihood | Magnitude | Risk score | Mitigation | Residual risk |
|---|-----------------|-----------|-----------|------------|------------|---------------|
| 1 | [Describe one specific failure scenario per row. Be concrete: "LLM assigns severity 2 to a claim that should be 8, causing a legitimate high-severity claim to be fast-tracked instead of escalated"] | 1-5 | 1-5 | L×M | [control reference] | [after mitigation] |

## Risk categories assessed
- **Accuracy/reliability risks:** [Describe specific ways the system could produce wrong outputs. Example: "Severity score miscalibration on multi-incident claims leads to under-assessment"]
- **Bias/fairness risks:** [Describe how different groups might receive different outcomes. Example: "Claims written in informal language may receive lower severity scores, correlating with demographic patterns"]
- **Security risks:** [Describe attack vectors specific to this system. Reference relevant OWASP LLM IDs. Example: "Prompt injection via crafted claim descriptions (LLM01) could manipulate severity scores"]
- **Privacy risks:** [Describe how sensitive data could be exposed. Example: "Claim descriptions containing medical details could be leaked via LLM output or logs"]
- **Safety risks:** [Describe how system failures could cause harm. Example: "Under-assessed high-severity claims delay critical payouts, causing financial hardship"]
- **Transparency risks:** [Describe situations where decisions cannot be explained. Example: "LLM scoring rationale is opaque — adjusters cannot explain to customers why a score was assigned"]

## Impact assessment
- **Individual impact:** [Describe the concrete harm to one person if the system fails. Example: "A customer with a legitimate $50K claim experiences a 2-week delay and financial stress because the AI routed it to fast-track instead of escalation"]
- **Group impact:** [Describe how a class of people could be systematically affected. Example: "Non-native English speakers may consistently receive lower severity scores due to writing style bias in the LLM"]
- **Organizational impact:** [Describe business consequences. Example: "Systematic under-assessment could trigger regulatory investigation, class-action litigation, and reputational damage estimated at $X"]
- **Societal impact:** [Describe broader effects if this system's pattern were widespread. Example: "Algorithmic bias in insurance claim assessment could deepen existing inequities in financial services access"]

## Risk tolerance
- **Acceptable risk level:** [This requires human input — state the organization's risk appetite. Example: "False negative rate (under-assessed severe claims) must be below 2%. False positive rate (over-escalated minor claims) acceptable up to 15%."]
- **Go/no-go recommendation:** [Based on the residual risk analysis above: recommend proceed, proceed with conditions, or do not proceed. State the specific conditions if conditional. Example: "Proceed with conditions: mandatory human review for all claims over $25K, quarterly bias audit, 90-day pilot before full rollout"]
