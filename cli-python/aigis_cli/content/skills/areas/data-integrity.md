---
id: data-integrity
title: Data integrity and poisoning prevention
controls:
  owasp: [LLM04]
  nist: [MAP-2.3, MEASURE-2.6]
  iso42001: [Annex-A.7]
min_risk_tier: all
system_traits: [uses-rag, uses-finetuned]
---

## What this addresses

OWASP LLM04 covers data and model poisoning — manipulation of training, fine-tuning, or RAG data to introduce biases, backdoors, or vulnerabilities. Particularly critical when using external data sources for retrieval-augmented generation.

## Implementation patterns

### Pattern 1: Data provenance tracking

```python
class DataProvenanceTracker:
    def record_ingestion(self, source: str, data: bytes, metadata: dict) -> str:
        doc_id = generate_id()
        record = {
            "doc_id": doc_id,
            "source": source,
            "ingested_at": datetime.utcnow().isoformat(),
            "checksum": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "ingested_by": metadata.get("user"),
            "source_verified": metadata.get("verified", False)
        }
        self.provenance_store.insert(record)
        return doc_id

    def verify_integrity(self, doc_id: str, data: bytes) -> bool:
        record = self.provenance_store.get(doc_id)
        current_checksum = hashlib.sha256(data).hexdigest()
        return current_checksum == record["checksum"]
```

```javascript
const crypto = require('crypto');

class DataProvenanceTracker {
  async recordIngestion(source, data, metadata) {
    const docId = generateId();
    const record = {
      docId,
      source,
      ingestedAt: new Date().toISOString(),
      checksum: crypto.createHash('sha256').update(data).digest('hex'),
      sizeBytes: data.length,
      ingestedBy: metadata.user,
      sourceVerified: metadata.verified || false,
    };
    await this.provenanceStore.insert(record);
    return docId;
  }

  async verifyIntegrity(docId, data) {
    const record = await this.provenanceStore.get(docId);
    const currentChecksum = crypto.createHash('sha256').update(data).digest('hex');
    return currentChecksum === record.checksum;
  }
}
```


### Pattern 2: RAG data validation pipeline

```python
def validate_before_embedding(document: dict) -> bool:
    """Validate documents before they enter the vector store."""
    # Check source trustworthiness
    if document["source"] not in TRUSTED_SOURCES:
        log_event("untrusted_source_rejected", source=document["source"])
        return False
    # Check for injection patterns in content
    if check_injection_patterns(document["content"])["flagged"]:
        log_event("suspicious_content_rejected", doc_id=document["id"])
        return False
    # Check document freshness
    if document.get("last_updated"):
        age_days = (datetime.utcnow() - document["last_updated"]).days
        if age_days > MAX_DOCUMENT_AGE_DAYS:
            log_event("stale_document_flagged", doc_id=document["id"], age=age_days)
            return False
    return True
```

```javascript
async function validateBeforeEmbedding(document) {
  if (!TRUSTED_SOURCES.includes(document.source)) {
    logEvent('untrusted_source_rejected', { source: document.source });
    return false;
  }
  if (checkInjectionPatterns(document.content).flagged) {
    logEvent('suspicious_content_rejected', { docId: document.id });
    return false;
  }
  if (document.lastUpdated) {
    const ageDays = (Date.now() - new Date(document.lastUpdated)) / 86400000;
    if (ageDays > MAX_DOCUMENT_AGE_DAYS) {
      logEvent('stale_document_flagged', { docId: document.id, age: Math.round(ageDays) });
      return false;
    }
  }
  return true;
}
```


### Pattern 3: Fine-tuning data checksums

```python
def prepare_training_data(dataset_path: str) -> dict:
    """Create checksummed, versioned training data package."""
    data = load_dataset(dataset_path)
    return {
        "data": data,
        "version": generate_version(),
        "checksum": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        "record_count": len(data),
        "created_at": datetime.utcnow().isoformat(),
        "schema_version": TRAINING_DATA_SCHEMA_VERSION
    }
```

```javascript
const crypto = require('crypto');

function prepareTrainingData(dataset) {
  const serialized = JSON.stringify(dataset, Object.keys(dataset).sort());
  return {
    data: dataset,
    version: generateVersion(),
    checksum: crypto.createHash('sha256').update(serialized).digest('hex'),
    recordCount: dataset.length,
    createdAt: new Date().toISOString(),
    schemaVersion: TRAINING_DATA_SCHEMA_VERSION,
  };
}
```



