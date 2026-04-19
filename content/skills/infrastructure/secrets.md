---
id: infra-secrets
title: Secrets management infrastructure (env-var baseline + vault integration patterns)
controls:
  owasp: [LLM02, LLM05]
  nist: [MAP-2.3, MEASURE-2.7]
  iso42001: [Clause-8.3]
---

Several area procedures (`pii-handling`, `supply-chain`, the `rate-limiting` infra file's Redis URL) require secrets — API keys, database credentials, connection strings — to live outside source code. This file shows the two infrastructure shapes that satisfy that requirement: an environment-variable baseline for new projects, and integration patterns for projects that already have a secrets manager. Pick one. Then return to the procedure that sent you here.

This is content, not a scaffold. Aigis does not write files for you. Copy the snippets you need; adapt them to your project.

## Starting from scratch (you have no secrets manager yet)

If you are building a new project and don't have a vault, the minimum acceptable baseline is environment variables loaded from a `.env` file in development and from your platform's secret store in production. Hard-coded secrets in source files are not acceptable at any stage — the supply-chain procedure will flag them.

### Required dependency

```
python-dotenv>=1.0    # loads .env into os.environ; pin per your supply-chain procedure
```

### `.env.example` convention

Commit `.env.example` with placeholder values. Add `.env` to `.gitignore`. Every key in `.env.example` must be present in `.env` for the app to start.

```
# .env.example
ANTHROPIC_API_KEY=sk-ant-REPLACE_ME
OPENAI_API_KEY=sk-REPLACE_ME
DATABASE_URL=postgresql://user:REPLACE_ME@localhost:5432/dbname
REDIS_URL=redis://localhost:6379/0
```

```
# .gitignore
.env
.env.local
.env.*.local
```

Do not deploy `.env` to production. Production secrets come from your platform's secret store (Vault, AWS Secrets Manager, GCP Secret Manager, or the wrappers below). The `.env` file exists only for local development; a `.env` in a container image or a production deploy is a leak.

### Loading code

```python
import os
from dotenv import load_dotenv

load_dotenv()    # no-op in production if .env is absent

def require(name: str) -> str:
    value = os.getenv(name)
    if not value or value.endswith("REPLACE_ME"):
        raise RuntimeError(f"Missing required secret: {name}")
    return value

ANTHROPIC_API_KEY = require("ANTHROPIC_API_KEY")
DATABASE_URL = require("DATABASE_URL")
```

The `require` helper fails fast at startup rather than at first use. A missing API key should crash the process on boot, not surface as a 500 the first time a user hits the LLM endpoint.

### Verifying the setup

Before wiring secrets into application code, confirm loading works and that no secret leaks into logs:

```python
print("ANTHROPIC_API_KEY loaded:", bool(os.getenv("ANTHROPIC_API_KEY")))
# Never print the value itself, even in development scripts.
```

If this prints `False`, fix the `.env` location or `load_dotenv()` call before continuing.

## Integrate with existing infrastructure

If you already have a secrets manager, adapt rather than introduce a second source of truth. Common cases below; pick the closest match.

### HashiCorp Vault

Read secrets at process start, populate `os.environ`, and let the rest of the app use the env-var pattern above:

```python
import hvac, os

client = hvac.Client(url=os.environ["VAULT_ADDR"], token=os.environ["VAULT_TOKEN"])
secrets = client.secrets.kv.v2.read_secret_version(path="myapp/prod")["data"]["data"]
for key, value in secrets.items():
    os.environ.setdefault(key, value)
```

Use AppRole or Kubernetes auth in production; static `VAULT_TOKEN` is for local development only.

### AWS Secrets Manager

```python
import boto3, json, os

client = boto3.client("secretsmanager", region_name=os.environ["AWS_REGION"])
secret = json.loads(client.get_secret_value(SecretId="myapp/prod")["SecretString"])
for key, value in secret.items():
    os.environ.setdefault(key, value)
```

Grant the application's IAM role `secretsmanager:GetSecretValue` on a single secret ARN, not `*`. Rotate via the built-in rotation Lambda, not by hand.

### GCP Secret Manager

```python
from google.cloud import secretmanager
import os

client = secretmanager.SecretManagerServiceClient()
def fetch(name: str) -> str:
    path = f"projects/{os.environ['GCP_PROJECT']}/secrets/{name}/versions/latest"
    return client.access_secret_version(name=path).payload.data.decode()

os.environ["ANTHROPIC_API_KEY"] = fetch("anthropic-api-key")
```

Bind the service account to `roles/secretmanager.secretAccessor` on each secret, not at the project level.

### Doppler / 1Password / Infisical

These tools inject secrets as environment variables at process start via a CLI wrapper:

```
doppler run -- python app.py
op run --env-file=.env -- python app.py
infisical run -- python app.py
```

Your application code does not change — it still reads `os.environ`. The wrapper handles fetch, decryption, and injection. Appropriate when you want centralized rotation without code changes.

These are developer-experience tools — good for smaller teams and centralized rotation. For regulated environments (SOC 2, HIPAA, FedRAMP), prefer the managed services above.

## Production considerations

Things to think about before deploying. None of these are blockers for the procedure that sent you here, but all of them affect whether your secret hygiene survives contact with a real environment.

### Rotation

Every secret should have a known rotation cadence. API keys: at least every 90 days, immediately on suspected compromise. Database credentials: managed by the secrets manager's rotation feature where available. Document the rotation procedure next to the secret definition; an undocumented secret is an unrotated secret.

For secrets that cannot rotate without downtime (primary database credentials on a live system), use dual-credential patterns — provision the new credential alongside the old, shift traffic, then revoke the old.

### Access control

Grant read access to specific secrets, not to the whole vault. Use separate credentials for development, staging, and production — a leaked dev key should not unlock prod. Audit access logs from your secrets manager; unexplained reads are an incident.

### Logging hygiene

Secrets must never appear in logs, error messages, stack traces, or telemetry. The `audit-logging` area procedure covers redaction patterns. At minimum, scrub `Authorization` headers, `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, and connection strings before any log emit.

### Build-time vs runtime

Do not bake secrets into container images, build artifacts, or CI caches. Inject at runtime via the patterns above. A secret in a Docker layer is permanently exposed even after you "remove" it — image layers are append-only.

## After this file

Return to the area procedure that sent you here (`pii-handling`, `supply-chain`, or `rate-limiting`). The procedure's secret-handling checkpoint is satisfied once your application reads secrets from environment variables (or a managed source above) and your repository contains no hard-coded credentials.

## Related infrastructure

- `aigis infra logging` — redaction patterns to keep secrets out of log output.
- `aigis infra rate-limiting` — where the Redis connection string this file scopes for you actually gets used.
