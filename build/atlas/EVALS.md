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
| EV-M1 | Coverage (recall) | (i) Area recall vs areas implied by ground-truth traits: must equal baseline exactly, apart from the one intended routing delta, which is measured separately as EV-RT (§9). (ii) Technique recall of `threats --traits <ground truth>` vs the gold in-scope set (union of gold entry points for the ground-truth traits). The in-scope set is read from the union of `entry_points[].techniques`, which is never truncated; `techniques` must be exactly its first `--top` items in the specified order. (The largest ground-truth in-scope set is 15 on dev and 17 on held-out; all seeded traits together give more than the `--top` limit of 25: 29 in the candidate gold.) The eval script computes every such count from the approved gold files; none is hard-coded. (iii) Technique recall of `threats "<description>"`: reported. | (i) delta 0; (ii) 1.000; (iii) equals the recall implied by the traits the resolver found (no extra loss) | Floor |
| EV-M2 | Precision | (i) Area precision: equal to baseline. (ii) Technique precision on the `--traits` path. (iii) On the description path: reported. | (i) delta 0; (ii) 1.000; (iii) at least 0.95 | Floor |
| EV-M5 | Context efficiency | (i) Brief characters added per description (auto mode) vs baseline. (ii) `core.md` characters. (iii) `threats` default text size. (iv) Size-weighted precision of `threats`: characters of technique entries whose id is in the gold in-scope set / characters of all technique entries. (v) Catalog bytes. | (i) at most +1,500 (plus the two new area bodies for agentic descriptions, §9.3); (ii) at most 5,650; (iii) at most 7,000; (iv) 1.000 on the `--traits` path; (v) at most 64,000 and never printed whole | Guard |
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
  - Description-path technique recall: 0.541, precision 1.000 with the candidate gold map after review round 3 (32 links). For the record: 0.554 with the round-2 candidate (36 links), 0.483 with the planner's first draft (30 links). E0 recomputes it from the approved file.
- Noise floor: 0. The CLI is deterministic, so any difference between two runs is a defect (EV-M6), not noise. N = 2 runs per command per description, to prove that.
- Because the noise floor is 0, targets are exact values, not margins.
- Budget: under one minute of compute in total; no model calls.

## 5. Gold labels

### 5.1 Method

State after review round 3 (orchestrator), and the one place in the plan where the current gold counts are recorded. Both drafts are merged and adjudicated, one row per proposed link, every `atlas_quote` verbatim and asserted against the pinned YAML:

| | Rows | Include | Exclude | Shape of the included set |
|---|---|---|---|---|
| A `gold/area-mitigations.candidate.json` | 29 | 23 | 6 | 12 areas labeled, at most 3 mitigations each; 12 distinct mitigations of 44 (AML.M0004, M0007, M0008, M0014, M0019, M0020, M0021, M0024, M0025, M0029, M0032, M0036); bias-monitoring, explainability and fallback-patterns empty |
| B `gold/entry-points.candidate.json` | 54 | 32 | 22 | 9 traits (accepts-user-input, generates-content, is-agentic, is-external, multi-model-pipeline, uses-finetuned, uses-llm, uses-rag, uses-thirdparty-api), at most 5 techniques each; 29 distinct techniques (17 Realized, 12 Demonstrated, none Feasible) |

Derived from A and B together with MITRE's direct links: for a system with all 9 seeded traits, 29 techniques are in scope, MITRE links 33 mitigations to them, the area labels reach 12 of those, so `aigis threats` lists 21 gaps; one in-scope technique (AML.T0110) has no MITRE mitigation. Every other file in the plan refers here instead of repeating these numbers, and tests and evals compute them from the approved files at run time. `gold/APPROVAL-REQUEST.md` is the summary Nayan approves; `gold/APPROVAL-DETAIL.md` shows every row with MITRE's sentence and the Aigis evidence. On approval the candidate files are copied to `gold/area-mitigations.json` and `gold/entry-points.json` with `approved_by` and `approved_at` added; makers and tests read only those approved files.

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

As built (this supersedes the sketch below where they differ): top level `atlas_version` and `rows`, plus `approved_by` and `approved_at` in the approved copies. One row per proposed link, included or excluded. Area rows: `area`, `mitigation`, `mitigation_name`, `atlas_quote`, `area_evidence`, `labelers`, `basis`, `decision`. Entry-point rows: `trait`, `technique`, `technique_name`, `maturity`, `atlas_quote`, `labelers`, `basis`, `decision`. There is no `surface` field; the display labels are fixed in SPEC S3.3. `check-gold.py` verifies the fields that exist.

