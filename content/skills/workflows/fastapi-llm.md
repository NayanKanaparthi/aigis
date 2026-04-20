---
name: workflow-fastapi-llm
description: Canonical 8-file layout for a FastAPI service that calls an LLM API. Run after `aigis classify` returned a Python/FastAPI system. Maps each governance area to a specific module so wiring is consistent across runs.
---

# Workflow: FastAPI + LLM

This workflow is for: a FastAPI HTTP service that calls a hosted LLM (Anthropic, OpenAI) on user input. If your project is something else (Express, Next.js, agentic loop, RAG service), this workflow does not apply — see `aigis workflow --list` for available workflows.

## Canonical file layout

Build into exactly these 8 files.

```
app/
├── main.py              # FastAPI routes + minimal orchestration only
├── input_validation.py  # length limits, sanitize, 3-category injection detection
├── pii.py               # PII_PATTERNS + redact_pii (5 required classes)
├── rate_limit.py        # Redis-backed limiter + token budget + Retry-After
├── fallback.py          # 3-state circuit breaker + per-request kill switch + safe response
├── audit.py             # trace IDs, structured logs, decision records, fairness fields
├── monitoring.py        # metrics, drift, incident logging, user feedback endpoint
└── response.py          # response shaping: confidence metadata, explanation, output sanitization
```

Plus at the project root: `requirements.txt` with pinned `==` versions, `tests/` with at least one smoke test, `docker-compose.yml` (Redis dependency for `rate_limit.py`).

## Area-to-file mapping

| Aigis area (run `aigis get <id>` for the procedure) | Lives in |
|---|---|
| input-validation | `app/input_validation.py` |
| pii-handling | `app/pii.py` |
| rate-limiting | `app/rate_limit.py` |
| fallback-patterns | `app/fallback.py` |
| audit-logging | `app/audit.py` |
| bias-monitoring | `app/audit.py` (fairness fields are part of structured logs) |
| monitoring | `app/monitoring.py` |
| confidence-scoring | `app/response.py` |
| explainability | `app/response.py` |
| output-sanitization | `app/response.py` |
| human-oversight | `app/main.py` (decision gate + override surface + action allowlist) |
| prompt-security | `app/main.py` (`SYSTEM_PROMPT` constant + leakage detection) |
| supply-chain | `requirements.txt` (pinned versions) + `app/main.py` (`MODEL_VERSION` constant) |

If `main.py`'s responsibilities grow past routes + minimal orchestration, pull human-oversight into `app/human_oversight.py` and/or prompt-security into `app/prompt_security.py`. Don't invent other splits — variance hurts maintainability.

## Wiring contracts (cross-file invariants)

These are the wiring rules the area-skill verification checkpoints check for. Get them right at build time.

1. **`redact_pii` from `pii.py` is called in two places:**
   - `main.py`, on user input, before passing to the LLM client
   - `audit.py`, on input/output before structured-log emission
2. **`call_llm_safely` from `fallback.py` wraps every LLM client call.** Every `client.messages.create` / `client.chat.completions.create` site routes through it. There must be exactly one LLM call site in `main.py` (or in a dedicated `app/llm.py` if you split for clarity); other modules invoke it through the safe wrapper.
3. **`ai_system_enabled()` from `fallback.py` is called inside the request handler in `main.py`, on every request.** Not at module load. Not via `@lru_cache`. Not stored on a `settings = Settings()` module-level singleton.
4. **The injection guard from `input_validation.py` blocks before the LLM call.** Raises `HTTPException(400)` on detection; the LLM call must come AFTER the guard, never before, never in parallel.
5. **`enforce_rate_limit` and `enforce_token_budget` from `rate_limit.py` run in the handler before any sanitize/LLM work.** Cheaper to reject than to sanitize-then-reject.
6. **`set_trace_id` middleware from `audit.py` runs on every request.** All log emissions and the `X-Trace-Id` response header use the contextvar.
7. **`response.py` shapes the outgoing payload from a parsed model result.** It receives the validated assessment dict and returns the JSON body the client gets — confidence metadata, explanation, sanitized fields, framing. `main.py` calls it at the end of the request handler; `response.py` does not call the LLM and does not log.

## Order of implementation

Recommended order (each step ships independently, tests pass at every step):

1. `app/main.py` skeleton with `POST /api/assess-claim` (or your route), `GET /healthz`, no LLM call yet.
2. `app/input_validation.py` — `aigis get input-validation` and follow the procedure.
3. `app/pii.py` — `aigis get pii-handling` and follow the procedure.
4. `app/fallback.py` — `aigis get fallback-patterns` and follow the procedure.
5. `app/rate_limit.py` — `aigis get rate-limiting` and follow the procedure.
6. Wire the LLM call in `main.py`, routing through `call_llm_safely`.
7. `app/audit.py` — `aigis get audit-logging` and `aigis get bias-monitoring`.
8. `app/monitoring.py` — `aigis get monitoring`.
9. `app/response.py` — `aigis get confidence-scoring`, `aigis get explainability`, `aigis get output-sanitization`. Wire it into `main.py` as the last step before returning.
10. Human-oversight + prompt-security work in `main.py` — `aigis get human-oversight`, `aigis get prompt-security`.
11. `requirements.txt` and `tests/` — `aigis get supply-chain`.

## Verification per file

After building each file, run `aigis verify <area> --auto .`. The scanner returns PASS/FAIL/OVERCLAIM/JUDGMENT for that area's deterministic checks. Fix any FAIL or OVERCLAIM before moving to the next file.

## If your existing codebase uses a different layout

Map each responsibility above to your existing modules. The wiring contracts (the numbered list) stay the same — the file names don't. For example, if your codebase already has `services/text_processing.py` for text cleanup, the input-validation procedure can live there; the contract that "an injection guard runs before the LLM call" is what matters, not which file holds it.

If the mapping is non-trivial, document it in `docs/aigis-mapping.md` so future contributors and `aigis verify --auto` reviewers can find your modules.
