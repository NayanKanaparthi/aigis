# EVALS: MITRE ATLAS in Aigis (Tier R)

All metrics are computed by running the CLI on labeled descriptions and comparing with gold. Deterministic, seconds, no agents. M4 (agent in the loop) is milestone only and not run tonight.

## 1. What is being judged

| Layer | Who owns the judgment | How it is validated |
|---|---|---|
| ATLAS ids, names, maturity, tactic links, mitigation to technique links | MITRE | Oracle built from the pinned YAML (`build/atlas/evals/oracle.py`, `python3 -I`, sha256 checked first). Independent of `lib/atlas.js`. |
| Area to mitigation labels (`controls.atlas`) | Aigis | Gold file: two independent drafts, evidence quotes checked by script, Nayan approves. |
| Trait to entry-point techniques | Aigis | Same method, second gold file. |
| Which areas and traits apply to a description | Aigis (existing) | Unchanged by this feature; guarded at delta 0. |

Agreement between two models is not validation. It only decides which rows Nayan has to look at closely.

## 2. Metrics

| Id | Metric | Definition | Target | Role |
|---|---|---|---|---|
| EV-M3a | Id accuracy | Every ATLAS id printed by classify, verify, report, build and threats on the eval sets exists in the pinned source, with the exact name and maturity where shown. Correct / printed. | 1.000 | Primary, hard gate |
| EV-M3b | Link accuracy | For every (technique, mitigation) pair in `threats --json` and every technique count in verify/classify: precision and recall against the oracle's set of MITRE's 494 direct `mitigates` links. An inferred pair (for example a parent's mitigation shown on a sub-technique) counts as a false positive. | P 1.000, R 1.000 | Primary, hard gate |
| EV-M3c | Area label accuracy | `controls.atlas` of each area vs gold `area-mitigations.json`. | P 1.000, R 1.000 | Primary, hard gate |
| EV-M3d | Entry-point accuracy | `atlas-entry-points.json` vs gold `entry-points.json`. | P 1.000, R 1.000 | Primary, hard gate |
| EV-M3e | No citation lost | OWASP, NIST, ISO, EU sets per area and per classify output vs baseline. | identical | Hard gate |
| EV-M1 | Coverage (recall) | (i) Area recall vs areas implied by ground-truth traits: must equal baseline exactly. (ii) Technique recall of `threats --traits <ground truth>` vs the gold in-scope set (union of gold entry points for the ground-truth traits). The in-scope set is read from the union of `entry_points[].techniques`, which is never truncated; `techniques` must be exactly its first `--top` items in the specified order. (The largest ground-truth in-scope set is 15 on dev and 17 on held-out; all 11 seeded traits together give 31, above the `--top` limit of 25.) (iii) Technique recall of `threats "<description>"`: reported. | (i) delta 0; (ii) 1.000; (iii) equals the recall implied by the traits the resolver found (no extra loss) | Floor |
| EV-M2 | Precision | (i) Area precision: equal to baseline. (ii) Technique precision on the `--traits` path. (iii) On the description path: reported. | (i) delta 0; (ii) 1.000; (iii) at least 0.95 | Floor |
| EV-M5 | Context efficiency | (i) Brief characters added per description (auto mode) vs baseline. (ii) `core.md` characters. (iii) `threats` default text size. (iv) Size-weighted precision of `threats`: characters of technique entries whose id is in the gold in-scope set / characters of all technique entries. (v) Catalog bytes. | (i) at most +1,000; (ii) at most 4,900; (iii) at most 7,000; (iv) 1.000 on the `--traits` path; (v) at most 64,000 and never printed whole | Guard |
| EV-M6 | Determinism and tests | Each eval command run twice gives identical bytes after masking the two listed volatile fields; `npm test` green. | identical; green | Hard gate |

Baseline for the new capability is 0 by construction: on `07ef537` no command prints an ATLAS id and `aigis threats` does not exist. This is labeled "no prior capability", not "improvement over a tool baseline".

## 3. Data sets

- **Dev set**: the 10 v2 benchmark descriptions with their ground-truth traits (`aigis-benchmarks/v2-final/descriptions.json`, copied to `build/atlas/evals/dev.json`). Suitable because they already carry trait labels that were locked in v2, and reusing them keeps the guard comparable with the v2 numbers. Weakness: only D9 is agentic and only D2 uses RAG, so they under-represent the surfaces ATLAS 2026.10 cares most about.
- **Held-out set**: 8 new descriptions written for those surfaces (below), with ground-truth traits drafted by the planner and checked by the plan reviewer. Stored in `build/atlas/evals/heldout.json`. Not shown to makers, not used in tests or fixtures, run once at INT.

| Id | Description | Ground-truth traits |
|---|---|---|
| H1 | Build an email triage agent that reads incoming support emails, looks up the customer in our CRM, and drafts and sends replies using Claude. | uses-llm, uses-thirdparty-api, is-agentic, accepts-user-input, processes-pii, is-external |
| H2 | Add an internal knowledge assistant that answers employee questions from our Confluence and Google Drive documents using retrieval augmented generation. | uses-llm, uses-rag, accepts-user-input, is-internal, handles-proprietary |
| H3 | Create a coding agent that opens pull requests, runs shell commands in CI and can merge its own changes. | uses-llm, is-agentic, generates-code |
| H4 | We want a public API that summarizes uploaded contracts with GPT-4o and stores the summaries for our legal team. | uses-llm, uses-thirdparty-api, accepts-user-input, is-external, handles-proprietary |
| H5 | Fine-tune an open-source model downloaded from Hugging Face on our support tickets and deploy it behind our helpdesk widget. | uses-llm, uses-finetuned, processes-pii, accepts-user-input, is-external |
| H6 | Build a research assistant with long-term memory that browses the web, saves notes, and calls tools through MCP servers. | uses-llm, is-agentic, accepts-user-input |
| H7 | A pipeline where one LLM extracts invoice fields from scanned images and a second LLM decides whether to approve payment. | uses-llm, is-multimodal, multi-model-pipeline, handles-financial, influences-decisions |
| H8 | Add a voice-enabled shopping assistant for our mobile app that recommends products and places orders for the user. | uses-llm, is-multimodal, is-agentic, accepts-user-input, is-external, handles-financial, processes-pii |

## 4. Baseline, noise floor, runs

- Baseline is measured by E0 on `07ef537` before any feature code: for every dev and held-out description, the detected traits (classify path and build path), `implement_files`, `controls`, brief size in auto mode, plus `core.md` length and the `init cursor` output length. Stored in `build/atlas/evals/results/baseline.json`.
- Planner pre-measurement on the dev set (to be reproduced by E0, not trusted as is):
  - Brief sizes (auto mode, characters): D1 90,672; D3 102,712; D4 65,514; D5 65,548; D6 65,863; D7 95,034; D8 17,622; D9 70,655; D10 65,782. D2 resolves no traits and has no brief.
  - Build-path trait recall 0.481, precision 1.000 (uncertain traits included). Classify-path area recall 0.374, precision 0.950 (low-confidence triggers rejected). These are properties of the CLI resolver on prose, inherited by this feature and not changed by it. They are lower than the README's v2 numbers, which were measured with an agent in the IDE; the difference is logged in IMPROVEMENTS and is outside this feature.
  - Description-path technique recall: 0.554, precision 1.000 with the candidate gold map (36 links). It was 0.483 with the planner's first draft (30 links).
- Noise floor: 0. The CLI is deterministic, so any difference between two runs is a defect (EV-M6), not noise. N = 2 runs per command per description, to prove that.
- Because the noise floor is 0, targets are exact values, not margins.
- Budget: under one minute of compute in total; no model calls.

## 5. Gold labels

### 5.1 Method

State after review round 2 (orchestrator): both drafts are merged and adjudicated into `gold/area-mitigations.candidate.json` (23 include rows, 1 exclude) and `gold/entry-points.candidate.json` (36 include rows, 3 exclude). `gold/APPROVAL-REQUEST.md` is the summary Nayan approves; `gold/APPROVAL-DETAIL.md` shows every row with MITRE's sentence and the Aigis evidence. On approval the candidate files are copied to `gold/area-mitigations.json` and `gold/entry-points.json` with `approved_by` and `approved_at` added; makers and tests read only those approved files.

1. Planner draft: appendices A and B of this file.
2. Second draft: GPT-5.6 Sol in a fresh session, given only section 5.2 (protocol), the 15 area files, `aigis traits` output with the trait definitions in `content/index/taxonomy.md`, and the pinned YAML. It must not be shown the appendices.
3. The orchestrator merges both drafts into the two gold files, one row per proposed link, with `labelers: { planner, second }`.
4. `build/atlas/evals/check-gold.py` verifies every row mechanically: the mitigation or technique id exists in the pinned YAML and the name matches; `atlas_quote` is a verbatim substring of that object's description (whitespace-normalized); each `area_evidence` string is a verbatim heading in the area file; traits are in `ALL_TRAITS`.
5. Nayan approves. He sees one table per mapping: agreed rows first, disagreements marked, each with its quote and evidence. Default if he does not want to go row by row: rows both labelers proposed are `include`; every other row is `exclude` tonight and listed in IMPROVEMENTS.
6. `APPROVAL.md` records who approved, when, the two file hashes, and the agreement rate (Jaccard of the two drafts) per mapping.
7. After approval the files are frozen. A later change needs a new approval (same rule as a framework citation change).

### 5.2 Labeling protocol (self-contained; this is what the second labeler receives)

**Task A, area to mitigation.** For each of the 15 areas, list the ATLAS mitigations (`AML.M####`, 44 exist in v2026.10) that the area's procedure implements **in part**. Include a link only if you can quote (i) a sentence from the mitigation's description in the pinned YAML and (ii) a pattern or step heading in the area file that does what that sentence says. A shared theme is not enough: "both are about agents" is not a link. Prefer missing a weak link to adding one; a wrong citation is an overclaim. An empty list is a valid answer (ATLAS has nothing on bias, fairness, explainability or graceful degradation). Do not label the four `eu-ai-act-*` areas.

Row format: `{ "area", "mitigation", "mitigation_name", "atlas_quote", "area_evidence": ["### heading"], "confidence": "high|medium", "note" }`.

**Task B, trait to entry-point techniques.** For each trait that describes an attack surface or a capability (where text or data gets in, or what the system can do), list at most 6 ATLAS techniques a threat modeler should check first for a generative or agentic AI system with that trait. Include a technique only if the trait is the precondition for it, and quote the sentence of the technique description that shows it. Prefer Realized and Demonstrated techniques with case studies. Use sub-techniques when they are the precise fit. Skip reconnaissance and resource-development techniques (the defender cannot act on them from a trait) and predictive-ML-only techniques. Traits about data sensitivity, impact or jurisdiction may have no entry.

Row format: `{ "trait", "surface" (short noun phrase), "technique", "technique_name", "maturity", "atlas_quote", "note" }`.

### 5.3 Gold file shape

As built (this supersedes the sketch below where they differ): top level `atlas_version` and `rows`, plus `approved_by` and `approved_at` in the approved copies. Area rows: `area`, `mitigation`, `mitigation_name`, `atlas_quote`, `area_evidence`, `labelers`, `basis`, `decision`, `note`. Entry-point rows: `trait`, `technique`, `technique_name`, `maturity`, `atlas_quote`, `labelers`, `basis`, `decision`, `note`. There is no `surface` field; the display labels are fixed in SPEC S3.3. `check-gold.py` verifies the fields that exist.

```json
{ "atlas_version": "2026.10", "atlas_sha256": "ac41ee9f...", "approved_by": "Nayan Kanaparthi", "approved_at": "<ISO time>",
  "rows": [ { "area": "rate-limiting", "mitigation": "AML.M0004", "mitigation_name": "Limit AI Service Query Volume and Rate",
              "atlas_quote": "Limit the number and rate of requests that users can submit to an AI service.",
              "area_evidence": ["### Step 2 — Key on authenticated user first"],
              "labelers": { "planner": true, "second": true }, "decision": "include", "decided_by": "nayan" } ] }
```
`entry-points.json` has the same envelope with rows `{ trait, surface, technique, technique_name, maturity, atlas_quote, labelers, decision, decided_by }`.

## 6. Guards

- Trait detection, `implement_files` and existing `controls` identical to baseline on dev and held-out.
- Trait F1: the trigger file is byte-identical, so resolver output is identical by construction; verified, not re-benchmarked.
- Brief growth at most 1,000 characters; `core.md` at most 4,900; init rules file grows only by the `core.md` growth; resolver block checksum unchanged.
- No output contains a FORBIDDEN phrase (SPEC S0).

## 7. Kill criteria

Stop and report to Nayan; the outcome is not a release:

1. EV-M3a or EV-M3b below 1.000 on dev or held-out after one fix loop of at most 30 minutes. A wrong ATLAS id or link is a wrong citation; it does not ship.
2. Any guard in section 6 violated after one fix loop.
3. Gold files not approved by 17:00. N1 and N2 may continue; N3, N5 and N6 do not start. If approval has not arrived by 18:00 the feature cannot reach freeze and the orchestrator escalates.
4. EV-M1(ii) or EV-M2(ii) below 1.000 on held-out: the command does not do what the approved map says. Fix once; otherwise stop.
5. Size-weighted precision EV-M5(iv) below 1.000 on the `--traits` path, or any cap exceeded, and trimming cannot fix it inside the timebox.

Not a kill criterion, but reported at GATE B with the numbers: description-path recall (EV-M1 iii). It is expected to be near 0.55 on dev because of the resolver (trait recall 0.481), and the README and command output say that `--traits` is the reliable path.

## 8. Report format (INT writes `build/atlas/evals/results/summary.md`)

One table: metric, baseline, dev, held-out, target, pass or fail. Below it: the list of every ATLAS id printed across the eval runs (count only, plus any mismatch), the per-description brief deltas, and the description-path recall per description. Scores come from the artifacts in `results/`, never from an agent's own claim.

---

Appendices A and B are the planner's first draft, kept as a historical record. They are not the gold. The current candidate mappings (23 and 36 include rows) are in `gold/`, and every count elsewhere in the plan uses those.

## Appendix A. Planner draft: area to mitigation

Do not show to the second labeler. Quotes are from the pinned YAML; headings are from the area files at `07ef537`.

| Area | Mitigation | ATLAS quote | Area evidence | Conf. |
|---|---|---|---|---|
| input-validation | AML.M0020 Generative AI Guardrails | "Guardrails are safety controls placed between users, tools, and generative AI models to evaluate prompts, retrieved context, model outputs, and agent actions before they are accepted, executed, or shown to a user." | Step 5 — Implement injection detection across three categories; Step 6 — Block on detection, not just log | high |
| output-sanitization | AML.M0020 Generative AI Guardrails | same sentence ("model outputs ... before they are accepted, executed, or shown to a user") | Pattern 1: Treat LLM output as untrusted user input; Pattern 5: Content type validation | high |
| output-sanitization | AML.M0032 Segmentation of AI Agent Components | "isolate code execution via containers or virtual machines" | Pattern 4: Sandbox execution for generated code | medium |
| prompt-security | AML.M0020 Generative AI Guardrails | same sentence (evaluating model outputs) | Pattern 3: Leakage detection in output | medium |
| pii-handling | AML.M0020 Generative AI Guardrails | same sentence (evaluating prompts and model outputs) | Step 3 — Call the redactor on every LLM input path; Step 6 — Redact the model's output too | medium |
| human-oversight | AML.M0029 Human In-the-Loop for AI Agent Actions | "Systems should require the user or another human stakeholder to approve AI agent actions before the agent takes them." | Pattern 2: Human-in-the-loop for high-impact decisions | high |
| human-oversight | AML.M0028 Enforce Access Controls for AI Agent Tools | "Limit AI agent tool access to each caller's authorized, task-required operations and resources" | Pattern 1: Principle of least privilege for tools | medium |
| supply-chain | AML.M0008 Validate AI Model | "Evaluate AI models against defined functional requirements before deployment and throughout their operational lifecycle." | Pattern 3: Regression testing before model upgrades | high |
| data-integrity | AML.M0025 Maintain AI Dataset Provenance | "Maintain a detailed history of datasets used for AI applications." | Pattern 1: Data provenance tracking | high |
| data-integrity | AML.M0007 Sanitize Training Data | "Detect, quarantine, and remove or remediate poisoned data before it is used to train an AI model." | Pattern 2: RAG data validation pipeline; Pattern 5: Batch rollback for poisoned data | medium |
| data-integrity | AML.M0014 Verify AI Artifacts | "Verify the integrity and authenticity of AI artifacts before importing, loading, or deploying them." | Pattern 3: Fine-tuning data checksums | medium |
| rag-security | AML.M0020 Generative AI Guardrails | same sentence ("retrieved context") | Pattern 3: Retrieved context validation | high |
| rag-security | AML.M0019 Control Access to AI Models and Data in Production | "Require authentication for API endpoints" | Pattern 4: Embedding endpoint access control | medium |
| rate-limiting | AML.M0004 Limit AI Service Query Volume and Rate | "Limit the number and rate of requests that users can submit to an AI service." | Step 2 — Key on authenticated user first; Step 3 — Return 429 with Retry-After on block | high |
| rate-limiting | AML.M0036 Limit AI Workload Resource Consumption | "Set bounds on input size, batch size, execution time, memory, compute, and output size." | Step 4 — Separate token budget from request count; Step 5 — Timeout every LLM call | high |
| audit-logging | AML.M0024 AI Telemetry Logging and Monitoring | "Implement logging and monitoring across the AI lifecycle to detect suspicious activity and support investigation." | Pattern 1: Structured log entry for every LLM interaction; Pattern 2: Trace ID propagation | high |
| monitoring | AML.M0024 AI Telemetry Logging and Monitoring | same sentence | Pattern 1: Key metrics dashboard; Pattern 4: Incident response logging | high |

Empty in the draft: bias-monitoring, confidence-scoring, explainability, fallback-patterns.
Totals: 17 links, 12 distinct mitigations of 44 (M0004, M0007, M0008, M0014, M0019, M0020, M0024, M0025, M0028, M0029, M0032, M0036).

Considered and left out by the planner (for Nayan if the second labeler proposes them): input-validation to M0033 and M0036; output-sanitization to M0033; prompt-security to M0021; pii-handling to M0041; human-oversight to M0027 and M0036; supply-chain to M0023; rag-security to M0005, M0032 and M0033; monitoring to M0008; confidence-scoring to M0020. Reason in each case: the area touches the theme but has no step that does what the mitigation text says for the object it names (for example M0033 is about validating the inputs and outputs of agent tools and data sources, not user prompts).

What the draft exposes (goes to IMPROVEMENTS, not tonight): no Aigis area for M0026, M0027, M0030, M0031, M0033, M0037, M0038, M0043 (agent access, tool invocation on untrusted data, memory hardening, agent component validation); supply-chain has no step for M0011, M0013, M0014, M0016 or M0023 (library loading, signing, artifact verification, scanning, AI bill of materials).

## Appendix B. Planner draft: trait to entry-point techniques

Do not show to the second labeler. Maturity and case-study counts are from the pinned YAML.

| Trait | Surface | Techniques (maturity, case studies) |
|---|---|---|
| accepts-user-input | User-supplied prompts and files | AML.T0051.000 LLM Prompt Injection: Direct (Realized, 11); AML.T0054 LLM Jailbreak (Realized, 11); AML.T0068 LLM Prompt Obfuscation (Realized, 11) |
| uses-rag | Retrieved documents and knowledge-base content | AML.T0051.001 LLM Prompt Injection: Indirect (Realized, 19); AML.T0070 RAG Poisoning (Demonstrated, 4); AML.T0071 False RAG Entry Injection (Demonstrated, 1); AML.T0085.000 Data from AI Services: RAG Databases (Demonstrated, 3) |
| is-agentic | Tools, actions and memory the model can use | AML.T0051.001 LLM Prompt Injection: Indirect (Realized, 19); AML.T0053 AI Agent Tool Invocation (Demonstrated, 18); AML.T0086 Exfiltration via AI Agent Tool Invocation (Realized, 10); AML.T0101 Data Destruction via AI Agent Tool Invocation (Realized, 3); AML.T0080.000 AI Agent Context Poisoning: Memory (Realized, 4); AML.T0110 AI Agent Tool Poisoning (Realized, 0) |
| uses-thirdparty-api | Third-party models, packages and hosted AI services | AML.T0010.001 Supply Chain Compromise: Software (Realized, 6); AML.T0109 AI Supply Chain Rug Pull (Realized, 1) |
| uses-finetuned | Training data and model artifacts | AML.T0020 Training Data Poisoning (Realized, 3); AML.T0010.002 Supply Chain Compromise: Data Repository (Realized, 2); AML.T0010.003 Supply Chain Compromise: Model Repository (Realized, 6); AML.T0011.000 User Execution: Unsafe AI Artifacts (Realized, 4) |
| is-external | Public-facing AI endpoint | AML.T0093 Prompt Infiltration via Public-Facing Application (Realized, 15); AML.T0024 Exfiltration via AI Inference API (Realized, 3); AML.T0029 Denial of AI Service (Demonstrated, 2); AML.T0034 Cost Harvesting (Feasible, 0) |
| uses-llm | Model output rendered or passed to other systems | AML.T0077 LLM Response Rendering (Demonstrated, 5) |
| generates-code | Generated code and package names | AML.T0060 Publish Hallucinated Entities (Demonstrated, 1) |
| handles-proprietary | System prompts and proprietary context | AML.T0069.002 Discover LLM System Information: System Prompt (Demonstrated, 1); AML.T0085.003 Data from AI Services: System Instructions (Feasible, 0) |
| processes-pii | Personal data in conversation context and memory | AML.T0085.002 Data from AI Services: Conversation Context and Memory (Demonstrated, 1) |
| is-multimodal | Images, audio and files as model input | AML.T0129 Triggers in Multimodal Inputs (Feasible, 0) |
| multi-model-pipeline | Model-to-model handoffs | AML.T0143 LLM Prompt Propagation (Demonstrated, 3) |

Totals: 12 traits, 30 links, 29 distinct techniques (16 Realized, 10 Demonstrated, 3 Feasible). MITRE links 32 mitigations directly to these techniques; the draft area labels reach 12 of them, so `aigis threats` would list up to 20 gaps for a system with every trait. Two techniques (AML.T0110, AML.T0060) have no MITRE mitigation and will print as such.

Note added after review round 1 (the rows above are unchanged; only the two totals in the previous sentence were recomputed for direct links, from 33 and 21). With direct links only, AML.T0051.000 and AML.T0051.001 carry AML.M0024, M0033 and M0035, while AML.M0020 Generative AI Guardrails is linked by MITRE to the parent AML.T0051 LLM Prompt Injection (Realized, 1 case study, 8 mitigations). Candidate row for the merge table, for Nayan to decide: add AML.T0051 to `accepts-user-input`.
