---
id: infra-logging
title: Structured logging infrastructure (JSON logs + redaction patterns)
companion_to_area: audit-logging
controls:
  owasp: [LLM02, LLM08]
  nist: [MEASURE-2.7, MANAGE-4.1]
  iso42001: [Clause-9.1]
---

The `audit-logging` area procedure (`aigis get audit-logging`) requires structured, queryable logs with PII and secret redaction. This file shows the two infrastructure shapes that satisfy that requirement: a from-scratch JSON-logging setup for new projects, and integration patterns for projects that already ship logs to a platform. Pick one. Then return to the procedure.

This is content, not a scaffold. Aigis does not write files for you. Copy the snippets you need; adapt them to your project.

## Starting from scratch (you have no structured logger yet)

If you are building a new project and currently use `print()` or default Python logging with text formatting, the simplest acceptable upgrade is `structlog` emitting JSON to stdout, captured by your platform's log driver.

### Required dependency

```
structlog>=24.0    # pin per your supply-chain procedure
```

### Configuration

```python
import logging
import structlog

REDACT_KEYS = {
    # Credentials
    "password", "passwd", "secret", "token", "api_key", "apikey",
    "authorization", "cookie", "set-cookie",
    # Personally identifiable
    "email", "phone", "phone_number", "address", "street_address",
    "ssn", "tax_id", "credit_card", "card_number",
    "dob", "date_of_birth", "ip_address",
    "first_name", "last_name", "full_name",
    "zip", "postal_code",
}
# This set errs on the side of over-redaction. A log line with
# email="support@company.com" will be redacted even though it's a
# service address, not user PII. The tradeoff is acceptable: missed
# PII is worse than redacted non-PII.

def redact(_, __, event_dict):
    for key in list(event_dict):
        if key.lower() in REDACT_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict

logging.basicConfig(format="%(message)s", level=logging.INFO)

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        redact,
        structlog.processors.JSONRenderer(),
    ],
)

log = structlog.get_logger()
```

### Usage

```python
log.info("llm_call_started", model="claude-opus-4", user_id=user.id, prompt_tokens=1234)
log.warning("rate_limit_exceeded", user_id=user.id, key="user:42", retry_after=37)
log.error("auth_failed", user_id=user.id, reason="invalid_token")
```

Always pass structured fields, never f-string the values into the message. The message is the event name (`llm_call_started`); the data is fields. This is what makes the logs queryable.

```python
# Wrong — f-string embeds PII into the unredacted 'event' field:
log.info(f"user {user.email} logged in")

# Right — structured fields pass through the redactor:
log.info("user_login", email=user.email)
```

### Verifying the setup

```python
# Works — top-level key is redacted:
log.info("test_event", api_key="sk-should-be-redacted", user_id=42)
# Expect stdout: {"event": "test_event", "api_key": "[REDACTED]", ...}

# Known limitation — nested dict values are NOT redacted:
log.info("test_request", headers={"authorization": "Bearer xyz"})
# Expect stdout: headers.authorization visible (not redacted)
# Mitigation: do not log full headers/request/response dicts.
# Log only the fields you need, at the top level.
```

If `api_key` appears unredacted, fix the redactor before continuing the audit-logging procedure.

## Integrate with existing infrastructure

If you already ship logs somewhere, route through the existing pipeline rather than adding a second one.

### Datadog / New Relic / Honeycomb (agent-based)

These platforms scrape stdout from your container or host. The `structlog` JSON output above is consumed as-is — you do not need a vendor SDK. Set the platform's source/service tags via the agent config, not in application code.

### CloudWatch Logs

ECS/EKS/Lambda send stdout to CloudWatch automatically. Use JSON output as above; CloudWatch Insights queries the structured fields directly:

```
fields @timestamp, event, user_id
| filter event = "rate_limit_exceeded"
| stats count() by user_id
```

### Sentry (error events only)

Sentry is for errors and exceptions, not general logs. Wire it alongside `structlog`:

```python
import sentry_sdk
sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    send_default_pii=False,
    max_request_body_size='never',
)
```

`send_default_pii=False` prevents cookies, IPs, and form data from being attached to events. `max_request_body_size='never'` is the line vibe coders miss: without it, Sentry's Flask/Django/FastAPI integrations capture full request bodies on error — which ships PII to Sentry even when `send_default_pii` is False. Confirm in the Sentry UI that captured events do not contain PII before deploying to production.

### OpenTelemetry / OTLP

For projects on the OpenTelemetry stack, route logs through the OTLP exporter so they flow alongside traces and metrics to your collector. The OTLP path replaces the stdout/JSONRenderer path from the Configuration section — it is not additive. Use this config in place of the earlier one:

```python
import logging
import structlog
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

provider = LoggerProvider()
provider.add_log_record_processor(
    BatchLogRecordProcessor(OTLPLogExporter(endpoint='http://collector:4317'))
)
handler = LoggingHandler(logger_provider=provider)
logging.basicConfig(format='%(message)s', level=logging.INFO, handlers=[handler])

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt='iso', utc=True),
        redact,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
)

log = structlog.get_logger()
```

The `redact` processor stays in the chain — OTel does not redact for you. Point the OTLP endpoint at your collector (OpenTelemetry Collector, Grafana Agent, Datadog Agent with OTLP ingest, etc.). The collector handles batching, retries, and forwarding to your backend.

## Production considerations

Things to think about before deploying. None of these are blockers for the procedure to verify PASS, but all of them affect whether the logs are useful in production.

### Redaction is allow-list-adjacent, not perfect

The `REDACT_KEYS` set above catches obvious cases. It does not catch:

- PII embedded in a free-form `message` field (an email inside an error string).
- Secrets in a URL query string logged as `request_url`.
- PII in a nested dict not at the top level.

For high-risk surfaces, log only IDs and event names — never log the full request or response body. The `pii-handling` area procedure has the canonical guidance.

### Log levels and volume

`INFO` for business events (request received, LLM call started). `WARNING` for recoverable issues (rate limit hit, retry). `ERROR` for unrecoverable issues. Do not log every database query at `INFO` — volume hides signal and inflates cost.

### Retention and access

Logs containing user IDs are subject to your privacy policy's retention limits. Configure platform-side retention (30/90/365 days) per data class. Restrict log query access to the people who need it; production logs are a regulated surface.

### Correlation IDs

Attach a request-scoped correlation ID via `structlog.contextvars.bind_contextvars(request_id=...)` at request entry. Every log line in that request inherits the ID, making cross-service tracing possible without a full distributed-tracing system.

## After this file

Return to the area procedure: `aigis get audit-logging`. The procedure's structured-logging checkpoint is satisfied once your application emits JSON logs with the redactor active. Continue from the next step.

## Related infrastructure

- `aigis infra secrets` — keep API keys, tokens, and connection strings out of the log fields shown above.
- `aigis infra rate-limiting` — `rate_limit_exceeded` events should land in the structured logger, not a separate sink.
