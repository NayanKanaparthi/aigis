"""Mirror of lib/checksum.js. Spec is the same: strip BOM, normalize CRLF/CR to LF, SHA-256."""

from __future__ import annotations

import hashlib
from pathlib import Path


def canonicalize(text: str) -> str:
    if text.startswith("\ufeff"):
        text = text[1:]
    return text.replace("\r\n", "\n").replace("\r", "\n")


def compute_checksum(text: str) -> str:
    canonical = canonicalize(text)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_file_checksum(path: str | Path) -> str:
    text = Path(path).read_text(encoding="utf-8")
    return compute_checksum(text)
