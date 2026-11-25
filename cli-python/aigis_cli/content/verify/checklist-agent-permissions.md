---
id: checklist-agent-permissions
implements: agent-permissions
---
# Verification: Agent identity, tool permissions and authority limits

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is every agent listed in one identity map as `service` or `delegated`, read when a run starts so that an unlisted agent is denied? | S1 | [ ] | |
| V2 | Is each service agent bound to an explicit map of authorized workflows (operations and allowed initiators), checked when a run starts so that an unlisted workflow or initiator is denied? | S2 | [ ] | |
| V3 | Does a delegated run get its operations from `effective_permissions`, the intersection of the user's permissions and the task scope in trusted config? | S3 | [ ] | |
| V4 | Does a per-caller function (`authorize_tool_call`) take the caller (agent, user, tenant) and decide each tool call, with no wildcard grant of every tool, scope or permission? | S4 | [ ] | |
| V5 | Is a maximum authority declared per agent before the run and applied when the run starts, with self-granting operations (new credentials, keys, roles, service accounts, own scopes) removed? | S5 | [ ] | |
| V6 | Does every resource the agent creates go through `register_agent_resource` with an owner and expiry, and does a sweep outside the agent revoke it at run end or expiry? | S6 | [ ] | |
| V7 | Do negative tests call the real dispatcher and assert a denial, and that the tool did not run, for each case in Step 7, plus one allowed call? | S7 | [ ] | |
| V8 | Does authorization run in the tool layer or gateway on every tool call, with the caller taken from the authenticated session, and never in prompt text? | S4 | [ ] | |
