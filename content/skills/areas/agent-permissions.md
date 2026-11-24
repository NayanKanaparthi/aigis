---
id: agent-permissions
title: Agent identity, tool permissions and authority limits
controls:
  owasp: []
  nist: []
  iso42001: []
  atlas: []
min_risk_tier: all
system_traits: [is-agentic]
---

This area limits what an AI agent can do under its identity and permissions. It applies when the model can call tools or act with someone's permissions. Every check runs in code outside the model, in the tool layer or gateway, denies by default and fails closed; nothing relies on prompt text. It does not stop prompt injection; it limits what injected text can make the agent do.

## Common incomplete implementations

1. **The agent runs on a developer token or shared admin account.** Prevented by Step 1.
2. **Authorization lives in the system prompt.** Prevented by Step 4.
3. **A shared tool checks its own privilege, not the caller's.** Prevented by Step 4.
4. **The agent can mint itself a key or edit its own scopes.** Prevented by Step 5.
5. **Tokens, webhooks, jobs and cloud resources outlive the task.** Prevented by Step 6.

## Implementation procedure

### Step 1 — Declare each agent identity as service or user-delegated ⚠ CRITICAL

**What to do.** List every agent in one `AGENT_IDENTITY` map, in config no tool can write, as `service` (own workload identity, started by requests, events or schedules) or `delegated` (acts for one signed-in user). Give each its own identity, never a developer token or shared admin account. Deny unlisted agents. Keep credentials out of model context.

**Verification checkpoint.** `start_run("ghost", "t1", "u1")` raises `Denied`.

### Step 2 — Bind every service identity to an explicit list of authorized workflows

**What to do.** In `AUTHORIZED_WORKFLOWS`, list each service agent's workflows with their operations and allowed initiators. At run start, deny unless the workflow is listed for that agent and the verified initiator may start it; the run gets only that workflow's operations. Keep permission and credential changes out of routine workflows.

**Verification checkpoint.** Starting `bot` with an unlisted workflow or initiator raises `Denied`.

### Step 3 — Cap a delegated agent at the intersection of the user's permissions and the task scope

**What to do.** Set the run's operations to `effective_permissions(user_permissions, task)`: the user's permissions intersected with the task scope in trusted config (`TASK_SCOPES`), never the agent's reading of the request. Prefer read-only operations. Reload the user's permissions on each tool call so removals apply at once. Use short-lived credentials scoped to user and task.

**Verification checkpoint.** A user with `mail:read` and `mail:send` on `triage` gets only `mail:read`; once they lose it, reads are denied.

### Step 4 — Authorize every tool call per caller inside the tool layer ⚠ CRITICAL

**What to do.** Route every tool call through a dispatcher that first calls `authorize_tool_call(run, caller, operation, resource)`. Build `caller` (agent, principal, tenant, user permissions) from the authenticated session, never model arguments; the operation comes from your tool registry. Allow only if the caller matches the run, run and user hold the operation and the resource is in the caller's tenant. Separate read, modify and delete; errors deny. Shared tools use a caller-scoped credential, never their own wider privilege. A static tool allowlist is not this step.

**Verification checkpoint.** `grep -rn "TOOLS\[" src/` hits only `dispatch_tool`; tenant `t2` asking for `tenants/t1/x` is denied.

### Step 5 — Fix the maximum authority before the run and block self-granting

**What to do.** Declare `MAX_AUTHORITY` per agent in reviewed config. At run start, intersect the run's operations with it, drop self-granting operations (creating credentials, keys, roles or service accounts; editing the agent's own scopes) and freeze the result. Only a human editing config out of band grants more. Give a sub-agent a subset of its parent's operations.

**Verification checkpoint.** `Run` is immutable; `iam:create_key` is denied even when a workflow lists it.

### Step 6 — Register, attribute and expire every external resource the agent creates

