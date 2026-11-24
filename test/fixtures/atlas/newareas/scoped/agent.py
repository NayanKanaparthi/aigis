def authorize_tool_call(caller, tool_name, resource):
    allowed_tool_scope = {"calendar.read", "ticket.create"}
    return bool(caller and resource and tool_name in allowed_tool_scope)
