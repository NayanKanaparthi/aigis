"""v3.0 `aigis threats`: a starting threat model for a system's entry points,
read from the vendored MITRE ATLAS catalog (SPEC S5). Mirror of lib/threats.js.

Scope comes from the approved trait -> entry-point map, not from the
mitigations the areas already cite (D5), so gaps can appear. Every
(technique, mitigation) pair printed is one of MITRE's direct `mitigates`
links (D6). Order is maturity, then MITRE case-study count, then id (D7).
No color, no timestamp, no network (D11).

The CLI (cli.py) only parses flags, calls these functions, prints and sets
the exit code. Input problems raise ThreatsInputError (exit 1); catalog
problems raise AtlasCatalogError (exit 2, see catalog_error_line).
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import atlas
from .atlas import AtlasCatalogError  # noqa: F401  (re-exported for the CLI)
from .build import assign_unique_slugs, normalize_description, resolve_traits
from .classify import ALL_TRAITS, classify
from .jurisdiction import filter_areas_by_jurisdiction, get_user_jurisdictions
from .keywords import detect_traits_from_text

DEFAULT_TOP = 10
MAX_TOP = 25
MAX_MITIGATION_LINES = 4
MAX_GAP_LINES = 8
MAX_REDTEAM = 5

MISSING_INPUT_LINES = [
    "Provide --traits, a quoted description, or both.",
    "Example: aigis threats --traits uses-llm,uses-rag,is-agentic",
    'Example: aigis threats "customer support agent that answers from our docs and can file tickets"',
]


class ThreatsInputError(Exception):
    exit_code = 1


# ── Input parsing ───────────────────────────────────────────────────────

def _split_traits(flag: Any) -> list[str]:
    if flag is None or flag is False:
        return []
    items = [t.strip() for t in str(flag).split(",")]
    return list(dict.fromkeys(t for t in items if t))


def parse_top(value: Any) -> int:
    """--top: an integer from 1 to 25, default 10. Raises ThreatsInputError."""
    if value is None:
        return DEFAULT_TOP
    text = str(value).strip()
    n = int(text) if re.fullmatch(r"[0-9]+", text) else None
    if n is None or n < 1 or n > MAX_TOP:
        raise ThreatsInputError("--top must be an integer from 1 to 25. The full catalog is at https://atlas.mitre.org.")
    return n


def resolve_threat_traits(description: str | None = None, traits_flag: Any = None) -> dict:
    """Resolve the final trait set (S5.2). Never prompts."""
    flag_traits = list(dict.fromkeys(traits_flag)) if isinstance(traits_flag, list) else _split_traits(traits_flag)
    normalized = normalize_description(description)

    if not flag_traits and not normalized:
        raise ThreatsInputError("\n".join(MISSING_INPUT_LINES))

    unknown = [t for t in flag_traits if t not in ALL_TRAITS]
    if unknown:
        raise ThreatsInputError(f'Unknown traits: {", ".join(unknown)}. Run "aigis traits" to see available traits.')

    from_description: list[str] = []
    uncertain: list[str] = []
    if normalized:
        detection = detect_traits_from_text(normalized)
        with_slugs = {**detection, "low_confidence_matches": assign_unique_slugs(detection["low_confidence_matches"])}
        resolved = resolve_traits(with_slugs, {}, uncertain_as_included=True)
        from_description = resolved["all_traits"]
        uncertain = resolved["uncertain_traits"]

    if not flag_traits and not from_description:
        raise ThreatsInputError('No traits resolved from description. Pass --traits <list> (run "aigis traits" to see them).')

    flag_set = set(flag_traits)
    traits = sorted(set(flag_traits) | set(from_description))
    uncertain_traits = sorted(t for t in uncertain if t not in flag_set)
    return {
        "traits": traits,
        "uncertain_traits": uncertain_traits,
        "description": normalized or None,
        "traits_flag": flag_traits,
    }


# ── Model ───────────────────────────────────────────────────────────────

def _recommended_areas_for(traits: list[str]) -> list[str]:
    result = classify(traits)
    return filter_areas_by_jurisdiction(result["implement_files"], get_user_jurisdictions(traits))


def build_threat_model(*, traits: list[str], uncertain_traits: list[str] | None = None,
                       description: str | None = None, traits_flag: list[str] | None = None,
                       top: Any = None, redteam: bool = False) -> dict:
    """Build the threat model (S5.3). Loads the catalog and the entry-point map
    first, so a broken install fails before any other work (AtlasCatalogError)."""
    catalog = atlas.load_catalog()
    entry_file = atlas.load_entry_points()
    shown_limit = DEFAULT_TOP if top is None else parse_top(top)

    final_traits = sorted(set(traits or []))
    uncertain_set = set(uncertain_traits or [])
    recommended_areas = list(_recommended_areas_for(final_traits))
    recommended_set = set(recommended_areas)
    areas_by_mitigation = atlas.mitigation_areas()

    # Entry points: one per final trait that the map knows, trait ascending.
    entry_points = []
    for t in final_traits:
        if t not in entry_file["entry_points"]:
            continue
        e = entry_file["entry_points"][t]
        surface = e.get("surface")
        entry_points.append({
            "trait": t,
            "surface": surface if isinstance(surface, str) and surface else t,
            "uncertain": t in uncertain_set,
            "techniques": list(e["techniques"]),
        })

    # In-scope techniques: union over entry points, sorted like compareTechniques.
    entry_traits_by_id: dict[str, list[str]] = {}
    for e in entry_points:
        for tid in e["techniques"]:
            entry_traits_by_id.setdefault(tid, []).append(e["trait"])
    scope = sorted((atlas.technique(tid) for tid in entry_traits_by_id), key=atlas.technique_sort_key)

    # Mitigations over ALL in-scope techniques (gaps, counts, unmitigated).
    mitigation_to_scope: dict[str, list[str]] = {}
    unmitigated: list[str] = []
    for t in scope:
        mids = atlas.mitigations_for_technique(t["id"])
        if not mids:
            unmitigated.append(t["id"])
        for m in mids:
            mitigation_to_scope.setdefault(m["id"], []).append(t["id"])

    def areas_of(mid: str) -> list[str]:
        return areas_by_mitigation.get(mid, [])

    gaps = [
        {"id": mid, "techniques": sorted(tids)}
        for mid, tids in mitigation_to_scope.items() if not areas_of(mid)
    ]
    gaps.sort(key=lambda g: (-len(g["techniques"]), g["id"]))
    with_area = sum(1 for mid in mitigation_to_scope if areas_of(mid))

    shown = [
        {
            "id": t["id"],
            "name": t["display_name"],
            "maturity": t["maturity"],
            "tactics": [{"id": x["id"], "name": x["name"]} for x in t["tactics"]],
            "entry_traits": sorted(entry_traits_by_id[t["id"]]),
            "case_studies": t["case_studies"],
            "mitigations": [
                {
                    "id": m["id"],
                    "areas": [{"id": a, "recommended": a in recommended_set} for a in areas_of(m["id"])],
                }
                for m in atlas.mitigations_for_technique(t["id"])
            ],
        }
        for t in scope[:shown_limit]
    ]

    used = {g["id"] for g in gaps} | {m["id"] for t in shown for m in t["mitigations"]}
    mitigation_names = {mid: catalog["mitigations"][mid]["name"] for mid in sorted(used)}

    model: dict[str, Any] = {
        "atlas": {
            "version": atlas.PINNED["version"],
            "disclaimer": atlas.DISCLAIMER,
            "source_sha256": atlas.PINNED["sha256"],
            "license": catalog["source"].get("license") or "Apache-2.0",
        },
        "input": {"description": description or None, "traits_flag": list(traits_flag or [])},
        "traits": final_traits,
        "uncertain_traits": [t for t in final_traits if t in uncertain_set],
        "entry_points": entry_points,
        "techniques_in_scope": len(scope),
        "techniques_shown": len(shown),
        "techniques": shown,
        "mitigation_names": mitigation_names,
        "gaps": gaps,
        "unmitigated_techniques": unmitigated,
        "mitigation_counts": {"in_scope": len(mitigation_to_scope), "with_area": with_area, "without_area": len(gaps)},
        "recommended_areas": recommended_areas,
    }
    if redteam:
        model["redteam"] = _build_redteam(model)
    return model


# ── Red-team stubs (S5.5, SHOULD) ───────────────────────────────────────

def _build_redteam(model: dict) -> list[dict]:
    surfaces = {e["trait"]: e["surface"] for e in model["entry_points"]}
    out = []
    for i, t in enumerate(model["techniques"][:MAX_REDTEAM]):
        trait = t["entry_traits"][0]
        out.append({
            "id": f"RT-{i + 1:02d}",
            "technique": t["id"],
            "name": t["name"],
            "maturity": t["maturity"],
            "tactics": [x["name"] for x in t["tactics"]],
            "entry_point": {"trait": trait, "surface": surfaces.get(trait)},
            "attempt": "TODO: write the concrete attack input for this system through this entry point.",
            "expected_defenses": [
                {"mitigation": m["id"], "areas": [a["id"] for a in m["areas"]]}
                for m in t["mitigations"] if m["areas"]
            ],
            "pass_criteria": "Blocked or contained, no unauthorized tool call or data leaves the system, and the attempt appears in the audit log.",
            "rerun_when": "Tools, write access, memory, data sources or the model change.",
        })
    return out


# ── Output ──────────────────────────────────────────────────────────────

def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _mitigation_line(m: dict, names: dict) -> str:
    if not m["areas"]:
        return f"   - {m['id']} {names[m['id']]} -> no Aigis area"
    areas = ", ".join(a["id"] if a["recommended"] else f"{a['id']} (not in your brief)" for a in m["areas"])
    return f"   - {m['id']} {names[m['id']]} -> {areas}"


def format_threats_text(model: dict) -> str:
    names = model["mitigation_names"]
    L: list[str] = []
    L.append(f"# Aigis threat model (MITRE ATLAS v{model['atlas']['version']})")
    L.append("")
    L.append(f"> {model['atlas']['disclaimer']}")
    L.append("> This is a starting list from your traits, not proof of coverage. Method: `aigis template threat-model`.")
    L.append("")
    L.append(f"Traits ({len(model['traits'])}): {', '.join(model['traits'])}")
    if model["uncertain_traits"]:
        L.append(f"Uncertain traits ({len(model['uncertain_traits'])}, marked ⚠): {', '.join(model['uncertain_traits'])}")
    L.append("Missing a trait? Rerun with --traits (see `aigis traits`).")
    L.append("")

    L.append(f"## Entry points ({len(model['entry_points'])})")
    L.append("")
    if not model["entry_points"]:
        L.append("No ATLAS entry points are mapped for these traits.")
    else:
        for e in model["entry_points"]:
            mark = "⚠ " if e["uncertain"] else ""
            L.append(f"- {mark}{e['trait']}: {e['surface']} ({_plural(len(e['techniques']), 'technique')})")
    L.append("")

    L.append(f"## Techniques (showing {model['techniques_shown']} of {model['techniques_in_scope']}; Realized first, then by number of MITRE case studies)")
    L.append("")
    if not model["techniques"]:
        L.append("- None for these traits.")
    for i, t in enumerate(model["techniques"]):
        tactics = ", ".join(x["name"] for x in t["tactics"])
        L.append(f"{i + 1}. {t['id']} {t['name']} [{t['maturity']}] | tactic: {tactics} | entry: {', '.join(t['entry_traits'])} | case studies: {t['case_studies']}")
        if not t["mitigations"]:
            L.append("   - No mitigation listed by MITRE for this technique.")
            continue
        ordered = [m for m in t["mitigations"] if m["areas"]] + [m for m in t["mitigations"] if not m["areas"]]
        for m in ordered[:MAX_MITIGATION_LINES]:
            L.append(_mitigation_line(m, names))
        if len(ordered) > MAX_MITIGATION_LINES:
            L.append(f"   - +{len(ordered) - MAX_MITIGATION_LINES} more mitigations (use --json)")
    L.append("")

    L.append(f"## Gaps: mitigations MITRE links to these techniques that no Aigis area implements ({len(model['gaps'])})")
    L.append("")
    if not model["gaps"]:
        L.append("- None for these techniques.")
    else:
        for g in model["gaps"][:MAX_GAP_LINES]:
            L.append(f"- {g['id']} {names[g['id']]} (MITRE links it to {', '.join(g['techniques'])})")
        if len(model["gaps"]) > MAX_GAP_LINES:
            L.append(f"- +{len(model['gaps']) - MAX_GAP_LINES} more (use --json)")
    L.append("")

    if model.get("redteam"):
        L.append(f"## Red-team test stubs ({len(model['redteam'])})")
        L.append("")
        for r in model["redteam"]:
            if r["expected_defenses"]:
                defenses = "; ".join(f"{d['mitigation']} -> {', '.join(d['areas'])}" for d in r["expected_defenses"])
            else:
                defenses = "none with an Aigis area (see Gaps)"
            L.append(f"{r['id']} {r['technique']} {r['name']} [{r['maturity']}] | entry: {r['entry_point']['trait']} ({r['entry_point']['surface']})")
            L.append(f"   - Attempt: {r['attempt']}")
            L.append(f"   - Expected defenses: {defenses}")
            L.append(f"   - Pass: {r['pass_criteria']}")
            L.append(f"   - Rerun when: {r['rerun_when']}")
        L.append("")

    L.append("## Next")
    L.append("")
    L.append('- Fetch the areas named above with `aigis get <area>`. "(not in your brief)" means classify did not recommend that area for these traits.')
    L.append("- Fill in the method: `aigis template threat-model`.")
    if "redteam" not in model:
        L.append("- Test-case stubs: rerun with `--redteam`.")
    L.append("- Rerun when you add tools, write access, memory or a data source, before launch, and after an incident.")
    return "\n".join(L) + "\n"


def format_threats_json(model: dict) -> str:
    return json.dumps(model, indent=2, ensure_ascii=False) + "\n"


def catalog_error_line(err: AtlasCatalogError) -> str:
    """The single stderr line for a catalog or entry-point failure (S5.6, exit 2)."""
    return f"ATLAS catalog unavailable: {err.file} {err.code}. Reinstall the aigis package."
