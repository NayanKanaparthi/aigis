def authorize_tool_call(caller, tool_name, resource):
    allowed_tool_scope = {"alice": {"calendar.read", "ticket.create"}, "bob": {"calendar.read"}}
    return resource is not None and tool_name in allowed_tool_scope.get(caller, set())
