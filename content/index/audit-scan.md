---
id: audit-scan
title: Aigis codebase audit scan prompt
version: "2.0"
purpose: Structured instructions for an agent to scan a codebase and detect system traits. Control-by-control evaluation is produced separately by `aigis audit --traits <detected>` so the denominator is deterministic.
---

# AIGIS CODEBASE AUDIT (DISCOVERY)

This prompt covers three phases: project inventory, trait detection, and classify handoff.

**Control-by-control evaluation (formerly Phases 4-5) is no longer in this prompt.** Once Phase 3 identifies the traits, run `aigis audit --traits <detected-traits>` to get the scoped checklist. That command emits only the pattern areas recommended by `classify` and prints an explicit total-check denominator, so two runs on the same system produce the same scoring scope.

Complete every section in order.

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

## PHASE 4: SCOPED CONTROL EVALUATION (handoff)

Do not evaluate controls inline with this prompt. The scoped checklist is produced by a separate command that uses the classify output from Phase 3.

Run:

```
aigis audit --traits <detected-traits>
```

That command:

- Includes only the pattern areas that `classify` recommended for this trait set. Areas that are not recommended are not printed at all (no "N/A" placeholders, no agent-side skipping).
- Prints the deterministic total-check count for this scope at the top and repeats it at the bottom.
- Prints the exact `Score: <pass> / <total> total checks across <N> recommended areas (areas: ...)` line you should emit once you have filled in the checklists.

Use the output of `aigis audit --traits` as your Phase 4 worksheet. Fill every row with PASS / FAIL / PARTIAL and file:line evidence. Then emit the prescribed score line, followed by:

- A list of FAIL items in priority order (OWASP controls first, then NIST MEASURE, then NIST MANAGE, then ISO documentation).
- A list of PARTIAL items.
- The exact `aigis template ...` commands from your classification output for any required compliance documentation.

(End of discovery prompt.)
