---
id: pii-handling
title: PII and sensitive data protection
controls:
  owasp: [LLM02]
  nist: [MAP-2.1, MEASURE-2.10]
  iso42001: [Annex-A.7, Annex-A.4]
min_risk_tier: all
system_traits: [processes-pii, handles-financial, handles-health, handles-minors]
---

Personally identifiable information that reaches the LLM (or the logs of LLM calls) leaks control of that data to the provider and to anyone with log access. This procedure redacts PII before it crosses those boundaries.

## Common incomplete implementations

1. **Partial pattern coverage.** Three classes out of five (typically: SSN + email + phone OR SSN + credit card + email). The one class most often missed is **physical addresses**, because addresses are harder to regex than structured fields. Missing any of the five below leaves a class of PII flowing to the LLM unredacted.
2. **Redaction on LLM input but not logs.** Redacting what goes to the model protects the model; logs of the raw request to the handler still contain raw PII.
3. **Hashable placeholder.** Using `hash(ssn)` or similar as the replacement. The hash is deterministic — anyone who observes a log entry with a given hash and has a candidate SSN can verify the match. Use non-reversible labels like `[SSN_REDACTED]`.
4. **Redaction applied only at one entry point.** If your handler ingests claim text in multiple places (main endpoint + retry endpoint + batch endpoint), every entry point must route through the redactor.

## The five required pattern classes

Every implementation of this pattern must cover these five classes at minimum:

| Class | What it matches | Example |
|---|---|---|
| `ssn` | US Social Security Numbers | `123-45-6789` |
| `email` | Email addresses | `alice@example.com` |
| `phone` | US phone numbers (with or without country code, with or without separators) | `(555) 123-4567`, `+1-555-123-4567` |
| `credit_card` | 13-19 digit card numbers with optional separators | `4242 4242 4242 4242` |
| `address` | US street addresses with directional / street-type tokens | `123 Main St`, `456 Elm Avenue, Apt 2B` |

Domain-specific classes (date of birth, account numbers, medical record numbers) should be added on top of these five, not in place of any of them.

## Implementation procedure

### Step 1 — Define PII_PATTERNS with all five required keys ⚠ CRITICAL

**What to do.** Create a dictionary (or equivalent structure) named `PII_PATTERNS` with exactly these keys: `ssn`, `email`, `phone`, `credit_card`, `address`. Each value is the regex that matches that class.

**Why this matters.** The regex dict is the single source of truth for what your redactor knows about. If a key is missing from the dict, it doesn't matter how careful the rest of your code is — that class of PII flows through.

```python
import re

PII_PATTERNS = {
    "ssn":          re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "email":        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "phone":        re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "credit_card":  re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
    "address":      re.compile(
        r"\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}"
        r"(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Ln|Lane|Dr|Drive|Way|Ct|Court|Pl|Place|Sq|Square|Pkwy|Parkway|Terr|Terrace)\b"
        r"(?:,?\s*(?:Apt|Suite|Ste|Unit|#)\s*[\w-]+)?",
        re.IGNORECASE,
    ),
}
```

**Verification checkpoint.** Count the keys. The dictionary must have **exactly five** keys named `ssn`, `email`, `phone`, `credit_card`, `address`. If any is missing, add it before continuing. If you have additional keys for domain-specific classes, that is fine — do not remove them. But do not claim the redactor is complete without all five required keys.

### Step 2 — Write a redaction function with non-reversible placeholders

**What to do.** Implement `redact_pii(text) -> (redacted_text, seen: list[str])` that iterates `PII_PATTERNS` and replaces each match with a label like `[<CLASS>_REDACTED]`. Return the list of classes seen for metric / log context.

**Why this matters.** Reversible placeholders (hashes of PII) defeat the purpose — anyone with a candidate value can verify a match. Non-reversible labels keep the boundary intact.

**Verification checkpoint.** Run the redactor against a test string containing every required class. All five should be replaced; none of the originals should appear in the output. See the complete example at the end for the implementation + test.

### Step 3 — Call the redactor on every LLM input path

**What to do.** For every place in the code where user-provided text goes to the LLM, pass it through `redact_pii` first. Use the redacted text in the LLM request. Originals stay in the handler stack frame only — never in logs or persistent stores.

**Why this matters.** Redaction at the wrong layer leaks. If one endpoint redacts and another doesn't, the system leaks through the other.

