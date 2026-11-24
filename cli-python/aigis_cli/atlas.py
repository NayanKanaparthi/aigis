"""v3.0 MITRE ATLAS lookups over the vendored catalog. Mirror of lib/atlas.js.

Aigis owns two small judgments (D1): area -> ATLAS mitigations
(`controls.atlas` in area frontmatter) and trait -> entry-point techniques
(`content/index/atlas-entry-points.json`). Everything else (names, maturity,
tactics, mitigation -> technique links, case-study counts) is read from
`content/index/atlas.json`.

Rules (same as Node):
  - Only MITRE's direct `mitigates` links are used (D6). No parent or child
    inheritance.
  - Ordering is maturity, then MITRE case-study count descending, then id
    (D7). ATLAS does not rank threats and this module adds no ranking.
  - Pure, synchronous, cached per path. No network, no clock, no randomness.
    Every returned list or dict is a fresh copy.
  - Load failures raise AtlasCatalogError; callers that must keep working
    without ATLAS wrap their ATLAS code in with_atlas (D12).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

_CONTENT_DIR = Path(__file__).resolve().parent / "content"
CATALOG_PATH = _CONTENT_DIR / "index" / "atlas.json"
ENTRY_POINTS_PATH = _CONTENT_DIR / "index" / "atlas-entry-points.json"
AREAS_DIR = _CONTENT_DIR / "skills" / "areas"

PINNED = {
    "version": "2026.10",
    "sha256": "ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d",
}

# The only place this sentence is typed in Python runtime code (S0, AC14).
DISCLAIMER = 'MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.'

MATURITY_RANK = {"Realized": 0, "Demonstrated": 1, "Feasible": 2}
_CATALOG_KEYS = ["source", "counts", "tactics", "techniques", "mitigations"]


class AtlasCatalogError(Exception):
    def __init__(self, message: str, file: str, code: str):
        super().__init__(message)
        self.file = file
        self.code = code


# ── Loading ─────────────────────────────────────────────────────────────

_catalog_cache: dict[str, Any] = {}
_entry_point_cache: dict[str, Any] = {}
_index_cache: dict[int, dict[str, list[str]]] = {}
_area_cache: dict[str, dict[str, list[str]]] = {}


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _read_json(filepath: Path, file: str) -> Any:
    try:
        raw = filepath.read_text(encoding="utf-8")
    except (FileNotFoundError, NotADirectoryError):
        raise AtlasCatalogError(f"Cannot read ATLAS {file} at {filepath}", file, "missing") from None
    except Exception:
        raise AtlasCatalogError(f"Cannot read ATLAS {file} at {filepath}", file, "corrupt") from None
    try:
        return json.loads(raw)
    except Exception:
        raise AtlasCatalogError(f"ATLAS {file} at {filepath} is not valid JSON", file, "corrupt") from None


def load_catalog(path: str | Path | None = None) -> dict:
    filepath = Path(path or CATALOG_PATH).resolve()
    key = str(filepath)
    if key in _catalog_cache:
        return _catalog_cache[key]

    data = _read_json(filepath, "catalog")
    shape_ok = (
        _is_object(data)
        and all(k in data for k in _CATALOG_KEYS)
        and _is_object(data["source"]) and _is_object(data["counts"]) and isinstance(data["tactics"], list)
        and _is_object(data["techniques"]) and _is_object(data["mitigations"])
    )
    if not shape_ok:
        raise AtlasCatalogError(f"ATLAS catalog at {filepath} is missing top-level keys", "catalog", "corrupt")
    if data["source"].get("version") != PINNED["version"] or data["source"].get("sha256") != PINNED["sha256"]:
        raise AtlasCatalogError(
            f"ATLAS catalog at {filepath} is not the pinned release {PINNED['version']}", "catalog", "pin-mismatch")
    _catalog_cache[key] = data
    return data


def load_entry_points(path: str | Path | None = None) -> dict:
    filepath = Path(path or ENTRY_POINTS_PATH).resolve()
    key = str(filepath)
    if key in _entry_point_cache:
        return _entry_point_cache[key]

    data = _read_json(filepath, "entry-points")

    def corrupt(why: str) -> AtlasCatalogError:
        return AtlasCatalogError(f"ATLAS entry points at {filepath}: {why}", "entry-points", "corrupt")

    if not _is_object(data) or not _is_object(data.get("entry_points")):
        raise corrupt("missing entry_points")

    from .classify import ALL_TRAITS  # lazy: classify imports this module
    catalog = load_catalog()
    for trait, entry in data["entry_points"].items():
        if trait not in ALL_TRAITS:
            raise corrupt(f"unknown trait {trait}")
        if not _is_object(entry) or not isinstance(entry.get("techniques"), list):
            raise corrupt(f"trait {trait} has no techniques list")
        for tid in entry["techniques"]:
            if not isinstance(tid, str) or tid not in catalog["techniques"]:
                raise corrupt(f"trait {trait} names unknown technique {tid}")
    if data.get("atlas_version") != PINNED["version"]:
        raise AtlasCatalogError(
            f"ATLAS entry points at {filepath} target {data.get('atlas_version')}, not {PINNED['version']}",
            "entry-points", "pin-mismatch")
    _entry_point_cache[key] = data
    return data


def _mitigation_index(catalog: dict) -> dict[str, list[str]]:
    """Reverse index technique -> direct mitigation ids, built once per catalog."""
    cid = id(catalog)
    if cid in _index_cache:
        return _index_cache[cid]
    index: dict[str, list[str]] = {}
    for mid in sorted(catalog["mitigations"].keys()):
        for tid in catalog["mitigations"][mid].get("techniques") or []:
            index.setdefault(tid, []).append(mid)
    _index_cache[cid] = index
    return index


# ── Catalog lookups ─────────────────────────────────────────────────────

def technique(tid: Any) -> dict | None:
    catalog = load_catalog()
    if not isinstance(tid, str) or tid not in catalog["techniques"]:
        return None
    t = catalog["techniques"][tid]
    parent = t.get("parent") or None
    parent_entry = catalog["techniques"].get(parent) if parent else None
    tactic_names = {x["id"]: x["name"] for x in catalog["tactics"]}
    return {
        "id": tid,
        "name": t["name"],
        "display_name": f"{parent_entry['name']}: {t['name']}" if parent_entry else t["name"],
        "maturity": t.get("maturity"),
        "tactics": [{"id": x, "name": tactic_names.get(x, x)} for x in (t.get("tactics") or [])],
        "parent": parent,
        "case_studies": t.get("case_studies") or 0,
    }


def mitigation(mid: Any) -> dict | None:
    catalog = load_catalog()
    if not isinstance(mid, str) or mid not in catalog["mitigations"]:
        return None
    m = catalog["mitigations"][mid]
    return {"id": mid, "name": m["name"], "techniques": list(m.get("techniques") or [])}


def mitigations_for_technique(tid: str) -> list[dict]:
    catalog = load_catalog()
    mids = _mitigation_index(catalog).get(tid, [])
    return [{"id": mid, "name": catalog["mitigations"][mid]["name"]} for mid in mids]


def technique_sort_key(t: dict) -> tuple:
    """Sort key equal to Node's compareTechniques."""
    return (MATURITY_RANK.get(t.get("maturity"), 3), -(t.get("case_studies") or 0), t["id"])