**What to do.** Make `register_agent_resource(run, kind, create, ttl_seconds)` the only way tools create cloud resources, accounts, tokens, webhooks or scheduled jobs. It refuses kinds without a revoker or over-long lifetimes and records agent, principal, run, creation and expiry. A scheduler outside the agent runs `sweep_agent_resources`: on run end or expiry it revokes credentials, deletes the resource, confirms both and retries failures.

**Verification checkpoint.** Provider create calls appear only in `create` callbacks given to `register_agent_resource`; a sweep after run end marks records `revoked`.

### Step 7 — Prove the denials with negative tests

**What to do.** Call the real dispatcher. Assert `Denied` and that the tool did not run for: unlisted agent, workflow or initiator; operation outside the task; permission lost mid-run; other tenant; `..` in the path; self-granting; unknown tool. Add one allowed call so deny-everything fails.

**Verification checkpoint.** Deleting the tenant check from `authorize_tool_call` makes the cross-tenant test fail.

## Complete working example

```python
import time
import uuid
from collections import namedtuple

NONE = frozenset()
Run = namedtuple("Run", "run_id agent_id tenant_id principal delegated operations")

class Denied(Exception):
    pass

# Reviewed config that no tool can write
AGENT_IDENTITY = {"bot": "service", "aide": "delegated"}
AUTHORIZED_WORKFLOWS = {"bot": {"report": ({"db:read", "doc:write"}, {"cron"})}}  # ops, initiators
TASK_SCOPES = {"triage": {"mail:read", "mail:label"}}
MAX_AUTHORITY = {"bot": {"db:read", "doc:write"}, "aide": {"mail:read", "mail:label", "mail:send"}}
SELF_GRANTING = {"iam:create_key", "iam:create_role", "agent:edit_scopes"}

def effective_permissions(user_permissions, task):
    return frozenset(user_permissions) & TASK_SCOPES.get(task, NONE)

def start_run(agent_id, tenant_id, principal, task=None, user_permissions=(), workflow=None):
    kind = AGENT_IDENTITY.get(agent_id)
    if kind == "service":
        ops, starters = AUTHORIZED_WORKFLOWS.get(agent_id, {}).get(workflow, (NONE, NONE))
        if principal not in starters:
            raise Denied("workflow")
    elif kind == "delegated":
        ops = effective_permissions(user_permissions, task)
    else:
        raise Denied("identity")
    ops = (frozenset(ops) & MAX_AUTHORITY.get(agent_id, NONE)) - SELF_GRANTING
    return Run(uuid.uuid4().hex, agent_id, tenant_id, principal, kind == "delegated", ops)

def authorize_tool_call(run, caller, operation, resource):
    if any(caller[k] != getattr(run, k) for k in ("agent_id", "tenant_id", "principal")):
        raise Denied("caller")
    if operation not in run.operations or (run.delegated and operation not in caller["user_permissions"]):
        raise Denied("operation")
    if ".." in resource.split("/") or not resource.startswith(f"tenants/{run.tenant_id}/"):
        raise Denied("resource")

TOOLS = {}  # name -> (operation, fn); you set the operation, not the model

def dispatch_tool(run, caller, name, resource, args):
    try:
        operation, fn = TOOLS[name]
        authorize_tool_call(run, caller, operation, resource)
    except Exception as exc:  # fail closed
        raise Denied(str(exc)) from exc
    return fn(args, caller=caller, resource=resource)

RESOURCES = {}  # a database table in production
REVOKERS = {}  # kind -> fn(id): revoke, delete, confirm

def register_agent_resource(run, kind, create, ttl_seconds):
    if kind not in REVOKERS or not 0 < ttl_seconds <= 3600:
        raise Denied("resource")
    rid, now = create(), time.time()
    RESOURCES[rid] = dict(kind=kind, agent=run.agent_id, principal=run.principal, run=run.run_id,
                          created=now, expires=now + ttl_seconds, status="active")
    return rid

def sweep_agent_resources(ended_runs=()):
    for rid, rec in RESOURCES.items():
        if rec["status"] == "active" and (time.time() >= rec["expires"] or rec["run"] in ended_runs):
            try:
                REVOKERS[rec["kind"]](rid)
                rec["status"] = "revoked"
            except Exception:
                pass  # retried next sweep
```

