---
id: audit-scan
title: Aigis codebase audit scan prompt
version: "1.1"
purpose: Structured instructions for an agent to scan an existing codebase, detect system traits, identify governance gaps, and produce a compliance report
---

# AIGIS CODEBASE AUDIT

Follow these instructions exactly. Complete every section. Do not skip any check.

---

## PHASE 1: PROJECT INVENTORY

Before analyzing governance, build a complete picture of what exists.

### 1.1 File discovery

Scan the project and document:

- [ ] **Primary language(s):** (Python, JavaScript/TypeScript, Go, Java, etc.)
- [ ] **Package manager files:** (requirements.txt, package.json, pyproject.toml, go.mod, pom.xml)
- [ ] **Environment/config files:** (.env, .env.example, config.yaml, settings.py, etc.)
- [ ] **API route definitions:** (FastAPI routes, Express routes, Flask blueprints, etc.)
- [ ] **Test files:** (test directories, test files, testing frameworks used)
- [ ] **Deployment files:** (Dockerfile, docker-compose, kubernetes manifests, CI/CD configs)
- [ ] **Documentation:** (README, docs/, API specs, architecture docs)

### 1.2 Dependency analysis

Read the dependency files and list:

- [ ] **LLM client libraries:** (openai, anthropic, cohere, google-generativeai, langchain, llama-index, transformers, vllm, ollama)
- [ ] **Vector database clients:** (pinecone-client, chromadb, weaviate-client, qdrant-client, pgvector, faiss, milvus)
- [ ] **Embedding libraries:** (sentence-transformers, openai embeddings, cohere embed)
- [ ] **ML/AI frameworks:** (tensorflow, pytorch, scikit-learn, huggingface)
- [ ] **Web frameworks:** (fastapi, flask, django, express, next.js, nestjs)
- [ ] **Database clients:** (sqlalchemy, prisma, mongoose, knex, sequelize)
- [ ] **Authentication libraries:** (jwt, oauth, passport, auth0, clerk)
- [ ] **Monitoring/logging libraries:** (winston, pino, structlog, loguru, sentry, datadog)
- [ ] **Data validation libraries:** (pydantic, zod, joi, ajv, marshmallow)

---

## PHASE 2: TRAIT DETECTION

For each trait below, search the codebase for the specified indicators. Mark YES, NO, or UNCERTAIN. If UNCERTAIN, explain what you found and why you're unsure.

### 2.1 AI architecture traits

**uses-llm**
Search for: imports of openai, anthropic, cohere, google.generativeai, langchain.llms, langchain.chat_models, llama_index, transformers pipeline, any chat.completions.create or messages API calls, any prompt template construction
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**uses-rag**
Search for: imports of vector database clients (pinecone, chromadb, weaviate, qdrant, pgvector), embedding generation calls, similarity_search or .query() on vector stores, any retrieval chain or retrieval QA construction, documents being chunked and embedded
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**uses-finetuned**
Search for: training scripts, fine-tuning code (LoRA, QLoRA, PEFT, SFT), custom model loading from local paths or HuggingFace hub with custom model IDs, dataset preparation for training, training configuration files, model checkpoints in the repo
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**uses-thirdparty-api**
Search for: API keys for model providers (OPENAI_API_KEY, ANTHROPIC_API_KEY, COHERE_API_KEY, etc.) in env files or config, base_url pointing to external providers, client initialization with API keys, any network calls to model inference endpoints
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**is-agentic**
Search for: tool/function definitions for LLM use (tools=[], functions=[], @tool decorator), LLM output being used to trigger actions (database writes, API calls, file operations, email sending), agent frameworks (langchain agents, autogen, crewai), code execution from LLM output, any loop where LLM decides the next action
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**is-multimodal**
Search for: image processing with LLMs (vision API calls, image_url in messages), audio transcription (whisper, speech-to-text), text-to-speech, image generation (DALL-E, Stable Diffusion), video processing, document OCR with AI
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

### 2.2 Data sensitivity traits

