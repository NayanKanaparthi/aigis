---
id: checklist-fallback-patterns
implements: fallback-patterns
---
# Verification: Fallback patterns

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is there a defined default safe response for LLM failures? | MEASURE-2.6/P1 | [ ] | |
| V2 | Is there a circuit breaker that trips on repeated failures? | MANAGE-2.4/P2 | [ ] | |
| V3 | Is there a kill switch that can be toggled without code deployment? | MANAGE-2.4/P3 | [ ] | |
| V4 | Confirm: no crashes on LLM errors (all exceptions caught). | Anti-pattern | [ ] | |
| V5 | Is there a defined recovery process after kill switch activation? | Edge case | [ ] | |
