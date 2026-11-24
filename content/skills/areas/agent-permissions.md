---
id: agent-permissions
title: Agent identity, tool permissions and authority limits
controls:
  owasp: [LLM01, LLM02, LLM05, LLM06, LLM07]
  nist: [MEASURE-2.7]
  iso42001: []
  atlas: [AML.M0026, AML.M0027, AML.M0028, AML.M0037, AML.M0043]
min_risk_tier: all
system_traits: [is-agentic]
---

This area limits what an AI agent can do when it calls tools or acts with someone's permissions. Checks run in code outside the model, deny by default and fail closed. It does not stop prompt injection; it limits what injected text can make the agent do.

## Common incomplete implementations

1. **The agent uses a developer token or shared admin account.** Prevented by Step 1.
2. **Authorization lives in the system prompt.** Prevented by Step 4.
3. **A shared tool checks its own privilege, not the caller's.** Prevented by Step 4.
4. **Tokens, webhooks, jobs and cloud resources outlive the task.** Prevented by Step 6.

## Implementation procedure

### Step 1 — Declare each agent identity as service or user-delegated ⚠ CRITICAL

**What to do.** List every agent in one `AGENT_IDENTITY` map, in config no tool can write, as `service` (own workload identity) or `delegated` (acts for a signed-in user). Each entry names the agent's own credential reference (never a developer token or shared admin account), kept out of model context. Deny unlisted agents.

**Verification checkpoint.** `start_run("ghost", "t1", "u1")` raises `Denied`, and no two `AGENT_IDENTITY` entries share a credential reference.

### Step 2 — Bind every service identity to an explicit list of authorized workflows

**What to do.** In `AUTHORIZED_WORKFLOWS`, list each service agent's workflows with operations, allowed initiators and resource root. At run start, deny unless the agent lists the workflow and the verified initiator may start it; the run gets only its operations.

**Verification checkpoint.** Starting `bot` with an unlisted workflow or initiator raises `Denied`.

### Step 3 — Cap a delegated agent at the intersection of the user's permissions and the task scope

**What to do.** Set the run's operations to `effective_permissions(user_permissions, task)`: the user's permissions intersected with the task scope in trusted `TASK_SCOPES`. List write operations in `TASK_SCOPES` only for tasks that need them; the task id comes from the authenticated request. Re-check the user's permissions on every call.

**Verification checkpoint.** A user with `mail:read` and `mail:send` on `triage` gets only `mail:read`, denied once they lose it.

### Step 4 — Authorize every tool call per caller inside the tool layer ⚠ CRITICAL

**What to do.** Route every tool call through a dispatcher that calls `authorize_tool_call(run, caller, operation, resource)`. Build `caller` (agent, principal, tenant, user permissions) from the authenticated session, not model arguments; the tool registry sets the operation. Each run gets a resource root at start: `tenants/{tenant}/users/{principal}/` if delegated, else its workflow's prefix. Allow only if the caller matches the run, run and user hold the operation and the resource is inside the run's resource root. Deny any `resource` containing `%` or `\`; normalize it before the prefix check. The tool acts only on the authorized `resource`; `args` carry no second target (deny undeclared arg names). Shared tools use caller-scoped credentials, never their own. A static tool allowlist is not this step.

**Verification checkpoint.** `grep -rnE "TOOLS(\[|\.get\()" src/` hits only the dispatcher; another tenant's resource and another user's resource, same tenant, are denied.

### Step 5 — Fix the maximum authority before the run and block self-granting

**What to do.** Declare `MAX_AUTHORITY` per agent in reviewed config. At run start, intersect the run's operations with it, drop self-granting (creating credentials, keys, roles or service accounts; editing the agent's own scopes) and freeze the result. Only a human editing config out of band grants more; sub-agents get a subset of the parent's operations.

**Verification checkpoint.** `iam:create_key` is denied even when a workflow lists it.

### Step 6 — Register, attribute and expire every external resource the agent creates

**What to do.** Make `register_agent_resource(run, kind, create, ttl_seconds)` the only way tools create cloud resources, accounts, tokens, webhooks or scheduled jobs. It refuses kinds without a revoker or long lifetimes and records agent, principal, run and expiry. A scheduler outside the agent runs `sweep_agent_resources`: at run end or expiry it revokes credentials, deletes the resource, confirms both, retries failures.

**Verification checkpoint.** Sweeping after run end marks its records `revoked`.

### Step 7 — Prove the denials with negative tests

**What to do.** Via the real dispatcher, assert `Denied` and no tool run for: unlisted agent, workflow or initiator; operation outside the task; permission lost mid-run; other tenant; another user's resource, same tenant; `..`, `%` or `\` in the path; undeclared args; self-granting; unknown tool. Include one allowed call.

**Verification checkpoint.** Removing the root check in `authorize_tool_call` fails the other-user test.

## Complete working example

```python
import posixpath
import time
import uuid
from collections import namedtuple

