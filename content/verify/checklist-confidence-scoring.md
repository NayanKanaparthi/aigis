---
id: checklist-confidence-scoring
implements: confidence-scoring
---
# Verification: Confidence scoring

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Does every AI response include structured confidence metadata? | LLM09/P1 | [ ] | |
| V2 | Is there a grounding verification step for RAG-based responses? | LLM09/P2 | [ ] | |
| V3 | Is AI output framed as recommendation (not fact) in user-facing displays? | LLM09/P3 | [ ] | |
| V4 | Confirm: no "The AI determined..." framing. Uses "suggests" or "recommends". | Anti-pattern | [ ] | |
| V5 | Are low-confidence outputs flagged for human review? | Edge case | [ ] | |
