# GATE A2: rulebook references for the two new guides

Plain summary for Nayan. Every row below has the rulebook's exact sentence and the guide step that does it in new-areas.candidate.json.

## agent-permissions
- MITRE ATLAS defenses: AML.M0026 Manage AI Agent Service Access; AML.M0027 Manage User-Delegated AI Agent Access; AML.M0028 Enforce Access Controls for AI Agent Tools; AML.M0037 AI Agent Authority Expansion Controls; AML.M0043 AI Agent External Resource Lifecycle Management
- OWASP Top 10 for LLMs 2025: LLM06 Excessive Agency; LLM01 Prompt Injection; LLM02 Sensitive Information Disclosure; LLM05 Improper Output Handling; LLM07 System Prompt Leakage
- NIST AI RMF 1.0: MEASURE-2.7 AI system security and resilience – as identified in the MAP function – are evaluated and documented.

## agent-tool-safety
- MITRE ATLAS defenses: AML.M0030 Restrict AI Agent Tool Invocation on Untrusted Data; AML.M0033 Input and Output Validation for AI Agent Components; AML.M0038 AI Agent Scope Drift Detection; AML.M0031 Memory Hardening; AML.M0020 Generative AI Guardrails; AML.M0029 Human In-the-Loop for AI Agent Actions; AML.M0037 AI Agent Authority Expansion Controls
- OWASP Top 10 for LLMs 2025: LLM01 Prompt Injection; LLM06 Excessive Agency; LLM02 Sensitive Information Disclosure; LLM05 Improper Output Handling
- NIST AI RMF 1.0: MEASURE-2.7 AI system security and resilience – as identified in the MAP function – are evaluated and documented.; MANAGE-2.4 Mechanisms are in place and applied, and responsibilities are assigned and understood, to supersede, disengage, or deactivate AI systems that demonstrate performance or outcomes inconsistent with intended use.

Left out (claimed more than the guide does): agent-tool-safety AML.M0036; agent-tool-safety LLM10; agent-permissions MANAGE-1.3; agent-tool-safety MANAGE-1.3
ISO 42001: none (standard text not available to quote).

## Approval
- Approved by Nayan Kanaparthi in the orchestrator chat ("I approved"), recorded 2026-11-24T22:44:23Z.
- ISO 42001: no rows (owner did not approve citing by precedent).
