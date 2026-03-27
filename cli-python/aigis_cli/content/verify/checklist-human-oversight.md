---
id: checklist-human-oversight
implements: human-oversight
---
# Verification: Human oversight

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Are LLM tools defined as an explicit allowlist (not blocklist)? | LLM06/P1 | [ ] | |
| V2 | Do write/mutating operations require human approval? | LLM06/P2 | [ ] | |
| V3 | Is there action rate limiting for LLM-initiated actions? | LLM06/P3 | [ ] | |
| V4 | Does every AI-influenced response include an override mechanism? | LLM06/P4 | [ ] | |
| V5 | Is there an audit trail for every LLM-initiated action? | Anti-pattern | [ ] | |
| V6 | For low-confidence outputs, is human review required? | Edge case | [ ] | |
