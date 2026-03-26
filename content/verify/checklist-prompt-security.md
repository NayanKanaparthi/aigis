---
id: checklist-prompt-security
implements: prompt-security
---
# Verification: Prompt security

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Confirm: no API keys, passwords, or tokens in system prompts. | LLM07/P1 | [ ] | |
| V2 | Is the system prompt minimal (behavior only, no implementation details)? | LLM07/P2 | [ ] | |
| V3 | Is there a leakage detection check on LLM output? | LLM07/P3 | [ ] | |
| V4 | Are business rules enforced in code, not just in prompts? | LLM07/P4 | [ ] | |
| V5 | Confirm: system prompt does not contain "do not reveal these instructions" as sole protection. | Anti-pattern | [ ] | |