**processes-pii**
Search for: fields or variables named email, phone, ssn, address, name, date_of_birth, social_security, passport, driver_license; user profile or account models with personal fields; form inputs collecting personal data; database tables storing personal information; any data that could identify a specific individual
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**handles-financial**
Search for: fields named account_number, credit_card, transaction, balance, payment, invoice, claim, policy_number, premium; financial calculation logic; payment processing integrations (stripe, square, plaid); insurance-related models; credit scoring; loan or lending logic
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**handles-health**
Search for: fields named diagnosis, prescription, patient, medical_record, health_record, condition, symptom, treatment, ICD_code, CPT_code; HIPAA-related configuration; health data models; medical terminology in schemas; clinical data processing
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**handles-proprietary**
Search for: trade secret markers, confidential labels in code or data, proprietary algorithm implementations, competitive intelligence processing, internal strategy documents being processed, source code analysis features, IP-related data handling
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**handles-minors**
Search for: age verification logic, date_of_birth fields with age checks, COPPA compliance references, parental consent flows, fields or models related to students/children/minors, age-gating logic, under-13 or under-16 checks
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

### 2.3 Impact scope traits

**influences-decisions**
Search for: AI output being used to approve/deny/score/rank/filter people; hiring or recruitment logic; credit or loan decisions; insurance claim assessment; content moderation decisions affecting users; grading or evaluation; benefit eligibility determination; any place where AI output directly affects a specific person's outcome
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**accepts-user-input**
Search for: API endpoints accepting text body/payload from users, chat input fields, form text areas, file upload endpoints where content is sent to LLM, any route where user-provided text is concatenated into or passed alongside LLM prompts
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**is-external**
Search for: public API endpoints (no auth required, or auth for external users), customer-facing UI, public documentation referencing the AI feature, deployment configs exposing to internet, CORS configs allowing external origins, public-facing domains in config
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**is-internal**
Search for: VPN-only access configs, internal domain restrictions, employee-only auth (SSO, corporate identity), admin-only UI, deployment to internal infrastructure only
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**is-high-volume**
Search for: auto-scaling configs, load balancer references, queue/worker patterns for LLM calls, batch processing of LLM requests, rate limiting configuration suggesting high throughput, production deployment manifests with multiple replicas, usage metrics suggesting >1000 requests/day
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

### 2.4 Output type traits

**generates-code**
Search for: LLM output being passed to eval(), exec(), subprocess, child_process, vm.runInContext, or any code execution; SQL generation from LLM output; code generation features; LLM-generated scripts being saved and run; any sandbox or code execution environment
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**generates-content**
Search for: LLM output being published to websites, sent as emails to customers, posted to social media, included in reports distributed externally, used in marketing materials, displayed in customer-facing UI without human review step
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**multi-model-pipeline**
Search for: multiple different LLM calls in sequence where one model's output feeds into another's input, chain/pipeline constructions (langchain chains, sequential calls), orchestration logic connecting multiple AI models, ensemble or voting patterns across models
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

### 2.5 Regulatory jurisdiction traits

**jurisdiction-eu**
Search for: EU-specific configuration, GDPR references, EU AI Act references, .eu domains, European language localizations, EU data residency settings, European cloud regions in deployment configs, EU-specific compliance documentation
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**jurisdiction-us-regulated**
Search for: HIPAA references or BAA documentation, FCRA or fair lending references, FERPA references, FedRAMP configuration, SOC2 documentation, US financial regulation references (OCC, CFPB, SEC), state-specific AI regulation references
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

**jurisdiction-global**
Search for: multi-region deployment configs, internationalization (i18n) with multiple country locales, multiple currency support, geo-routing logic, data residency for multiple countries, multi-language support spanning different regulatory zones
- [ ] YES / NO / UNCERTAIN
- Evidence: [file:line references]

---

## PHASE 3: TRAIT SUMMARY

Based on Phase 2, compile the detected traits:

```
Detected traits: [comma-separated list of YES traits]
Uncertain traits: [comma-separated list of UNCERTAIN traits with brief reason]
```

Run: `aigis classify --traits <detected-traits> --json`

Record the output:
- Risk tier: ___
- Implement files recommended: ___
- Templates required: ___
- Guardrails fired: ___

---