```json
{ "atlas_version": "2026.10", "atlas_sha256": "ac41ee9f...", "approved_by": "Nayan Kanaparthi", "approved_at": "<ISO time>",
  "rows": [ { "area": "rate-limiting", "mitigation": "AML.M0004", "mitigation_name": "Limit AI Service Query Volume and Rate",
              "atlas_quote": "Limit the number and rate of requests that users can submit to an AI service.",
              "area_evidence": ["### Step 2 — Key on authenticated user first"],
              "labelers": { "planner": true, "second": true }, "decision": "include", "decided_by": "nayan" } ] }
```
`entry-points.json` has the same envelope with rows `{ trait, surface, technique, technique_name, maturity, atlas_quote, labelers, decision, decided_by }`.

## 6. Guards

- Trait detection identical to baseline on dev and held-out. `implement_files` and existing `controls` identical to baseline except for the exact routing delta of §9.2 (trait sets containing `is-agentic` gain the two new areas and their citations, nothing else).
- Trait F1: the trigger file is byte-identical, so resolver output is identical by construction; verified, not re-benchmarked.
- Brief growth at most 1,500 characters; `core.md` at most 5,650; init rules file grows only by the `core.md` growth; resolver block checksum unchanged.
- No output contains a FORBIDDEN phrase (SPEC S0).

## 7. Kill criteria

Stop and report to Nayan; the outcome is not a release:

1. EV-M3a or EV-M3b below 1.000 on dev or held-out after one fix loop of at most 30 minutes. A wrong ATLAS id or link is a wrong citation; it does not ship.
2. Any guard in section 6 violated after one fix loop.
3. Gold files not approved by 17:00. N1 and N2 may continue; N3, N5 and N6 do not start. If approval has not arrived by 18:00 the feature cannot reach freeze and the orchestrator escalates.
4. EV-M1(ii) or EV-M2(ii) below 1.000 on held-out: the command does not do what the approved map says. Fix once; otherwise stop.
5. Size-weighted precision EV-M5(iv) below 1.000 on the `--traits` path, or any cap exceeded, and trimming cannot fix it inside the timebox.

Not a kill criterion, but reported at GATE B with the numbers: description-path recall (EV-M1 iii). It is expected to be near 0.54 on dev because of the resolver (trait recall 0.481), and the README and command output say that `--traits` is the reliable path.

## 8. Report format (INT writes `build/atlas/evals/results/summary.md`)

One table: metric, baseline, dev, held-out, target, pass or fail. Below it: the list of every ATLAS id printed across the eval runs (count only, plus any mismatch), the per-description brief deltas, and the description-path recall per description. Scores come from the artifacts in `results/`, never from an agent's own claim.

---

Appendices A and B are the planner's first draft, kept as a historical record. They are not the gold. The current candidate mappings (23 and 32 include rows after review round 3) are in `gold/`, and every count elsewhere in the plan uses those.

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
---

## 9. Scope change 15:45: routing change and new-area citations

### 9.1 EV-RT routing metric

The routing rule (`is-agentic` to the two new areas) is Aigis's judgment, so it needs a label that does not come from the rule itself.

- Label per description, `needs_agent_security`: "Does this system let the model take actions or call tools (send, write, buy, execute, control a device, call an API on someone's behalf)?" yes or no. Planner draft below; the plan reviewer checks it; E0 stores it in `dev.json` and `heldout.json`. A second labeler disagreement goes to Nayan with the mapping approvals.

| Set | yes | no |
|---|---|---|
| Dev | D9 (controls IoT devices) | D1, D2, D3, D4, D5, D6, D7, D8, D10 |
| Held-out | H1 (sends replies, reads CRM), H3 (runs shell, merges), H6 (browses, calls MCP tools, memory), H8 (places orders) | H2, H4, H5, H7 |

H7 is the closest call (a model "decides whether to approve payment"): labeled no because the description gives it a decision, not an action; `influences-decisions` already routes it to `human-oversight`.

