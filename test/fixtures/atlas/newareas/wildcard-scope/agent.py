def authorize_tool_call(caller, tool_name, resource):
    allowed_tool_scope = {"alice": "*", "bob": "*"}
    return resource is not None and allowed_tool_scope.get(caller) in ("*", tool_name)
