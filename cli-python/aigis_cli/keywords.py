"""Mirror of lib/keywords.js — the resolver.

Loads content/resolvers/triggers.json and provides:
  - detect_traits_from_text(text): returns high/low matches + auto-applied traits
  - apply_confirmations(detection, decisions): merges low-confidence yes answers

The two-tier match logic is identical to the JS implementation.
"""

from __future__ import annotations

import json
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent / "content"
TRIGGERS_PATH = CONTENT_DIR / "resolvers" / "triggers.json"

_cache: dict | None = None


def load_triggers() -> dict:
    global _cache
    if _cache is None:
        _cache = json.loads(TRIGGERS_PATH.read_text(encoding="utf-8"))
    return _cache


def detect_traits_from_text(text: str) -> dict:
    triggers = load_triggers()
    text_lower = text.lower()

    high_matches = []
    auto_traits: set[str] = set()
    for phrase, entry in triggers["high_confidence"].items():
        if phrase.lower() in text_lower:
            high_matches.append({"phrase": phrase, "traits": list(entry["traits"])})
            for t in entry["traits"]:
                auto_traits.add(t)

    low_matches = []
    next_id = 1
    for phrase, entry in triggers["low_confidence"].items():
        if phrase.lower() in text_lower:
            low_matches.append({
                "id": str(next_id),
                "phrase": phrase,
                "traits": list(entry["traits"]),
                "confirmation_prompt": entry["confirmation_prompt"],
                "notes": entry["notes"],
            })
            next_id += 1

    return {
        "high_confidence_matches": high_matches,
        "low_confidence_matches": low_matches,
        "traits_auto_applied": list(auto_traits),
    }


def apply_confirmations(detection: dict, decisions: dict | None = None) -> dict:
    decisions = decisions or {}
    final = set(detection["traits_auto_applied"])
    user_decisions = []
    for sug in detection["low_confidence_matches"]:
        decision = (decisions.get(sug["id"], "no") or "no").lower()
        user_decisions.append({**sug, "user_decision": decision})
        if decision in ("yes", "y"):
            for t in sug["traits"]:
                final.add(t)
    return {
        "final_traits": sorted(final),
        "low_confidence_decisions": user_decisions,
    }
