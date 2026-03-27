---
id: input-validation
title: Input validation and sanitization
controls:
  owasp: [LLM01]
  nist: [MEASURE-2.7, MANAGE-1.3]
  iso42001: [Clause-8.2, Annex-A.6]
min_risk_tier: all
system_traits: [uses-llm, accepts-user-input]
---

## What this addresses

Prompt injection is the #1 security risk for LLM applications (OWASP LLM01:2025). Attackers manipulate inputs to override system instructions, extract sensitive data, or trigger unintended behavior. Two vectors: direct injection (malicious user input) and indirect injection (malicious content in documents or data the LLM processes).

## Implementation patterns

### Pattern 1: Input length enforcement

```python
MAX_INPUT_LENGTH = 4000  # characters
MAX_INPUT_TOKENS = 1000  # tokens

def validate_input_length(user_input: str) -> str:
    if len(user_input) > MAX_INPUT_LENGTH:
        raise ValueError(f"Input exceeds {MAX_INPUT_LENGTH} characters")
    token_count = len(tokenizer.encode(user_input))
    if token_count > MAX_INPUT_TOKENS:
        raise ValueError(f"Input exceeds {MAX_INPUT_TOKENS} tokens")
    return user_input
```

```javascript
const MAX_INPUT_LENGTH = 4000;
const MAX_INPUT_TOKENS = 1000;

function validateInputLength(userInput) {
  if (userInput.length > MAX_INPUT_LENGTH)
    throw new Error(`Input exceeds ${MAX_INPUT_LENGTH} characters`);
  const tokenCount = tokenizer.encode(userInput).length;
  if (tokenCount > MAX_INPUT_TOKENS)
    throw new Error(`Input exceeds ${MAX_INPUT_TOKENS} tokens`);
  return userInput;
}
```

### Pattern 2: System/user prompt separation

Never concatenate user input into the system prompt. Use the API's native role separation.

```python
# CORRECT
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": sanitize_input(user_input)}
]

# WRONG - never do this
prompt = SYSTEM_PROMPT + "\nUser says: " + user_input
```

```javascript
// CORRECT
const messages = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: sanitizeInput(userInput) }
];

// WRONG - never do this
// const prompt = SYSTEM_PROMPT + '\nUser says: ' + userInput;
```


### Pattern 3: Character and encoding sanitization

```python
import unicodedata, re

DANGEROUS_CHARS = re.compile(
    '[\x00-\x08\x0b\x0c\x0e-\x1f'
    '\u200b-\u200f'
    '\u202a-\u202e'
    '\u2060-\u2064'
    '\ufeff]'
)

def sanitize_input(raw_input: str) -> str:
    cleaned = DANGEROUS_CHARS.sub('', raw_input)
    cleaned = unicodedata.normalize('NFC', cleaned)
    return cleaned.strip()
```

```javascript
const DANGEROUS_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

function sanitizeInput(rawInput) {
  let cleaned = rawInput.replace(DANGEROUS_CHARS, '');
  cleaned = cleaned.normalize('NFC');
  return cleaned.trim();
}
```


### Pattern 4: Output schema enforcement

```python
from pydantic import BaseModel, Field
from enum import Enum

class Recommendation(str, Enum):
    FAST_TRACK = "fast-track"
    STANDARD = "standard"
    ESCALATE = "escalate"

class AssessmentOutput(BaseModel):
    severity_score: int = Field(ge=1, le=10)
    recommendation: Recommendation
    confidence: float = Field(ge=0.0, le=1.0)

def validate_llm_output(raw_response: str) -> AssessmentOutput:
    try:
        return AssessmentOutput(**json.loads(raw_response))
    except (json.JSONDecodeError, ValidationError) as e:
        log_anomaly("output_schema_violation", raw_response, str(e))
        return default_safe_response()  # See fallback-patterns.md Pattern 1 (default safe response) for the fallback value
```

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

const outputSchema = {
  type: 'object',
  properties: {
    severity_score: { type: 'integer', minimum: 1, maximum: 10 },
    recommendation: { type: 'string', enum: ['fast-track', 'standard', 'escalate'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['severity_score', 'recommendation', 'confidence'],
  additionalProperties: false
};
const validate = ajv.compile(outputSchema);

function validateLlmOutput(rawResponse) {
  try {
    const parsed = JSON.parse(rawResponse);
    if (!validate(parsed)) {
      logAnomaly('output_schema_violation', rawResponse, validate.errors);
      return defaultSafeResponse();  // See fallback-patterns.md Pattern 1
    }
    return parsed;
  } catch (e) {
    logAnomaly('output_parse_failure', rawResponse, e.message);
    return defaultSafeResponse();
  }
}
```


### Pattern 5: Injection pattern detection (defense in depth)

```python
SUSPICIOUS_PATTERNS = [
    "ignore previous instructions", "ignore all prior",
    "you are now", "system prompt", "reveal your instructions",
    "act as", "pretend you are", "do not follow",
    "disregard", "new instructions:",
]

def check_injection_patterns(user_input: str) -> dict:
    input_lower = user_input.lower()
    for pattern in SUSPICIOUS_PATTERNS:
        if pattern in input_lower:
            log_security_event("injection_pattern_detected", pattern=pattern)
            return {"flagged": True, "pattern": pattern}
    return {"flagged": False}
```

```javascript
const SUSPICIOUS_PATTERNS = [
  'ignore previous instructions', 'ignore all prior',
  'you are now', 'system prompt', 'reveal your instructions',
  'act as', 'pretend you are', 'do not follow',
  'disregard', 'new instructions:',
];

function checkInjectionPatterns(userInput) {
  const inputLower = userInput.toLowerCase();
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (inputLower.includes(pattern)) {
      logSecurityEvent('injection_pattern_detected', { pattern });
      return { flagged: true, pattern };
    }
  }
  return { flagged: false };
}
```


## Anti-patterns

- **String concatenation for prompts.** Never use f-strings or template literals to build prompts.
- **Client-side-only validation.** Validation must happen server-side.
- **Blocklist-only approach.** Blocklists are defense-in-depth, not primary controls.
- **Silent truncation.** Return an error on length violations; truncation changes meaning.

## Edge cases

- **Indirect injection via documents.** Apply same sanitization to extracted document text.
- **Multi-turn conversations.** Cumulative length limits on conversation context.
- **Multimodal inputs.** Images may contain text visible to vision models.
- **Tool/function calling.** Combine with human-oversight.md for tool-using systems.
