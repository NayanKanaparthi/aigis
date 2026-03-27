---
id: checklist-pii-handling
implements: pii-handling
---
# Verification: PII handling

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is PII detected and redacted before being sent to the LLM? | LLM02/P1 | [ ] | |
| V2 | Does the system send only necessary fields to the LLM (data minimization)? | LLM02/P2 | [ ] | |
| V3 | Is LLM output scanned for PII before returning to the user? | LLM02/P3 | [ ] | |
| V4 | Are PII-containing records stored separately from LLM-accessible data? | LLM02/P4 | [ ] | |
| V5 | Are logs written with redacted content, never raw PII? | LLM02/P5 | [ ] | |
| V6 | Confirm: no full database records sent to the LLM. | Anti-pattern | [ ] | |