## PHASE 4: EXISTING CONTROLS ASSESSMENT

For each implement file recommended by the classification, check whether the patterns are ALREADY implemented in the codebase. This is the gap analysis.

### 4.1 Input validation (if recommended)

| # | Control | What to look for in the code | Status | Evidence |
|---|---------|------------------------------|--------|----------|
| V1 | Input length check | A function or middleware that checks character count or token count of user input BEFORE it reaches the LLM call | PASS / FAIL / PARTIAL | [file:line or "not found"] |
| V2 | System/user prompt separation | LLM calls using structured messages array with role: "system" and role: "user" as separate objects, NOT string concatenation | PASS / FAIL / PARTIAL | [file:line] |
| V3 | Character sanitization | A function stripping control characters, null bytes, zero-width Unicode from user input before LLM processing | PASS / FAIL / PARTIAL | [file:line] |
| V4 | Output schema validation | LLM response being parsed and validated against a defined schema (pydantic, zod, ajv, JSON schema) before downstream use | PASS / FAIL / PARTIAL | [file:line] |
| V5 | Injection pattern detection | Any pattern matching or classification of user input for known injection phrases, even if just logging | PASS / FAIL / PARTIAL | [file:line] |

### 4.2 Output sanitization (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | HTML encoding of LLM output | LLM output being escaped/encoded before rendering in any web context | PASS / FAIL / PARTIAL | |
| V2 | Parameterized DB queries | Any database operations using LLM output use parameterized queries, not string interpolation | PASS / FAIL / PARTIAL | |
| V3 | Code execution sandboxing | If LLM generates code that is executed, it runs in a sandbox (subprocess, vm, container) not eval/exec | PASS / FAIL / PARTIAL | |
| V4 | Content type validation | LLM response content type is checked before use (is it valid JSON? is it a number? is it within allowed enum?) | PASS / FAIL / PARTIAL | |

### 4.3 PII handling (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | PII redaction before LLM | A function detecting and replacing PII (regex, NER model, or library) that runs BEFORE user data is sent to the LLM | PASS / FAIL / PARTIAL | |
| V2 | Data minimization | Only specific needed fields are extracted and sent to the LLM, not entire database records or user profiles | PASS / FAIL / PARTIAL | |
| V3 | Output PII filtering | LLM response is scanned for PII before being returned to the user or stored | PASS / FAIL / PARTIAL | |
| V4 | Separated data stores | PII is stored in a different location or with different access controls than the data the LLM can access | PASS / FAIL / PARTIAL | |
| V5 | Redacted logging | Log entries containing LLM inputs/outputs have PII redacted or hashed, not stored in plaintext | PASS / FAIL / PARTIAL | |

### 4.4 Prompt security (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | No secrets in prompts | System prompts do not contain API keys, passwords, database credentials, or tokens | PASS / FAIL / PARTIAL | |
| V2 | Minimal prompt content | System prompts contain behavioral instructions only, not detailed business logic, pricing, or internal processes | PASS / FAIL / PARTIAL | |
| V3 | Leakage detection | There is some check on LLM output for system prompt content echoing back | PASS / FAIL / PARTIAL | |
| V4 | Server-side rule enforcement | Business rules (output length, topic restrictions, format requirements) are enforced in code, not just in the prompt | PASS / FAIL / PARTIAL | |

### 4.5 Human oversight (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Tool allowlist | If LLM has tools/functions, they are defined as an explicit list (not dynamically generated or unrestricted) | PASS / FAIL / PARTIAL | |
| V2 | Write operation approval | Database writes, API calls, emails, or other state-changing actions triggered by LLM require human confirmation or are logged with review capability | PASS / FAIL / PARTIAL | |
| V3 | Action rate limiting | There are limits on how many actions the LLM can take per time window | PASS / FAIL / PARTIAL | |
| V4 | Override mechanism | API responses or UI include a way for humans to override or escalate AI decisions | PASS / FAIL / PARTIAL | |
| V5 | Confidence gating | Low-confidence outputs are flagged or routed to human review rather than auto-processed | PASS / FAIL / PARTIAL | |

