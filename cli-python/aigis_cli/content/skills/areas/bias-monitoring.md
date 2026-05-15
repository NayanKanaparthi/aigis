---
id: bias-monitoring
title: Bias monitoring and fairness
controls:
  owasp: []
  nist: [MAP-2.3, MEASURE-2.11, MEASURE-3.1]
  iso42001: [Clause-6.1, Annex-C]
  eu_ai_act: [Art-10(2)(f), Art-10(5)]
min_risk_tier: medium
system_traits: [influences-decisions, handles-health, handles-financial, generates-content, handles-minors]
---

## What this addresses

NIST MEASURE 2.11 requires evaluation of fairness and bias. AI systems can produce systematically different outcomes for different demographic groups, even without explicit demographic data, through proxy features like zip code, writing style, or name. This file covers the technical infrastructure for detecting and monitoring bias.

## Implementation patterns

### Pattern 1: Fairness-enabling metadata in logs

```python
def log_with_fairness_fields(decision: dict, context: dict):
    """Include fields that enable fairness auditing downstream."""
    audit_entry = {
        "trace_id": get_trace_id(),
        "decision": decision,
        # Fairness-relevant metadata (NOT protected characteristics directly)
        "fairness_audit_fields": {
            "claim_type": context.get("claim_type"),
            "region": context.get("region"),
            "submission_channel": context.get("channel"),  # web, phone, agent
            "input_language": detect_language(context.get("input_text", "")),
            "input_length_bucket": bucket_length(context.get("input_text", "")),
        }
    }
    audit_log.info(audit_entry)
```

```javascript
function logWithFairnessFields(decision, context) {
  auditLog.info({
    traceId: getTraceId(),
    decision,
    fairnessAuditFields: {
      claimType: context.claimType,
      region: context.region,
      submissionChannel: context.channel,
      inputLanguage: detectLanguage(context.inputText || ''),
      inputLengthBucket: bucketLength(context.inputText || ''),
    },
  });
}
```


### Pattern 2: Output distribution monitoring

```python
class BiasMonitor:
    def __init__(self, alert_threshold: float = 0.15):
        self.alert_threshold = alert_threshold

    def check_distribution(self, period: str = "7d") -> list:
        """Compare score distributions across demographic segments."""
        decisions = self.load_decisions(period)
        alerts = []

        for field in FAIRNESS_AUDIT_FIELDS:
            segments = group_by(decisions, field)
            for seg_a, seg_b in combinations(segments.keys(), 2):
                scores_a = [d["severity_score"] for d in segments[seg_a]]
                scores_b = [d["severity_score"] for d in segments[seg_b]]
                disparity = abs(mean(scores_a) - mean(scores_b))

                if disparity > self.alert_threshold:
                    alerts.append({
                        "field": field,
                        "segment_a": seg_a,
                        "segment_b": seg_b,
                        "disparity": disparity,
                        "sample_size_a": len(scores_a),
                        "sample_size_b": len(scores_b),
                    })
        return alerts
```

```javascript
class BiasMonitor {
  constructor(alertThreshold = 0.15) {
    this.alertThreshold = alertThreshold;
  }

  async checkDistribution(period = '7d') {
    const decisions = await this.loadDecisions(period);
    const alerts = [];
    for (const field of FAIRNESS_AUDIT_FIELDS) {
      const segments = groupBy(decisions, field);
      const keys = Object.keys(segments);
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const scoresA = segments[keys[i]].map(d => d.severityScore);
          const scoresB = segments[keys[j]].map(d => d.severityScore);
          const disparity = Math.abs(mean(scoresA) - mean(scoresB));
          if (disparity > this.alertThreshold) {
            alerts.push({ field, segmentA: keys[i], segmentB: keys[j],
              disparity, sampleSizeA: scoresA.length, sampleSizeB: scoresB.length });
          }
        }
      }
    }
    return alerts;
  }
}
```


### Pattern 3: Periodic fairness reports

```python
def generate_fairness_report(period: str = "30d") -> dict:
    monitor = BiasMonitor()
    alerts = monitor.check_distribution(period)
    override_analysis = monitor.analyze_override_patterns(period)

    return {
        "period": period,
        "generated_at": datetime.utcnow().isoformat(),
        "distribution_alerts": alerts,
        "override_patterns": override_analysis,
        "total_decisions": monitor.count_decisions(period),
        "nist_control": "MEASURE-2.11",
        "iso_clause": "Clause-6.1",
        "recommendation": "review_required" if alerts else "no_action_needed"
    }
```

