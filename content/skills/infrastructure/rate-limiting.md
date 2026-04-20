---
id: infra-rate-limiting
title: Rate limiting infrastructure (Redis-backed setup + integration patterns)
companion_to_area: rate-limiting
controls:
  owasp: [LLM10]
  nist: [MEASURE-2.6, MANAGE-2.4]
  iso42001: [Clause-8.2]
---

The `rate-limiting` area procedure (`aigis get rate-limiting`) requires a durable backing store unconditionally. This file shows the two infrastructure shapes that satisfy that requirement: a from-scratch Redis setup for new projects, and integration patterns for projects that already have a key-value store. Pick one. Then return to the procedure.

This is content, not a scaffold. Aigis does not write files for you. Copy the snippets you need; adapt them to your project.

## Starting from scratch (you have no Redis yet)

If you are building a new project and don't have a Redis instance, the simplest production-ready setup is Redis 7+ running in Docker for development, with a managed Redis (Upstash, Redis Cloud, ElastiCache) for production.

### Required dependency

```
redis>=5.0    # Python client; pin per your supply-chain procedure
```

### Local development (docker-compose)

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    container_name: aigis-rate-limit
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped
```

Run: `docker compose up -d redis`. Verify: `redis-cli ping` returns `PONG`.

### Environment variable convention

```
# .env.example
REDIS_URL=redis://localhost:6379/0
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
TOKEN_BUDGET_PER_DAY=200000
```

Do not hard-code the connection string; read from `REDIS_URL` so your local, staging, and production environments swap cleanly.

### Connection code

```python
import os
import redis

_client: redis.Redis | None = None

def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
    return _client
```

### Verifying the connection

Before wiring this into the rate-limiter, confirm the application can talk to Redis:

```python
from your_module import get_redis
get_redis().ping()    # returns True or raises ConnectionError
```

If this raises, fix it before continuing the rate-limiting procedure. The procedure assumes the connection works.

## Integrate with existing infrastructure

If you already have a key-value store, adapt rather than add a second one. Common cases below; pick the closest match.

### You already have Redis (self-hosted or managed)

Set `REDIS_URL` to your existing connection string. That's it. The connection code above reads the env var; nothing else changes.

```
REDIS_URL=redis://user:password@redis.internal.company.com:6379/0
```

### Upstash (serverless Redis)

Upstash provides a Redis-compatible HTTP and TCP interface. Use the TCP URL with the standard `redis` client:

```
REDIS_URL=rediss://default:<token>@<region>.upstash.io:6379
```

Note the `rediss://` scheme (TLS) and that Upstash serverless is rate-limited per request — appropriate for low-volume rate limiting, less appropriate for high-frequency token-budget tracking. If your rate-limit traffic exceeds Upstash's free tier, switch to managed Redis.

### AWS ElastiCache

ElastiCache is Redis-protocol-compatible. Connect from inside the same VPC:

```
REDIS_URL=redis://my-elasticache.abc123.0001.use1.cache.amazonaws.com:6379
```

Use IAM auth if your cluster is configured for it; otherwise rely on VPC security groups. Do not expose ElastiCache to the public internet.

### Memcached, DynamoDB, or another KV store

The rate-limiting procedure's reference implementation uses Redis primitives (`INCR`, `EXPIRE`, `TTL`). If you cannot use Redis, the conceptual operations are:

- **Counter increment with TTL** — atomic increment of a per-key counter that expires after the window. Memcached's `incr` + `set` combo. DynamoDB's `UpdateItem` with a TTL attribute.
- **Read remaining TTL for Retry-After** — Redis returns this directly with `TTL`. Memcached doesn't expose it; you must compute it from the time you set the key. DynamoDB exposes it via the TTL attribute.

If you adopt one of these alternatives, document the choice in a comment at the top of your rate-limit module (the procedure's Step 1 verification checkpoint expects this). The rest of the area procedure (Retry-After header, token budget separation, LLM client timeout) is store-agnostic and applies as written.

## Production considerations

Things to think about before deploying. None of these are blockers for the procedure to verify PASS, but all of them affect whether the rate limiter actually works in production.

### Key namespace conventions

Prefix every rate-limit key with a namespace so multiple services can share one Redis without colliding:

```
ratelimit:<service>:<key>          # request count
tokens:<service>:<key>:<YYYY-MM-DD> # token budget per day
```

The procedure's reference implementation uses `ratelimit:<key>` and `tokens:<key>:<day>`. Add the `<service>` segment if your Redis is shared.

### TTL strategy

The window-based limiter sets the key's TTL on first increment. If the key is hit only once in the window and not renewed, it expires when the window ends — correct behavior. If the key is hit continuously, do not refresh the TTL (the limiter would never reset). The procedure's Redis snippet uses `EXPIRE bucket <window> NX` (set only if no TTL exists) for this reason.

### Failure modes

What happens when Redis is unreachable? Three reasonable choices:

1. **Fail open** — log the error, allow the request through. Highest availability, lowest safety. Appropriate for non-critical paths.
2. **Fail closed** — return 503. Highest safety, blocks all traffic on a Redis outage. Appropriate for high-risk endpoints.
3. **Fall back to in-memory** — track in a process-local counter for the duration of the outage. Acceptable trade for medium-risk endpoints if the outage is rare and you alert on it.

Pick one and document it. The procedure's reference handler catches `redis.exceptions.ConnectionError` and returns 503 (fail closed); change it if your risk tolerance is different.

### Multi-region

For most projects, **per-region rate limits** are the right starting point — each region runs its own Redis; users routed to a region get per-region quota. Acceptable when traffic is sticky to a region.

If per-region quotas don't fit (you genuinely need a global cap on a per-user basis), the escape hatch is an **external rate-limit service** (Cloudflare, Kong, AWS API Gateway). Removes the per-app rate-limit logic entirely; trades implementation complexity for vendor lock-in.

## After this file

Return to the area procedure: `aigis get rate-limiting`. The procedure's Step 1 (durable backing store) is satisfied once the connection works. Continue from Step 2 onward.

## Related infrastructure

- `aigis infra logging` — where rate-limit blocks should be logged.
- `aigis infra secrets` — where to store the Redis connection string and credentials.