| Id | Metric | Target |
|---|---|---|
| EV-RT(i) | On the ground-truth-traits path: recall and precision of {both new areas recommended} against `needs_agent_security`, over the 18 descriptions | 1.000 and 1.000 |
| EV-RT(ii) | On the description path (build resolution): the same, reported per set | no loss beyond the resolver: the new areas appear exactly when the resolver finds `is-agentic` (certain or uncertain). Reported, not gated. |
| EV-RT(iii) | Baseline | 0 of 5 positives get an agent-security procedure on `07ef537` (the areas do not exist). Labeled "no prior capability". |

### 9.2 Exact-delta guard (AC15)

For every dev and held-out description on both paths, and for the fixed matrix: new `implement_files` = baseline, plus the two new ids when the trait set contains `is-agentic`; `controls` = baseline plus those areas' frontmatter ids; risk tier, reason, templates, guardrails, warnings identical. Any other difference is a guard violation (kill criterion 2).

### 9.3 Context guard (M5)

- Each new area at most 12,000 characters (existing areas range from about 6,000 to 21,000).
- Brief growth for a description whose resolved traits include `is-agentic`: at most 1,500 plus the two stripped area bodies. For all others: at most 1,500 (raised from 1,000 at 16:00 for the instruction list of AC32).
- E0 records baseline brief sizes for the agentic descriptions; INT reports new sizes and names any description that moved from a full brief to the compact fallback (cap 120,000). A move is reported at GATE B, not hidden; it is a kill only if a non-agentic description moves.
- Not measured tonight and said so in the CHANGELOG: whether the larger brief changes what coding agents implement (M4).

### 9.4 Gold for the new areas' citations (gate G1, GATE A2)

Same method as §5, with these specifics:

1. Timing: after NA1 and NA2 are content-approved (about 18:25), because the evidence is a quoted step heading.
2. Planner draft: appendix C (the design targets of SPEC S7 plus a first OWASP, NIST and ISO proposal). The second labeler (GPT-5.6 Sol, fresh session) gets only the two area files, the §5.2 Task A protocol extended to the other frameworks, the pinned YAML and the framework source files. It does not see SPEC S7 or appendix C.
3. ATLAS rows: all 44 mitigations are candidates, not only the nine targets. A target the labeler does not confirm is adjudicated; if it stays unconfirmed it is excluded and the mitigation remains a printed gap.
4. OWASP and NIST rows need a verbatim quote from the versioned public source: OWASP Top 10 for LLM Applications 2025 and NIST AI RMF 1.0 (NIST AI 100-1). The orchestrator places those texts under `/tmp/frameworks/` with their sha256 recorded in the gold file; `check-gold.py` verifies the quotes. No fetched source, no row.
5. ISO/IEC 42001:2023 rows: the standard's text is not available to quote tonight. Allowed only "by precedent": an id already carried by `human-oversight` at `07ef537`, with `basis: "precedent, not re-verified against the standard"`, and only if Nayan approves that rule (GOALS question 10). Otherwise `iso42001: []`.
6. EU AI Act: no rows tonight.
7. File: `gold/new-areas.json`, rows `{ area, framework, id, name, quote, source, area_evidence, labelers, basis, decision }`; approved copy carries `approved_by`, `approved_at`. `APPROVAL-new-areas.md` is the one page Nayan reads.

### 9.5 If GATE A2 is late

- By 20:00 without approval and with Nayan's pre-agreed rule (GOALS question 9): rows both labelers proposed become `include`, all others `exclude`.
- Without that pre-agreement: the areas ship with empty `controls` arrays. That is schema-valid and honest (no citation is claimed); `aigis threats` keeps printing those mitigations as gaps; README and CHANGELOG say the mapping is pending. Nayan decides at GATE B whether that is still the launch.
- In no case does an unapproved citation ship.

### 9.6 Kill criteria added

6. A new area fails content rubric item C-3 or C-6 after the stuck diagnosis and one more fix: that area does not ship (fallback 7 in GOALS, needs Nayan).
7. EV-RT(i) below 1.000, or any exact-delta violation, after one fix loop.
8. An own-example or empty-agent self-consistency test (T-NV-03, T-NV-04) cannot be made to pass without weakening a rule into something a comment satisfies: the check becomes JUDGMENT; if more than half of an area's auto checks end up JUDGMENT, report it at GATE B as "verify is mostly manual for this area".

## Appendix C. Planner draft for the new areas (do not show to the second labeler)