NONE = frozenset()
Run = namedtuple("Run", "run_id agent_id tenant_id principal delegated operations root")

class Denied(Exception):
    pass

AGENT_IDENTITY = {"bot": ("service", "kv:bot"), "aide": ("delegated", "kv:aide")}
AUTHORIZED_WORKFLOWS = {"bot": {"report": ({"db:read", "doc:write"}, {"cron"}, "reports/")}}
TASK_SCOPES = {"triage": {"mail:read"}}
MAX_AUTHORITY = {"bot": {"db:read", "doc:write"}, "aide": {"mail:read", "mail:send"}}
SELF_GRANTING = {"iam:create_key", "agent:edit_scopes"}

def effective_permissions(user_permissions, task):
    return frozenset(user_permissions) & TASK_SCOPES.get(task, NONE)

def start_run(agent_id, tenant_id, principal, task=None, user_permissions=(), workflow=None):
    kind = AGENT_IDENTITY.get(agent_id, (None,))[0]
    if kind == "service":
        ops, starters, sub = AUTHORIZED_WORKFLOWS.get(agent_id, {}).get(workflow, (NONE, NONE, ""))
        if principal not in starters:
            raise Denied("workflow")
    elif kind == "delegated":
        ops, sub = effective_permissions(user_permissions, task), f"users/{principal}/"
    else:
        raise Denied("identity")
    ops = (frozenset(ops) & MAX_AUTHORITY.get(agent_id, NONE)) - SELF_GRANTING
    return Run(uuid.uuid4().hex, agent_id, tenant_id, principal, kind == "delegated", ops, f"tenants/{tenant_id}/{sub}")

def authorize_tool_call(run, caller, operation, resource):
    if any(caller[k] != getattr(run, k) for k in ("agent_id", "tenant_id", "principal")):
        raise Denied("caller")
    if operation not in run.operations or (run.delegated and operation not in caller["user_permissions"]):
        raise Denied("operation")
    path = posixpath.normpath(resource)
    if "%" in resource or "\\" in resource or not path.startswith(run.root):
        raise Denied("resource")
    return path

TOOLS = {}  # name -> (operation, arg names, fn)

def dispatch_tool(run, caller, name, resource, args):
    try:
        operation, arg_names, fn = TOOLS[name]
        path = authorize_tool_call(run, caller, operation, resource)
        if set(args) - set(arg_names):
            raise Denied("args")
    except Exception as exc:
        raise Denied(str(exc)) from exc
    return fn(args, caller=caller, resource=path)

RESOURCES = {}  # use a database table
REVOKERS = {}  # kind -> revoke, delete, confirm

def register_agent_resource(run, kind, create, ttl_seconds):
    if kind not in REVOKERS or not 0 < ttl_seconds <= 3600:
        raise Denied("resource")
    rid = create()
    RESOURCES[rid] = dict(kind=kind, agent=run.agent_id, principal=run.principal, run=run.run_id,
                          expires=time.time() + ttl_seconds, status="active")
    return rid

def sweep_agent_resources(ended_runs=()):
    for rid, rec in RESOURCES.items():
        if rec["status"] == "active" and (time.time() >= rec["expires"] or rec["run"] in ended_runs):
            try:
                REVOKERS[rec["kind"]](rid)
                rec["status"] = "revoked"
            except Exception:
                pass  # retried later
