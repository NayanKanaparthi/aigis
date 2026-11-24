---
id: checklist-agent-tool-safety
implements: agent-tool-safety
---
# Verification: Tool invocation safety, tool input and output validation, scope drift

| # | Check | Control | Status | Evidence |
|---|-------|---------|--------|----------|
| V1 | Is every item added to the model context recorded with a `trust_level`, and does one untrusted item taint the rest of the turn? | S1 | [ ] | |
| V2 | While untrusted data is in context, does a gate (`gate_tool_call`) deny side-effect tools or hold them for human approval, rather than only logging? | S2 | [ ] | |
| V3 | Are tool arguments checked against a schema by `validate_tool_args` before the tool runs, with the call rejected on failure? | S3 | [ ] | |
| V4 | Are tool results and retrieved data passed through `sanitize_tool_output` (or `validate_tool_output`), which rejects or cleans them before they re-enter the context? | S4 | [ ] | |
| V5 | Is each planned action checked by `check_scope_drift` against the authorized objective, with drift stopping the call? | S5 | [ ] | |
| V6 | If the agent keeps persistent memory: are writes attributed (source, trust label, tenant, user), stored as facts rather than instructions, and are recalls filtered by tenant and user? Not applicable without persistent memory. | S6 | [ ] | |
| V7 | Do injection and drift tests use the real dispatcher, and does each fail when its control is removed? | S7 | [ ] | |
