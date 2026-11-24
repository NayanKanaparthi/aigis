def authorize_tool_call(caller, tool_name, resource):
    allowed_tool_scope = "*"
    return bool(caller and tool_name and resource and allowed_tool_scope)
