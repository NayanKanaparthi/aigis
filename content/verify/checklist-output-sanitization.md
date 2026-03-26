---
id: checklist-output-sanitization
implements: output-sanitization
---
# Verification: Output sanitization

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is LLM output encoded/escaped before rendering in HTML? | LLM05/P2 | [ ] | |
| V2 | Are database operations using parameterized queries, not string interpolation with LLM output? | LLM05/P3 | [ ] | |
| V3 | If LLM generates code for execution, is it sandboxed? | LLM05/P4 | [ ] | |
| V4 | Is LLM output content type validated before use? | LLM05/P5 | [ ] | |
| V5 | Confirm: no eval() or exec() on raw LLM output. | Anti-pattern | [ ] | |
| V6 | If rendering LLM markdown as HTML, is a sanitizing parser used? | Edge case | [ ] | |
