---
id: monitoring
title: Post-deployment monitoring
controls:
  owasp: []
  nist: [MEASURE-2.4, MEASURE-3.1, MANAGE-4.1, MANAGE-4.2]
  iso42001: [Clause-9.1, Clause-10]
min_risk_tier: medium
system_traits: [uses-llm, is-high-volume, multi-model-pipeline]
---

## What this addresses

NIST MANAGE 4.1 requires post-deployment monitoring including performance tracking, feedback integration, and incident response. ISO 42001 Clause 9.1 requires systematic measurement and evaluation. This covers operational monitoring after the system is live.

## Implementation patterns

### Pattern 1: Key metrics dashboard

```python
MONITORING_METRICS = {
    "latency_p50_ms": {"alert_threshold": 5000, "window": "5m"},
    "latency_p99_ms": {"alert_threshold": 15000, "window": "5m"},
    "error_rate": {"alert_threshold": 0.05, "window": "15m"},
    "override_rate": {"alert_threshold": 0.30, "window": "24h"},
    "confidence_mean": {"alert_threshold_low": 0.4, "window": "1h"},
    "tokens_per_request_mean": {"alert_threshold": 3000, "window": "1h"},
    "cost_per_hour_usd": {"alert_threshold": 50.0, "window": "1h"},
    "fallback_rate": {"alert_threshold": 0.10, "window": "1h"},
}

def check_metrics(current: dict) -> list:
    alerts = []
    for metric, config in MONITORING_METRICS.items():
        value = current.get(metric)
        if value is None:
            continue
        threshold = config.get("alert_threshold")
        if threshold and value > threshold:
            alerts.append({"metric": metric, "value": value, "threshold": threshold})
    return alerts
```

```javascript
const MONITORING_METRICS = {
  latencyP50Ms: { alertThreshold: 5000, window: '5m' },
  latencyP99Ms: { alertThreshold: 15000, window: '5m' },
  errorRate: { alertThreshold: 0.05, window: '15m' },
  overrideRate: { alertThreshold: 0.30, window: '24h' },
  confidenceMean: { alertThresholdLow: 0.4, window: '1h' },
  tokensPerRequestMean: { alertThreshold: 3000, window: '1h' },
  costPerHourUsd: { alertThreshold: 50.0, window: '1h' },
  fallbackRate: { alertThreshold: 0.10, window: '1h' },
};

function checkMetrics(current) {
  const alerts = [];
  for (const [metric, config] of Object.entries(MONITORING_METRICS)) {
    const value = current[metric];
    if (value == null) continue;
    if (config.alertThreshold && value > config.alertThreshold)
      alerts.push({ metric, value, threshold: config.alertThreshold });
  }
  return alerts;
}
```


### Pattern 2: Output drift detection

```python
class DriftDetector:
    def __init__(self, baseline_window: str = "30d"):
        self.baseline = self.compute_baseline(baseline_window)

    def check_drift(self, recent_window: str = "24h") -> dict:
        recent = self.compute_distribution(recent_window)
        drift_score = self.ks_test(self.baseline, recent)  # Kolmogorov-Smirnov

        return {
            "drift_detected": drift_score > DRIFT_THRESHOLD,
            "drift_score": drift_score,
            "baseline_mean": self.baseline["mean"],
            "recent_mean": recent["mean"],
            "baseline_window": self.baseline["window"],
            "recent_window": recent_window
        }
```

```javascript
class DriftDetector {
  constructor(baselineWindow = '30d') {
    this.baseline = null;
    this.init(baselineWindow);
  }

  async init(window) {
    this.baseline = await this.computeDistribution(window);
  }

  async checkDrift(recentWindow = '24h') {
    const recent = await this.computeDistribution(recentWindow);
    const driftScore = this.ksTest(this.baseline, recent);
    return {
      driftDetected: driftScore > DRIFT_THRESHOLD,
      driftScore,
      baselineMean: this.baseline.mean,
      recentMean: recent.mean,
    };
  }
}
```


### Pattern 3: User feedback integration

```python
def record_feedback(trace_id: str, feedback_type: str, details: str = None):
    """Record user feedback on AI decisions for monitoring."""
    feedback_store.insert({
        "trace_id": trace_id,
        "feedback_type": feedback_type,  # "agree", "disagree", "escalate"
        "details": details,
        "timestamp": datetime.utcnow().isoformat()
    })

    # Check for feedback patterns
    recent_disagreements = feedback_store.count(
        feedback_type="disagree",
        window="24h"
    )
    if recent_disagreements > DISAGREEMENT_ALERT_THRESHOLD:
        alert_ops_team(f"High disagreement rate: {recent_disagreements} in 24h")
```

```javascript
async function recordFeedback(traceId, feedbackType, details = null) {
  await feedbackStore.insert({
    traceId,
    feedbackType,  // 'agree', 'disagree', 'escalate'
    details,
    timestamp: new Date().toISOString(),
  });
  const recentDisagreements = await feedbackStore.count({
    feedbackType: 'disagree', window: '24h',
  });
  if (recentDisagreements > DISAGREEMENT_ALERT_THRESHOLD)
    await alertOpsTeam('High disagreement rate: ' + recentDisagreements + ' in 24h');
}
```


### Pattern 4: Incident response logging

```python
def log_incident(incident_type: str, details: dict, severity: str):
    """Structured incident logging per NIST MANAGE 4.3."""
    incident = {
        "incident_id": generate_id(),
        "type": incident_type,
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat(),
        "details": details,
        "status": "open",
        "nist_control": "MANAGE-4.3",
        "response_actions": [],
        "resolution": None
    }
    incident_store.insert(incident)
    if severity in ("high", "critical"):
        alert_incident_team(incident)
    return incident
```

```javascript
function logIncident(incidentType, details, severity) {
  const incident = {
    incidentId: generateId(),
    type: incidentType,
    severity,
    timestamp: new Date().toISOString(),
    details,
    status: 'open',
    nistControl: MANAGE-4.3',
    responseActions: [],
    resolution: null,
  };
  incidentStore.insert(incident);
  if (['high', 'critical'].includes(severity))
    alertIncidentTeam(incident);
  return incident;
}
```


## Anti-patterns

- **No monitoring after deployment.** The system needs active monitoring from day one.
- **Monitoring only uptime.** Track output quality, not just availability.
- **No feedback mechanism.** Users must be able to flag bad outputs.
- **Alert fatigue.** Tune thresholds to avoid noise; tier alerts by severity.

## Edge cases

- **Gradual degradation.** Performance may decline slowly. Use drift detection, not just threshold alerts.
- **Seasonal patterns.** Some metrics vary by time of day/week/year. Build seasonality into baselines.
- **Model provider changes.** When the third-party model is updated, reset baselines and monitor closely.