```

```javascript
const { randomUUID } = require('node:crypto');
const { posix } = require('node:path');

class Denied extends Error {}
const get = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

const AGENT_IDENTITY = { bot: ['service', 'kv:bot'], aide: ['delegated', 'kv:aide'] };
const AUTHORIZED_WORKFLOWS = { bot: { report: [['db:read', 'doc:write'], ['cron'], 'reports/'] } };
const TASK_SCOPES = { triage: ['mail:read'] };
const MAX_AUTHORITY = { bot: ['db:read', 'doc:write'], aide: ['mail:read', 'mail:send'] };
const SELF_GRANTING = ['iam:create_key', 'agent:edit_scopes'];

const effectivePermissions = (userPermissions, task) =>
  (get(TASK_SCOPES, task) || []).filter((op) => userPermissions.includes(op));

function startRun(agentId, tenantId, principal, { task, userPermissions = [], workflow } = {}) {
  const [kind] = get(AGENT_IDENTITY, agentId) || [];
  let ops, starters, sub;
  if (kind === 'service') {
    [ops, starters, sub] = get(get(AUTHORIZED_WORKFLOWS, agentId), workflow) || [[], []];
    if (!starters.includes(principal)) throw new Denied('workflow');
  } else if (kind === 'delegated') [ops, sub] = [effectivePermissions(userPermissions, task), `users/${principal}/`];
  else throw new Denied('identity');
  const ceiling = get(MAX_AUTHORITY, agentId) || [];
  return Object.freeze({ runId: randomUUID(), agentId, tenantId, principal, delegated: kind === 'delegated',
    root: `tenants/${tenantId}/${sub}`,
    operations: Object.freeze(ops.filter((op) => ceiling.includes(op) && !SELF_GRANTING.includes(op))) });
}

function authorizeToolCall(run, caller, operation, resource) {
  if (['agentId', 'tenantId', 'principal'].some((k) => caller[k] !== run[k])) throw new Denied('caller');
  if (!run.operations.includes(operation) || (run.delegated && !caller.userPermissions.includes(operation)))
    throw new Denied('operation');
  const path = posix.normalize(resource);
  if (/[%\\]/.test(resource) || !path.startsWith(run.root)) throw new Denied('resource');
  return path;
}

const TOOLS = new Map(); // name -> { operation, args, fn }

async function dispatchTool(run, caller, name, resource, args) {
  const tool = TOOLS.get(name);
  let path;
  try {
    path = authorizeToolCall(run, caller, tool.operation, resource);
    if (Object.keys(args).some((k) => !tool.args.includes(k))) throw new Denied('args');
  } catch (err) {
    throw new Denied(err.message); // fail closed
  }
  return tool.fn(args, { caller, resource: path });
}

const RESOURCES = new Map();
const REVOKERS = new Map();

async function registerAgentResource(run, kind, create, ttlSeconds) {
  if (!REVOKERS.has(kind) || !(ttlSeconds > 0 && ttlSeconds <= 3600)) throw new Denied('resource');
  const rid = await create();
  RESOURCES.set(rid, { kind, agent: run.agentId, principal: run.principal, run: run.runId,
    expires: Date.now() + ttlSeconds * 1000, status: 'active' });
  return rid;
}

async function sweepAgentResources(endedRuns = new Set()) {
  for (const [rid, rec] of RESOURCES) {
    if (rec.status !== 'active' || (Date.now() < rec.expires && !endedRuns.has(rec.run))) continue;
    try {
      await REVOKERS.get(rec.kind)(rid);
      rec.status = 'revoked';
    } catch { /* retried later */ }
  }
}

module.exports = { Denied, TOOLS, REVOKERS, startRun, dispatchTool, registerAgentResource, sweepAgentResources };
```

## What this does not cover

Prompt injection detection (`input-validation`), tool gating on untrusted context (`agent-tool-safety`), approvals (`human-oversight`), logging (`audit-logging`).

## Related patterns

`human-oversight`, `agent-tool-safety`.