### Pattern 4: Anomaly detection on embedding distributions

```python
import numpy as np

class EmbeddingDistributionMonitor:
    def __init__(self, baseline_embeddings: np.ndarray):
        self.baseline_mean = np.mean(baseline_embeddings, axis=0)
        self.baseline_std = np.std(baseline_embeddings, axis=0)

    def check_batch(self, new_embeddings: np.ndarray, threshold: float = 3.0) -> dict:
        new_mean = np.mean(new_embeddings, axis=0)
        z_scores = np.abs((new_mean - self.baseline_mean) / (self.baseline_std + 1e-8))
        anomalous_dims = np.sum(z_scores > threshold)
        is_anomalous = anomalous_dims > len(z_scores) * 0.1  # >10% dims shifted
        if is_anomalous:
            log_security_event("embedding_distribution_shift",
                               anomalous_dims=int(anomalous_dims),
                               max_z=float(np.max(z_scores)))
        return {"anomalous": is_anomalous, "anomalous_dimensions": int(anomalous_dims)}
```

```javascript
class EmbeddingDistributionMonitor {
  constructor(baselineEmbeddings) {
    this.baselineMean = this.mean(baselineEmbeddings);
    this.baselineStd = this.std(baselineEmbeddings);
  }

  checkBatch(newEmbeddings, threshold = 3.0) {
    const newMean = this.mean(newEmbeddings);
    const zScores = this.baselineMean.map((bm, i) =>
      Math.abs((newMean[i] - bm) / (this.baselineStd[i] + 1e-8))
    );
    const anomalousDims = zScores.filter(z => z > threshold).length;
    const isAnomalous = anomalousDims > zScores.length * 0.1;
    if (isAnomalous)
      logSecurityEvent('embedding_distribution_shift', { anomalousDims });
    return { anomalous: isAnomalous, anomalousDimensions: anomalousDims };
  }

  mean(matrix) { /* compute column means */ }
  std(matrix) { /* compute column stds */ }
}
```

### Pattern 5: Batch rollback for poisoned data

```python
class DataBatchManager:
    def ingest_batch(self, batch_id: str, documents: list) -> dict:
        """Ingest with rollback capability."""
        ingested_ids = []
        try:
            for doc in documents:
                if not validate_before_embedding(doc):
                    raise ValueError(f"Validation failed for doc {doc['id']}")
                doc_id = self.vector_store.upsert(doc)
                ingested_ids.append(doc_id)
            self.batch_store.record(batch_id, ingested_ids, status="complete")
            return {"status": "complete", "count": len(ingested_ids)}
        except Exception as e:
            self.rollback(batch_id, ingested_ids)
            return {"status": "rolled_back", "error": str(e)}

    def rollback(self, batch_id: str, doc_ids: list):
        for doc_id in doc_ids:
            self.vector_store.delete(doc_id)
        self.batch_store.record(batch_id, doc_ids, status="rolled_back")
        log_event("batch_rolled_back", batch_id=batch_id, count=len(doc_ids))
```

```javascript
class DataBatchManager {
  async ingestBatch(batchId, documents) {
    const ingestedIds = [];
    try {
      for (const doc of documents) {
        if (!(await validateBeforeEmbedding(doc)))
          throw new Error('Validation failed for doc ' + doc.id);
        const docId = await this.vectorStore.upsert(doc);
        ingestedIds.push(docId);
      }
      await this.batchStore.record(batchId, ingestedIds, 'complete');
      return { status: 'complete', count: ingestedIds.length };
    } catch (e) {
      await this.rollback(batchId, ingestedIds);
      return { status: 'rolled_back', error: e.message };
    }
  }

  async rollback(batchId, docIds) {
    for (const docId of docIds) await this.vectorStore.delete(docId);
    await this.batchStore.record(batchId, docIds, 'rolled_back');
    logEvent('batch_rolled_back', { batchId, count: docIds.length });
  }
}
```

## Anti-patterns

- **Ingesting data from unverified sources into RAG.** Validate source trustworthiness.
- **No checksums on training data.** Always verify data integrity before training.
- **No monitoring for anomalous model behavior after data updates.** Track output distributions.

## Edge cases

- **Adversarial documents.** Documents crafted to influence RAG retrieval (SEO-like attacks on vector search).
- **Slow poisoning.** Gradual introduction of biased data over time. Monitor distribution shifts.
- **Third-party data feeds.** External data sources can be compromised. Validate at every sync.
