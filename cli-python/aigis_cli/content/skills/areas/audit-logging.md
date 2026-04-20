---
id: audit-logging
title: Audit logging and traceability
controls:
  owasp: []
  nist: [MEASURE-2.8, MANAGE-4.1, MANAGE-4.3]
  iso42001: [Clause-9.1, Annex-A.6]
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

## Related infrastructure

- `aigis infra logging` — `structlog` JSON-to-stdout setup with a concrete `REDACT_KEYS` list, plus integration patterns for Datadog/New Relic/Honeycomb, CloudWatch, Sentry (with the `max_request_body_size='never'` warning), and OpenTelemetry/OTLP.
- `aigis infra secrets` — keep API keys and connection strings out of the structured fields you log.
