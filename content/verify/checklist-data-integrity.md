---
id: checklist-data-integrity
implements: data-integrity
---
# Verification: Data integrity

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is data provenance tracked (source, checksum, ingestion date)? | LLM04/P1 | [ ] | |
| V2 | Is data validated before entering the vector store / training pipeline? | LLM04/P2 | [ ] | |
| V3 | Are training/fine-tuning datasets checksummed and versioned? | LLM04/P3 | [ ] | |
| V4 | Confirm: no unverified external data sources ingested without validation. | Anti-pattern | [ ] | |
