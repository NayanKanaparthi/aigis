---
id: checklist-rag-security
implements: rag-security
---
# Verification: RAG security

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Are access controls applied to vector database queries? | LLM08/P1 | [ ] | |
| V2 | Is there tenant isolation in multi-tenant RAG systems? | LLM08/P2 | [ ] | |
| V3 | Are retrieved results validated (relevance threshold, injection scan)? | LLM08/P3 | [ ] | |
| V4 | Confirm: no cross-tenant data leakage possible. | Anti-pattern | [ ] | |