def techniques_for_mitigations(ids: list[str] | None) -> list[str]:
    catalog = load_catalog()
    seen: dict[str, None] = {}
    for mid in ids or []:
        if not isinstance(mid, str) or mid not in catalog["mitigations"]:
            continue
        for tid in catalog["mitigations"][mid].get("techniques") or []:
            if tid in catalog["techniques"]:
                seen[tid] = None
    return [t["id"] for t in sorted((technique(tid) for tid in seen), key=technique_sort_key)]


# ── Area labels (frontmatter controls.atlas) ────────────────────────────

def _areas_dir_of(areas_dir: str | Path | None) -> str:
    return str(Path(areas_dir or AREAS_DIR).resolve())


def _area_labels(d: str) -> dict[str, list[str]]:
    if d in _area_cache:
        return _area_cache[d]
    import frontmatter

    labels: dict[str, list[str]] = {}
    try:
        files = sorted(p.name for p in Path(d).iterdir() if p.name.endswith(".md"))
    except OSError:
        files = []
    for name in files:
        ids: list[str] = []
        try:
            fm = frontmatter.loads((Path(d) / name).read_text(encoding="utf-8")).metadata
            controls = fm.get("controls") if isinstance(fm, dict) else None
            atlas = controls.get("atlas") if isinstance(controls, dict) else None
            if isinstance(atlas, list):
                ids = sorted({x for x in atlas if isinstance(x, str)})
        except Exception:
            ids = []
        labels[name[: -len(".md")]] = ids
    _area_cache[d] = labels
    return labels


def area_mitigations(area_id: str, areas_dir: str | Path | None = None) -> list[str]:
    return list(_area_labels(_areas_dir_of(areas_dir)).get(area_id, []))


def mitigation_areas(areas_dir: str | Path | None = None) -> dict[str, list[str]]:
    reverse: dict[str, list[str]] = {}
    for area_id, mids in _area_labels(_areas_dir_of(areas_dir)).items():
        for mid in mids:
            reverse.setdefault(mid, []).append(area_id)
    return {mid: sorted(reverse[mid]) for mid in sorted(reverse)}


def summarize_areas(area_ids: list[str] | None, areas_dir: str | Path | None = None) -> dict:
    catalog = load_catalog()
    mids: set[str] = set()
    for area_id in area_ids or []:
        for mid in area_mitigations(area_id, areas_dir):
            if mid in catalog["mitigations"]:
                mids.add(mid)
    sorted_mids = sorted(mids)
    techniques = [technique(tid) for tid in techniques_for_mitigations(sorted_mids)]

    def count(m: str) -> int:
        return sum(1 for t in techniques if t["maturity"] == m)

    return {
        "version": PINNED["version"],
        "disclaimer": DISCLAIMER,
        "mitigations": [{"id": mid, "name": catalog["mitigations"][mid]["name"]} for mid in sorted_mids],
        "techniques_addressed": {
            "total": len(techniques),
            "realized": count("Realized"),
            "demonstrated": count("Demonstrated"),
            "feasible": count("Feasible"),
        },
        "top_techniques": [
            {"id": t["id"], "name": t["display_name"], "maturity": t["maturity"]} for t in techniques[:2]
        ],
    }


# ── Fail-soft wrapper (D12) ─────────────────────────────────────────────

_warned_default = False


def _default_warn(message: str) -> None:
    global _warned_default
    if _warned_default:
        return
    _warned_default = True
    sys.stderr.write(f"{message}\n")


def with_atlas(fn: Callable[[], Any], fallback: Any, warn: Callable[[str], None] | None = None) -> Any:
    try:
        return fn()
    except AtlasCatalogError as err:
        (warn or _default_warn)(f"aigis: ATLAS catalog unavailable ({err.file} {err.code}); ATLAS output omitted")
        return fallback
