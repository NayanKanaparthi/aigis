---
id: checklist-input-validation
implements: input-validation
---
# Verification: Input validation

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is there a maximum input length check (characters and/or tokens) before the LLM call? | LLM01/P1 | [ ] | |
| V2 | Does the code use API native role separation (system vs user messages), not string concatenation? | LLM01/P2 | [ ] | |
| V3 | Is there a sanitization function stripping control characters and zero-width Unicode before the LLM call? | LLM01/P3 | [ ] | |
| V4 | Is LLM output validated against a defined schema before downstream use? | LLM01/P4 | [ ] | |
| V5 | Is there an injection pattern detection layer (even if advisory/logging-only)? | LLM01/P5 | [ ] | |
| V6 | Confirm: no string concatenation or f-strings used to build prompts. | Anti-pattern | [ ] | |
| V7 | Confirm: input exceeding length limits returns an error, not silent truncation. | Anti-pattern | [ ] | |
| V8 | If system processes documents/files: is extracted text sanitized with same pipeline as direct input? | Edge case | [ ] | |