ATLAS (design targets; the step titles are in SPEC S7):

| Area | Mitigation | Step |
|---|---|---|
| agent-permissions | AML.M0026 Manage AI Agent Service Access | Steps 1, 2 |
| agent-permissions | AML.M0027 Manage User-Delegated AI Agent Access | Steps 1, 3 |
| agent-permissions | AML.M0028 Enforce Access Controls for AI Agent Tools | Step 4 |
| agent-permissions | AML.M0037 AI Agent Authority Expansion Controls | Step 5 |
| agent-permissions | AML.M0043 AI Agent External Resource Lifecycle Management | Step 6 |
| agent-tool-safety | AML.M0030 Restrict AI Agent Tool Invocation on Untrusted Data | Steps 1, 2 |
| agent-tool-safety | AML.M0033 Input and Output Validation for AI Agent Components | Steps 3, 4 |
| agent-tool-safety | AML.M0038 AI Agent Scope Drift Detection | Step 5 |
| agent-tool-safety | AML.M0031 Memory Hardening | Step 6 (conditional) |

Candidates the planner does not propose but expects the labeler may: `agent-permissions` to AML.M0032 (segmentation), `agent-tool-safety` to AML.M0020 (guardrails on agent actions) and AML.M0029 (approval in step 2).

If all nine targets are approved, the areas reach 21 of the 44 mitigations instead of 12, and for a system with every seeded trait the gap list drops from 21 to 15 (26, 27, 28, 30, 33 and 38 leave it; AML.M0031, M0037 and M0043 are not linked by MITRE to any technique in the current entry-point map, so they do not appear in that list either way). These two numbers are projections from the candidate gold, not results.

Other frameworks (first proposal; every row still needs its source quote, see §9.4):

| Area | OWASP LLM Top 10 2025 | NIST AI RMF 1.0 | ISO/IEC 42001 (precedent only) |
|---|---|---|---|
| agent-permissions | LLM06 Excessive Agency | MEASURE-2.7, MANAGE-1.3 | Annex-A.9, Clause-8.4 (as `human-oversight`) |
| agent-tool-safety | LLM01 Prompt Injection, LLM06 Excessive Agency | MEASURE-2.7, MANAGE-1.3 | Annex-A.9 (as `human-oversight`) |

Candidates not proposed: LLM05 Improper Output Handling for step 3 and 4 of `agent-tool-safety`; LLM04 Data and Model Poisoning for the memory step.
---

## 10. Agent-native use (owner requirement 16:00)

Tonight (deterministic, in the fast suite and E2E): the instructions exist where the agent reads them (core skill through `aigis init`, `audit --scan`, every brief), they are complete (when, how, gaps, rerun), and the written loop is executable as written (T-DOC-01, T-DOC-10, T-DOC-11, T-SUR-12, E2E-04). Context cost is guarded: core skill at most 5,650 characters (EV-M5 ii now uses this value), brief growth at most 1,500 (EV-M5 i).

Milestone eval, not tonight (L4, name EV-L4-THREATS). It answers the question the deterministic tests cannot: does an agent actually do it.

- Setup: a fixture project with an LLM feature, `aigis init <ide>` already run. Conditions: rules file from 2.1.1 (baseline) and from 3.0.0.
- Prompts: natural-language requests that hit a trigger without naming Aigis, threats or ATLAS (for example "add a tool that lets the assistant send emails for the user", "give it long-term memory", "we launch next week, what is missing?"), plus two controls that hit no trigger.
- Runners: cursor-agent, `claude -p`, `codex exec`; N runs each, fixed in advance.
- Scored from artifacts only (command log, files written, final message), with a rubric locked before the runs: (1) ran `aigis threats` unprompted; (2) used `--traits` with traits that match the project; (3) ran `aigis get` for at least the areas named for the top technique; (4) implemented and ran `aigis verify --auto`; (5) reported gaps to the user as not covered; (6) did not run it on the control prompts.
- Primary metric: share of trigger runs that reach step 3. Guards: step 6 (no false triggers), M4 implemented coverage not lower than baseline, brief and rules-file sizes.
- Baseline is 0 for steps 1 to 5 by construction (the command does not exist in 2.1.1); the informative numbers are the absolute rates and the difference between agents.
- Until this runs, no document says agents "do" this. The planned wording is "the agent is instructed to".