**Verification checkpoint.** `grep -rn "messages.create\|chat.completions.create"` — every hit must be preceded by a call to `redact_pii` in the same function. Any callsite passing raw user text to the LLM is a leak.

### Step 4 — Redact PII from log output as well

**What to do.** Every log entry that contains user input or LLM output must use the redacted text, not raw. Hash the raw input with SHA-256 for correlation (`input_hash`) but never log the plaintext.

**Why this matters.** Redacting the model path protects the model; redacting logs protects everyone with log access from incidental exposure.

**Verification checkpoint.** `grep -rn "logger\.\(info\|warning\|error\)" --include="*.py"` — every hit that includes request or model text must route through `redact_pii` or use a hashed identifier. No raw user strings in logs.

### Step 5 — Add domain-specific classes on top

**What to do.** Consider whether your domain introduces additional classes of sensitive data. Add them to `PII_PATTERNS` — do not remove any of the five required ones.

Common additions:

| Class | When to add |
|---|---|
| `dob` | Any system handling identity, insurance, medical, or minors |
| `account_number` | Financial or utility systems |
| `medical_record` | Health systems (ICD codes, MRN formats) |
| `drivers_license` | Insurance, age verification, identity |
| `passport` | Travel, immigration, identity |

**Verification checkpoint.** If your classify output included `handles-financial`, `handles-health`, or `handles-minors`, you have at least one domain-specific class to consider.

### Step 6 — Redact the model's output too

**What to do.** The LLM may reproduce PII from its input, or hallucinate PII-shaped output. Before returning the model's output to the user or to logs, run it through `redact_pii` as well.

**Why this matters.** Even with redaction on the input, the model can echo PII if you prompt it incorrectly or if the model confabulates something shaped like a phone number. Treat model output as untrusted PII-wise.

**Verification checkpoint.** The response payload that leaves your handler has been through `redact_pii` on the free-text fields. Structured fields (scores, enums) do not need redaction.

## Complete working example

```python
"""PII redaction for LLM input, logs, and output."""

from __future__ import annotations

import hashlib
import json
import logging
import re

logger = logging.getLogger("pii")
audit = logging.getLogger("audit")


# ─── Step 1 — five required classes (+ one domain-specific) ────────────
PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "ssn":          re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "email":        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "phone":        re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "credit_card":  re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
    "address":      re.compile(
        r"\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}"
        r"(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Ln|Lane|Dr|Drive|Way|Ct|Court|Pl|Place|Sq|Square|Pkwy|Parkway|Terr|Terrace)\b"
        r"(?:,?\s*(?:Apt|Suite|Ste|Unit|#)\s*[\w-]+)?",
        re.IGNORECASE,
    ),
    # Step 5 — domain-specific add-on; not one of the required five
    "dob":          re.compile(r"\b(?:0[1-9]|1[0-2])/(?:0[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b"),
}


# ─── Step 2 — redaction with non-reversible placeholders ───────────────
def redact_pii(text: str) -> tuple[str, list[str]]:
    seen: list[str] = []
    out = text
    for pii_type, pattern in PII_PATTERNS.items():
        if pattern.search(out):
            seen.append(pii_type)
            out = pattern.sub(f"[{pii_type.upper()}_REDACTED]", out)
    return out, seen


# ─── Step 3+6 — redact input before LLM and output before return ───────
def call_llm_with_redaction(user_text: str, trace_id: str, invoke) -> dict:
    redacted_input, seen_in = redact_pii(user_text)
    raw_output = invoke(redacted_input)                          # invoke returns model text
    redacted_output, seen_out = redact_pii(raw_output)

    # Step 4 — log with hashed input + redacted text only
    audit.info(json.dumps({
        "trace_id": trace_id,
        "input_hash": hashlib.sha256(user_text.encode()).hexdigest(),
        "input_redacted": redacted_input[:500],
        "output_redacted": redacted_output[:2000],
        "pii_types_in_input": seen_in,
        "pii_types_in_output": seen_out,
    }))

    return {"text": redacted_output}
```

## Related patterns

- `input-validation.md` — sanitization of user input prior to any LLM call (zero-width unicode, prompt-injection patterns).
- `audit-logging.md` — structure of log entries; works with this pattern's `input_hash` convention.
