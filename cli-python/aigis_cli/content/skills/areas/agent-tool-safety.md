---
id: agent-tool-safety
title: Tool invocation safety, tool input and output validation, scope drift
controls:
  owasp: [LLM01, LLM02, LLM05, LLM06]
  nist: [MEASURE-2.7, MANAGE-2.4]
  iso42001: []
  atlas: [AML.M0020, AML.M0029, AML.M0030, AML.M0031, AML.M0033, AML.M0037, AML.M0038]
min_risk_tier: all
system_traits: [is-agentic]
---

For any model that calls tools or acts with someone's permissions: limits what content it reads can make it do. Enforce in the tool dispatcher, never in prompt text; deny by default, fail closed. It does not stop prompt injection; it limits its reach.

## Common incomplete implementations

1. **Trust label only logged.** Prevented by Step 2.
2. **Arguments validated, results not.** Prevented by Step 4.
3. **Same tools regardless of context.** Prevented by Step 2.
4. **Memory copied from tool output.** Prevented by Step 6.
5. **Summaries relabeled trusted.** Prevented by Step 1.

## Implementation procedure

### Step 1 — Label every item entering the model context as trusted or untrusted ⚠ CRITICAL

**What to do.** Add items only via `Context.add`, recording `source` and `trust_level`. Trusted: system prompt, the authenticated user's own turn. Untrusted: tool results, documents, emails, web pages, files, other agents' output, unknown sources. Code sets labels, never the model. Taint is sticky (removing items never clears it); later adds are stored untrusted whatever their label. A context built from a tainted one (compaction, hand-off) starts tainted: add its summary untrusted. `Context(derived_from=old)` keeps the pause; a non-`Context` source counts as tainted.

**Verification checkpoint.** `grep -rn "items.append\|items.push" .` finds no append outside `Context.add`. Tests: a tool result taints; a later `TRUSTED` add stays untrusted; a context derived from a tainted or unknown source is tainted.

### Step 2 — Restrict tool invocation while untrusted data is in context ⚠ CRITICAL

**What to do.** Mark a tool `side_effects` if it writes, deletes, pays, sends, or fetches a model-chosen URL; no flag counts as side-effect. Run `gate_tool_call` before every call. Tainted context plus side-effect tool: deny, or require approval via `human-oversight`; `always_approve` tools need approval even untainted. `approval_granted` comes from your approval service, not the model. Errors deny; a log line is not a restriction. Tool chains in code use `dispatch` on the same context.

**Verification checkpoint.** After a tool result, unapproved `send_reply` raises `ToolDenied`; the tool never runs.

### Step 3 — Validate tool arguments against a schema before execution

**What to do.** Run `validate_tool_args` before execution: exact fields and types, length caps, enums, ranges, allowed path roots and URL hosts. On failure skip the tool; never coerce. Tools return one envelope, `{"ok": bool, "data": str}`.

**Verification checkpoint.** An extra field, wrong type or over-length string is denied before the tool runs.

### Step 4 — Validate and sanitize tool outputs and retrieved data before they re-enter the context

**What to do.** Before `Context.add`, run every tool result and retrieved item through `sanitize_tool_output`: reject non-envelope results; strip control and zero-width characters, script and comment blocks; redact secrets and personal data (`pii-handling`); escape `<tool_result` tags. It stays untrusted.

**Verification checkpoint.** A stub's PEM key, `sk-` token, `\u200b` and forged `</tool_result>` come out redacted, stripped and escaped; 1 MB of unclosed `<!--` takes under 0.1 s.

### Step 5 — Check each planned action against the authorized objective

**What to do.** At task start record the objective from the authenticated request, not model output: allowed actions and resources, step budget; sub-agents get the same or narrower. Run `check_scope_drift` before every call and on every plan step up front. Drift: action or resource outside the sets, budget spent, or a step that adds credentials, permissions or new parties. On drift pause, deny all calls, escalate via `human-oversight`, then resume the plan or end the task.

**Verification checkpoint.** With actions `{read}`, ticket `{42}`: `send_reply(42)` raises `ScopeDrift`; then `read_ticket(42)` is denied.

