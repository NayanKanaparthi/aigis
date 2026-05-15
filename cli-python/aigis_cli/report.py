"""v2.1 — `aigis report` audit-ready compliance documentation.

Mirror of lib/report.js. Compiles a structured audit report from
`aigis verify --auto` results across one or more areas. Output is the
multi-framework traceability artifact for audit prep.

No LLM calls. No external HTTP. Aigis writes nothing into the user's source
code — the report is OUTPUT to stdout / --output path. Deterministic — same
project + same options (modulo timestamp) produces identical report.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import frontmatter

from .auto_verify import auto_verify_area

AREAS_DIR = Path(__file__).resolve().parent / "content" / "skills" / "areas"


def build_report(
    *,
    project_dir: str,
    areas: list[str],
    jurisdictions: list[str] | None = None,
    version: str | None = None,
    timestamp: datetime | None = None,
) -> dict:
    if not project_dir:
        raise ValueError("build_report: project_dir is required")
    if not areas:
        raise ValueError("build_report: areas must be a non-empty list of area ids")
    jurisdictions = jurisdictions or []
    ts = _iso_ms(timestamp)
    ver = version or _read_version()

    per_area: list[dict] = []
    agg = {"owasp": set(), "nist": set(), "iso42001": set(), "eu_ai_act": set()}
    totals = {"auto_pass": 0, "auto_fail": 0, "overclaims": 0, "judgment": 0}
    areas_fully_passing = 0

    for area in areas:
        try:
            result = auto_verify_area(area, project_dir, jurisdictions=jurisdictions)
        except Exception as e:
            per_area.append({
                "area": area,
                "status": "ERROR",
                "error": str(e),
                "cited_controls": None,
                "auto_checks": {},
                "overclaim_checks": {},
                "judgment_checks": {},
                "evidence": [],
            })
            continue

        s = result["summary"]
        if s["auto_fail"] == 0 and s["overclaims_raised"] == 0:
            status = "PASS" if s["auto_total"] > 0 else "NO_CHECKS"
        elif s["auto_pass"] > 0:
            status = "PARTIAL"
        else:
            status = "FAIL"
        if status == "PASS":
            areas_fully_passing += 1

        if result.get("cited_controls"):
            for fw, vs in result["cited_controls"].items():
                for v in vs:
                    agg[fw].add(v)

        totals["auto_pass"] += s["auto_pass"]
        totals["auto_fail"] += s["auto_fail"]
        totals["overclaims"] += s["overclaims_raised"]
        totals["judgment"] += s["judgment_required"]

        evidence: list[dict] = []
        for check_id, r in result["auto_checks"].items():
            if r.get("status") != "PASS":
                continue
            for e in (r.get("evidence") or [])[:3]:
                evidence.append({
                    "check_id": check_id,
                    "file": e["file"], "line": e["line"], "snippet": e["snippet"],
                })

        per_area.append({
            "area": area,
            "title": _read_area_title(area),
            "status": status,
            "summary": s,
            "cited_controls": result.get("cited_controls"),
            "auto_checks": result["auto_checks"],
            "overclaim_checks": result["overclaim_checks"],
            "judgment_checks": result["judgment_checks"],
            "evidence": evidence,
        })

    return {
        "generated_at": ts,
        "aigis_version": ver,
        "project_dir": project_dir,
        "user_jurisdictions": sorted(jurisdictions),
        "areas_requested": list(areas),
        "summary": {
            "areas_evaluated": len(areas),
            "areas_fully_passing": areas_fully_passing,
            "total_auto_pass": totals["auto_pass"],
            "total_auto_fail": totals["auto_fail"],
            "total_overclaims_raised": totals["overclaims"],
            "total_judgment_required": totals["judgment"],
            "cross_framework_coverage": {
                "owasp_count": len(agg["owasp"]),
                "nist_count": len(agg["nist"]),
                "iso42001_count": len(agg["iso42001"]),
                "eu_ai_act_count": len(agg["eu_ai_act"]),
            },
            "cross_framework_citations": {
                "owasp": sorted(agg["owasp"]),
                "nist": sorted(agg["nist"]),
                "iso42001": sorted(agg["iso42001"]),
                "eu_ai_act": sorted(agg["eu_ai_act"]),
            },
        },
        "per_area": per_area,
    }


def format_report_markdown(report: dict) -> str:
    L: list[str] = []
    L.append("# Aigis Compliance Report")
    L.append("")
    L.append(f"> Generated: {report['generated_at']}")
    L.append(f"> Aigis version: {report['aigis_version']}")
    L.append(f"> Project: `{report['project_dir']}`")
    if report["user_jurisdictions"]:
        L.append(f"> Jurisdictions in scope: {', '.join(report['user_jurisdictions'])}")
    else:
        L.append("> Jurisdictions in scope: (none — pass `--jurisdiction eu` to surface EU AI Act citations)")
    L.append("")
    L.append("> *This report is content output. Aigis writes nothing into your source code. The agent and the user remain responsible for what is submitted to auditors.*")
    L.append("")

    s = report["summary"]
    L.append("## Summary")
    L.append("")
    L.append(f"- Areas evaluated: **{s['areas_evaluated']}**")
    L.append(f"- Areas fully passing (no FAIL, no OVERCLAIM): **{s['areas_fully_passing']} / {s['areas_evaluated']}**")
    L.append(f"- Auto-checks: **{s['total_auto_pass']} PASS, {s['total_auto_fail']} FAIL** across all areas")
    L.append(f"- Overclaim recognizers raised: **{s['total_overclaims_raised']}**")
    L.append(f"- Judgment items requiring agent/human review: **{s['total_judgment_required']}**")
    L.append("")
    L.append("### Cross-framework coverage")
    L.append("")
    L.append("| Framework | Citations across all areas |")
    L.append("|---|---:|")
    L.append(f"| OWASP LLM Top 10 | {s['cross_framework_coverage']['owasp_count']} |")
    L.append(f"| NIST AI RMF | {s['cross_framework_coverage']['nist_count']} |")
    L.append(f"| ISO/IEC 42001 | {s['cross_framework_coverage']['iso42001_count']} |")
    eu_note = "" if "eu" in report["user_jurisdictions"] else " _(not surfaced — no EU jurisdiction)_"
    L.append(f"| EU AI Act | {s['cross_framework_coverage']['eu_ai_act_count']}{eu_note} |")
    L.append("")

    L.append("## Per-area results")
    L.append("")
    for a in report["per_area"]:
        L.append(f"### {a['area']}")
        if a.get("title"):
            L.append(f"*{a['title']}*")
        L.append("")
        if a["status"] == "ERROR":
            L.append(f"**Status: ERROR** — {a.get('error', '')}")
            L.append("")
            continue
        L.append(f"**Status: {a['status']}**")
        L.append("")
        sa = a["summary"]
        plural = "" if sa["judgment_required"] == 1 else "s"
        L.append(f"Verify breakdown: {sa['auto_pass']}/{sa['auto_total']} auto checks PASS, {sa['overclaims_raised']} overclaims raised, {sa['judgment_required']} judgment item{plural}")
        L.append("")
        c = a.get("cited_controls")
        if c:
            total = len(c["owasp"]) + len(c["nist"]) + len(c["iso42001"]) + len(c["eu_ai_act"])
            if total > 0:
                L.append("**Controls in scope:**")
                if c["owasp"]:    L.append(f"- OWASP LLM Top 10: {', '.join(f'`{v}`' for v in c['owasp'])}")
                if c["nist"]:     L.append(f"- NIST AI RMF: {', '.join(f'`{v}`' for v in c['nist'])}")
                if c["iso42001"]: L.append(f"- ISO/IEC 42001: {', '.join(f'`{v}`' for v in c['iso42001'])}")
                if c["eu_ai_act"]:L.append(f"- EU AI Act: {', '.join(f'`{v}`' for v in c['eu_ai_act'])}")
                L.append("")
        if a["evidence"]:
            L.append("**Evidence (file:line excerpts from PASS checks, max 3 per check):**")
            L.append("")
            for e in a["evidence"]:
                snippet = e["snippet"][:117] + "…" if len(e["snippet"]) > 120 else e["snippet"]
                snippet = snippet.replace("`", "\\`")
                L.append(f"- `{e['check_id']}` — `{e['file']}:{e['line']}` — `{snippet}`")
            L.append("")
        elif a["summary"]["auto_pass"] > 0:
            L.append("*Evidence collected but not surfaced here (PASS checks without grep-able evidence — e.g. config-file presence checks).*")
            L.append("")

        fails = [(k, r) for k, r in a["auto_checks"].items() if r.get("status") == "FAIL"]
        overs = [(k, r) for k, r in a["overclaim_checks"].items() if r.get("raised")]
        if fails or overs:
            L.append("**Open items in this area:**")
            L.append("")
            for k, r in fails:
                L.append(f"- ❌ FAIL `{k}` — {r.get('desc', '')}")
            for k, r in overs:
                L.append(f"- ⚠ OVERCLAIM `{k}` — {r.get('desc', '')} _(recognizer: {r.get('recognizer', '')})_")
            L.append("")
        L.append("---")
        L.append("")

    all_fails: list[dict] = []
    all_overs: list[dict] = []
    for a in report["per_area"]:
        for k, r in a.get("auto_checks", {}).items():
            if r.get("status") == "FAIL":
                all_fails.append({"area": a["area"], "id": k, "desc": r.get("desc", "")})
        for k, r in a.get("overclaim_checks", {}).items():
            if r.get("raised"):
                all_overs.append({"area": a["area"], "id": k, "desc": r.get("desc", ""), "recognizer": r.get("recognizer", "")})
    if all_fails or all_overs:
        L.append("## Aggregated open gaps")
        L.append("")
        if all_fails:
            L.append(f"### FAIL ({len(all_fails)})")
            L.append("")
            for f in all_fails:
                L.append(f"- **`{f['area']}` / `{f['id']}`** — {f['desc']}")
            L.append("")
        if all_overs:
            L.append(f"### OVERCLAIM ({len(all_overs)})")
            L.append("")
            for o in all_overs:
                L.append(f"- **`{o['area']}` / `{o['id']}`** — {o['desc']} _(recognizer: {o['recognizer']})_")
            L.append("")
    else:
        L.append("## Aggregated open gaps")
        L.append("")
        L.append("_No FAIL or OVERCLAIM signals across the evaluated areas._")
        L.append("")

    L.append("## Methodology")
    L.append("")
    L.append(f"This report was generated by `aigis report` (v{report['aigis_version']}) running deterministic regex-based scanners (`aigis verify <area> --auto`) against the project at `{report['project_dir']}`.")
    L.append("")
    L.append("- **Scanner**: heuristic regex patterns over project source files. Matches drive PASS / FAIL. See `content/index/auto-verify-rules.json` for the rule definitions.")
    L.append("- **Overclaim recognizers**: targeted detectors for known anti-patterns. When raised, the literal check passes but a stricter operational bar may not.")
    L.append("- **Judgment items**: not auto-gradable. The agent (or auditor) must evaluate.")
    L.append("- **Cross-framework citations**: each area's `controls` frontmatter declares which OWASP / NIST / ISO 42001 / EU AI Act controls it satisfies.")
    L.append("- **Jurisdiction gating**: EU AI Act citations are only surfaced when `--jurisdiction eu` was passed.")
    L.append("- **Determinism**: same project + same options + same Aigis version produces byte-identical reports (modulo the timestamp line).")
    L.append("")
    L.append("This report is content output. It is not a certification. EU AI Act conformity assessment requires notified-body involvement; this report is preparation material.")
    L.append("")

    return "\n".join(L)


def format_report_json(report: dict) -> str:
    return json.dumps(report, indent=2)


def _read_area_title(area_id: str) -> str | None:
    try:
        filepath = AREAS_DIR / f"{area_id}.md"
        if not filepath.exists():
            return None
        fm = frontmatter.loads(filepath.read_text(encoding="utf-8")).metadata
        return fm.get("title")
    except Exception:
        return None


def _iso_ms(timestamp: datetime | None) -> str:
    dt = timestamp or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _read_version() -> str:
    try:
        from . import __version__
        return __version__
    except Exception:
        return "unknown"
