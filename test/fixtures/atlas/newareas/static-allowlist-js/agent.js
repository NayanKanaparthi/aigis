const ALLOWED = new Set(["calendar.read", "ticket.create"]);

function authorizeToolCall(caller, toolName, resource) {
  return ALLOWED.has(toolName);
}
