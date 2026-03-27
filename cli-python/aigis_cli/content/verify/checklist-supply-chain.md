---
id: checklist-supply-chain
implements: supply-chain
---
# Verification: Supply chain

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is the model version pinned to a specific identifier (not "latest")? | LLM03/P1 | [ ] | |
| V2 | Is model version tracked in every response/log entry? | LLM03/P2 | [ ] | |
| V3 | Is there a regression test suite for model version upgrades? | LLM03/P3 | [ ] | |
| V4 | Is there a fallback provider or degradation path for outages? | LLM03/P4 | [ ] | |
| V5 | Confirm: client library versions are also pinned. | Anti-pattern | [ ] | |