### 4.6 Supply chain (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Model version pinning | LLM API calls specify an exact model version (e.g., "gpt-4o-2024-11-20") not a floating alias (e.g., "gpt-4o") | PASS / FAIL / PARTIAL | |
| V2 | Version tracking in logs | Model version is recorded in logs or response metadata for every LLM call | PASS / FAIL / PARTIAL | |
| V3 | Regression test suite | There are tests that evaluate LLM output quality that could be run against a new model version | PASS / FAIL / PARTIAL | |
| V4 | Fallback provider | There is a secondary LLM provider or fallback behavior defined for when the primary provider fails | PASS / FAIL / PARTIAL | |

### 4.7 Data integrity (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Data provenance tracking | Documents or data entering the system have their source, ingestion time, and checksums recorded | PASS / FAIL / PARTIAL | |
| V2 | Pre-embedding validation | Data is validated (source check, content check, freshness check) before being embedded into a vector store | PASS / FAIL / PARTIAL | |
| V3 | Training data versioning | Fine-tuning or training datasets are versioned and checksummed | PASS / FAIL / PARTIAL | |
| V4 | Distribution monitoring | There is monitoring for changes in embedding or output distributions after data updates | PASS / FAIL / PARTIAL | |
| V5 | Batch rollback capability | There is a mechanism to roll back a batch of ingested data if it's found to be compromised | PASS / FAIL / PARTIAL | |

### 4.8 RAG security (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Vector DB access control | Vector database queries include access control filters (department, role, classification level) | PASS / FAIL / PARTIAL | |
| V2 | Tenant isolation | In multi-tenant systems, vector queries always filter by tenant ID | PASS / FAIL / PARTIAL | |
| V3 | Retrieved content validation | Retrieved results are filtered by relevance score threshold and checked for suspicious content | PASS / FAIL / PARTIAL | |
| V4 | Embedding endpoint protection | The embedding generation endpoint has authentication and rate limiting | PASS / FAIL / PARTIAL | |
| V5 | Permission inheritance | Embeddings carry the access permissions of their source documents | PASS / FAIL / PARTIAL | |

### 4.9 Confidence scoring (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Confidence metadata | AI responses include a confidence score or level (high/medium/low) in the output | PASS / FAIL / PARTIAL | |
| V2 | Grounding verification | For RAG systems, there is a check that LLM claims are supported by retrieved sources | PASS / FAIL / PARTIAL | |
| V3 | Recommendation framing | AI output is presented as a suggestion/recommendation, not as a definitive fact, in any user-facing display | PASS / FAIL / PARTIAL | |
| V4 | Source attribution | When RAG is used, the response includes references to the source documents | PASS / FAIL / PARTIAL | |

### 4.10 Rate limiting (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Per-user rate limits | LLM endpoints have rate limiting per user or per API key | PASS / FAIL / PARTIAL | |
| V2 | Token budget | There are daily or per-request token limits configured | PASS / FAIL / PARTIAL | |
| V3 | Cost monitoring | There is monitoring or alerting on LLM API costs | PASS / FAIL / PARTIAL | |
| V4 | Request timeout | LLM calls have a timeout configured | PASS / FAIL / PARTIAL | |

### 4.11 Audit logging (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Structured log entries | Every LLM interaction produces a structured log with trace ID, timestamp, model version, token counts | PASS / FAIL / PARTIAL | |
| V2 | Trace ID propagation | A trace/correlation ID is generated per request and passed through all components | PASS / FAIL / PARTIAL | |
| V3 | Decision logging | AI-influenced decisions are logged with the decision, confidence, and context | PASS / FAIL / PARTIAL | |
| V4 | No raw PII in logs | Log entries do not contain unredacted personal information | PASS / FAIL / PARTIAL | |

### 4.12 Bias monitoring (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Fairness metadata in logs | Logs include fields that enable fairness analysis (claim type, region, channel, input language) without collecting protected characteristics directly | PASS / FAIL / PARTIAL | |
| V2 | Distribution monitoring | There is analysis or dashboarding of output distributions across different segments | PASS / FAIL / PARTIAL | |
| V3 | Periodic fairness reporting | There is a scheduled process or script that generates fairness reports | PASS / FAIL / PARTIAL | |
| V4 | Override pattern analysis | Human override rates are tracked and analyzed for patterns across segments | PASS / FAIL / PARTIAL | |

