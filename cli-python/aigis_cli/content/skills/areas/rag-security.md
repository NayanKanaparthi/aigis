---
id: rag-security
title: RAG and embedding security
controls:
  owasp: [LLM08]
  nist: [MEASURE-2.7]
  iso42001: [Clause-8.2, Annex-A.7]
min_risk_tier: all
system_traits: [uses-rag]
---

## What this addresses

OWASP LLM08 (new in 2025) covers vulnerabilities in retrieval-augmented generation systems: poisoned embeddings, unauthorized access to vector databases, manipulation of similarity search, and data leakage through embedding inversion.

## Implementation patterns

### Pattern 1: Access control on vector databases

```python
class SecureVectorStore:
    def query(self, embedding: list, user_context: dict, top_k: int = 5) -> list:
        # Apply access control filters BEFORE similarity search
        access_filter = self.build_access_filter(user_context)
        results = self.vector_db.search(
            vector=embedding,
            filter=access_filter,
            limit=top_k
        )
        # Audit log every retrieval
        log_event("vector_query", user=user_context["user_id"],
                  results_count=len(results), filter_applied=access_filter)
        return results

    def build_access_filter(self, user_context: dict) -> dict:
        return {
            "department": {"$in": user_context["allowed_departments"]},
            "classification": {"$lte": user_context["clearance_level"]}
        }
```

```javascript
class SecureVectorStore {
  async query(embedding, userContext, topK = 5) {
    const accessFilter = this.buildAccessFilter(userContext);
    const results = await this.vectorDb.search({
      vector: embedding,
      filter: accessFilter,
      limit: topK,
    });
    logEvent('vector_query', {
      user: userContext.userId,
      resultsCount: results.length,
      filterApplied: accessFilter,
    });
    return results;
  }

  buildAccessFilter(userContext) {
    return {
      department: { $in: userContext.allowedDepartments },
      classification: { $lte: userContext.clearanceLevel },
    };
  }
}
```


### Pattern 2: Multi-tenant isolation

```python
class MultiTenantVectorStore:
    def upsert(self, tenant_id: str, documents: list):
        for doc in documents:
            doc["metadata"]["tenant_id"] = tenant_id
        self.vector_db.upsert(documents)

    def query(self, tenant_id: str, embedding: list, top_k: int = 5) -> list:
        # ALWAYS filter by tenant — never allow cross-tenant retrieval
        return self.vector_db.search(
            vector=embedding,
            filter={"tenant_id": tenant_id},
            limit=top_k
        )
```

```javascript
class MultiTenantVectorStore {
  async upsert(tenantId, documents) {
    for (const doc of documents) {
      doc.metadata.tenantId = tenantId;
    }
    await this.vectorDb.upsert(documents);
  }

  async query(tenantId, embedding, topK = 5) {
    // ALWAYS filter by tenant
    return this.vectorDb.search({
      vector: embedding,
      filter: { tenantId },
      limit: topK,
    });
  }
}
```


### Pattern 3: Retrieved context validation

```python
def validate_retrieved_context(results: list, query: str) -> list:
    """Filter out suspicious or irrelevant retrieval results."""
    validated = []
    for result in results:
        # Check relevance score threshold
        if result["score"] < MIN_RELEVANCE_SCORE:
            continue
        # Check for injection patterns in retrieved content
        if check_injection_patterns(result["content"])["flagged"]:
            log_security_event("suspicious_retrieval", doc_id=result["id"])
            continue
        # Verify document is still current
        if result["metadata"].get("expires_at") and result["metadata"]["expires_at"] < now():
            continue
        validated.append(result)
    return validated
```

```javascript
function validateRetrievedContext(results, query) {
  return results.filter(result => {
    if (result.score < MIN_RELEVANCE_SCORE) return false;
    if (checkInjectionPatterns(result.content).flagged) {
      logSecurityEvent('suspicious_retrieval', { docId: result.id });
      return false;
    }
    if (result.metadata.expiresAt && new Date(result.metadata.expiresAt) < new Date())
      return false;
    return true;
  });
}
```



### Pattern 4: Embedding endpoint access control

```python
class SecureEmbeddingService:
    def embed(self, text: str, user_context: dict) -> list:
        """Only authorized users can generate embeddings."""
        if not self.authorize(user_context, "embed"):
            log_security_event("unauthorized_embed_attempt", user=user_context["user_id"])
            raise PermissionError("Not authorized to generate embeddings")
        embedding = self.model.encode(text)
        log_event("embedding_generated", user=user_context["user_id"],
                  text_hash=hashlib.sha256(text.encode()).hexdigest())
        return embedding
```

```javascript
class SecureEmbeddingService {
  async embed(text, userContext) {
    if (!this.authorize(userContext, 'embed')) {
      logSecurityEvent('unauthorized_embed_attempt', { user: userContext.userId });
      throw new Error('Not authorized to generate embeddings');
    }
    const embedding = await this.model.encode(text);
    logEvent('embedding_generated', {
      user: userContext.userId,
      textHash: crypto.createHash('sha256').update(text).digest('hex'),
    });
    return embedding;
  }
}
```

### Pattern 5: Document permission inheritance

```python
def embed_with_permissions(document: dict, source_permissions: dict) -> dict:
    """Embeddings inherit the access permissions of their source documents."""
    embedding = embed_model.encode(document["content"])
    return {
        "embedding": embedding,
        "metadata": {
            "source_doc_id": document["id"],
            "source_chunk": document.get("chunk_index"),
            "permissions": source_permissions,  # Inherited from source
            "department": source_permissions.get("department"),
            "classification": source_permissions.get("classification"),
            "embedded_at": datetime.utcnow().isoformat(),
        }
    }
```

```javascript
async function embedWithPermissions(document, sourcePermissions) {
  const embedding = await embedModel.encode(document.content);
  return {
    embedding,
    metadata: {
      sourceDocId: document.id,
      sourceChunk: document.chunkIndex,
      permissions: sourcePermissions,
      department: sourcePermissions.department,
      classification: sourcePermissions.classification,
      embeddedAt: new Date().toISOString(),
    },
  };
}
```

## Anti-patterns

- **No tenant isolation in multi-tenant RAG.** Always filter by tenant ID.
- **Returning all results regardless of relevance score.** Set minimum thresholds.
- **No access control on the vector database.** Apply the same access controls as the source data.

## Related files

- **data-integrity.md:** All data entering the RAG pipeline must be validated using data-integrity.md Pattern 2 (RAG data validation pipeline) before embedding. RAG security controls access to the vector store; data integrity controls what goes into it.
- **input-validation.md:** Retrieved context can contain injection payloads. Apply input-validation.md Pattern 5 (injection pattern detection) to retrieved documents, not just direct user input. Pattern 3 of this file handles this but the injection patterns come from input-validation.
- **pii-handling.md:** Documents in the vector store may contain PII. Apply pii-handling.md Pattern 1 (PII redaction) before embedding documents, or ensure access controls (Pattern 1 of this file) prevent unauthorized PII retrieval.

## Edge cases

- **Embedding inversion attacks.** Attackers reconstructing source text from embeddings. Use access controls on embedding endpoints.
- **Cross-collection leakage.** Ensure collections with different sensitivity levels are isolated.
- **Stale embeddings.** When source documents are updated or deleted, embeddings must be updated too.