```javascript
const { randomUUID } = require('node:crypto');

class Denied extends Error {}
const get = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

const AGENT_IDENTITY = { bot: 'service', aide: 'delegated' };
const AUTHORIZED_WORKFLOWS = { bot: { report: [['db:read', 'doc:write'], ['cron']] } }; // ops, initiators
const TASK_SCOPES = { triage: ['mail:read', 'mail:label'] };
const MAX_AUTHORITY = { bot: ['db:read', 'doc:write'], aide: ['mail:read', 'mail:label', 'mail:send'] };
const SELF_GRANTING = ['iam:create_key', 'iam:create_role', 'agent:edit_scopes'];

const effectivePermissions = (userPermissions, task) =>
  (get(TASK_SCOPES, task) || []).filter((op) => userPermissions.includes(op));

function startRun(agentId, tenantId, principal, { task, userPermissions = [], workflow } = {}) {
  const kind = get(AGENT_IDENTITY, agentId);
  let ops;
  if (kind === 'service') {
    const [wfOps, starters] = get(get(AUTHORIZED_WORKFLOWS, agentId), workflow) || [[], []];
    if (!starters.includes(principal)) throw new Denied('workflow');
    ops = wfOps;
  } else if (kind === 'delegated') ops = effectivePermissions(userPermissions, task);
  else throw new Denied('identity');
  const ceiling = get(MAX_AUTHORITY, agentId) || [];
  return Object.freeze({ runId: randomUUID(), agentId, tenantId, principal, delegated: kind === 'delegated',
    operations: Object.freeze(ops.filter((op) => ceiling.includes(op) && !SELF_GRANTING.includes(op))) });
}

function authorizeToolCall(run, caller, operation, resource) {
  if (['agentId', 'tenantId', 'principal'].some((k) => caller[k] !== run[k]))
    throw new Denied('caller');
  if (!run.operations.includes(operation) || (run.delegated && !caller.userPermissions.includes(operation)))
    throw new Denied('operation');
  if (resource.split('/').includes('..') || !resource.startsWith(`tenants/${run.tenantId}/`))
    throw new Denied('resource');
}

const TOOLS = new Map(); // name -> { operation, fn }

async function dispatchTool(run, caller, name, resource, args) {
  const tool = TOOLS.get(name);
  try {
    authorizeToolCall(run, caller, tool.operation, resource);
  } catch (err) {
    throw new Denied(err.message); // fail closed
  }
  return tool.fn(args, { caller, resource });
}

const RESOURCES = new Map();
const REVOKERS = new Map(); // kind -> async revoke, delete, confirm

async function registerAgentResource(run, kind, create, ttlSeconds) {
  if (!REVOKERS.has(kind) || !(ttlSeconds > 0 && ttlSeconds <= 3600)) throw new Denied('resource');
  const rid = await create();
  const now = Date.now();
  RESOURCES.set(rid, { kind, agent: run.agentId, principal: run.principal, run: run.runId,
    created: now, expires: now + ttlSeconds * 1000, status: 'active' });
  return rid;
}

async function sweepAgentResources(endedRuns = new Set()) {
  for (const [rid, rec] of RESOURCES) {
    if (rec.status !== 'active' || (Date.now() < rec.expires && !endedRuns.has(rec.run))) continue;
    try {
      await REVOKERS.get(rec.kind)(rid);
      rec.status = 'revoked';
    } catch { /* retried next sweep */ }
  }
}

module.exports = { Denied, TOOLS, REVOKERS, startRun, dispatchTool, registerAgentResource, sweepAgentResources };
```

## What this does not cover

- Detecting prompt injection (`input-validation`), or gating tools on untrusted context (`agent-tool-safety`).
- Ceilings set too broadly in config.
- Approvals (`human-oversight`), logging (`audit-logging`), rate limits (`rate-limiting`).

## Related patterns

`human-oversight`, `agent-tool-safety`, `audit-logging`, `input-validation`.
