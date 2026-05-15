---
id: confidence-scoring
title: Confidence scoring and misinformation prevention
controls:
  owasp: [LLM09]
  nist: [MAP-2.2, MEASURE-2.5, MEASURE-2.9]
  iso42001: [Annex-A.8]
  eu_ai_act: [Art-15(1), Art-15(2), Art-15(3)]
min_risk_tier: all
system_traits: [influences-decisions, is-external, generates-content]
---

## What this addresses

OWASP LLM09 covers misinformation — confident but incorrect LLM outputs (hallucinations, fabricated citations, false facts). When decisions are based on unverified LLM output, consequences can be severe. This file covers confidence metadata, grounding, and uncertainty disclosure.

## Implementation patterns

### Pattern 1: Structured confidence in every response

```python
class LLMResponse:
    def __init__(self, content: dict, raw_response: str):
        self.content = content
        self.confidence = self.compute_confidence(raw_response)
        self.grounded = self.check_grounding(content)

    def compute_confidence(self, raw: str) -> dict:
        return {
            "score": self.extract_confidence_score(raw),
            "level": self.categorize(self.extract_confidence_score(raw)),
            "factors": self.identify_uncertainty_factors(raw)
        }

    def categorize(self, score: float) -> str:
        if score >= 0.8: return "high"
        if score >= 0.5: return "medium"
        return "low"

    def to_response(self) -> dict:
        return {
            **self.content,
            "confidence": self.confidence,
            "grounded": self.grounded,
            "disclaimer": self.generate_disclaimer()
        }

    def generate_disclaimer(self) -> str | None:
        if self.confidence["level"] == "low":
            return "This assessment has low confidence. Human review recommended."
        return None
```

```javascript
class LlmResponse {
  constructor(content, rawResponse) {
    this.content = content;
    this.confidence = this.computeConfidence(rawResponse);
    this.grounded = this.checkGrounding(content);
  }

  computeConfidence(raw) {
    const score = this.extractConfidenceScore(raw);
    return {
      score,
      level: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
      factors: this.identifyUncertaintyFactors(raw),
    };
  }

  toResponse() {
    return {
      ...this.content,
      confidence: this.confidence,
      grounded: this.grounded,
      disclaimer: this.confidence.level === 'low'
        ? 'This assessment has low confidence. Human review recommended.' : null,
    };
  }
}
```


### Pattern 2: RAG-based grounding verification

```python
def verify_grounding(llm_output: str, retrieved_sources: list) -> dict:
    """Check if LLM claims are supported by retrieved documents."""
    claims = extract_claims(llm_output)
    grounded_claims = 0
    ungrounded_claims = []

    for claim in claims:
        supported = any(
            is_supported_by(claim, source["content"])
            for source in retrieved_sources
        )
        if supported:
            grounded_claims += 1
        else:
            ungrounded_claims.append(claim)

    grounding_ratio = grounded_claims / len(claims) if claims else 0
    return {
        "grounding_ratio": grounding_ratio,
        "total_claims": len(claims),
        "ungrounded_claims": ungrounded_claims,
        "fully_grounded": len(ungrounded_claims) == 0
    }
```

```javascript
function verifyGrounding(llmOutput, retrievedSources) {
  const claims = extractClaims(llmOutput);
  const ungroundedClaims = [];
  let groundedCount = 0;

  for (const claim of claims) {
    const supported = retrievedSources.some(
      source => isSupportedBy(claim, source.content)
    );
    if (supported) groundedCount++;
    else ungroundedClaims.push(claim);
  }

  return {
    groundingRatio: claims.length ? groundedCount / claims.length : 0,
    totalClaims: claims.length,
    ungroundedClaims,
    fullyGrounded: ungroundedClaims.length === 0,
  };
}
```


### Pattern 3: Never present LLM output as definitive fact

```python
def format_for_display(assessment: dict) -> dict:
    """Frame AI output as a recommendation, not a fact."""
    return {
        "header": "AI-assisted assessment",  # Not "Assessment Result"
        "body": assessment["content"],
        "confidence_indicator": assessment["confidence"]["level"],
        "source_attribution": assessment.get("sources", []),
        "footer": "This is an AI-generated recommendation. "
                  "Final decisions should be made by qualified personnel."
    }
```

```javascript
function formatForDisplay(assessment) {
  return {
    header: 'AI-assisted assessment',  // Not "Assessment Result"
    body: assessment.content,
    confidenceIndicator: assessment.confidence.level,
    sourceAttribution: assessment.sources || [],
    footer: 'This is an AI-generated recommendation. '
      + 'Final decisions should be made by qualified personnel.',
  };
}
```


## Anti-patterns

- **Presenting LLM output without confidence metadata.** Always include confidence.
- **"The AI determined..." framing.** Use "The AI suggests..." or "Based on available data..."
- **No source attribution.** When using RAG, cite the sources that informed the response.
- **Binary confidence (just confident/not confident).** Use a spectrum with actionable thresholds.

## Related files

- **human-oversight.md:** When confidence is low, route to human review. Implement human-oversight.md Pattern 2 (decision gate with confidence threshold) to automatically flag low-confidence outputs for human review rather than auto-processing them.
- **monitoring.md:** Confidence scores should be tracked over time. Use monitoring.md Pattern 1 (key metrics dashboard) to monitor mean confidence and alert when it drops, which may signal model degradation or data drift.

## Edge cases

- **Calibration.** LLM confidence scores are often miscalibrated. Validate against ground truth periodically.
- **Confident hallucinations.** LLMs can be confidently wrong. Grounding verification catches this better than self-reported confidence.
- **Downstream automation.** If another system consumes the confidence score, ensure it respects low-confidence flags.

## EU AI Act extensions

> Renders only when `jurisdiction-eu` is in the user's trait set. Article 15 addresses accuracy, robustness, and cybersecurity of high-risk AI systems. This area covers the **accuracy** dimension of Art 15. Robustness is in `aigis get fallback-patterns`; cybersecurity is in `aigis get prompt-security` and `aigis get input-validation`.

### Article 15(1)–(3) — Accuracy obligations

- **Art 15(1) — Appropriate level of accuracy.** "Appropriate" is defined by the intended purpose. A medical triage system has a higher accuracy floor than a marketing-copy generator. Document the accuracy floor for your system AND the rationale for choosing it.
- **Art 15(2) — Performance consistent throughout the lifecycle.** Accuracy is not a one-time measurement. Re-measurement happens on every material change (model upgrade, training data refresh, deployment region added). Each re-measurement is logged with timestamp and result.
- **Art 15(3) — Metrics declared in instructions for use.** The accuracy metrics + measurement methodology + known limitations must appear in the deployer transparency document (`aigis get eu-ai-act-art-13-deployer-transparency` Step 2). The metric definitions in this area's procedure above are the source for those declarations.

### Verification checkpoint (EU jurisdiction)

- Accuracy floor for the system is documented with rationale.
- Latest accuracy measurement is dated within the last 90 days OR within the material-change interval (whichever is shorter).
- Article 13 deployer instructions Section "Performance and accuracy" cites the same metrics + methodology + limitations as this area's measurement output. The two documents stay in sync.

### Cross-reference

- `aigis get fallback-patterns` — Article 15(4) robustness extension.
- `aigis get prompt-security` and `aigis get input-validation` — Article 15(5) cybersecurity extensions.
- `aigis get eu-ai-act-art-13-deployer-transparency` — where the declared accuracy metrics get published to deployers.