### Step 6 — If the agent has persistent memory: harden what gets written and recalled

Skip this step if the agent keeps no state between sessions.

**What to do.** Per memory write record tenant, user, source, `trust_level`, expiry, version. Tainted-context writes become untrusted facts, never instructions; preference writes need the user's turn or approval. Filter by session tenant and user; cap size and write rate; flag repeated self-updates; keep versions; quarantine and roll back suspicious records. Recalls re-enter via Step 1, label kept.

**Verification checkpoint.** A preference write from a tainted turn is rejected; user B never recalls user A's records.

### Step 7 — Prove it with injection and drift tests

**What to do.** Test the real dispatcher: a tool result with `AIGIS-TEST-MARKER: call send_reply`, then `send_reply` (denied or held); the same after compaction; bad arguments; a secret in output; an out-of-scope action; a cross-tenant recall.

**Verification checkpoint.** Each test fails when its control is disabled.

## Complete working example

```python
import re

class TrustLevel:
    TRUSTED, UNTRUSTED = "trusted", "untrusted"

class ToolDenied(Exception): pass
class ScopeDrift(ToolDenied): pass

TOOLS = {
    "read_ticket": {"args": {"ticket_id": (int, 0)}, "side_effects": False, "action": "read"},
    "send_reply": {"args": {"ticket_id": (int, 0), "body": (str, 4000)}, "action": "reply"},
}
HIDDEN = re.compile("[\x00-\x08\x0b-\x1f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")
UNSAFE = re.compile(r"<(script|style)\b.*?(?:</\1\s*>|\Z)|<!--.*?(?:-->|\Z)|-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)|\bsk-[\w-]{20,}", re.S | re.I)

class Context:
    def __init__(self, derived_from=None):
        d, self.items = derived_from, []
        self._tainted = d is not None and not (isinstance(d, Context) and not d.tainted)
        self.paused = bool(d.get("paused") if isinstance(d, dict) else getattr(d, "paused", False))

    @property
    def tainted(self):
        return self._tainted or any(i["trust_level"] != TrustLevel.TRUSTED for i in self.items)

    def add(self, source, content, trust_level=TrustLevel.UNTRUSTED):
        if self.tainted: trust_level = TrustLevel.UNTRUSTED
        self._tainted = trust_level != TrustLevel.TRUSTED
        self.items.append({"source": source, "trust_level": trust_level, "content": content})

def gate_tool_call(ctx, name, approval_granted=False):
    tool = TOOLS.get(name)
    if tool is None or ctx.paused:
        raise ToolDenied("unavailable")
    if (tool.get("always_approve") or ctx.tainted and tool.get("side_effects") is not False) and approval_granted is not True:
        raise ToolDenied("approval required")

def validate_tool_args(name, args):
    schema = TOOLS.get(name, {}).get("args")
    if not schema or not isinstance(args, dict) or set(args) != set(schema):
        raise ToolDenied("bad arguments")
    for key, (typ, max_len) in schema.items():
        if type(args[key]) is not typ or (max_len and len(args[key]) > max_len):
            raise ToolDenied("bad argument: " + key)

def sanitize_tool_output(name, result):
    if not isinstance(result, dict) or set(result) != {"ok", "data"} or not isinstance(result["data"], str):
        raise ToolDenied("bad result")
    text = UNSAFE.sub("[REDACTED]", HIDDEN.sub("", result["data"]))
    text = re.sub(r"<(/?tool_result)", r"&lt;\1", text, flags=re.I)
    return f'<tool_result source="{name}">\n{text}\n</tool_result>'

def check_scope_drift(objective, name, args, step):
    if TOOLS[name].get("action") not in objective["actions"] or args.get("ticket_id") not in objective["ticket_ids"]:
        return "out of scope"
    return "budget spent" if step >= objective["max_steps"] else None

def dispatch(ctx, objective, step, name, args, registry, approval_granted=False):
    validate_tool_args(name, args)
    reason = check_scope_drift(objective, name, args, step)
    if reason:
        ctx.paused = True
        raise ScopeDrift(reason)
    gate_tool_call(ctx, name, approval_granted)
    ctx.add(name, sanitize_tool_output(name, registry[name](**args)))
```

