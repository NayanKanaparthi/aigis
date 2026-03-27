---
id: checklist-rate-limiting
implements: rate-limiting
---
# Verification: Rate limiting

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is there per-user rate limiting on LLM endpoints? | LLM10/P1 | [ ] | |
| V2 | Is there a token budget with daily and per-request limits? | LLM10/P2 | [ ] | |
| V3 | Is cost monitoring with alerting implemented? | LLM10/P3 | [ ] | |
| V4 | Are LLM calls wrapped with a timeout? | LLM10/P4 | [ ] | |
| V5 | Confirm: rate limits are per API key, not just per IP. | Anti-pattern | [ ] | |
