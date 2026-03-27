---
id: checklist-audit-logging
implements: audit-logging
---
# Verification: Audit logging

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Does every LLM interaction produce a structured log entry with trace ID? | MANAGE-4.1/P1 | [ ] | |
| V2 | Is the trace ID propagated across all system components? | MANAGE-4.1/P2 | [ ] | |
| V3 | Are AI-influenced decisions logged with full context? | MANAGE-4.1/P3 | [ ] | |
| V4 | Confirm: no raw PII in log entries. | Anti-pattern | [ ] | |
| V5 | Confirm: all interactions logged, not just errors. | Anti-pattern | [ ] | |
