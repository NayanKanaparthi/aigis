from __future__ import annotations

import re
from pathlib import Path

import frontmatter

from .annotate import get_annotations

CONTENT_DIR = Path(__file__).resolve().parent / "content"

SEPARATOR = "\n\n---\n\n"


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


def filter_language(content: str, lang: str | None) -> str:
    if not lang:
        return content
    remove = "javascript" if lang == "py" else "python"
    return re.sub(r"```" + remove + r"[\s\S]*?```\n?", "", content)


def append_annotations(content: str, file_id: str) -> str:
    annotations = get_annotations(file_id)
    if not annotations:
        return content
    block = "\n\n---\n## Local annotations\n\n"
    for a in annotations:
        block += f'- {a["note"]} _({a["date"]})_\n'
    return content + block


def get(file_ids: list[str] | None, *, all_files: bool = False,
        strip_fm: bool = True, lang: str | None = None) -> str:
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
