---
id: rate-limiting
title: Rate limiting, token budgets, and resource control
controls:
  owasp: [LLM10]
  nist: [MEASURE-2.6, MANAGE-2.4]
  iso42001: [Clause-8.2]
min_risk_tier: all
system_traits: [is-external, is-high-volume, uses-llm]
---

LLM endpoints are expensive and easy to abuse. Rate limiting caps per-user request volume, token budgets cap per-user dollar cost, and timeouts cap the damage a hung LLM call can do.

<!--
Procedure-design note (for maintainers, not for agents):
Step 1 requires a durable backing store unconditionally. Earlier drafts
allowed in-memory for single-process dev — an agent following that
variant produced code that cleared the Retry-After overclaim recognizer
but stayed at rubric Score 5 because the rubric requires durable + cross-
replica state without carve-outs. The rubric is locked for baseline
comparison; we tighten the procedure to match it rather than accept a
ceiling at Score 5. If you loosen this step in the future, re-benchmark
against the rubric before shipping.
-->

## Common incomplete implementations

1. **In-memory store.** A per-user bucket held in a Python dict (`defaultdict(deque)`) or JS `Map`. Loses state on restart. Gives every user a fresh quota every deploy. Does not share state across replicas — the same user hits two pods and doubles their quota. Not acceptable, including for dev builds — use Redis locally via docker-compose.
2. **No `Retry-After` header.** HTTP 429 responses without `Retry-After` leave clients guessing. Well-behaved clients (including every major LLM SDK retry wrapper) read `Retry-After` to decide when to try again. Without it, clients either thundering-herd retry immediately or give up entirely.
3. **Request-count only, no token budget.** An abuser can stay under the request-count limit but still burn through your LLM budget by sending large inputs with large outputs. Token budget is separate from request count and must be enforced separately.
4. **No LLM call timeout.** A hung call to the provider can hold a request for minutes, blocking a worker and consuming tokens on the eventual response. Every LLM call must have an explicit, tight timeout.
5. **Rate limit keyed on IP only.** NAT'd enterprise users share an IP. Rate-limiting by IP either throttles everyone behind the NAT or you have to set the limit so high that actual abuse gets through. Key on authenticated user or API key first, IP only as a last-resort fallback.

## Implementation procedure

### Step 1 — Use a durable backing store (Redis or DB) ⚠ CRITICAL

**What to do.** The rate-limit counter must live in a store that (a) survives process restart, and (b) is shared across replicas. Use Redis (`INCR` + `EXPIRE`, and `TTL` to compute Retry-After) or a DB table with an expiry column. **Do not** use an in-memory `dict`, `defaultdict`, or `deque`, even for a dev build.

**Why this matters.** In-memory rate limiting fails in two ways that matter in production: the counter resets on every deploy (attacker gets a fresh quota on every redeploy), and two replicas of the same service can't share state (the attacker doubles their quota by hitting a second pod). Every baseline run silently chose in-memory; the production deployment inherits the limitation. Making the durable choice at build time is cheaper than debugging a rate-limit bypass later.

**Verification checkpoint.** `grep -rn "defaultdict\|deque" <rate-limit-module>` — if either match is storing the counter, that's the in-memory anti-pattern. Replace with a Redis client call (the dependency is small, Docker-compose-able for local dev). The benchmark's single-process nature is not a justification for skipping this — the rubric measures production readiness, not development convenience.

### Step 2 — Key on authenticated user first

**What to do.** Extract the rate-limit key from the authenticated user ID (`X-User-Id`) or API key (`X-API-Key`) if available. Fall back to IP only if neither is present, and log a warning when you do.

**Why this matters.** Shared-IP environments (corporate NAT, mobile carriers) make IP-based rate limiting either too loose or too strict for real users.

**Verification checkpoint.** Find the handler using the rate limiter. Confirm the key comes from a header before falling back to IP. See the complete example at the end.

### Step 3 — Return 429 with Retry-After on block ⚠ CRITICAL

**What to do.** When the limiter blocks a request, raise a 429 with a `Retry-After` response header whose value is the **actual** number of seconds until the bucket refills. Read it from the store — Redis `TTL` or the DB expiry column. Do not hard-code `Retry-After: 60`.

**Why this matters.** Every baseline run returned 429 without `Retry-After`. LLM SDKs and well-behaved HTTP clients use that header to drive retry backoff. Without it, clients either retry immediately (worsening the problem) or give up entirely.

```python
raise HTTPException(
    status_code=429,
    detail="Rate limit exceeded",
    headers={"Retry-After": str(retry_after)},
)
```

**Verification checkpoint.** `grep -rn "status_code=429\|HTTPException(429" --include="*.py"` — every hit must set a `Retry-After` header or route through a helper that does. A 429 without this header is incomplete.

### Step 4 — Separate token budget from request count

**What to do.** Track approximate tokens consumed per user per day. Enforce a daily ceiling on tokens independently of the per-window request count. Consume the estimate **before** the LLM call; reconcile with provider-reported actual usage afterward (Anthropic and OpenAI both return token counts).