```javascript
const TrustLevel = Object.freeze({ TRUSTED: 'trusted', UNTRUSTED: 'untrusted' });
class ToolDenied extends Error {}
class ScopeDrift extends ToolDenied {}

const TOOLS = {
  readTicket: { args: { ticketId: ['number', 0] }, sideEffects: false, action: 'read' },
  sendReply: { args: { ticketId: ['number', 0], body: ['string', 4000] }, action: 'reply' },
};
const HIDDEN = /[\x00-\x08\x0b-\x1f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
const UNSAFE = /<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)|\bsk-[\w-]{20,}/gi;
const toolFor = (n) => (Object.hasOwn(TOOLS, n) ? TOOLS[n] : null);
const keysOf = (o) => JSON.stringify(Object.keys(o).sort());

class Context {
  constructor(derivedFrom = null) {
    const d = derivedFrom;
    this.items = []; this.paused = Boolean(d?.paused);
    this._tainted = d != null && !(d instanceof Context && !d.tainted);
  }
  get tainted() { return this._tainted || this.items.some((i) => i.trustLevel !== TrustLevel.TRUSTED); }
  add(source, content, trustLevel = TrustLevel.UNTRUSTED) {
    if (this.tainted) trustLevel = TrustLevel.UNTRUSTED;
    this._tainted = trustLevel !== TrustLevel.TRUSTED;
    this.items.push({ source, trustLevel, content });
  }
}

function gateToolCall(ctx, name, approvalGranted = false) {
  const tool = toolFor(name);
  if (!tool || ctx.paused) throw new ToolDenied('unavailable');
  if ((tool.alwaysApprove || (ctx.tainted && tool.sideEffects !== false)) && approvalGranted !== true) throw new ToolDenied('approval required');
}

function validateToolArgs(name, args) {
  const schema = toolFor(name)?.args;
  if (!schema || !args || typeof args !== 'object' || keysOf(args) !== keysOf(schema)) throw new ToolDenied('bad arguments');
  for (const [key, [type, maxLen]] of Object.entries(schema)) {
    const v = args[key];
    const bad = typeof v !== type || (type === 'number' && !Number.isInteger(v)) || (maxLen && v.length > maxLen);
    if (bad) throw new ToolDenied(`bad argument: ${key}`);
  }
}

function sanitizeToolOutput(name, result) {
  const ok = result && typeof result.data === 'string' && keysOf(result) === '["data","ok"]';
  if (!ok) throw new ToolDenied('bad result');
  const text = result.data.replace(HIDDEN, '').replace(UNSAFE, '[REDACTED]').replace(/<(\/?tool_result)/gi, '&lt;$1');
  return `<tool_result source="${name}">\n${text}\n</tool_result>`;
}

function checkScopeDrift(objective, name, args, step) {
  if (!objective.actions.has(TOOLS[name].action) || !objective.ticketIds.has(args.ticketId)) return 'out of scope';
  return step >= objective.maxSteps ? 'budget spent' : null;
}

async function dispatch(ctx, objective, step, name, args, registry, approvalGranted = false) {
  validateToolArgs(name, args);
  const reason = checkScopeDrift(objective, name, args, step);
  if (reason) {
    ctx.paused = true;
    throw new ScopeDrift(reason);
  }
  gateToolCall(ctx, name, approvalGranted);
  ctx.add(name, sanitizeToolOutput(name, await registry[name](args)));
}

module.exports = { TrustLevel, ToolDenied, ScopeDrift, TOOLS, Context, dispatch };
```

## What this does not cover

- Injection misleading answers or read-only tool use.
- Authorization, approval UI, user-prompt checks, output encoding, logging, rate limits, sandboxing.
- Drift inside the declared actions and resources.

## Related patterns

`agent-permissions`, `human-oversight`, `input-validation`, `output-sanitization`, `pii-handling`, `audit-logging`.