```javascript
async function generateFairnessReport(period = '30d') {
  const monitor = new BiasMonitor();
  const alerts = await monitor.checkDistribution(period);
  const overrideAnalysis = await monitor.analyzeOverridePatterns(period);
  return {
    period,
    generatedAt: new Date().toISOString(),
    distributionAlerts: alerts,
    overridePatterns: overrideAnalysis,
    totalDecisions: await monitor.countDecisions(period),
    nistControl: MEASURE-2.11',
    isoClause: Clause-6.1',
    recommendation: alerts.length ? 'review_required' : 'no_action_needed',
  };
}
```


## Anti-patterns

- **Collecting protected characteristics directly.** Use proxy-free fairness audit fields.
- **One-time bias testing.** Bias must be monitored continuously, not just at launch.
- **Only measuring accuracy.** Equal accuracy doesn't mean equal outcomes. Measure disparate impact.
- **Ignoring override patterns.** If humans override AI decisions more for one group, that signals bias.

## Related files

- **audit-logging.md:** Fairness audit fields (Pattern 1) must be included in the structured log entries defined in audit-logging.md Pattern 1. The fairness fields are additional metadata in the same audit log, not a separate logging system.
- **human-oversight.md:** Override patterns are a key bias signal. Track human override rates per segment using human-oversight.md Pattern 4 (override mechanism) data, analyzed through bias-monitoring.md Pattern 2 (distribution monitoring).
- **confidence-scoring.md:** Bias may manifest as systematically lower confidence for certain groups. Cross-reference confidence distributions with fairness audit fields.

## Edge cases

- **Intersectional bias.** Bias may only appear at the intersection of two dimensions (e.g., region + claim type).
- **Small sample sizes.** Statistical tests need sufficient data per segment. Flag when samples are too small.
- **Feedback loops.** If biased outputs influence future training data, bias compounds over time.

## EU AI Act extensions

> Renders only when `jurisdiction-eu` is in the user's trait set. Article 10(2)(f) addresses bias examination of training/validation/testing data; Article 10(5) creates a narrow carve-out allowing PII processing for bias detection.

### Article 10(2)(f) — Bias examination obligations

The Aigis bias-monitoring procedure above must be ADDITIONALLY documented for EU high-risk systems with:

- **Examination performed pre-deployment** — bias examination must occur before placing the system on the market. Post-deployment monitoring (the procedure above's Pattern 2) is necessary but not sufficient — Art 10 requires the pre-deployment examination as well.
- **Coverage of biases likely to affect health, safety, or fundamental rights** — not "all biases." Document which protected characteristics + harm modes were examined, and the rationale for the scope.
- **Mitigation actions documented** — when a bias is found, the action taken (data resampling, model adjustment, deployment restriction, accepted residual risk) is recorded. Article 9 risk register cross-references these.

### Article 10(5) — PII for bias detection (special carve-out)

Article 10(5) permits processing of "special categories of personal data" (Article 9 GDPR — race, ethnicity, religion, biometric data, etc.) for the purpose of bias detection and correction in high-risk AI systems, **only when**:

1. Bias detection cannot be effectively achieved by anonymized or synthetic data
2. The special-category data is subject to "appropriate safeguards" — pseudonymisation, access controls, deletion when no longer needed
3. The data is NOT transmitted, transferred, or otherwise accessible to other parties

This is an exception that requires affirmative justification. Document the reason effective bias detection requires special-category data, the safeguards applied, and the deletion timeline.

### Verification checkpoint (EU jurisdiction)

- Pre-deployment bias examination report exists and is dated before market placement.
- Each examined characteristic has a documented mitigation status.
- If special-category PII was used for bias detection (Art 10(5)), the justification + safeguards + deletion plan is documented.

### Cross-reference

- `aigis get data-integrity` covers Art 10(2)(a)–(e) — the broader data governance subset.
- `aigis get pii-handling` covers runtime PII handling (different concern from training-time PII for bias detection).
