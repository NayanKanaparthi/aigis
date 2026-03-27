from __future__ import annotations

ALL_TRAITS = [
    "uses-llm", "uses-rag", "uses-finetuned", "uses-thirdparty-api", "is-agentic", "is-multimodal",
    "processes-pii", "handles-financial", "handles-health", "handles-proprietary", "handles-minors",
    "influences-decisions", "accepts-user-input", "is-external", "is-internal", "is-high-volume",
    "generates-code", "generates-content", "multi-model-pipeline",
    "jurisdiction-eu", "jurisdiction-us-regulated", "jurisdiction-global",
]

TRAIT_FILES: dict[str, list[str]] = {
    "uses-llm": ["input-validation", "output-sanitization", "prompt-security", "audit-logging", "monitoring"],
    "uses-rag": ["rag-security", "data-integrity"],
    "uses-finetuned": ["data-integrity", "supply-chain"],
    "uses-thirdparty-api": ["supply-chain"],
    "is-agentic": ["human-oversight", "rate-limiting", "fallback-patterns", "audit-logging"],
    "is-multimodal": ["input-validation", "output-sanitization", "pii-handling"],
    "processes-pii": ["pii-handling", "audit-logging"],
    "handles-financial": ["pii-handling", "audit-logging", "bias-monitoring"],
    "handles-health": ["pii-handling", "audit-logging", "bias-monitoring", "explainability"],
    "handles-proprietary": ["pii-handling", "prompt-security"],
    "handles-minors": ["pii-handling", "bias-monitoring", "human-oversight"],
    "influences-decisions": ["bias-monitoring", "confidence-scoring", "human-oversight", "explainability"],
    "accepts-user-input": ["input-validation", "output-sanitization"],
    "is-external": ["rate-limiting", "confidence-scoring"],
    "is-internal": [],
    "is-high-volume": ["rate-limiting", "monitoring", "fallback-patterns"],
    "generates-code": ["output-sanitization", "human-oversight", "fallback-patterns"],
    "generates-content": ["confidence-scoring", "bias-monitoring", "audit-logging"],
    "multi-model-pipeline": ["audit-logging", "monitoring", "fallback-patterns", "data-integrity"],
    "jurisdiction-eu": [],
    "jurisdiction-us-regulated": [],
    "jurisdiction-global": [],
}

FILE_CONTROLS: dict[str, dict[str, list[str]]] = {
    "input-validation": {"owasp": ["LLM01"], "nist": ["MEASURE-2.7", "MANAGE-1.3"], "iso": ["Clause-8.2", "Annex-A.6"]},
    "output-sanitization": {"owasp": ["LLM05"], "nist": ["MEASURE-2.6", "MEASURE-2.7"], "iso": ["Clause-8.2"]},
    "pii-handling": {"owasp": ["LLM02"], "nist": ["MAP-2.1", "MEASURE-2.10"], "iso": ["Annex-A.7", "Annex-A.4"]},
    "prompt-security": {"owasp": ["LLM07"], "nist": ["MEASURE-2.7", "MEASURE-2.8"], "iso": ["Clause-8.2"]},
    "human-oversight": {"owasp": ["LLM06"], "nist": ["MAP-3.5", "MANAGE-1.3", "MANAGE-4.1"], "iso": ["Annex-A.9", "Clause-8.4"]},
    "supply-chain": {"owasp": ["LLM03"], "nist": ["GOVERN-6.1", "GOVERN-6.2", "MANAGE-3.1", "MANAGE-3.2"], "iso": ["Annex-A.10"]},
    "data-integrity": {"owasp": ["LLM04"], "nist": ["MAP-2.3", "MEASURE-2.6"], "iso": ["Annex-A.7"]},
    "rag-security": {"owasp": ["LLM08"], "nist": ["MEASURE-2.7"], "iso": ["Clause-8.2", "Annex-A.7"]},
    "confidence-scoring": {"owasp": ["LLM09"], "nist": ["MAP-2.2", "MEASURE-2.5", "MEASURE-2.9"], "iso": ["Annex-A.8"]},
    "rate-limiting": {"owasp": ["LLM10"], "nist": ["MEASURE-2.6", "MANAGE-2.4"], "iso": ["Clause-8.2"]},
    "audit-logging": {"owasp": [], "nist": ["MEASURE-2.8", "MANAGE-4.1", "MANAGE-4.3"], "iso": ["Clause-9.1", "Annex-A.6"]},
    "bias-monitoring": {"owasp": [], "nist": ["MAP-2.3", "MEASURE-2.11", "MEASURE-3.1"], "iso": ["Clause-6.1", "Annex-C"]},
    "fallback-patterns": {"owasp": [], "nist": ["MEASURE-2.6", "MANAGE-2.3", "MANAGE-2.4"], "iso": ["Clause-8.2"]},
    "monitoring": {"owasp": [], "nist": ["MEASURE-2.4", "MEASURE-3.1", "MANAGE-4.1", "MANAGE-4.2"], "iso": ["Clause-9.1", "Clause-10"]},
    "explainability": {"owasp": [], "nist": ["MEASURE-2.8", "MEASURE-2.9"], "iso": ["Annex-A.8", "Clause-7.4"]},
}


