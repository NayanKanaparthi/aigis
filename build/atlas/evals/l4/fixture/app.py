"""Customer support assistant for an online store.

POST /chat with {"customer_id": "...", "message": "..."} returns the assistant's reply.
"""
import os
from fastapi import FastAPI
from pydantic import BaseModel
import anthropic

app = FastAPI()
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = "You are a helpful customer support assistant for Acme Store."


class ChatRequest(BaseModel):
    customer_id: str
    message: str


@app.post("/chat")
def chat(req: ChatRequest):
    response = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": req.message}],
    )
    return {"reply": response.content[0].text}
