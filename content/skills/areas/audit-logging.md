---
id: audit-logging
title: Audit logging and traceability
controls:
  owasp: []
  nist: [MEASURE-2.8, MANAGE-4.1, MANAGE-4.3]
  iso42001: [Clause-9.1, Annex-A.6]
  eu_ai_act: [Art-12, Art-12(1), Art-12(2)]
min_risk_tier: all
system_traits: [uses-llm]
---

## What this addresses

Every AI system needs an audit trail. NIST MANAGE 4.1 requires post-deployment monitoring with mechanisms for evaluating system behavior. ISO 42001 Clause 9.1 requires systematic monitoring and measurement. Without structured logging, you cannot debug failures, investigate incidents, demonstrate compliance, or detect drift.

## Implementation patterns

### Pattern 1: Structured log entry for every LLM interaction

```python
import uuid
from datetime import datetime

def create_audit_entry(
    input_text: str,
    output_text: str,
    model_version: str,
    user_id: str,
    **kwargs
) -> dict:
    return {
        "trace_id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "model_version": model_version,
        "model_provider": kwargs.get("provider", "unknown"),
        "user_id": user_id,
        "input_hash": hashlib.sha256(input_text.encode()).hexdigest(),
        "input_token_count": count_tokens(input_text),
        "output_token_count": count_tokens(output_text),
        "output_redacted": redact_pii(output_text)[0],  # Never log raw PII
        "latency_ms": kwargs.get("latency_ms"),
        "status": kwargs.get("status", "success"),
        "confidence_score": kwargs.get("confidence"),
        "controls_applied": kwargs.get("controls", []),
        "override_status": kwargs.get("override", None),
    }
```

```javascript
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function createAuditEntry(inputText, outputText, modelVersion, userId, opts = {}) {
  return {
    traceId: uuidv4(),
    timestamp: new Date().toISOString(),
    modelVersion,
    modelProvider: opts.provider || 'unknown',
    userId,
    inputHash: crypto.createHash('sha256').update(inputText).digest('hex'),
    inputTokenCount: countTokens(inputText),
    outputTokenCount: countTokens(outputText),
    outputRedacted: redactPii(outputText).text,
    latencyMs: opts.latencyMs,
    status: opts.status || 'success',
    confidenceScore: opts.confidence,
    controlsApplied: opts.controls || [],
    overrideStatus: opts.override || null,
  };
}
```


### Pattern 2: Trace ID propagation

```python
import contextvars

trace_id_var = contextvars.ContextVar('trace_id')

def set_trace_id():
    tid = str(uuid.uuid4())
    trace_id_var.set(tid)
    return tid

def get_trace_id() -> str:
    return trace_id_var.get("no-trace-id")

# Use in every log call, API response, and error message
# This allows correlating a single request across all system components
```

```javascript
const { AsyncLocalStorage } = require('async_hooks');
const traceStorage = new AsyncLocalStorage();

function setTraceId() {
  const traceId = crypto.randomUUID();
  traceStorage.enterWith(traceId);
  return traceId;
}

function getTraceId() {
  return traceStorage.getStore() || 'no-trace-id';
}
```


### Pattern 3: Decision audit trail

```python
def log_decision(decision: dict, context: dict):
    """Log every AI-influenced decision with full context."""
    audit_log.info({
        "event_type": "ai_decision",
        "trace_id": get_trace_id(),
        "decision": {
            "action": decision["recommendation"],
            "confidence": decision["confidence"],
            "model_version": decision["model_version"],
        },
        "context": {
            "input_summary": context.get("summary"),  # Not raw input
            "controls_applied": context.get("controls"),
            "risk_tier": context.get("risk_tier"),
        },
        "compliance": {
            "nist_controls": ["MANAGE-4.1"],
            "iso_clause": "9.1",
            "human_reviewable": True
        }
    })
```

```javascript
function logDecision(decision, context) {
  auditLog.info({
    eventType: 'ai_decision',
    traceId: getTraceId(),
    decision: {
      action: decision.recommendation,
      confidence: decision.confidence,
      modelVersion: decision.modelVersion,
    },
    context: {
      inputSummary: context.summary,
      controlsApplied: context.controls,
      riskTier: context.riskTier,
    },
    compliance: {
      nistControls: [MANAGE-4.1'],
      isoClause: '9.1',
      humanReviewable: true,
    },
  });
}
```


## Anti-patterns

- **Logging raw PII.** Always redact before logging. See pii-handling.md.
- **Unstructured log messages.** Use structured JSON logs with consistent fields.
- **No trace ID.** Every request must have a trace ID that propagates through all components.
- **Logging only errors.** Log all interactions, not just failures. You need the baseline to detect anomalies.

## Edge cases

- **Log volume at scale.** At high volume, consider sampling non-critical logs while keeping 100% of error and decision logs.
- **Log retention and compliance.** Different regulations require different retention periods. Configure per data type.
- **Cross-system correlation.** If the AI system calls external services, propagate trace IDs via headers.

## EU AI Act extensions

> Renders only when `jurisdiction-eu` is in the user's trait set. Article 12 mandates automatic event recording over the AI system's lifetime for high-risk systems, with specific obligations on log content, format, and retention.

### Article 12 — Record-keeping obligations

- **Art 12(1) — Automatic event recording.** Logging must be automatic; manual log entries are not acceptable for compliance demonstration. The procedure above already satisfies this if structured logging is wired into the LLM call path.
- **Art 12(2) — Traceability of system functioning.** Logs must enable the deployer (or auditors) to trace the system's functioning across:
  - Period of use (each session start / end timestamps)
  - The data input that produced each output (input → output linkage via trace ID)
  - The reference data used (for RAG: which retrieved chunks; for inference: which model version)
  - Identification of natural persons involved in oversight (Article 14 cross-reference — operator id on every override)
- **Art 12(3) — For Annex III(1)(a) biometric ID systems** (additional requirements):
  - Period of each use (start/end)
  - The reference database against which input data was checked
  - The input data for which the search led to a match
  - Identity of the natural persons involved in verifying results (Art 14(5) dual control)
- **Article 19 retention** — high-risk system logs must be retained for at least **6 months**, longer if required by sector-specific Union or national law (e.g. financial services often requires 5+ years).

### Verification checkpoint (EU jurisdiction)

- Log retention is configured ≥ 6 months in the storage backend.
- Each LLM call has a trace ID linking input → output → operator (if oversight engaged).
- For systems doing biometric identification: logs include reference-database identifier + dual-confirmation operator identities per Article 14(5).
- Log access is audited (who queried what, when) — auditors will check for unauthorized access to the regulated logs themselves.

### Cross-reference

- `aigis get human-oversight` Article 14(5) — operator identity that gets logged here.
- `aigis get eu-ai-act-art-9-risk-management` — logs are the evidence base for quarterly risk re-evaluation.
- `aigis get eu-ai-act-art-73-incident-reporting` — logs are the evidence base for incident causal analysis (15-day window).

## Related infrastructure

- `aigis infra logging` — `structlog` JSON-to-stdout setup with a concrete `REDACT_KEYS` list, plus integration patterns for Datadog/New Relic/Honeycomb, CloudWatch, Sentry (with the `max_request_body_size='never'` warning), and OpenTelemetry/OTLP.
- `aigis infra secrets` — keep API keys and connection strings out of the structured fields you log.