### 4.13 Fallback patterns (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Default safe response | There is a defined fallback response returned when the LLM fails or returns invalid output | PASS / FAIL / PARTIAL | |
| V2 | Circuit breaker | There is a circuit breaker that stops calling the LLM after repeated failures | PASS / FAIL / PARTIAL | |
| V3 | Kill switch | There is a mechanism to disable the AI system without deploying new code (feature flag, config toggle, environment variable) | PASS / FAIL / PARTIAL | |
| V4 | Exception handling | All LLM calls are wrapped in try/catch with defined fallback behavior (no unhandled crashes) | PASS / FAIL / PARTIAL | |

### 4.14 Monitoring (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Key metrics tracking | Latency, error rate, token usage, and/or cost are being tracked via monitoring tools or custom dashboards | PASS / FAIL / PARTIAL | |
| V2 | Drift detection | There is comparison of recent output distributions against a baseline | PASS / FAIL / PARTIAL | |
| V3 | User feedback mechanism | Users can flag bad AI outputs (thumbs down, disagree button, feedback form) | PASS / FAIL / PARTIAL | |
| V4 | Incident logging | There is a structured process for logging and tracking AI-related incidents | PASS / FAIL / PARTIAL | |

### 4.15 Explainability (if recommended)

| # | Control | What to look for | Status | Evidence |
|---|---------|------------------|--------|----------|
| V1 | Decision explanations | The system generates human-readable explanations for its AI-driven outputs | PASS / FAIL / PARTIAL | |
| V2 | Model card | There is documentation describing the model's purpose, limitations, and performance characteristics | PASS / FAIL / PARTIAL | |
| V3 | Audit-friendly records | Decisions are stored in a format suitable for compliance review with full context | PASS / FAIL / PARTIAL | |
| V4 | Appeal mechanism | Users or affected individuals have a way to appeal or request review of AI decisions | PASS / FAIL / PARTIAL | |

---

## PHASE 5: GAP REPORT

Compile the results into a structured report:

### 5.1 Summary

```
Project: [project name]
Scan date: [date]
Risk tier: [from Phase 3]
Traits detected: [list]

Overall score: [X] / [total checks] PASS
Critical gaps: [count of FAIL on high-priority controls]
Partial implementations: [count of PARTIAL]
```

### 5.2 Critical gaps (FAIL — must fix)

List every check that received FAIL, ordered by priority:

1. OWASP-mapped controls first (these are active security vulnerabilities)
2. NIST MEASURE controls second (these are evaluation and testing gaps)
3. NIST MANAGE controls third (these are operational monitoring gaps)
4. ISO documentation requirements last (these are compliance documentation gaps)

For each gap:
- Control ID and description
- What is missing
- Which implement file to reference: `aigis get <file-id>`
- Specific pattern(s) to implement
- Estimated effort (small: <1 hour, medium: 1-4 hours, large: 4+ hours)

### 5.3 Partial implementations (PARTIAL — needs improvement)

List every check that received PARTIAL:
- What exists currently
- What is missing or insufficient
- Specific improvement needed

### 5.4 Passed controls (PASS — no action needed)

List every check that received PASS with evidence, for compliance documentation.

### 5.5 Recommended implementation order

Based on the gaps identified, provide a prioritized implementation plan:

1. **Immediate (security vulnerabilities):** Input validation, output sanitization, PII handling gaps
2. **Short-term (operational risk):** Audit logging, fallback patterns, rate limiting gaps
3. **Medium-term (compliance):** Monitoring, bias monitoring, explainability gaps
4. **Documentation:** Templates to generate (list specific `aigis template` commands)

### 5.6 Commands to run

Provide the exact aigis commands for the developer:

```
# Fetch patterns for all identified gaps:
aigis get [list of files with FAIL or PARTIAL checks]

# After implementing fixes, verify:
aigis verify [same list]

# Generate required compliance documentation:
aigis template [list from classification]
```
