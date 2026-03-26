---
id: pii-handling
title: PII and sensitive data protection
controls:
  owasp: [LLM02]
  nist: [MAP-2.1, MEASURE-2.10]
  iso42001: [Annex-A.7, Annex-A.4]
min_risk_tier: all
system_traits: [processes-pii, handles-financial, handles-health, handles-proprietary, handles-minors]
---

## What this addresses

LLMs can memorize and regurgitate training data, echo PII from context windows, and leak sensitive information through creative prompting. OWASP LLM02 covers sensitive information disclosure — the risk that your system inadvertently reveals personal data, financial records, health information, or proprietary content.

## Implementation patterns

### Pattern 1: PII detection and redaction before LLM call

```python
import re

PII_PATTERNS = {
    "ssn": re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    "email": re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    "phone": re.compile(r'\b(?:\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b'),
    "credit_card": re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'),
    "dob": re.compile(r'\b(?:0[1-9]|1[0-2])/(?:0[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b'),
}

def redact_pii(text: str) -> tuple[str, dict]:
    """Returns (redacted_text, redaction_map) for potential restoration."""
    redaction_map = {}
    for pii_type, pattern in PII_PATTERNS.items():
        for i, match in enumerate(pattern.finditer(text)):
            placeholder = f"[{pii_type.upper()}_{i}]"
            redaction_map[placeholder] = match.group()
            text = text.replace(match.group(), placeholder, 1)
    return text, redaction_map
```

```javascript
const PII_PATTERNS = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
  phone: /\b(?:\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
};

function redactPii(text) {
  const redactionMap = {};
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    let i = 0;
    text = text.replace(pattern, (match) => {
      const placeholder = '[' + piiType.toUpperCase() + '_' + i + ']';
      redactionMap[placeholder] = match;
      i++;
      return placeholder;
    });
  }
  return { text, redactionMap };
}
```


### Pattern 2: Data minimization — send only what's needed

```python
def prepare_context_for_llm(claim: dict) -> str:
    """Send only the fields the LLM needs. Never the full record."""
    # CORRECT: select specific fields
    context = {
        "claim_description": claim["description"],
        "claim_type": claim["type"],
        "date_filed": claim["date_filed"]
    }
    # WRONG: sending everything
    # context = claim  # Includes SSN, address, policy details, etc.
    return json.dumps(context)
```

```javascript
function prepareContextForLlm(claim) {
  // CORRECT: select specific fields
  return JSON.stringify({
    claimDescription: claim.description,
    claimType: claim.type,
    dateFiled: claim.dateFiled,
  });
  // WRONG: JSON.stringify(claim) — includes SSN, address, etc.
}
```


### Pattern 3: Output filtering — catch PII in LLM responses

```python
def filter_output_pii(llm_response: str) -> str:
    """Scan LLM output for PII that shouldn't be there."""
    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(llm_response)
        if matches:
            log_security_event("pii_in_output", pii_type=pii_type, count=len(matches))
            llm_response = pattern.sub(f"[REDACTED_{pii_type.upper()}]", llm_response)
    return llm_response
```

```javascript
function filterOutputPii(llmResponse) {
  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = llmResponse.match(pattern);
    if (matches) {
      logSecurityEvent('pii_in_output', { piiType, count: matches.length });
      llmResponse = llmResponse.replace(pattern, '[REDACTED_' + piiType.toUpperCase() + ']');
    }
  }
  return llmResponse;
}
```


### Pattern 4: Separate PII storage from LLM-accessible data

```python
# Architecture pattern: PII lives in a separate store the LLM cannot access
class SecureDataLayer:
    def __init__(self, pii_store, llm_context_store):
        self.pii_store = pii_store          # Encrypted, access-controlled
        self.llm_context_store = llm_context_store  # Redacted, LLM-safe

    def prepare_for_llm(self, record_id: str) -> dict:
        """Fetch only LLM-safe fields."""
        return self.llm_context_store.get(record_id)

    def get_full_record(self, record_id: str, requester: str) -> dict:
        """Full record requires authentication and audit logging."""
        log_access("pii_access", record_id=record_id, requester=requester)
        return self.pii_store.get(record_id)
```

```javascript
class SecureDataLayer {
  constructor(piiStore, llmContextStore) {
    this.piiStore = piiStore;          // Encrypted, access-controlled
    this.llmContextStore = llmContextStore;  // Redacted, LLM-safe
  }

  async prepareForLlm(recordId) {
    return this.llmContextStore.get(recordId);
  }

  async getFullRecord(recordId, requester) {
    logAccess('pii_access', { recordId, requester });
    return this.piiStore.get(recordId);
  }
}
```


### Pattern 5: Logging without PII

```python
def log_llm_interaction(input_text: str, output_text: str, metadata: dict):
    """Log the interaction for audit, but never log raw PII."""
    redacted_input, _ = redact_pii(input_text)
    redacted_output, _ = redact_pii(output_text)
    audit_log.info({
        "trace_id": metadata["trace_id"],
        "input_hash": hashlib.sha256(input_text.encode()).hexdigest(),
        "input_redacted": redacted_input,
        "output_redacted": redacted_output,
        "model_version": metadata["model_version"],
        "timestamp": datetime.utcnow().isoformat()
    })
```

```javascript
const crypto = require('crypto');

function logLlmInteraction(inputText, outputText, metadata) {
  const { text: redactedInput } = redactPii(inputText);
  const { text: redactedOutput } = redactPii(outputText);
  auditLog.info({
    traceId: metadata.traceId,
    inputHash: crypto.createHash('sha256').update(inputText).digest('hex'),
    inputRedacted: redactedInput,
    outputRedacted: redactedOutput,
    modelVersion: metadata.modelVersion,
    timestamp: new Date().toISOString(),
  });
}
```


## Anti-patterns

- **Sending full database records to the LLM.** Only send the fields needed for the task.
- **Logging raw inputs/outputs containing PII.** Always redact before logging.
- **Relying on the system prompt to prevent PII disclosure.** Prompts are not security controls.
- **Storing PII and LLM-accessible data in the same store.** Separate by design.

## Edge cases

- **PII in non-obvious formats.** Names embedded in email addresses, addresses in free text, medical record numbers. Consider using a dedicated NER model for high-risk systems.
- **Cross-language PII.** Phone numbers, addresses, and ID formats vary by country. Regex patterns need locale awareness.
- **PII in images.** If processing multimodal input, images of documents contain PII that bypasses text-based redaction.
- **Children's data (COPPA/GDPR).** Requires explicit parental consent mechanisms and stricter data minimization. See handles-minors trait.
