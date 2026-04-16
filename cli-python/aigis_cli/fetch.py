from __future__ import annotations

import json
import re
from pathlib import Path

import frontmatter

from .annotate import get_annotations

CONTENT_DIR = Path(__file__).resolve().parent / "content"

SEPARATOR = "\n\n---\n\n"

# Language canonicalization — mirrors lib/fetch.js.
_LANG_ALIASES = {
    "py": "python", "python": "python",
    "js": "javascript", "javascript": "javascript", "node": "javascript",
    "ts": "typescript", "typescript": "typescript",
    "go": "go", "golang": "go",
    "rust": "rust", "rs": "rust",
}
_LANG_FENCE_KEEPS = {
    "python": {"python", "py"},
    "javascript": {"javascript", "js", "node"},
    "typescript": {"typescript", "ts", "javascript", "js"},
    "go": {"go"},
    "rust": {"rust", "rs"},
}
_ALL_LANG_FENCES = {"python", "py", "javascript", "js", "node", "typescript", "ts", "go", "rust", "rs"}

_VALID_CONTEXTS = {"web", "agentic", "rag", "batch"}
_context_rules_cache: dict | None = None


def read_file(directory: str, file_id: str) -> str:
    filepath = CONTENT_DIR / directory / f"{file_id}.md"
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {directory}/{file_id}.md")
    return filepath.read_text(encoding="utf-8")


def list_dir(directory: str) -> list[str]:
    dirpath = CONTENT_DIR / directory
    if not dirpath.exists():
        return []
    return sorted(
        p.stem for p in dirpath.iterdir() if p.suffix == ".md"
    )


def strip_frontmatter(content: str) -> str:
    parsed = frontmatter.loads(content)
    return parsed.content.strip()


def _canonicalize_lang(lang: str | None) -> str | None:
    if not lang:
        return None
    normalized = lang.lower()
    canonical = _LANG_ALIASES.get(normalized)
    if not canonical:
        raise ValueError(
            f'Unknown language "{lang}". Known: py, python, js, javascript, ts, typescript, go, rust.'
        )
    return canonical


def filter_language(content: str, lang: str | None) -> str:
    canonical = _canonicalize_lang(lang)
    if not canonical:
        return content
    keep_set = _LANG_FENCE_KEEPS[canonical]

    block_re = re.compile(r"^```([A-Za-z0-9_+-]*)\s*\n[\s\S]*?^```\s*$\n?", re.MULTILINE)

    def _sub(m: re.Match[str]) -> str:
        tag = (m.group(1) or "").lower()
        if tag not in _ALL_LANG_FENCES:
            return m.group(0)
        return m.group(0) if tag in keep_set else ""

    out = block_re.sub(_sub, content)
    return re.sub(r"\n{3,}", "\n\n", out)


def _load_context_rules() -> dict:
    global _context_rules_cache
    if _context_rules_cache is not None:
        return _context_rules_cache
    rules_path = CONTENT_DIR / "index" / "context-rules.json"
    if not rules_path.exists():
        _context_rules_cache = {"rules": []}
        return _context_rules_cache
    _context_rules_cache = json.loads(rules_path.read_text(encoding="utf-8"))
    return _context_rules_cache


def _canonicalize_context(context: str | None) -> str | None:
    if not context:
        return None
    normalized = context.lower()
    if normalized not in _VALID_CONTEXTS:
        raise ValueError(
            f'Unknown context "{context}". Known: web, agentic, rag, batch.'
        )
    return normalized


def filter_context(content: str, context: str | None, file_id: str) -> str:
    canonical = _canonicalize_context(context)
    if not canonical:
        return content

    rules = _load_context_rules().get("rules", [])
    file_rules = [r for r in rules if r.get("file") == file_id]
    if not file_rules:
        return content

    lines = content.split("\n")
    keep = [True] * len(lines)
    for rule in file_rules:
        if canonical in rule["contexts"]:
            continue  # pattern applies to this context; keep
        prefix = re.escape(rule["pattern_heading_prefix"])
        header_re = re.compile(r"^###\s+" + prefix + r"\b")
        i = 0
        while i < len(lines):
            if header_re.match(lines[i]):
                j = i
                while j < len(lines):
                    if j > i and re.match(r"^(##\s|###\s)", lines[j]):
                        break
                    keep[j] = False
                    j += 1
                i = j
                continue
            i += 1

    filtered = "\n".join(ln for ln, k in zip(lines, keep) if k)
    return re.sub(r"\n{3,}", "\n\n", filtered)


def append_annotations(content: str, file_id: str) -> str:
    annotations = get_annotations(file_id)
    if not annotations:
        return content
    block = "\n\n---\n## Local annotations\n\n"
    for a in annotations:
        block += f'- {a["note"]} _({a["date"]})_\n'
    return content + block


def get(file_ids: list[str] | None, *, all_files: bool = False,
        strip_fm: bool = True, lang: str | None = None,
        context: str | None = None) -> str:
    if all_files:
        file_ids = list_dir("implement")

    if not file_ids:
        raise ValueError('Provide file IDs or use --all. Run "aigis search --list" to see available files.')

    outputs: list[str] = []
    for fid in file_ids:
        content = read_file("implement", fid)
        if not strip_fm:
            content = strip_frontmatter(content)
        if lang:
            content = filter_language(content, lang)
        if context:
            content = filter_context(content, context, fid)
        content = append_annotations(content, fid)
        outputs.append(content)

    return SEPARATOR.join(outputs)


def verify(file_ids: list[str]) -> str:
    if not file_ids:
        raise ValueError("Provide file IDs to verify.")

    outputs: list[str] = []
    for fid in file_ids:
        content = read_file("verify", f"checklist-{fid}")
        outputs.append(content)

    return SEPARATOR.join(outputs)


def get_template(template_ids: list[str]) -> str:
    if not template_ids:
        raise ValueError("Provide template IDs.")

    outputs: list[str] = []
    for tid in template_ids:
        content = read_file("templates", tid)
        outputs.append(content)

    return SEPARATOR.join(outputs)


def get_audit_scan() -> str:
    return read_file("index", "audit-scan")
