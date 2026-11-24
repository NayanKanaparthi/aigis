# GATE A: gold mappings for approval

Source: MITRE ATLAS v2026.10 (sha256 ac41ee9f...). Labelers: Fable 5.2 planner, GPT-5.6 Sol (blind), disputes adjudicated by Opus 5.5 with verbatim quotes.

## Mapping A: which ATLAS mitigations each Aigis area cites (23)

| Area | ATLAS mitigations | How decided |
|---|---|---|
| audit-logging | AML.M0024 AI Telemetry Logging and Monitoring | both |
| confidence-scoring | AML.M0020 Generative AI Guardrails | adjudicated |
| data-integrity | AML.M0007 Sanitize Training Data, AML.M0014 Verify AI Artifacts, AML.M0025 Maintain AI Dataset Provenance | both, both, both |
| human-oversight | AML.M0020 Generative AI Guardrails, AML.M0029 Human In-the-Loop for AI Agent Actions, AML.M0036 Limit AI Workload Resource Consumption | adjudicated, both, adjudicated |
| input-validation | AML.M0020 Generative AI Guardrails, AML.M0036 Limit AI Workload Resource Consumption | both, adjudicated |
| monitoring | AML.M0024 AI Telemetry Logging and Monitoring | both |
| output-sanitization | AML.M0020 Generative AI Guardrails, AML.M0032 Segmentation of AI Agent Components | both, both |
| pii-handling | AML.M0020 Generative AI Guardrails, AML.M0024 AI Telemetry Logging and Monitoring | both, adjudicated |
| prompt-security | AML.M0020 Generative AI Guardrails, AML.M0021 Generative AI Guidelines | both, adjudicated |
| rag-security | AML.M0019 Control Access to AI Models and Data in Production, AML.M0020 Generative AI Guardrails, AML.M0024 AI Telemetry Logging and Monitoring | both, both, adjudicated |
| rate-limiting | AML.M0004 Limit AI Service Query Volume and Rate, AML.M0036 Limit AI Workload Resource Consumption | both, both |
| supply-chain | AML.M0008 Validate AI Model | both |

No ATLAS citation (ATLAS has nothing that matches): bias-monitoring, explainability, fallback-patterns

Excluded tonight (6, incl. human-oversight AML.M0028 after round-2 review): fallback-patterns AML.M0036; human-oversight AML.M0030; human-oversight AML.M0037; monitoring AML.M0008; supply-chain AML.M0014

## Mapping B: attack entry points per trait, used by `aigis threats` (32)

| Trait | Techniques (maturity) |
|---|---|
| accepts-user-input | AML.T0051.000 Direct (Realized); AML.T0054 LLM Jailbreak (Realized); AML.T0068 LLM Prompt Obfuscation (Realized) |
| generates-content | AML.T0061 LLM Prompt Self-Replication (Demonstrated); AML.T0067 LLM Trusted Output Components Manipulation (Demonstrated); AML.T0143 LLM Prompt Propagation (Demonstrated) |
| is-agentic | AML.T0051.001 Indirect (Realized); AML.T0053 AI Agent Tool Invocation (Demonstrated); AML.T0086 Exfiltration via AI Agent Tool Invocation (Realized); AML.T0101 Data Destruction via AI Agent Tool Invocation (Realized); AML.T0110 AI Agent Tool Poisoning (Realized) |
| is-external | AML.T0024 Exfiltration via AI Inference API (Realized); AML.T0029 Denial of AI Service (Demonstrated); AML.T0049 Exploit Public-Facing Application (Realized); AML.T0093 Prompt Infiltration via Public-Facing Application (Realized); AML.T0132 Misconfigured or Publicly Exposed AI Services (Demonstrated) |
| multi-model-pipeline | AML.T0061 LLM Prompt Self-Replication (Demonstrated); AML.T0143 LLM Prompt Propagation (Demonstrated) |
| uses-finetuned | AML.T0010.002 Data Repository (Realized); AML.T0010.003 Model Repository (Realized); AML.T0011.000 Unsafe AI Artifacts (Realized); AML.T0020 Training Data Poisoning (Realized); AML.T0137.003 Extract Memorized Data (Demonstrated) |
| uses-llm | AML.T0051 LLM Prompt Injection (Realized); AML.T0069.002 System Prompt (Demonstrated) |
| uses-rag | AML.T0051.001 Indirect (Realized); AML.T0070 RAG Poisoning (Demonstrated); AML.T0071 False RAG Entry Injection (Demonstrated); AML.T0082 RAG Credential Harvesting (Demonstrated); AML.T0085.000 RAG Databases (Demonstrated) |
| uses-thirdparty-api | AML.T0010.001 Software (Realized); AML.T0109 AI Supply Chain Rug Pull (Realized) |

Removed after round-2 review (trait does not imply the precondition): is-agentic AML.T0080.000 (needs memory), uses-llm AML.T0077 (needs output rendering), processes-pii AML.T0085.002 (needs stored conversation memory). Candidate for a later `has-memory` trait.

Every row with MITRE's quote and the Aigis evidence: APPROVAL-DETAIL.md

Removed after round-3 review: generates-code AML.T0060 (a Resource Development technique; the protocol skips those), is-multimodal AML.T0051.001 / AML.T0068 / AML.T0129 (the trait includes generation-only systems, while these techniques need the system to take in outside content). Every proposed link, kept or dropped, is listed with MITRE's exact sentence in APPROVAL-DETAIL.md.
