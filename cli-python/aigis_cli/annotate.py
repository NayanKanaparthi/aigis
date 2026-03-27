from __future__ import annotations

import json
from datetime import date
from pathlib import Path

AIGIS_DIR = Path.home() / ".aigis"
ANNOTATIONS_FILE = AIGIS_DIR / "annotations.json"


def _load_annotations() -> dict:
    if not ANNOTATIONS_FILE.exists():
        return {}
    try:
        return json.loads(ANNOTATIONS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_annotations(data: dict) -> None:
    AIGIS_DIR.mkdir(parents=True, exist_ok=True)
    ANNOTATIONS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def annotate(file_id: str, note: str) -> None:
    data = _load_annotations()
    data.setdefault(file_id, []).append({
        "note": note,
        "date": date.today().isoformat(),
    })
    _save_annotations(data)


def get_annotations(file_id: str) -> list[dict]:
    return _load_annotations().get(file_id, [])


def list_annotations() -> dict:
    return _load_annotations()


def clear_annotation(file_id: str) -> None:
    data = _load_annotations()
    data.pop(file_id, None)
    _save_annotations(data)
