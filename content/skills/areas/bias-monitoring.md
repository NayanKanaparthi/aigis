---
id: bias-monitoring
title: Bias monitoring and fairness
controls:
  owasp: []
  nist: [MAP-2.3, MEASURE-2.11, MEASURE-3.1]
  iso42001: [Clause-6.1, Annex-C]
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