def classify(trait_list: list[str]) -> dict:
    ts = set(trait_list)
    warnings: list[str] = []

    invalid = [t for t in trait_list if t not in ALL_TRAITS]
    if invalid:
        raise ValueError(
            f'Unknown traits: {", ".join(invalid)}. Run "aigis traits" to see available traits.'
        )

    # Constraint C1: is-internal + is-external
    if "is-internal" in ts and "is-external" in ts:
        warnings.append("Both is-internal and is-external selected. Treating as is-external (stricter).")
        ts.discard("is-internal")

    # Step 1: trait-based file selection
    files: set[str] = set()
    for t in ts:
        for f in TRAIT_FILES.get(t, []):
            files.add(f)

    # Step 2: risk tier
    sens_data = bool(
        ts & {"processes-pii", "handles-financial", "handles-health", "handles-proprietary", "handles-minors"}
    )

    tier = "LOW"
    reason = "no high/medium triggers"

    if "influences-decisions" in ts:
        tier, reason = "HIGH", "influences-decisions"
    elif "handles-health" in ts:
        tier, reason = "HIGH", "handles-health"
    elif "handles-financial" in ts and "accepts-user-input" in ts:
        tier, reason = "HIGH", "handles-financial + accepts-user-input"
    elif "handles-minors" in ts:
        tier, reason = "HIGH", "handles-minors"
    elif ("jurisdiction-eu" in ts or "jurisdiction-global" in ts) and sens_data:
        tier, reason = "HIGH", "jurisdiction-eu + sensitive data"
    elif "generates-code" in ts and "is-external" in ts:
        tier, reason = "HIGH", "generates-code + is-external"
    elif "generates-code" in ts and "is-agentic" in ts:
        tier, reason = "HIGH", "generates-code + is-agentic"
    elif "processes-pii" in ts:
        tier, reason = "MEDIUM", "processes-pii"
    elif "is-external" in ts:
        tier, reason = "MEDIUM", "is-external"
    elif "is-agentic" in ts:
        tier, reason = "MEDIUM", "is-agentic"
    elif "handles-proprietary" in ts:
        tier, reason = "MEDIUM", "handles-proprietary"
    elif "generates-content" in ts:
        tier, reason = "MEDIUM", "generates-content"
    elif "multi-model-pipeline" in ts:
        tier, reason = "MEDIUM", "multi-model-pipeline"
    elif "jurisdiction-us-regulated" in ts:
        tier, reason = "MEDIUM", "jurisdiction-us-regulated"
    elif "generates-code" in ts:
        tier, reason = "MEDIUM", "generates-code"

    # Jurisdiction modifier
    if ("jurisdiction-eu" in ts or "jurisdiction-global" in ts) and tier != "HIGH":
        old_tier = tier
        tier = "MEDIUM" if tier == "LOW" else "HIGH"
        reason += f" (elevated from {old_tier} by EU/global jurisdiction)"

    # Step 3: guardrails
    guardrails_fired: list[dict] = []

    # G12 removal guardrail fires first
    if "uses-llm" in ts and "uses-thirdparty-api" not in ts and "supply-chain" in files:
        files.discard("supply-chain")
        guardrails_fired.append({
            "id": "G12",
            "action": "REMOVE supply-chain",
            "rationale": "Self-hosted models skip third-party controls",
        })

    guardrails = [
        ("G1", lambda: sens_data and "audit-logging" not in files, "audit-logging", "Sensitive data requires traceability"),
        ("G2", lambda: "handles-health" in ts and "bias-monitoring" not in files, "bias-monitoring", "Health data has demographic bias risks"),
        ("G3", lambda: "handles-financial" in ts and "influences-decisions" in ts and "fallback-patterns" not in files, "fallback-patterns", "Financial decisions need safe failure"),
        ("G4", lambda: "is-agentic" in ts and "human-oversight" not in files, "human-oversight", "Autonomous systems need oversight"),
        ("G5", lambda: "generates-code" in ts and "output-sanitization" not in files, "output-sanitization", "Generated code is execution risk"),
        ("G6", lambda: "jurisdiction-eu" in ts and "explainability" not in files, "explainability", "EU AI Act requires explainability"),
        ("G7", lambda: "jurisdiction-eu" in ts and "bias-monitoring" not in files, "bias-monitoring", "EU AI Act mandates non-discrimination"),
        ("G8", lambda: "handles-minors" in ts and "human-oversight" not in files, "human-oversight", "Systems affecting children require review"),
        ("G9", lambda: "multi-model-pipeline" in ts and "monitoring" not in files, "monitoring", "Multi-model compounding failures"),
        ("G10", lambda: tier == "HIGH" and "monitoring" not in files, "monitoring", "High-risk systems need monitoring"),
        ("G11", lambda: tier == "HIGH" and "fallback-patterns" not in files, "fallback-patterns", "High-risk systems must fail safely"),
        ("G13", lambda: "jurisdiction-us-regulated" in ts and "audit-logging" not in files, "audit-logging", "US regulated industries need audit trails"),
        ("G14", lambda: "jurisdiction-us-regulated" in ts and "human-oversight" not in files, "human-oversight", "US regulated industries need human review"),
        ("G15", lambda: "generates-code" in ts and "human-oversight" not in files, "human-oversight", "Code generation needs human review"),
    ]

    for gid, cond, file, rationale in guardrails:
        if cond():
            files.add(file)
            guardrails_fired.append({"id": gid, "action": f"ADD {file}", "rationale": rationale})

    # Step 4: templates
    templates: list[str] = []
    if tier == "HIGH" or "jurisdiction-eu" in ts or "jurisdiction-global" in ts or "influences-decisions" in ts:
        templates.extend(["ai-impact-assessment", "intended-purpose-doc", "risk-characterization"])
    elif tier == "MEDIUM" or "jurisdiction-us-regulated" in ts:
        templates.append("intended-purpose-doc")

    if "uses-thirdparty-api" in ts and tier != "LOW":
        templates.append("third-party-assessment")

    if "jurisdiction-us-regulated" in ts and "ai-impact-assessment" not in templates:
        templates.insert(0, "ai-impact-assessment")

    # Step 5: collect control IDs
    all_owasp: set[str] = set()
    all_nist: set[str] = set()
    all_iso: set[str] = set()
    for f in files:
        c = FILE_CONTROLS.get(f)
        if c:
            all_owasp.update(c["owasp"])
            all_nist.update(c["nist"])
            all_iso.update(c["iso"])

    return {
        "risk_tier": tier,
        "reason": reason,
        "traits": list(ts),
        "implement_files": sorted(files),
        "templates": list(dict.fromkeys(templates)),
        "guardrails_fired": guardrails_fired,
        "warnings": warnings,
        "controls": {
            "owasp": sorted(all_owasp),
            "nist": sorted(all_nist),
            "iso": sorted(all_iso),
        },
    }
