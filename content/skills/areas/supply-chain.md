---
id: supply-chain
title: Supply chain and third-party AI management
controls:
  owasp: [LLM03]
  nist: [GOVERN-6.1, GOVERN-6.2, MANAGE-3.1, MANAGE-3.2]
  iso42001: [Annex-A.10]
min_risk_tier: all
system_traits: [uses-thirdparty-api, uses-finetuned]
---

## What this addresses

OWASP LLM03 covers supply chain risks: the LLM provider, fine-tuning data, plugins, and pre-built components. When you depend on a third-party model API, you inherit their risks. Model updates can change behavior. Service outages affect your availability. Terms of service changes affect your compliance.

## Implementation patterns

### Pattern 1: Pin model versions

```python
# CORRECT: pin to specific version
response = client.chat.completions.create(
    model="gpt-4o-2024-11-20",  # Specific version, not "gpt-4o"
    messages=messages
)

# WRONG: floating version
response = client.chat.completions.create(
    model="gpt-4o",  # Could change behavior without warning
    messages=messages
)
```

```javascript
// CORRECT: pin to specific version
const response = await client.chat.completions.create({
  model: 'gpt-4o-2024-11-20',  // Specific version
  messages,
});

// WRONG: floating version
// model: 'gpt-4o',  // Could change behavior without warning
```


### Pattern 2: Model version tracking in responses

```python
def call_llm(messages: list, metadata: dict) -> dict:
    response = client.chat.completions.create(
        model=PINNED_MODEL_VERSION,
        messages=messages
    )
    return {
        "content": response.choices[0].message.content,
        "model_version": PINNED_MODEL_VERSION,
        "provider": "openai",
        "response_id": response.id,
        "timestamp": datetime.utcnow().isoformat(),
        "trace_id": metadata["trace_id"]
    }
```

```javascript
async function callLlm(messages, metadata) {
  const response = await client.chat.completions.create({
    model: PINNED_MODEL_VERSION,
    messages,
  });
  return {
    content: response.choices[0].message.content,
    modelVersion: PINNED_MODEL_VERSION,
    provider: 'openai',
    responseId: response.id,
    timestamp: new Date().toISOString(),
    traceId: metadata.traceId,
  };
}
```


### Pattern 3: Regression testing before model upgrades

```python
class ModelUpgradeValidator:
    def __init__(self, test_suite_path: str, threshold: float = 0.95):
        self.test_cases = load_test_suite(test_suite_path)
        self.threshold = threshold

    def validate_new_version(self, new_model: str, current_model: str) -> dict:
        current_results = self.run_suite(current_model)
        new_results = self.run_suite(new_model)

        agreement_rate = self.compare_results(current_results, new_results)
        regression_cases = self.find_regressions(current_results, new_results)

        return {
            "approved": agreement_rate >= self.threshold and len(regression_cases) == 0,
            "agreement_rate": agreement_rate,
            "regressions": regression_cases,
            "recommendation": "approve" if agreement_rate >= self.threshold else "review_required"
        }
```

```javascript
class ModelUpgradeValidator {
  constructor(testSuitePath, threshold = 0.95) {
    this.testCases = loadTestSuite(testSuitePath);
    this.threshold = threshold;
  }

  async validateNewVersion(newModel, currentModel) {
    const currentResults = await this.runSuite(currentModel);
    const newResults = await this.runSuite(newModel);
    const agreementRate = this.compareResults(currentResults, newResults);
    const regressions = this.findRegressions(currentResults, newResults);
    return {
      approved: agreementRate >= this.threshold && regressions.length === 0,
      agreementRate,
      regressions,
      recommendation: agreementRate >= this.threshold ? 'approve' : 'review_required',
    };
  }
}
```


### Pattern 4: Fallback provider configuration

```python
PROVIDER_CONFIG = {
    "primary": {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "timeout": 30},
    "fallback": {"provider": "openai", "model": "gpt-4o-2024-11-20", "timeout": 30},
    "emergency": {"provider": "local", "model": "rules-based-fallback", "timeout": 5}
}

async def call_with_fallback(messages: list) -> dict:
    for tier in ["primary", "fallback", "emergency"]:
        try:
            config = PROVIDER_CONFIG[tier]
            result = await call_provider(config, messages, timeout=config["timeout"])
            result["provider_tier"] = tier
            if tier != "primary":
                log_event("fallback_activated", tier=tier)
            return result
        except (TimeoutError, ProviderError) as e:
            log_event("provider_failure", tier=tier, error=str(e))
            continue
    raise ServiceUnavailable("All providers failed")
```

```javascript
const PROVIDER_CONFIG = {
  primary: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', timeout: 30000 },
  fallback: { provider: 'openai', model: 'gpt-4o-2024-11-20', timeout: 30000 },
  emergency: { provider: 'local', model: 'rules-based-fallback', timeout: 5000 },
};

async function callWithFallback(messages) {
  for (const tier of ['primary', 'fallback', 'emergency']) {
    try {
      const config = PROVIDER_CONFIG[tier];
      const result = await callProvider(config, messages, config.timeout);
      result.providerTier = tier;
      if (tier !== 'primary') logEvent('fallback_activated', { tier });
      return result;
    } catch (e) {
      logEvent('provider_failure', { tier, error: e.message });
    }
  }
  throw new Error('All providers failed');
}
```


## Anti-patterns

- **Using "latest" or unversioned model identifiers.** Always pin versions.
- **No fallback for provider outages.** Define degradation behavior.
- **Trusting provider claims without testing.** Run your own evaluation suite.
- **No SBOM for AI components.** Track all AI dependencies just like software dependencies.

## Related files

- **fallback-patterns.md:** When the primary model provider fails, fallback-patterns.md Pattern 2 (circuit breaker) and Pattern 1 (default safe response) define what happens. Supply chain Pattern 4 (fallback provider) should use the circuit breaker to manage the switch.
- **monitoring.md:** Provider health should be tracked. Use monitoring.md Pattern 1 (key metrics dashboard) to monitor provider latency, error rates, and cost. Set alerts for provider degradation.
- **audit-logging.md:** Every model call should log the provider and model version. Use audit-logging.md Pattern 1 (structured log entry) with the model_version and provider fields.

## Edge cases

- **Provider API changes.** API parameters or response formats can change. Pin client library versions too.
- **Data residency.** Third-party providers may process data in different jurisdictions. Verify data routing.
- **Model deprecation.** Providers retire models. Monitor deprecation notices and have migration plans.
