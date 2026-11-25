import re
import time

MAX_INPUT_LENGTH = 4000

def validate_input(value):
    if len(value) > MAX_INPUT_LENGTH:
        raise ValueError("input too long")
    if re.search(r"ignore previous instructions", value, re.I):
        raise ValueError("prompt injection")
    return value

def rate_limit(user_id, requests, window_seconds=60):
    now = time.time()
    recent = [stamp for stamp in requests.get(user_id, []) if now - stamp < window_seconds]
    if len(recent) >= 10:
        return {"status": 429, "retry_after": window_seconds}
    recent.append(now)
    requests[user_id] = recent
    return {"status": 200}
