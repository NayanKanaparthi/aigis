"""v2.1 — Jurisdiction filtering for areas and brief content.

Mirror of lib/jurisdiction.js. See that file for the design rationale.
The classify layer is jurisdiction-blind; the consumer layer (CLI commands +
brief assembly) applies the filter.

Three pure functions:
  - get_user_jurisdictions(traits)
  - filter_areas_by_jurisdiction(areas, user_jurisdictions)
  - strip_jurisdiction_gated_sections(content, user_jurisdictions)

No I/O beyond the area-frontmatter read. Same inputs → same outputs.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

import frontmatter

AREAS_DIR = Path(__file__).resolve().parent / "content" / "skills" / "areas"

# Map from trait id → jurisdiction code stored in frontmatter `jurisdiction:`.
# Mirror of TRAIT_TO_JURISDICTION in lib/jurisdiction.js.
TRAIT_TO_JURISDICTION = {
    "jurisdiction-eu": "eu",
    "jurisdiction-us-regulated": "us-regulated",
    # "jurisdiction-global" deliberately omitted (meta-trait, no specific gate).
}


def get_user_jurisdictions(traits: Iterable[str] | None) -> set[str]:
    """Derive the user's jurisdiction set from their resolved trait set."""
    out: set[str] = set()
    for t in traits or []:
        j = TRAIT_TO_JURISDICTION.get(t)
        if j:
            out.add(j)
    return out


def read_area_jurisdictions(area_id: str) -> list[str] | None:
    """Read area frontmatter `jurisdiction:` field.

    Returns None if the area has no jurisdiction field (universal area), or
    on missing file / parse failure (fail-open).
    """
    try:
        filepath = AREAS_DIR / f"{area_id}.md"
        if not filepath.exists():
            return None
        fm = frontmatter.loads(filepath.read_text(encoding="utf-8")).metadata
        j = fm.get("jurisdiction")
        if not j:
            return None
        return list(j) if isinstance(j, list) else None
    except Exception:
        return None


def filter_areas_by_jurisdiction(
    areas: list[str],
    user_jurisdictions: Iterable[str] | set[str],
) -> list[str]:
    """Filter areas by user's jurisdiction set.

    - Areas with no `jurisdiction:` field are kept (universal).
    - Areas with `jurisdiction:` are kept only if at least one declared
      jurisdiction is in user_jurisdictions.

    Returns a new list preserving original order.
    """
    user_j = user_jurisdictions if isinstance(user_jurisdictions, set) else set(user_jurisdictions or [])
    out: list[str] = []
    for a in areas:
        declared = read_area_jurisdictions(a)
        if declared is None:
            out.append(a)  # universal
            continue
        if any(j in user_j for j in declared):
            out.append(a)
    return out


_EU_HEADING_RE = re.compile(r"^## EU AI Act extensions\s*$")
_H2_RE = re.compile(r"^## ")
_TRIPLE_NEWLINE_RE = re.compile(r"\n{3,}")


def strip_jurisdiction_gated_sections(
    content: str,
    user_jurisdictions: Iterable[str] | set[str],
) -> str:
    """Remove `## EU AI Act extensions` sections for non-EU users.

    Line-by-line walker, mirrors lib/jurisdiction.js for byte-identical
    output across Node and Python.
    """
    user_j = user_jurisdictions if isinstance(user_jurisdictions, set) else set(user_jurisdictions or [])
    if "eu" in user_j:
        return content
    lines = content.split("\n")
    out: list[str] = []
    in_eu_section = False
    for line in lines:
        if _EU_HEADING_RE.match(line):
            in_eu_section = True
            continue
        if in_eu_section and _H2_RE.match(line):
            in_eu_section = False
        if not in_eu_section:
            out.append(line)
    return _TRIPLE_NEWLINE_RE.sub("\n\n", "\n".join(out))
