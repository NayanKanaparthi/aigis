---
id: third-party-assessment
title: Third-Party AI Assessment
framework: NIST GOVERN 6 / OWASP LLM03
required_when: uses-thirdparty-api AND (risk_tier=HIGH OR risk_tier=MEDIUM)
---

# Third-party AI assessment

> Maps to NIST GOVERN 6.1/6.2 and OWASP LLM03. Documents risks of third-party AI dependencies.

## Provider information
- **Provider:** [Extract from the import statements or API client initialization in the code. Example: "Anthropic (Claude API)"]
- **Model:** [Extract from the model parameter in the API call. Example: "claude-sonnet-4-20250514"]
- **API version:** [auto-fill]
- **Client library version:** [Read from the dependency file. Example: "anthropic==0.39.0 (from requirements.txt)"]

## Dependency risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Model behavior changes on update | Medium | High | Version pinning (supply-chain.md P1) |
| Provider outage | Low | High | Fallback provider (supply-chain.md P4) |
| Terms of service change | Low | Medium | Contract review, alternative evaluation |
| Data residency non-compliance | [check] | High | Verify provider data routing |
| Model deprecation | Medium | Medium | Migration plan, regression test suite |

## Data handling
- **Data sent to provider:** [Enumerate every field included in the messages array. Example: "claim_description (redacted), claim_type, date_filed. No PII sent — redacted by pii-handling.md P1"]
- **PII sent:** Yes/No [should be No — see pii-handling.md]
- **Data retention by provider:** [Look up the provider's data retention policy. Example: "Anthropic: zero retention on API by default. OpenAI: 30-day retention unless opted out via API"]
- **Provider's data used for training:** Yes/No [check provider's terms]

## Contingency plan
- **Fallback provider:** [from supply-chain.md P4]
- **Fallback behavior:** [from fallback-patterns.md]
- **Maximum acceptable downtime:** [requires human input]
- **Migration estimated effort:** [days/weeks]

## Review schedule
- **Next review date:** [quarterly recommended for high-risk]
- **Trigger for immediate review:** provider update, incident, terms change
