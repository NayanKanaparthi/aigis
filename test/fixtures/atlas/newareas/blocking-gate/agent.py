def gate_tool_call(trust_level, tool_name):
    if trust_level == "untrusted":
        raise PermissionError(f"tool blocked: {tool_name}")
    return True
