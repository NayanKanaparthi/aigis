ALLOWED = {"calendar.read", "ticket.create"}


def authorize_tool_call(caller, tool_name, resource):
    return tool_name in ALLOWED
