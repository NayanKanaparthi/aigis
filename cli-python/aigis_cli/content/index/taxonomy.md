---
id: classification-taxonomy
title: System trait classification taxonomy
version: "1.1"
---

# Classification taxonomy

Select all traits that apply to the AI system being built. The combination determines risk tier and which implement/ files to fetch.

## AI architecture

| Trait | Description | Triggers files |
|-------|-------------|----------------|
| uses-llm | System calls or embeds a large language model | input-validation, output-sanitization, prompt-security, audit-logging, monitoring |
| uses-rag | System retrieves context from a vector database before LLM inference | rag-security, data-integrity |
| uses-finetuned | System uses a fine-tuned or custom-trained model | data-integrity, supply-chain |
| uses-thirdparty-api | System calls an external model provider API | supply-chain |
| is-agentic | System takes actions autonomously (DB writes, API calls, code execution) | human-oversight, rate-limiting, fallback-patterns, audit-logging |
| is-multimodal | System processes or generates images, audio, or video | input-validation, output-sanitization, pii-handling |

## Data sensitivity

| Trait | Description | Triggers files |
|-------|-------------|----------------|
| processes-pii | System ingests, processes, or outputs personally identifiable information | pii-handling, audit-logging |
| handles-financial | System processes financial records, transactions, or credit data | pii-handling, audit-logging, bias-monitoring |
| handles-health | System processes health records, medical histories, or clinical data | pii-handling, audit-logging, bias-monitoring, explainability |
| handles-proprietary | System processes confidential business info or trade secrets | pii-handling, prompt-security |
| handles-minors | System may process data from or about minors | pii-handling, bias-monitoring, human-oversight |

## Impact scope

| Trait | Description | Triggers files |
|-------|-------------|----------------|
| influences-decisions | System output influences decisions about specific people | bias-monitoring, confidence-scoring, human-oversight, explainability |
| accepts-user-input | System accepts unstructured text input from users | input-validation, output-sanitization |
| is-external | System is accessible to customers or public users | rate-limiting, confidence-scoring |
| is-internal | System is accessible only to employees | (no direct file triggers — reduces risk tier if sole scope trait) |
| is-high-volume | System handles >1000 requests/day or >100 concurrent users | rate-limiting, monitoring, fallback-patterns |

## Output type

| Trait | Description | Triggers files |
|-------|-------------|----------------|
| generates-code | System produces code that is subsequently executed | output-sanitization, human-oversight, fallback-patterns |
| generates-content | System produces text/media published externally | confidence-scoring, bias-monitoring, audit-logging |
| multi-model-pipeline | System chains multiple AI models in sequence | audit-logging, monitoring, fallback-patterns, data-integrity |

## Regulatory jurisdiction

| Trait | Description | Effect |
|-------|-------------|--------|
| jurisdiction-eu | System deployed in or serving EU users (EU AI Act scope) | Elevates risk tier by one level. Forces ai-impact-assessment. Adds bias-monitoring and explainability via guardrails |
| jurisdiction-us-regulated | System in US regulated sector (HIPAA, FCRA, FERPA, etc.) | Forces ai-impact-assessment and intended-purpose-doc. Adds audit-logging and human-oversight via guardrails |
| jurisdiction-global | System serves users across multiple countries | Treated as jurisdiction-eu (applies strictest rules) |

---

# Risk tier rules

HIGH if: influences-decisions OR handles-health OR (handles-financial AND accepts-user-input) OR handles-minors OR (jurisdiction-eu AND any-sensitive-data) OR (generates-code AND is-external) OR (generates-code AND is-agentic)

MEDIUM if: processes-pii OR is-external OR is-agentic OR handles-proprietary OR generates-content OR multi-model-pipeline OR jurisdiction-us-regulated OR generates-code

LOW if: none of the above

Modifier: jurisdiction-eu elevates tier by one level (LOW->MEDIUM, MEDIUM->HIGH). jurisdiction-global treated as jurisdiction-eu.
Modifier: is-internal with no other medium/high triggers keeps tier at LOW.
Constraint: is-internal and is-external cannot both be true. If both provided, treat as is-external and log warning.

---

# Templates by risk tier

HIGH: ai-impact-assessment, intended-purpose-doc, risk-characterization, third-party-assessment (if uses-thirdparty-api)
MEDIUM: intended-purpose-doc, third-party-assessment (if uses-thirdparty-api)
LOW: none required (intended-purpose-doc recommended)

Override: jurisdiction-eu always forces ai-impact-assessment regardless of tier.
Override: jurisdiction-us-regulated always forces ai-impact-assessment and intended-purpose-doc regardless of tier.