**Why this matters.** Request-count limits cap call frequency but not cost. An abuser sending one huge request per minute stays under a 60-rpm limit while burning your monthly budget.

**Verification checkpoint.** `grep -rn "token_budget\|TokenBudget\|daily_token" --include="*.py"` — if no hits, Step 4 is not done. Request-count-only is incomplete.

### Step 5 — Timeout every LLM call

**What to do.** Configure a timeout on the LLM client. Do not rely on the SDK default (which is often minutes or unbounded).

**Why this matters.** A hung provider call holds a worker and continues to count against rate-limit and token budgets. Tight timeouts keep failures fast and cheap.

```python
from anthropic import Anthropic

client = Anthropic(api_key=..., timeout=30.0)   # 30-second ceiling
```

**Verification checkpoint.** `grep -rn "Anthropic\s*(\|OpenAI\s*(" --include="*.py"` — every client instantiation includes an explicit `timeout=`.

### Step 6 — Verify the 429 response end-to-end

**What to do.** Write a test (or execute manually) that exceeds the rate limit and confirms:

- Response status is 429
- Response includes a `Retry-After` header
- The value of `Retry-After` is a positive integer (seconds), not 0 and not absurdly large

**Why this matters.** This is the only test that proves the pieces fit together. An in-code grep can miss that the header is set to `"0"` (a no-op value from a buggy TTL read).

```python
def test_rate_limit_returns_retry_after():
    # hammer the endpoint past max_requests
    for _ in range(max_requests + 1):
        r = client.post("/api/assess-claim", ...)
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    assert int(r.headers["Retry-After"]) > 0
```

**Verification checkpoint.** The test passes.

## Complete working example

```python
"""Rate limiting with durable store, per-user key, Retry-After, token budget."""

from __future__ import annotations

import logging
import time
from typing import Annotated

import redis
from anthropic import Anthropic
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("rate_limit")
app = FastAPI()

_redis = redis.Redis(host="localhost", port=6379, decode_responses=True)


# ─── Step 1 — durable store via Redis ──────────────────────────────────
class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def check_and_increment(self, key: str) -> tuple[bool, int]:
        bucket = f"ratelimit:{key}"
        pipe = _redis.pipeline()
        pipe.incr(bucket, 1)
        pipe.expire(bucket, self.window_seconds, nx=True)
        count, _ = pipe.execute()
        if int(count) > self.max_requests:
            ttl = _redis.ttl(bucket) or 1
            return False, max(int(ttl), 1)
        return True, 0


api_limiter = RateLimiter(max_requests=60, window_seconds=60)


# ─── Step 4 — token budget (daily) ─────────────────────────────────────
class TokenBudget:
    def __init__(self, max_tokens_per_day: int):
        self.max = max_tokens_per_day

    def consume(self, key: str, tokens: int) -> tuple[bool, int]:
        day = time.strftime("%Y-%m-%d")
        bucket = f"tokens:{key}:{day}"
        pipe = _redis.pipeline()
        pipe.incrby(bucket, tokens)
        pipe.expire(bucket, 60 * 60 * 26, nx=True)
        used, _ = pipe.execute()
        if int(used) > self.max:
            return False, 0
        return True, self.max - int(used)


token_budget = TokenBudget(max_tokens_per_day=200_000)


# ─── Step 2 — rate-limit key from auth, IP as last resort ──────────────
def get_rate_limit_key(
    request: Request,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> str:
    if x_api_key:
        return f"api_key:{x_api_key}"
    if x_user_id:
        return f"user:{x_user_id}"
    ip = request.client.host if request.client else "unknown"
    logger.warning("rate_limit_fallback_to_ip", extra={"ip": ip})
    return f"ip:{ip}"


# ─── Step 5 — LLM client with explicit timeout ─────────────────────────
llm = Anthropic(timeout=30.0)


class ClaimBody(BaseModel):
    claim_description: str


@app.post("/api/assess-claim")
async def assess_claim(
    body: ClaimBody,
    key: Annotated[str, Depends(get_rate_limit_key)],
) -> dict:
    # Step 3 — 429 with Retry-After
    allowed, retry_after = api_limiter.check_and_increment(key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    # Step 4 — estimate tokens and check budget before the call
    est_tokens = max(1, len(body.claim_description) // 4) + 500
    allowed, remaining = token_budget.consume(key, est_tokens)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Daily token budget exhausted",
            headers={"Retry-After": "86400"},
        )

    # Step 5 — timeout is on the client instance; call proceeds
    result = llm.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        messages=[{"role": "user", "content": body.claim_description}],
    )

    # Reconcile actual tokens with budget (Anthropic returns usage info)
    actual = getattr(result, "usage", None)
    if actual:
        total = (actual.input_tokens or 0) + (actual.output_tokens or 0)
        token_budget.consume(key, max(0, total - est_tokens))

    return {"text": result.content[0].text if result.content else ""}
```

## Related patterns

- `fallback-patterns.md` — what to return when the LLM call fails or the breaker is open.
- `monitoring.md` — tracking rate-limit hit rates and token-budget usage as operational metrics.
