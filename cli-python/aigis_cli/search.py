from __future__ import annotations

from pathlib import Path

import frontmatter

CONTENT_DIR = Path(__file__).resolve().parent / "content"


def _load_file_meta(directory: str) -> list[dict]:
    dirpath = CONTENT_DIR / directory
    if not dirpath.exists():
        return []

    results: list[dict] = []
    for filepath in sorted(dirpath.iterdir()):
        if filepath.suffix != ".md":
            continue
        raw = filepath.read_text(encoding="utf-8")
        parsed = frontmatter.loads(raw)
        basename = filepath.stem
        results.append({
            "id": parsed.metadata.get("id", basename),
            "title": parsed.metadata.get("title", basename),
            "controls": parsed.metadata.get("controls", {}),
            "dir": directory,
            "filename": filepath.name,
            "content": raw.lower(),
        })
    return results


def search(query: str) -> list[dict]:
    query_lower = query.lower()
    results: list[dict] = []

    all_files = _load_file_meta("implement") + _load_file_meta("templates")

    for f in all_files:
        matched_controls: list[str] = []

        title_match = query_lower in f["title"].lower()

        if f["controls"]:
            for framework, ids in f["controls"].items():
                for cid in (ids or []):
                    if query_lower in cid.lower():
                        matched_controls.append(f"{framework}:{cid}")

        content_match = query_lower in f["content"]

        if title_match or matched_controls or content_match:
            results.append({
                "id": f["id"],
                "title": f["title"],
                "dir": f["dir"],
                "matched_controls": matched_controls,
                "relevance": (3 if title_match else 0) + (len(matched_controls) * 2) + (1 if content_match else 0),
            })

    results.sort(key=lambda r: r["relevance"], reverse=True)
    return results


def list_all() -> dict[str, list[dict]]:
    return {
        "implement": [{"id": f["id"], "title": f["title"]} for f in _load_file_meta("implement")],
        "templates": [{"id": f["id"], "title": f["title"]} for f in _load_file_meta("templates")],
    }
