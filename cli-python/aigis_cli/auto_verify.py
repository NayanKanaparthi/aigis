"""Deterministic scanner for `aigis verify <area> --auto <path>`.

Python mirror of lib/auto-verify.js. The rules file (content/index/
auto-verify-rules.json) is shared — behavior must stay identical between
runtimes. Special recognizers live below as functions.

Philosophy: heuristic regex over project source files. Goal is catching
common overclaim patterns, not bulletproof static analysis.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_THIS_DIR = Path(__file__).resolve().parent
_CONTENT_DIR = _THIS_DIR / "content"

DEFAULT_INCLUDE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs",
    ".go", ".rb", ".java", ".kt",
}
DEFAULT_CONFIG_FILES = {
    "package.json", "requirements.txt", "pyproject.toml", "Pipfile",
    "Pipfile.lock", "poetry.lock", "go.mod", "Gemfile", "Gemfile.lock",
    "pom.xml",
}
SKIP_DIRS = {
    "node_modules", ".venv", "venv", "env", "__pycache__", ".pytest_cache",
    "dist", "build", ".git", ".tox", "target", "coverage", ".next", ".nuxt",
    ".cache", ".idea", ".vscode",
}


def _rules_path() -> Path:
    return _CONTENT_DIR / "index" / "auto-verify-rules.json"


def load_rules() -> dict[str, Any]:
    raw = _rules_path().read_text(encoding="utf-8")
    parsed = json.loads(raw)
    return {k: v for k, v in parsed.items() if not k.startswith("_schema_")}


def _walk_files(root_dir: Path):
    stack = [root_dir]
    while stack:
        d = stack.pop()
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir():
                if entry.name in SKIP_DIRS or entry.name.startswith("."):
                    continue
                stack.append(entry)
            elif entry.is_file():
                if entry.suffix in DEFAULT_INCLUDE_EXTS or entry.name in DEFAULT_CONFIG_FILES:
                    yield entry


def _load_files(root_dir: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in _walk_files(root_dir):
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        out.append({"path": str(p.relative_to(root_dir)), "absolutePath": str(p), "content": content})
    return out


def _matches_glob(file_path: str, glob: str) -> bool:
    norm = file_path.replace("\\", "/")
    pattern = glob.replace("\\", "/")
    out = ""
    i = 0
    while i < len(pattern):
        c = pattern[i]
        if c == "*":
            if i + 1 < len(pattern) and pattern[i + 1] == "*":
                if i + 2 < len(pattern) and pattern[i + 2] == "/":
                    out += "(?:.*/)?"
                    i += 3
                    continue
                out += ".*"
                i += 2
                continue
            out += "[^/]*"
            i += 1
            continue
        if c in ".+^${}()|[]":
            out += "\\" + c
        else:
            out += c
        i += 1
    return re.match("^" + out + "$", norm) is not None


def _exists_path_rule(rule: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    globs = rule.get("path_globs", [])
    evidence = []
    for f in files:
        if any(_matches_glob(f["path"], g) for g in globs):
            evidence.append({"file": f["path"], "line": 1, "snippet": "(path match)", "pattern": 0})
            if len(evidence) >= 5:
                break
    return {
        "status": "PASS" if evidence else "FAIL",
        "evidence": evidence,
        "matched_patterns": [0] if evidence else [],
        "total_patterns": 1,
        "inverse": False,
        "require": "any",
    }


def _scan_rule(rule: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    if rule.get("type") == "exists_path":
        return _exists_path_rule(rule, files)

    flags = re.MULTILINE
    if not rule.get("case_sensitive"):
        flags |= re.IGNORECASE

    patterns = []
    for p in rule.get("patterns", []):
        try:
            patterns.append(re.compile(p, flags))
        except re.error:
            patterns.append(re.compile(re.escape(p), flags))

    require = rule.get("require", "any")
    inverse = bool(rule.get("inverse"))
    max_evidence = 5

    matched_patterns: set[int] = set()
    evidence: list[dict[str, Any]] = []

    for f in files:
        lines = f["content"].split("\n")
        for i, re_obj in enumerate(patterns):
            if i in matched_patterns and len(evidence) >= max_evidence:
                continue
            for m in re_obj.finditer(f["content"]):
                matched_patterns.add(i)
                if len(evidence) < max_evidence:
                    line = f["content"].count("\n", 0, m.start()) + 1
                    snippet = (lines[line - 1] if line - 1 < len(lines) else "").strip()[:160]
                    evidence.append({"file": f["path"], "line": line, "snippet": snippet, "pattern": i})
                if len(evidence) >= max_evidence:
                    break
            if len(evidence) >= max_evidence:
                break
        if len(evidence) >= max_evidence and (require == "any" or len(matched_patterns) == len(patterns)):
            break

    if require == "all":
        passed = len(matched_patterns) == len(patterns)
    else:
        passed = len(matched_patterns) >= 1
    if inverse:
        passed = not passed

    return {
        "status": "PASS" if passed else "FAIL",
        "evidence": evidence,
        "matched_patterns": sorted(matched_patterns),
        "total_patterns": len(patterns),
        "inverse": inverse,
        "require": require,
    }


# ── Special recognizers ────────────────────────────────────────────────

_INJECTION_DETECTOR_RE = re.compile(
    r"\b_?(?:check|detect|scan|run|test|is)_?(?:prompt_?)?injection[a-z_]*\b"
    r"|INJECTION_PATTERN\s*\.\s*(?:search|match|test|exec)",
)


def _kill_switch_restart_latched(files: list[dict[str, Any]], ctx: dict[str, Any]) -> dict[str, Any]:
    evidence: list[dict[str, Any]] = []
    reasons: list[str] = []

    for f in files:
        lines = f["content"].split("\n")
        for i, line in enumerate(lines):
            if "@lru_cache" in line:
                follow = "\n".join(lines[i + 1 : i + 6])
                if re.search(r"def\s+(get_)?settings\b|->\s*Settings\b|return\s+Settings\s*\(", follow):
                    evidence.append({
                        "file": f["path"],
                        "line": i + 1,
                        "snippet": "\n".join(lines[i : min(i + 4, len(lines))]),
                    })
                    reasons.append("@lru_cache on Settings retrieval (pydantic-settings cached at first call)")

    for f in files:
        if re.search(r"^settings\s*=\s*Settings\s*\(\s*\)", f["content"], re.MULTILINE):
            lines = f["content"].split("\n")
            for i, line in enumerate(lines):
                if re.search(r"settings\.(ai_system_enabled|kill_switch|ai_enabled|feature_flag)", line):
                    evidence.append({"file": f["path"], "line": i + 1, "snippet": line.strip()})
                    reasons.append("Module-level `settings = Settings()` read inside handler (frozen at import)")
                    break

    for f in files:
        lines = f["content"].split("\n")
        for i, line in enumerate(lines):
            if re.search(r"^(KILL_SWITCH|AI_ENABLED|AI_SYSTEM_ENABLED)\s*=\s*os\.getenv", line):
                evidence.append({"file": f["path"], "line": i + 1, "snippet": line.strip()})
                reasons.append("Module-level `<FLAG> = os.getenv(...)` (value frozen at import)")

    rereads = False
    for f in files:
        if re.search(r"@app\.(get|post|put|delete)|@router\.(get|post|put|delete)", f["content"]):
            if re.search(
                r"^(?!\s*#).*os\.getenv\s*\(\s*['\"](?:AI_SYSTEM_ENABLED|KILL_SWITCH|AI_ENABLED)",
                f["content"],
                re.MULTILINE,
            ):
                rereads = True

    flagged = bool(evidence) and not rereads
    if flagged:
        notes = (
            f"Kill switch appears restart-latched. Reasons: {'; '.join(sorted(set(reasons)))}. "
            "This meets Aigis V3 literal wording ('env variable') but cannot be toggled during a "
            "live incident without a process restart. Verify manually; if confirmed, mark PARTIAL "
            "rather than PASS."
        )
    elif evidence:
        notes = (
            "Restart-latched signals present but counter-signals (per-request env reads) also "
            "found. Manual review recommended."
        )
    else:
        notes = "No restart-latched signals detected."
    return {"flagged": flagged, "evidence": evidence, "notes": notes}


def _injection_log_only(files: list[dict[str, Any]], ctx: dict[str, Any]) -> dict[str, Any]:
    callsites: list[dict[str, Any]] = []
    evidence: list[dict[str, Any]] = []

    block_patterns = [
        re.compile(
            r"if\s+(?:injection|inj|result|flagged|inject[a-z_]*)[\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)",
            re.IGNORECASE,
        ),
        re.compile(
            r"if\s+[^\n]*\[[\"']flagged[\"']\][\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)",
            re.IGNORECASE,
        ),
        re.compile(
            r"if\s+[^\n]*\.flagged[\s\S]{0,120}?(?:raise|return|HTTPException|abort)",
            re.IGNORECASE,
        ),
    ]

    for f in files:
        lines = f["content"].split("\n")
        for i, line in enumerate(lines):
            if re.match(r"^\s*def\s+", line) and _INJECTION_DETECTOR_RE.search(line):
                continue
            if _INJECTION_DETECTOR_RE.search(line) and not re.match(r"^\s*def\s+", line) and not re.match(r"^\s*(from|import)\s+", line):
                window = "\n".join(lines[i : min(i + 20, len(lines))])
                blocks = any(p.search(window) for p in block_patterns)
                callsites.append({"file": f["path"], "line": i + 1, "snippet": line.strip(), "blocks": blocks})
                if not blocks:
                    evidence.append({
                        "file": f["path"],
                        "line": i + 1,
                        "snippet": line.strip() + "  // next 20 lines contain no control-flow break",
                    })

    flagged = bool(callsites) and all(not c["blocks"] for c in callsites)
    partial = any(not c["blocks"] for c in callsites) and any(c["blocks"] for c in callsites)

    if not callsites:
        notes = "No injection detector callsites found."
    elif flagged:
        notes = (
            f"{len(callsites)} callsite(s) of the injection detector found; none branch on the "
            "result. Meets Aigis V5 literal wording ('even if just logging') but the LLM call still "
            "runs on flagged inputs. Verify manually; if confirmed, mark PARTIAL rather than PASS."
        )
    elif partial:
        notes = "Some callsites block on detection, others do not. Review the non-blocking ones."
    else:
        notes = "All callsites of the injection detector branch on the result."

    return {"flagged": flagged or partial, "evidence": evidence, "notes": notes}


_SPECIAL_REGISTRY = {
    "kill_switch_restart_latched": _kill_switch_restart_latched,
    "injection_log_only": _injection_log_only,
}


# ── Public API ─────────────────────────────────────────────────────────

def auto_verify_area(area_id: str, project_dir: str) -> dict[str, Any]:
    rules = load_rules()
    area = rules.get(area_id)
    if not area:
        raise ValueError(
            f"No auto-verify rules for pattern area '{area_id}'. "
            f"Known: {', '.join(rules.keys())}"
        )
    root = Path(project_dir).resolve()
    files = _load_files(root)

    auto_results: dict[str, Any] = {}
    for check_id, rule in (area.get("auto") or {}).items():
        scan_files = files
        fg = rule.get("file_glob")
        if fg:
            globs = [g.strip() for g in fg.split(",")]
            scan_files = [f for f in files if any(_matches_glob(f["path"], g) for g in globs)]
        res = _scan_rule(rule, scan_files)
        auto_results[check_id] = {**rule, **res}

    overclaim_results: dict[str, Any] = {}
    for check_id, entry in (area.get("overclaim") or {}).items():
        fn = _SPECIAL_REGISTRY.get(entry["recognizer"])
        recog = fn(files, {"rootDir": str(root), "areaId": area_id, "checkId": check_id}) if fn else {
            "flagged": False, "evidence": [], "notes": f"Unknown recognizer: {entry['recognizer']}"
        }
        also_auto = entry.get("also_auto")
        raise_ = recog["flagged"]
        if also_auto and auto_results.get(also_auto, {}).get("status") != "PASS":
            raise_ = False
        overclaim_results[check_id] = {
            "desc": entry.get("desc", ""),
            "recognizer": entry["recognizer"],
            "also_auto": also_auto,
            "raised": raise_,
            "flagged": recog["flagged"],
            "evidence": recog["evidence"],
            "notes": recog["notes"],
        }

    judgment_results: dict[str, Any] = {}
    for check_id, desc in (area.get("judgment") or {}).items():
        judgment_results[check_id] = {"desc": desc, "status": "JUDGMENT"}

    auto_pass = sum(1 for r in auto_results.values() if r["status"] == "PASS")
    auto_fail = sum(1 for r in auto_results.values() if r["status"] == "FAIL")
    overclaims_raised = sum(1 for r in overclaim_results.values() if r["raised"])

    return {
        "area": area_id,
        "project_dir": str(root),
        "files_scanned": len(files),
        "summary": {
            "auto_total": len(auto_results),
            "auto_pass": auto_pass,
            "auto_fail": auto_fail,
            "overclaims_raised": overclaims_raised,
            "judgment_required": len(judgment_results),
        },
        "auto_checks": auto_results,
        "overclaim_checks": overclaim_results,
        "judgment_checks": judgment_results,
    }


def format_text_report(result: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"═══ AUTO-VERIFY: {result['area']} ═══\n")
    lines.append(f"Project: {result['project_dir']}")
    lines.append(f"Files scanned: {result['files_scanned']}")
    s = result["summary"]
    lines.append(f"Auto-verified: {s['auto_pass']}/{s['auto_total']} PASS, {s['auto_fail']} FAIL")
    lines.append(f"Overclaim recognizers raised: {s['overclaims_raised']}")
    lines.append(f"Judgment required: {s['judgment_required']} check(s)\n")

    if result["auto_checks"]:
        lines.append("── AUTO CHECKS ──")
        for cid, r in result["auto_checks"].items():
            badge = "[PASS]" if r["status"] == "PASS" else "[FAIL]"
            inv = " (inverse)" if r.get("inverse") else ""
            lines.append(f"\n{badge} {cid}: {r.get('desc','')}{inv}")
            for e in r["evidence"][:3]:
                lines.append(f"       {e['file']}:{e['line']}  {e['snippet']}")
            if r["status"] == "FAIL" and not r.get("inverse") and not r["evidence"]:
                lines.append(f"       no matches for any of {r.get('total_patterns', 0)} pattern(s)")
        lines.append("")

    if result["overclaim_checks"]:
        lines.append("── OVERCLAIM RECOGNIZERS ──")
        for cid, r in result["overclaim_checks"].items():
            badge = "[OVERCLAIM RAISED]" if r["raised"] else "[no signal]"
            lines.append(f"\n{badge} {cid}: {r['desc']}")
            lines.append(f"       recognizer: {r['recognizer']}")
            lines.append(f"       {r['notes']}")
            for e in r["evidence"][:3]:
                lines.append(f"       {e['file']}:{e['line']}  {e['snippet']}")
        lines.append("")

    if result["judgment_checks"]:
        lines.append("── JUDGMENT REQUIRED (agent must evaluate) ──")
        for cid, r in result["judgment_checks"].items():
            lines.append(f"\n[JUDGMENT] {cid}: {r['desc']}")
        lines.append("")

    lines.append("═══ SUMMARY ═══")
    lines.append(f"Auto-verified: {s['auto_pass']} PASS, {s['auto_fail']} FAIL out of {s['auto_total']}")
    lines.append(f"Overclaim flags raised: {s['overclaims_raised']}")
    lines.append(f"Judgment required: {s['judgment_required']} checks")
    return "\n".join(lines)
