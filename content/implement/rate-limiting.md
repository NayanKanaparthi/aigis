---
id: rate-limiting
title: Rate limiting and resource control
controls:
  owasp: [LLM10]
  nist: [MEASURE-2.6, MANAGE-2.4]
  iso42001: [Clause-8.2]
min_risk_tier: all
system_traits: [is-external, is-high-volume, is-agentic]
---

## What this addresses

OWASP LLM10 covers unbounded consumption — excessive resource usage leading to denial of service, financial exploitation ("denial of wallet"), or model theft through extraction attacks.

## Implementation patterns

### Pattern 1: Per-user rate limiting

```python
from functools import wraps
import time

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = {}  # user_id -> [timestamps]

    def check(self, user_id: str) -> bool:
        now = time.time()
        user_requests = self.requests.get(user_id, [])
        # Remove expired entries
        user_requests = [t for t in user_requests if now - t < self.window_seconds]
        if len(user_requests) >= self.max_requests:
            return False
        user_requests.append(now)
        self.requests[user_id] = user_requests
        return True

# Configure per endpoint
api_limiter = RateLimiter(max_requests=60, window_seconds=60)
llm_limiter = RateLimiter(max_requests=20, window_seconds=60)
```

```javascript
class RateLimiter {
  constructor(maxRequests, windowSeconds) {
    this.maxRequests = maxRequests;
    this.windowSeconds = windowSeconds;
    this.requests = new Map();
  }

  check(userId) {
    const now = Date.now() / 1000;
    const userRequests = (this.requests.get(userId) || [])
      .filter(t => now - t < this.windowSeconds);
    if (userRequests.length >= this.maxRequests) return false;
    userRequests.push(now);
    this.requests.set(userId, userRequests);
    return true;
  }
}

const apiLimiter = new RateLimiter(60, 60);
const llmLimiter = new RateLimiter(20, 60);
```


### Pattern 2: Token budget enforcement

```python
class TokenBudget:
    def __init__(self, daily_limit: int, per_request_limit: int):
        self.daily_limit = daily_limit
        self.per_request_limit = per_request_limit

    def check_and_deduct(self, user_id: str, estimated_tokens: int) -> bool:
        if estimated_tokens > self.per_request_limit:
            return False
        daily_usage = self.get_daily_usage(user_id)
        if daily_usage + estimated_tokens > self.daily_limit:
            log_event("daily_token_limit_reached", user=user_id)
            return False
        self.record_usage(user_id, estimated_tokens)
        return True

budget = TokenBudget(daily_limit=100_000, per_request_limit=4_000)
```

```javascript
class TokenBudget {
  constructor(dailyLimit, perRequestLimit) {
    this.dailyLimit = dailyLimit;
    this.perRequestLimit = perRequestLimit;
  }

  async checkAndDeduct(userId, estimatedTokens) {
    if (estimatedTokens > this.perRequestLimit) return false;
    const dailyUsage = await this.getDailyUsage(userId);
    if (dailyUsage + estimatedTokens > this.dailyLimit) {
      logEvent('daily_token_limit_reached', { user: userId });
      return false;
    }
    await this.recordUsage(userId, estimatedTokens);
    return true;
  }
}
```


### Pattern 3: Cost monitoring and alerting

```python
class CostMonitor:
    def __init__(self, hourly_budget: float, daily_budget: float):
        self.hourly_budget = hourly_budget
        self.daily_budget = daily_budget

    def record_and_check(self, cost: float) -> dict:
        self.record(cost)
        hourly_total = self.get_hourly_total()
        daily_total = self.get_daily_total()

        alerts = []
        if hourly_total > self.hourly_budget * 0.8:
            alerts.append({"level": "warning", "message": f"80% of hourly budget used: {hourly_total:.2f}"})
        if hourly_total > self.hourly_budget:
            alerts.append({"level": "critical", "message": "Hourly budget exceeded — throttling"})
            self.enable_throttle()
        if daily_total > self.daily_budget:
            alerts.append({"level": "emergency", "message": "Daily budget exceeded — circuit breaker"})
            self.trip_circuit_breaker()

        return {"cost": cost, "hourly_total": hourly_total, "daily_total": daily_total, "alerts": alerts}
```

```javascript
class CostMonitor {
  constructor(hourlyBudget, dailyBudget) {
    this.hourlyBudget = hourlyBudget;
    this.dailyBudget = dailyBudget;
  }

  async recordAndCheck(cost) {
    await this.record(cost);
    const hourlyTotal = await this.getHourlyTotal();
    const dailyTotal = await this.getDailyTotal();
    const alerts = [];
    if (hourlyTotal > this.hourlyBudget * 0.8)
      alerts.push({ level: 'warning', message: '80% of hourly budget used' });
    if (hourlyTotal > this.hourlyBudget) {
      alerts.push({ level: 'critical', message: 'Hourly budget exceeded' });
      await this.enableThrottle();
    }
    if (dailyTotal > this.dailyBudget) {
      alerts.push({ level: 'emergency', message: 'Daily budget exceeded' });
      await this.tripCircuitBreaker();
    }
    return { cost, hourlyTotal, dailyTotal, alerts };
  }
}
```


### Pattern 4: Request timeout

```python
import asyncio

async def call_llm_with_timeout(messages: list, timeout: int = 30) -> dict:
    try:
        result = await asyncio.wait_for(
            client.chat.completions.create(model=MODEL, messages=messages),
            timeout=timeout
        )
        return {"success": True, "result": result}
    except asyncio.TimeoutError:
        log_event("llm_timeout", timeout=timeout)
        return {"success": False, "error": "timeout", "fallback": default_safe_response()}
```

```javascript
async function callLlmWithTimeout(messages, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const result = await client.chat.completions.create(
      { model: MODEL, messages },
      { signal: controller.signal }
    );
    clearTimeout(timer);
    return { success: true, result };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logEvent('llm_timeout', { timeout });
      return { success: false, error: 'timeout', fallback: defaultSafeResponse() };
    }
    throw e;
  }
}
```


## Anti-patterns

- **No rate limits on LLM endpoints.** Every endpoint must have limits.
- **Same limits for all users.** Tier your limits by user role and subscription.
- **No cost monitoring.** LLM costs can spike unexpectedly. Monitor and alert.
- **Unlimited context windows.** Cap the conversation history sent to the LLM.

## Edge cases

- **Distributed attacks.** Rate limit by API key, not just IP address.
- **Legitimate burst traffic.** Allow temporary bursts with backpressure, don't hard-block.
- **Cost estimation accuracy.** Token counts for prompts and completions differ. Estimate both.
