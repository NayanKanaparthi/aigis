---
id: fallback-patterns
title: Fallback patterns, circuit breaker, kill switch
controls:
  owasp: []
  nist: [MEASURE-2.6, MANAGE-2.3, MANAGE-2.4]
  iso42001: [Clause-8.2]
min_risk_tier: all
system_traits: [uses-llm, is-agentic, is-high-volume]
---

When an LLM call fails or behaves badly, the system must fail safely, recover automatically from transient failures, and allow operators to disable the AI feature during an incident without redeploying code.

## Common incomplete implementations

These are the specific failure modes this procedure is designed to prevent. If your implementation matches one of these, keep going — do not stop after hitting the basic pattern.

1. **Kill switch read at module load.** An env var like `AI_SYSTEM_ENABLED` assigned to a module-level constant (`KILL_SWITCH = os.getenv(...)`) or fetched via a `@lru_cache`-decorated `get_settings()` is read once at import and never again. Flipping the flag in production requires a restart — which is exactly the thing you wanted to avoid during an incident.
2. **Circuit breaker that never closes.** Two-state (open/closed) breakers trip and stay tripped, because there is no HALF_OPEN probe state. Traffic is stuck on fallback until someone manually resets.
3. **Circuit breaker that wraps only one LLM callsite.** If your code calls the LLM from multiple places, every callsite must route through the same breaker or the breaker gives a false sense of safety.
4. **Fallback returns an error instead of a defined safe response.** Raising an exception on LLM failure propagates a 500 to the user. The fallback should return a deterministic safe payload (e.g., `recommendation=standard, confidence=0`).

## Implementation procedure

Work through these steps in order. Do not skip the verification checkpoints — they catch the specific gaps that appear across independent implementations of this pattern.

### Step 1 — Define a default safe response

**What to do.** Write a `default_safe_response()` function that returns a neutral payload: conservative routing (e.g., `"standard"`), `confidence=0.0`, a disclaimer string. Same shape as a successful LLM response.

**Why this matters.** Without a defined fallback, an LLM failure becomes an application error. The safe response is what lets every later step actually return something.

**Verification checkpoint.** The safe response is callable with no arguments and returns the same keys a successful call would. See the complete example at the end for the shape.

### Step 2 — Implement a circuit breaker with three states

**What to do.** Write a `CircuitBreaker` class with explicit states: `"closed"`, `"open"`, `"half-open"`. Configurable `failure_threshold` and `reset_timeout`. On threshold → OPEN. After reset timeout → HALF_OPEN probe. On probe success → CLOSED. On probe failure → back to OPEN.

**Why this matters.** Two-state breakers (open/closed only) need manual intervention to recover. Three-state breakers recover themselves.

**Verification checkpoint.** Grep your code for the three state strings. If you only find `"closed"` and `"open"`, you built a two-state breaker — iterate until `"half-open"` is implemented.

### Step 3 — Route every LLM callsite through the breaker

**What to do.** Find every place in your codebase where you invoke the LLM client (e.g., `client.messages.create`, `openai.chat.completions.create`). Each must go through the breaker via a single helper (`call_llm_safely(func)`).

**Why this matters.** A breaker that only protects one callsite leaves the others exposed. When the provider has an outage, unprotected paths will still hammer it.

**Verification checkpoint.** `grep -rn "messages.create\|chat.completions.create"` in your source. For every hit, confirm it is wrapped by the breaker helper. Bare calls bypass the breaker — fix before continuing.

### Step 4 — Kill switch read per-request ⚠ CRITICAL

**What to do.** Implement a toggle that disables the AI feature without redeploying. The check must happen **inside the request handler**, reading the env var (or config-service value) at request time — not at module load.

**Why this matters.** Every baseline run of this pattern built a toggle that satisfied the literal checklist wording ("there is an env variable") but was read only at process startup. During an actual incident you cannot flip the flag without a rolling restart — which defeats the purpose.

```python
# CORRECT — read inside the handler, every request
def ai_system_enabled() -> bool:
    return os.getenv("AI_SYSTEM_ENABLED", "true").lower() == "true"

# WRONG — all three of these are restart-latched
KILL_SWITCH = os.getenv("KILL_SWITCH", "0") == "1"   # module-level constant
@lru_cache
def get_settings(): return Settings()                 # cached forever
settings = Settings()                                 # module-level instance
```

**Verification checkpoint.** Run these greps. If any match controls your kill switch, it's restart-latched — fix before continuing:

- `grep -rn "@lru_cache" --include="*.py"` on any settings-returning function
- `grep -rn "^KILL_SWITCH\|^AI_SYSTEM_ENABLED\|^AI_ENABLED" --include="*.py"` at module scope
- `grep -rn "settings = Settings()" --include="*.py"` imported by a handler

This is the critical gap.

### Step 5 — Confirm the toggle works without restart

**What to do.** Start the service. Send a request and see the AI feature respond. Flip the env var (`AI_SYSTEM_ENABLED=false`) in the running process's environment — or if you cannot mutate env vars post-start, point the service at a config file or feature-flag service whose value you can change. Send another request and confirm it returns the fallback.

**Why this matters.** This is the only test that proves Step 4 actually worked. An agent or reviewer grepping for `ai_system_enabled` will see the check exists; only a runtime flip tells you whether the check is live.

**Verification checkpoint.** Document the result of this test in a comment or test file. If you could not make the toggle take effect without a restart, Step 4 is not done yet — iterate.

### Step 6 — Wrap every LLM call in exception handling

**What to do.** Every LLM call path should be surrounded by a `try/except`. On any exception the fallback returns the safe response and the incident is logged with context. Unhandled exceptions must never propagate to the HTTP response.

**Why this matters.** Defense in depth: the breaker catches repeated failures, but a single unexpected failure should also not crash the request.

**Verification checkpoint.** Every LLM callsite from Step 3 is inside a `try/except`. No bare `raise` inside the handler body that would escape to the client without a fallback.

## Complete working example

```python
"""Fallback patterns: circuit breaker, kill switch, safe default, exception guard."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable, TypeVar

from fastapi import FastAPI
from pydantic import BaseModel

logger = logging.getLogger("fallback")
app = FastAPI()
T = TypeVar("T")


# ─── Step 1 — default safe response ────────────────────────────────────
def default_safe_response() -> dict[str, Any]:
    return {
        "severity_score": 5,
        "recommendation": "standard",
        "confidence_score": 0.0,
        "disclaimer": "Automated assessment unavailable; human review required.",
        "fallback": True,
    }


# ─── Step 2 — three-state circuit breaker ──────────────────────────────
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, reset_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.state = "closed"
        self.failure_count = 0
        self.last_failure_time: float | None = None

    def call(self, func: Callable[[], T]) -> T:
        now = time.time()
        if self.state == "open":
            if self.last_failure_time and now - self.last_failure_time > self.reset_timeout:
                self.state = "half-open"
            else:
                logger.warning("circuit_breaker_open")
                return default_safe_response()  # type: ignore[return-value]

        try:
            result = func()
            if self.state == "half-open":
                self.state = "closed"
            self.failure_count = 0
            return result
        except Exception:
            self.failure_count += 1
            self.last_failure_time = now
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.error("circuit_breaker_tripped failures=%s", self.failure_count)
            return default_safe_response()  # type: ignore[return-value]


_llm_breaker = CircuitBreaker(failure_threshold=5, reset_timeout=60)


# ─── Step 3 — single wrapper every LLM callsite uses ───────────────────
def call_llm_safely(func: Callable[[], T]) -> T:
    return _llm_breaker.call(func)


# ─── Step 4 — kill switch read per-request ⚠ CRITICAL ──────────────────
def ai_system_enabled() -> bool:
    """Read the toggle fresh each call. No @lru_cache. No module-level cache."""
    return os.getenv("AI_SYSTEM_ENABLED", "true").lower() == "true"


# ─── Step 6 — exception guard on the handler ───────────────────────────
class AssessRequest(BaseModel):
    claim_description: str


@app.post("/api/assess-claim")
async def assess_claim(body: AssessRequest) -> dict[str, Any]:
    if not ai_system_enabled():                      # Step 4: per-request check
        return default_safe_response()

    try:
        result = call_llm_safely(                    # Step 3: breaker wrapper
            lambda: _invoke_llm(body.claim_description)
        )
        return result
    except Exception as exc:                         # Step 6: exception guard
        logger.exception("llm_call_failed", extra={"error": str(exc)})
        return default_safe_response()


def _invoke_llm(text: str) -> dict[str, Any]:
    # Replace with your actual client call. Must raise on any failure
    # so the breaker can count it.
    ...
```

## Related patterns

- `human-oversight.md` — low-confidence decisions routed to review.
- `monitoring.md` — breaker trips and fallback rates as operational metrics.
