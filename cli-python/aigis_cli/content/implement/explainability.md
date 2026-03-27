---
id: explainability
title: Explainability and transparency
controls:
  owasp: []
  nist: [MEASURE-2.8, MEASURE-2.9]
  iso42001: [Annex-A.8, Clause-7.4]
min_risk_tier: high
system_traits: [influences-decisions, handles-health, jurisdiction-eu]
---

## What this addresses

NIST MEASURE 2.9 requires that AI models are explained, validated, and documented. ISO 42001 Annex A.8 covers information for interested parties — stakeholders need to understand how AI decisions are made. The EU AI Act requires explainability for high-risk systems.

## Implementation patterns

### Pattern 1: Decision explanation generation

```python
def generate_explanation(decision: dict, context: dict) -> dict:
    """Generate a human-readable explanation of the AI decision."""
    return {
        "decision": decision["recommendation"],
        "explanation": {
            "primary_factors": extract_key_factors(context["input"], decision),
            "confidence_basis": explain_confidence(decision["confidence"]),
            "limitations": [
                "Assessment based only on claim description text",
                "Does not account for claim history or policy details",
                "Should be reviewed by a qualified adjuster"
            ]
        },
        "model_info": {
            "model_type": "Large language model (text analysis)",
            "version": decision["model_version"],
            "training_description": "General-purpose model, not fine-tuned on claims data"
        }
    }
```

```javascript
function generateExplanation(decision, context) {
  return {
    decision: decision.recommendation,
    explanation: {
      primaryFactors: extractKeyFactors(context.input, decision),
      confidenceBasis: explainConfidence(decision.confidence),
      limitations: [
        'Assessment based only on claim description text',
        'Does not account for claim history or policy details',
        'Should be reviewed by a qualified adjuster',
      ],
    },
    modelInfo: {
      modelType: 'Large language model (text analysis)',
      version: decision.modelVersion,
      trainingDescription: 'General-purpose model, not fine-tuned on claims data',
    },
  };
}
```


### Pattern 2: Model card generation

```python
def generate_model_card() -> dict:
    """Structured model documentation per NIST MEASURE 2.9."""
    return {
        "model_name": "Claims Severity Assessor",
        "version": MODEL_VERSION,
        "intended_use": "Advisory assessment of insurance claim severity",
        "not_intended_for": [
            "Autonomous claim decisions without human review",
            "Assessment of claim validity or fraud detection",
            "Processing claims involving legal disputes"
        ],
        "known_limitations": [
            "Performance degrades on claims under 20 words",
            "Does not handle multi-incident claims well",
            "May show bias toward formal writing styles"
        ],
        "performance_metrics": load_latest_evaluation_results(),
        "fairness_evaluation": load_latest_fairness_report(),
        "last_evaluated": get_last_evaluation_date(),
        "contact": "ai-risk-team@company.com"
    }
```

```javascript
function generateModelCard() {
  return {
    modelName: 'Claims Severity Assessor',
    version: MODEL_VERSION,
    intendedUse: 'Advisory assessment of insurance claim severity',
    notIntendedFor: [
      'Autonomous claim decisions without human review',
      'Assessment of claim validity or fraud detection',
      'Processing claims involving legal disputes',
    ],
    knownLimitations: [
      'Performance degrades on claims under 20 words',
      'Does not handle multi-incident claims well',
      'May show bias toward formal writing styles',
    ],
    performanceMetrics: loadLatestEvaluationResults(),
    fairnessEvaluation: loadLatestFairnessReport(),
    lastEvaluated: getLastEvaluationDate(),
    contact: 'ai-risk-team@company.com',
  };
}
```


### Pattern 3: Audit-friendly decision records

```python
def create_decision_record(decision: dict, explanation: dict, context: dict) -> dict:
    """Complete record for compliance audit per ISO 42001 Clause 9.1."""
    return {
        "record_id": generate_id(),
        "timestamp": datetime.utcnow().isoformat(),
        "decision": decision,
        "explanation": explanation,
        "input_summary": summarize(context["input"]),  # Not raw input
        "controls_applied": context["controls"],
        "risk_tier": context["risk_tier"],
        "human_reviewable": True,
        "appeal_available": True,
        "appeal_endpoint": "/api/v1/appeal",
        "retention_period_days": 365,
        "framework_references": {
            "nist": ["MEASURE-2.8", "MEASURE-2.9"],
            "iso42001": ["Annex-A.8", "Clause-9.1"]
        }
    }
```

```javascript
function createDecisionRecord(decision, explanation, context) {
  return {
    recordId: generateId(),
    timestamp: new Date().toISOString(),
    decision,
    explanation,
    inputSummary: summarize(context.input),
    controlsApplied: context.controls,
    riskTier: context.riskTier,
    humanReviewable: true,
    appealAvailable: true,
    appealEndpoint: '/api/v1/appeal',
    retentionPeriodDays: 365,
    frameworkReferences: {
      nist: [MEASURE-2.8, MEASURE-2.9],
      iso42001: [Annex-A.8, Clause-9.1],
    },
  };
}
```


## Anti-patterns

- **"Black box" AI decisions.** Every consequential decision must be explainable.
- **Technical jargon in explanations.** Explanations must be understandable by the affected person.
- **No model card.** High-risk systems need documented model information.
- **Explanations generated post-hoc only.** Build explanation capability into the system from the start.

## Edge cases

- **Explanation fidelity.** LLM-generated explanations may not accurately reflect why the model produced its output. Use structured factor extraction where possible.
- **Trade secrets vs. transparency.** You can explain decision factors without revealing the full system prompt or model architecture.
- **Multi-model explanations.** In pipelines, each model's contribution should be traceable.
