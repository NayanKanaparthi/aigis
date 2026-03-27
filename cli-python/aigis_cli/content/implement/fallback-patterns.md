---
id: fallback-patterns
title: Fallback and safe failure patterns
controls:
  owasp: []
  nist: [MEASURE-2.6, MANAGE-2.3, MANAGE-2.4]
  iso42001: [Clause-8.2]
min_risk_tier: medium
system_traits: [is-agentic, is-high-volume, influences-decisions, multi-model-pipeline]
---

## What this addresses

NIST MEASURE 2.6 requires that AI systems fail safely. MANAGE 2.4 requires mechanisms to disengage systems with inconsistent performance. This file covers graceful degradation, circuit breakers, kill switches, and safe default behaviors.

## Implementation patterns

### Pattern 1: Default safe response

```python
def default_safe_response() -> dict:
    """Return a safe, neutral response when the LLM fails or output is invalid."""
    return {
        "severity_score": 5,  # Middle of range, not extreme in either direction
        "recommendation": "standard",  # Routes to normal human review
        "confidence": 0.0,  # Zero confidence flags for human review
        "fallback": True,
        "message": "Unable to generate AI assessment. Routed to standard review."
    }
```

```javascript
function defaultSafeResponse() {
  return {
    severityScore: 5,
    recommendation: 'standard',
    confidence: 0.0,
    fallback: true,
    message: 'Unable to generate AI assessment. Routed to standard review.',
  };
}
```


### Pattern 2: Circuit breaker

```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, reset_timeout: int = 60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.state = "closed"  # closed = normal, open = failing, half-open = testing
        self.last_failure_time = None

    def call(self, func, *args, **kwargs):
        if self.state == "open":
            if time.time() - self.last_failure_time > self.reset_timeout:
                self.state = "half-open"
            else:
                log_event("circuit_breaker_open")
                return default_safe_response()

        try:
            result = func(*args, **kwargs)
            if self.state == "half-open":
                self.state = "closed"
                self.failure_count = 0
            return result
        except Exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                log_event("circuit_breaker_tripped", failures=self.failure_count)
                alert_ops_team("Circuit breaker tripped for LLM service")
            return default_safe_response()
```

```javascript
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'closed';
    this.lastFailureTime = null;
  }

  async call(fn, ...args) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout)
        this.state = 'half-open';
      else {
        logEvent('circuit_breaker_open');
        return defaultSafeResponse();
      }
    }
    try {
      const result = await fn(...args);
      if (this.state === 'half-open') { this.state = 'closed'; this.failureCount = 0; }
      return result;
    } catch (e) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
        logEvent('circuit_breaker_tripped', { failures: this.failureCount });
        alertOpsTeam('Circuit breaker tripped');
      }
      return defaultSafeResponse();
    }
  }
}
```


### Pattern 3: Kill switch

```python
class KillSwitch:
    """Emergency shutdown mechanism. Can be triggered manually or by automated monitoring."""

    def __init__(self, config_source: str):
        self.config_source = config_source

    def is_active(self) -> bool:
        # Check external config (e.g., feature flag service, Redis, config file)
        return self.load_config().get("ai_system_enabled", True)

    def check_automated_triggers(self, metrics: dict) -> bool:
        """Automatically disable if metrics breach thresholds."""
        if metrics.get("error_rate_7d", 0) > 0.15:  # >15% error rate
            self.disable("automated: error_rate exceeded 15%")
            return False
        if metrics.get("override_rate_7d", 0) > 0.40:  # >40% human overrides
            self.disable("automated: override_rate exceeded 40%")
            return False
        return True

    def disable(self, reason: str):
        self.save_config({"ai_system_enabled": False, "disabled_reason": reason})
        alert_ops_team(f"AI system killed: {reason}")
        log_event("kill_switch_activated", reason=reason)
```

```javascript
class KillSwitch {
  constructor(configSource) {
    this.configSource = configSource;
  }

  async isActive() {
    const config = await this.loadConfig();
    return config.aiSystemEnabled !== false;
  }

  async checkAutomatedTriggers(metrics) {
    if ((metrics.errorRate7d || 0) > 0.15) {
      await this.disable('automated: error_rate exceeded 15%');
      return false;
    }
    if ((metrics.overrideRate7d || 0) > 0.40) {
      await this.disable('automated: override_rate exceeded 40%');
      return false;
    }
    return true;
  }

  async disable(reason) {
    await this.saveConfig({ aiSystemEnabled: false, disabledReason: reason });
    await alertOpsTeam('AI system killed: ' + reason);
    logEvent('kill_switch_activated', { reason });
  }
}
```


## Anti-patterns

- **No fallback behavior defined.** Every AI call must have a defined failure path.
- **Crashing on LLM errors.** Catch exceptions and return safe defaults.
- **No kill switch.** There must always be a way to shut the system down quickly.
- **Kill switch requires code deployment.** Use external config that can be toggled without deploying.

## Edge cases

- **Partial failures.** The LLM returns valid JSON but the content is nonsensical. Output schema validation catches structural issues; confidence scoring catches content issues.
- **Cascading failures.** In multi-model pipelines, one model failing can cascade. Each stage needs independent fallback.
- **Recovery after kill switch.** Define a process for re-enabling: run evaluation suite, gradual rollout, monitoring period.
