def execute_next_step(model, tools, request):
    decision = model.choose(request)
    return tools[decision.name](**decision.arguments)
