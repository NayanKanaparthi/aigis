from __future__ import annotations

import json
import os
import re
import sys

import click
from rich.console import Console

from . import __version__
from .classify import classify as run_classify
from .fetch import get as fetch_get, get_audit_scan, get_infra, get_template, get_workflow, list_infras, list_workflows, verify as fetch_verify
from .build import build_brief, build_list, BriefTooLargeError, normalize_description, assign_unique_slugs
from .report import build_report, format_report_markdown, format_report_json
from .keywords import detect_traits_from_text
from .search import list_all, search as run_search
from .annotate import annotate as add_annotation, clear_annotation, list_annotations
from .init_ide import init as run_init

console = Console(highlight=False)


# ── chalk-compatible styling (classify text output) ─────────────────
# `aigis classify` text output must be byte-identical to the Node CLI, which
# styles with chalk 4.1.2 and decides on color with supports-color 7.2.0.
# These helpers reproduce both: the same color decision for stdout and the
# same escape codes, including chalk's close/reopen around line breaks.
_CHALK_CODES = {"bold": ("\x1b[1m", "\x1b[22m"), "dim": ("\x1b[2m", "\x1b[22m"),
                "red": ("\x1b[31m", "\x1b[39m"), "green": ("\x1b[32m", "\x1b[39m"),
                "yellow": ("\x1b[33m", "\x1b[39m")}
_chalk_level_cache: list[int] = []


def _chalk_level() -> int:
    """supports-color 7.2.0 `stdout` level (0 = no color). Mirrors its env checks."""
    if _chalk_level_cache:
        return _chalk_level_cache[0]
    env = os.environ
    force: float | None = None
    if "FORCE_COLOR" in env:
        fc = env["FORCE_COLOR"]
        if fc == "true":
            force = 1
        elif fc == "false":
            force = 0
        elif fc == "":
            force = 1
        else:
            m = re.match(r"\s*([+-]?\d+)", fc)  # JS parseInt
            force = min(int(m.group(1)), 3) if m else float("nan")

    def level() -> int:
        if force == 0:
            return 0
        if not sys.stdout.isatty() and force is None:
            return 0
        minimum = int(force) if (force and force == force) else 0
        term = env.get("TERM")
        if term == "dumb":
            return minimum
        if sys.platform == "win32":
            return 1
        if "CI" in env:
            if any(k in env for k in ("TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE")) or env.get("CI_NAME") == "codeship":
                return 1
            return minimum
        if "TEAMCITY_VERSION" in env:
            return 1 if re.match(r"^(9\.(0*[1-9]\d*)\.|\d{2,}\.)", env["TEAMCITY_VERSION"]) else 0
        if env.get("COLORTERM") == "truecolor":
            return 3
        if "TERM_PROGRAM" in env:
            vm = re.match(r"\s*([+-]?\d+)", (env.get("TERM_PROGRAM_VERSION") or "").split(".")[0])
            version = int(vm.group(1)) if vm else -1
            if env["TERM_PROGRAM"] == "iTerm.app":
                return 3 if version >= 3 else 2
            if env["TERM_PROGRAM"] == "Apple_Terminal":
                return 2
        if term is not None and re.search(r"-256(color)?$", term, re.IGNORECASE):
            return 2
        if term is not None and re.search(r"^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux", term, re.IGNORECASE):
            return 1
        if "COLORTERM" in env:
            return 1
        return minimum

    _chalk_level_cache.append(level())
    return _chalk_level_cache[0]


def _chalk(text: str, *styles: str) -> str:
    """chalk.<styles[0]>.<styles[1]>...(text) with chalk 4.1.2 semantics."""
    if _chalk_level() <= 0 or not text:
        return text
    open_all = "".join(_CHALK_CODES[s][0] for s in styles)
    close_all = "".join(_CHALK_CODES[s][1] for s in reversed(styles))
    if "\x1b" in text:
        for s_ in reversed(styles):
            o, c = _CHALK_CODES[s_]
            text = text.replace(c, c + o)
    if "\n" in text:
        out, end = "", 0
        idx = text.find("\n")
        while idx != -1:
            got_cr = idx > 0 and text[idx - 1] == "\r"
            out += text[end:(idx - 1 if got_cr else idx)] + close_all + ("\r\n" if got_cr else "\n") + open_all
            end = idx + 1
            idx = text.find("\n", end)
        text = out + text[end:]
    return open_all + text + close_all


def _out(line: str = "") -> None:
    """console.log"""
    sys.stdout.write(line + "\n")


def _err(line: str = "") -> None:
    """console.error"""
    sys.stdout.flush()
    sys.stderr.write(line + "\n")


def _prompt_low_confidence(detection: dict) -> dict[str, str]:
    """Interactive prompt for low-confidence resolver suggestions."""
    decisions: dict[str, str] = {}
    console.print("\n[bold]═══ AIGIS RESOLVER ═══[/bold]")
    if detection["high_confidence_matches"]:
        console.print("\n[bold]High-confidence triggers (auto-applied):[/bold]")
        for m in detection["high_confidence_matches"]:
            console.print(f"  [green]✓[/green] \"{m['phrase']}\" → {', '.join(m['traits'])}")
    console.print(f"\n[bold]Low-confidence triggers (need your input — {len(detection['low_confidence_matches'])}):[/bold]")
    for sug in detection["low_confidence_matches"]:
        console.print(f"\n  [bold][{sug['id']}] \"{sug['phrase']}\"[/bold]")
        console.print(f"      [dim]Suggested traits: {', '.join(sug['traits'])}[/dim]")
        console.print(f"      {sug['confirmation_prompt']}")
        ans = input("      (y)es / (n)o / (u)nsure [n]: ").strip().lower()
        if ans in ("", "n", "no"):
            decision = "no"
        elif ans in ("y", "yes"):
            decision = "yes"
        elif ans in ("u", "unsure"):
            decision = "unsure"
        else:
            console.print(f"      [dim](unrecognized — defaulting to 'no')[/dim]")
            decision = "no"
        decisions[sug["id"]] = decision
    console.print("")
    return decisions


@click.group()
@click.version_option(__version__, prog_name="aigis")
def cli() -> None:
    """AI governance guardrails for coding agents."""


# ── classify ────────────────────────────────────────────────────────
@cli.command()
@click.argument("description", required=False, default=None)
@click.option("--traits", "traits_str", default=None, help="Comma-separated trait IDs (additive: combines with --description triggers if both passed)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON (also enabled automatically when stdout is not a TTY)")
@click.option("--confirm", "confirm_str", default=None, help="Comma-separated low-confidence suggestion IDs to confirm")
@click.option("--reject", "reject_str", default=None, help="Comma-separated low-confidence suggestion IDs to reject")
@click.option("--jurisdiction", "jurisdiction_str", default=None, help="Comma-separated jurisdiction codes (eu, us-regulated, global). Adds the matching jurisdiction-* traits.")
def classify(description: str | None, traits_str: str | None, as_json: bool,
             confirm_str: str | None, reject_str: str | None,
             jurisdiction_str: str | None) -> None:
    """Classify an AI system and get recommended governance files."""
    from .keywords import apply_confirmations
    if not traits_str and not description:
        _err(_chalk("Provide --traits, a quoted description, or both.", "red"))
        _out(_chalk("Example: aigis classify --traits uses-llm,processes-pii", "dim"))
        _out(_chalk('Example: aigis classify "customer chatbot with RAG"', "dim"))
        _out(_chalk('Example: aigis classify "chatbot" --traits handles-financial   (additive)\n', "dim"))
        sys.exit(1)

    json_mode = bool(as_json) or not sys.stdout.isatty()
    traits_from_flag = [t.strip() for t in traits_str.split(",") if t.strip()] if traits_str else []
    confirm_ids = set(s.strip() for s in confirm_str.split(",") if s.strip()) if confirm_str else None
    reject_ids = set(s.strip() for s in reject_str.split(",") if s.strip()) if reject_str else None

    detection = {"high_confidence_matches": [], "low_confidence_matches": [], "traits_auto_applied": []}
    if description:
        detection = detect_traits_from_text(description)

    decisions: dict[str, str] = {}
    used_flags = bool(confirm_ids or reject_ids)

    if description and detection["low_confidence_matches"]:
        if used_flags:
            for sug in detection["low_confidence_matches"]:
                if confirm_ids and sug["id"] in confirm_ids:
                    decisions[sug["id"]] = "yes"
                elif reject_ids and sug["id"] in reject_ids:
                    decisions[sug["id"]] = "no"
                else:
                    decisions[sug["id"]] = "no"
        elif json_mode:
            for sug in detection["low_confidence_matches"]:
                decisions[sug["id"]] = "no"
        else:
            decisions = _prompt_low_confidence(detection)

    resolved = apply_confirmations(detection, decisions)
    # v2.1: --jurisdiction flag adds jurisdiction-* traits.
    jurisdiction_traits = (
        [f"jurisdiction-{c}" for c in (s.strip() for s in jurisdiction_str.split(",")) if c]
        if jurisdiction_str else []
    )
    final_traits = sorted(set(resolved["final_traits"]) | set(traits_from_flag) | set(jurisdiction_traits))

    resolver_report = None
    if description:
        resolver_report = {
            "input": description,
            "high_confidence_matches": detection["high_confidence_matches"],
            "low_confidence_suggestions": resolved["low_confidence_decisions"],
            "traits_from_description": resolved["final_traits"],
            "traits_from_flag": traits_from_flag,
            "final_traits": final_traits,
        }

    if not final_traits:
        msg = "No traits resolved from description or --traits flag."
        if json_mode:
            click.echo(json.dumps({"error": msg, "resolver": resolver_report}, indent=2))
        else:
            _err(_chalk(msg, "red"))
            _out(_chalk('Run "aigis traits" to see available traits.\n', "dim"))
        sys.exit(1)

    try:
        result = run_classify(final_traits)
    except ValueError as exc:
        _err(_chalk(str(exc), "red"))
        sys.exit(1)

    # v2.1: jurisdiction filter on the area list (parity with bin/aigis.js).
    from .jurisdiction import get_user_jurisdictions, filter_areas_by_jurisdiction
    user_jurisdictions = get_user_jurisdictions(final_traits)
    before_filter = len(result["implement_files"])
    result["implement_files"] = filter_areas_by_jurisdiction(result["implement_files"], user_jurisdictions)
    result["filtered_by_jurisdiction"] = {
        "user_jurisdictions": sorted(user_jurisdictions),
        "dropped_count": before_filter - len(result["implement_files"]),
    }
    if resolver_report:
        result["resolver"] = resolver_report

    if json_mode:
        click.echo(json.dumps(result, indent=2))
        return

    # Formatted output: line for line, byte for byte the same as bin/aigis.js.
    if resolver_report:
        _out(_chalk("═══ AIGIS RESOLVER ═══", "bold"))
        if detection["high_confidence_matches"]:
            _out(_chalk("\nHigh-confidence triggers (auto-applied):", "bold"))
            for m in detection["high_confidence_matches"]:
                _out(f"  {_chalk('✓', 'green')} \"{m['phrase']}\" → {', '.join(m['traits'])}")
        if resolved["low_confidence_decisions"]:
            _out(_chalk("\nLow-confidence decisions:", "bold"))
            for d in resolved["low_confidence_decisions"]:
                if d["user_decision"] == "yes":
                    icon = _chalk("✓", "green")
                elif d["user_decision"] == "unsure":
                    icon = _chalk("?", "yellow")
                else:
                    icon = _chalk("✗", "dim")
                _out(f"  {icon} [{d['id']}] \"{d['phrase']}\" → {', '.join(d['traits'])}  (decision: {d['user_decision']})")
        if traits_from_flag:
            _out(_chalk(f"\nAdded via --traits flag: {', '.join(traits_from_flag)}", "bold"))
        _out(_chalk(f"\nFinal trait set ({len(final_traits)}): {', '.join(final_traits)}\n", "bold"))
        _out(_chalk("═══════════════════════\n", "dim"))

    tier = result["risk_tier"]
    tier_color = "red" if tier == "HIGH" else "yellow" if tier == "MEDIUM" else "green"
    _out(f"{_chalk('Risk tier:', 'bold')} {_chalk(tier, tier_color, 'bold')}")
    _out(f"{_chalk('Reason:', 'bold')} {result['reason']}\n")

    if result["warnings"]:
        for w in result["warnings"]:
            _out(_chalk(f"⚠ {w}", "yellow"))
        _out("")

    _out(_chalk(f"Recommended areas ({len(result['implement_files'])}):", "bold"))
    for f in result["implement_files"]:
        _out(_chalk(f"  aigis get {f}", "green"))

    if result["templates"]:
        _out(_chalk(f"\nTemplates ({len(result['templates'])}):", "bold"))
        for t in result["templates"]:
            _out(_chalk(f"  aigis template {t}", "yellow"))

    if result["guardrails_fired"]:
        _out(_chalk("\nGuardrails fired:", "bold"))
        for g in result["guardrails_fired"]:
            _out(_chalk(f"  {g['id']}: {g['action']} — {g['rationale']}", "yellow"))

    _out(_chalk("\nVerify after implementation:", "bold"))
    for f in result["implement_files"]:
        _out(_chalk(f"  aigis verify {f}", "green"))

    # v3.0 (SPEC S5.7, AC21): ATLAS count and threat-model pointer, only when
    # classify attached an ATLAS block (absent when the catalog is unavailable).
    c = result["controls"]
    atlas_count = f", {len(c['atlas'])} ATLAS mitigations" if result.get("atlas") and c.get("atlas") is not None else ""
    _out(_chalk(f"\nControls: {len(c['owasp'])} OWASP, {len(c['nist'])} NIST, {len(c['iso'])} ISO{atlas_count}", "dim"))
    if result.get("atlas"):
        _out(_chalk("Threat model (MITRE ATLAS):", "bold"))
        _out(_chalk(f"  {result['atlas']['threats_command']}", "green"))
        _out(_chalk(f"  {result['atlas']['disclaimer']}", "dim"))

    # Workflow suggestion (same as bin/aigis.js).
    _out(_chalk("\nSuggested workflow:", "bold"))
    _out(_chalk("  aigis workflow fastapi-llm", "green"))
    _out(_chalk("  (canonical file layout + wiring contracts; see `aigis workflow --list` for others)", "dim"))


# ── get ─────────────────────────────────────────────────────────────
@cli.command("get")
@click.argument("files", nargs=-1)
@click.option("--all", "all_files", is_flag=True, help="Fetch all implement files")
@click.option("--lang", default=None, help="Filter code blocks to one language. Accepts py, python, js, javascript, ts, typescript, go, rust.")
@click.option("--context", default=None, help="Filter patterns by system context. Accepts web, agentic, rag, batch.")
@click.option("--no-frontmatter", "no_frontmatter", is_flag=True, help="Strip YAML frontmatter")
def get_cmd(files: tuple[str, ...], all_files: bool, lang: str | None,
            context: str | None, no_frontmatter: bool) -> None:
    """Fetch implementation pattern files."""
    try:
        content = fetch_get(list(files) or None, all_files=all_files,
                            strip_fm=not no_frontmatter, lang=lang,
                            context=context)
        click.echo(content)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        sys.exit(1)


# ── verify ──────────────────────────────────────────────────────────
@cli.command()
@click.argument("files", nargs=-1, required=True)
@click.option("--auto", "auto_path", default=None, help="Run deterministic scanner against the project at this path instead of returning the blank checklist")
@click.option("--json", "as_json", is_flag=True, help="Output auto-verify results as JSON (only with --auto)")
@click.option("--jurisdiction", "jurisdiction_str", default=None, help="Comma-separated jurisdiction codes (eu, us-regulated). Surfaces jurisdiction-specific control citations (e.g. EU AI Act articles) in the report.")
def verify(files: tuple[str, ...], auto_path: str | None, as_json: bool, jurisdiction_str: str | None) -> None:
    """Fetch verification checklists, or run deterministic auto-verify with --auto."""
    if not auto_path:
        click.echo(fetch_verify(list(files)))
        return

    from pathlib import Path
    from .auto_verify import auto_verify_area, format_text_report

    proj = Path(os.path.abspath(auto_path))  # like Node path.resolve (no symlink resolution)
    if not proj.exists():
        console.print(f"[red]Project path does not exist: {proj}[/red]")
        sys.exit(1)

    # v2.1: parse --jurisdiction once, applied to every area.
    jurisdictions = [s.strip() for s in jurisdiction_str.split(",") if s.strip()] if jurisdiction_str else []

    results = []
    for area in files:
        try:
            results.append(auto_verify_area(area, str(proj), jurisdictions=jurisdictions))
        except Exception as e:
            console.print(f"[red]Error verifying '{area}': {e}[/red]")
            sys.exit(1)

    if as_json:
        click.echo(json.dumps(results[0] if len(results) == 1 else results, indent=2))
        return

    for i, r in enumerate(results):
        click.echo(format_text_report(r))
        if len(results) > 1 and i < len(results) - 1:
            click.echo("\n" + "─" * 60 + "\n")


# ── template ────────────────────────────────────────────────────────
@cli.command()
@click.argument("templates", nargs=-1, required=True)
def template(templates: tuple[str, ...]) -> None:
    """Fetch compliance documentation templates."""
    click.echo(get_template(list(templates)))


# ── workflow ────────────────────────────────────────────────────────
@cli.command()
@click.argument("type_", metavar="TYPE", required=False, default=None)
@click.option("--list", "list_workflows_flag", is_flag=True, help="List available workflows")
def workflow(type_: str | None, list_workflows_flag: bool) -> None:
    """Fetch the canonical file layout + wiring contracts for a project type."""
    if list_workflows_flag:
        items = list_workflows()
        if not items:
            console.print("[dim]No workflow skills found.[/dim]")
            return
        console.print("[bold]Available workflows:[/bold]\n")
        for w in items:
            console.print(f"  {w}")
        console.print("[dim]\nFetch one with: aigis workflow <type>[/dim]")
        return
    if not type_:
        console.print("[red]Provide a workflow type or pass --list.[/red]")
        console.print("[dim]  aigis workflow fastapi-llm[/dim]")
        console.print("[dim]  aigis workflow --list\n[/dim]")
        sys.exit(1)
    try:
        click.echo(get_workflow(type_))
    except Exception as exc:
        console.print(f"[red]{exc}[/red]")
        items = list_workflows()
        if items:
            console.print(f"[dim]\nAvailable workflows: {', '.join(items)}[/dim]")
        sys.exit(1)


# ── build ───────────────────────────────────────────────────────────
def _prompt_build_low_confidence(low_conf: list[dict]) -> dict[str, str]:
    """Interactive prompt for low-conf triggers in `aigis build`. Default = unsure."""
    decisions: dict[str, str] = {}
    console.print("\n[bold]═══ AIGIS BUILD — low-confidence triggers ═══[/bold]")
    console.print('[dim]Default for each is "unsure" → trait is included in the brief with a ⚠ flag for the agent to surface to you.\n[/dim]')
    for m in low_conf:
        console.print(f"  [bold][{m['slug']}] \"{m['phrase']}\"[/bold]")
        console.print(f"      [dim]Suggested traits: {', '.join(m['traits'])}[/dim]")
        console.print(f"      {m['confirmation_prompt']}")
        ans = input("      (y)es / (n)o / (u)nsure [u]: ").strip().lower()
        if ans in ("", "u", "unsure"):
            decision = "unsure"
        elif ans in ("y", "yes"):
            decision = "yes"
        elif ans in ("n", "no"):
            decision = "no"
        else:
            console.print("      [dim](unrecognized — defaulting to 'unsure')[/dim]")
            decision = "unsure"
        decisions[m["slug"]] = decision
        console.print("")
    return decisions


@cli.command()
@click.argument("description", required=True)
@click.option("--full", "force_full", is_flag=True, help="Force full inlined brief (hard cap at 200k chars)")
@click.option("--compact", "force_compact", is_flag=True, help="Force compact pointer-only brief (no auto-fallback)")
@click.option("--list", "list_only", is_flag=True, help="Shape A: print area names + traits + pre-built flags only")
@click.option("--confirm", "confirm_str", default=None, help="Comma-separated low-confidence trigger ids/slugs to confirm")
@click.option("--reject", "reject_str", default=None, help="Comma-separated low-confidence trigger ids/slugs to reject")
@click.option("--jurisdiction", "jurisdiction_str", default=None, help="Comma-separated jurisdiction codes (eu, us-regulated). Adds jurisdiction-* traits and gates EU AI Act / regional content accordingly.")
@click.option("--tight", "tight_flag", is_flag=True, help="Experimental: require ≥2 trait matches for area inclusion (vs default ≥1). Smaller briefs; recall trade-off.")
@click.option("--json", "as_json", is_flag=True, help="Output JSON (brief + meta) instead of plain markdown")
def build(description: str, force_full: bool, force_compact: bool, list_only: bool,
          confirm_str: str | None, reject_str: str | None,
          jurisdiction_str: str | None, tight_flag: bool, as_json: bool) -> None:
    """Compose a consolidated governance brief for a feature description."""
    if force_full and force_compact:
        console.print("[red]Pass --full or --compact, not both.[/red]")
        sys.exit(1)
    if list_only and (force_full or force_compact):
        console.print("[red]--list is independent of --full/--compact; pass only one.[/red]")
        sys.exit(1)

    # v2.1: parse --jurisdiction once, used by all paths.
    extra_jurisdictions = (
        [s.strip() for s in jurisdiction_str.split(",") if s.strip()]
        if jurisdiction_str else []
    )

    if list_only:
        try:
            click.echo(build_list(description, extra_jurisdictions=extra_jurisdictions, tight=tight_flag), nl=False)
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            sys.exit(1)
        return

    confirm_ids = set(s.strip() for s in confirm_str.split(",") if s.strip()) if confirm_str else None
    reject_ids = set(s.strip() for s in reject_str.split(",") if s.strip()) if reject_str else None
    if confirm_ids and reject_ids:
        overlap = confirm_ids & reject_ids
        if overlap:
            console.print(f"[red]Trigger {', '.join(overlap)} appears in both --confirm and --reject. Pick one.[/red]")
            sys.exit(1)

    # Need slugs to know what to prompt for / what flags refer to.
    from .keywords import detect_traits_from_text
    normalized = normalize_description(description)
    if not normalized:
        console.print('[red]Provide a description in quotes. Example: aigis build "customer chatbot with RAG"[/red]')
        sys.exit(1)
    det = detect_traits_from_text(normalized)
    low_conf = assign_unique_slugs(det["low_confidence_matches"])

    decisions: dict[str, str] = {}
    is_tty = sys.stdout.isatty() and sys.stdin.isatty()
    used_flags = bool(confirm_ids or reject_ids)

    if low_conf:
        if used_flags:
            for m in low_conf:
                if confirm_ids and (m["slug"] in confirm_ids or m["id"] in confirm_ids):
                    decisions[m["slug"]] = "yes"
                elif reject_ids and (m["slug"] in reject_ids or m["id"] in reject_ids):
                    decisions[m["slug"]] = "no"
                else:
                    decisions[m["slug"]] = "unsure"
        elif is_tty:
            decisions = _prompt_build_low_confidence(low_conf)
        else:
            for m in low_conf:
                decisions[m["slug"]] = "unsure"

    mode = "auto"
    if force_full:
        mode = "full"
    elif force_compact:
        mode = "compact"

    try:
        result = build_brief(description, decisions, extra_jurisdictions=extra_jurisdictions, tight=tight_flag, mode=mode)
    except BriefTooLargeError as e:
        console.print(f"[red]{e}[/red]")
        sys.exit(2)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        sys.exit(1)

    if result.get("auto_fallback"):
        full_cap = result["auto_fallback_full_cap"]
        full_chars = result["auto_fallback_full_chars"]
        normalized = result["meta"]["normalized_description"]
        console.print(
            f"[yellow]Brief exceeded {full_cap:,} chars with full content inlined "
            f"({full_chars:,} chars). Falling back to compact mode (pointers only). "
            f'Run `aigis build "{normalized}" --full` to force full content — '
            f"you may need to split the build into per-domain runs if the brief is still too large.[/yellow]",
            highlight=False,
        )

    if as_json:
        click.echo(json.dumps({
            "brief": result["brief"],
            "meta": result["meta"],
            "mode": result["mode"],
            "auto_fallback": result.get("auto_fallback", False),
        }, indent=2))
        return

    click.echo(result["brief"], nl=False)


# ── report (v2.1) ───────────────────────────────────────────────────
@cli.command()
@click.option("--areas", "areas_str", default=None, help="Comma-separated area ids to evaluate")
@click.option("--from-classify", "from_classify", default=None, help="Auto-detect areas: run classify on this description first")
@click.option("--all", "all_areas", is_flag=True, help="Evaluate every area in content/skills/areas/ (warning: large output)")
@click.option("--project", "project_dir", default=".", help="Path to project to scan (default: current directory)")
@click.option("--jurisdiction", "jurisdiction_str", default=None, help="Comma-separated jurisdiction codes (eu, us-regulated)")
@click.option("--format", "fmt", default="markdown", help="Output format: markdown | json")
@click.option("--output", "output_path", default=None, help="Write report to file instead of stdout")
def report(areas_str: str | None, from_classify: str | None, all_areas: bool,
           project_dir: str, jurisdiction_str: str | None, fmt: str,
           output_path: str | None) -> None:
    """Compile an audit-ready compliance report (verify across multiple areas + cross-framework citations + evidence)."""
    from pathlib import Path
    proj = Path(os.path.abspath(project_dir))  # like Node path.resolve (no symlink resolution)
    if not proj.exists():
        console.print(f"[red]Project path does not exist: {proj}[/red]")
        sys.exit(1)

    sources = sum(1 for x in [areas_str, from_classify, all_areas] if x)
    if sources == 0:
        console.print('[red]Provide one of --areas <ids>, --from-classify "<description>", or --all.[/red]')
        sys.exit(1)
    if sources > 1:
        console.print("[red]Pass exactly one of --areas, --from-classify, --all.[/red]")
        sys.exit(1)

    jurisdictions = [s.strip() for s in jurisdiction_str.split(",") if s.strip()] if jurisdiction_str else []
    from .jurisdiction import filter_areas_by_jurisdiction, get_user_jurisdictions

    if areas_str:
        areas = [s.strip() for s in areas_str.split(",") if s.strip()]
    elif from_classify:
        from .keywords import detect_traits_from_text, apply_confirmations
        det = detect_traits_from_text(from_classify)
        decisions = {sug["id"]: "no" for sug in det["low_confidence_matches"]}
        resolved = apply_confirmations(det, decisions)
        jurisdiction_traits = [f"jurisdiction-{c}" for c in jurisdictions]
        final_traits = sorted(set(resolved["final_traits"]) | set(jurisdiction_traits))
        if not final_traits:
            console.print("[red]No traits resolved from --from-classify description. Try --areas <list> instead.[/red]")
            sys.exit(1)
        cls = run_classify(final_traits)
        areas = filter_areas_by_jurisdiction(cls["implement_files"], get_user_jurisdictions(final_traits))
    else:
        from pathlib import Path as _Path
        areas_dir = _Path(__file__).resolve().parent / "content" / "skills" / "areas"
        areas = sorted(p.stem for p in areas_dir.iterdir() if p.suffix == ".md")
        areas = filter_areas_by_jurisdiction(areas, get_user_jurisdictions([f"jurisdiction-{c}" for c in jurisdictions]))

    if not areas:
        console.print("[red]No areas to evaluate after jurisdiction filtering.[/red]")
        sys.exit(1)

    try:
        rep = build_report(project_dir=str(proj), areas=areas, jurisdictions=jurisdictions)
    except Exception as e:
        console.print(f"[red]{e}[/red]")
        sys.exit(1)

    fmt_lower = (fmt or "markdown").lower()
    if fmt_lower == "json":
        output = format_report_json(rep)
    elif fmt_lower in ("markdown", "md"):
        output = format_report_markdown(rep)
    else:
        console.print(f"[red]Unknown --format '{fmt}'. Use markdown or json.[/red]")
        sys.exit(1)

    if output_path:
        from pathlib import Path as _Path
        _Path(output_path).write_text(output + ("" if output.endswith("\n") else "\n"))
        console.print(f"[green]Report written to {output_path} ({len(output)} chars, {len(areas)} area{'' if len(areas)==1 else 's'} evaluated)[/green]")
    else:
        click.echo(output, nl=not output.endswith("\n"))


# ── infra ───────────────────────────────────────────────────────────
@cli.command()
@click.argument("area", required=False, default=None)
@click.option("--list", "list_infras_flag", is_flag=True, help="List available infrastructure areas")
def infra(area: str | None, list_infras_flag: bool) -> None:
    """Fetch infrastructure setup content (rate-limiting, secrets, logging)."""
    if list_infras_flag:
        items = list_infras()
        if not items:
            console.print("[dim]No infrastructure areas found.[/dim]")
            return
        console.print("[bold]Available infrastructure areas:[/bold]\n")
        for i in items:
            console.print(f"  {i}")
        console.print("[dim]\nFetch one with: aigis infra <area>[/dim]")
        return
    if not area:
        console.print("[red]Provide an infrastructure area or pass --list.[/red]")
        console.print("[dim]  aigis infra rate-limiting[/dim]")
        console.print("[dim]  aigis infra --list\n[/dim]")
        sys.exit(1)
    try:
        click.echo(get_infra(area))
    except (ValueError, FileNotFoundError) as exc:
        console.print(f"[red]{exc}[/red]")
        items = list_infras()
        if items:
            console.print(f"[dim]\nAvailable areas: {', '.join(items)}[/dim]")
        sys.exit(1)


# ── audit ───────────────────────────────────────────────────────────
@cli.command()
@click.option("--scan", is_flag=True, help="Get structured discovery prompt (Phases 1-3: inventory, trait detection, classify handoff)")
@click.option("--traits", "traits_str", default=None, help="Run scoped audit: classify + checklists only for recommended areas. Prints deterministic denominator.")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def audit(scan: bool, traits_str: str | None, as_json: bool) -> None:
    """Audit an existing codebase for governance gaps."""
    if scan:
        click.echo(get_audit_scan())
        return

    if traits_str:
        import re
        traits = [t.strip() for t in traits_str.split(",")]
        classification = run_classify(traits)

        # Count checks per scoped area by parsing checklist rows (format: "| V<n> | ...").
        # Deterministic denominator the agent must score against.
        # v3.0: an area with no checklist file yet (some EU AI Act areas) is listed
        # as "no checklist yet" and left out of the denominator instead of crashing.
        checklists_by_area: dict[str, str] = {}
        per_area_counts: dict[str, int] = {}
        no_checklist: list[str] = []
        total_checks = 0
        for f in classification["implement_files"]:
            try:
                checklist = fetch_verify([f])
            except FileNotFoundError as err:
                if not str(err).startswith("File not found: verify/"):
                    raise
                no_checklist.append(f)
                checklists_by_area[f] = f"No checklist yet for {f}; not counted in the denominator."
                continue
            checklists_by_area[f] = checklist
            row_matches = re.findall(r"^\| V\d+\b", checklist, flags=re.MULTILINE)
            per_area_counts[f] = len(row_matches)
            total_checks += len(row_matches)
        scored_areas = [f for f in classification["implement_files"] if f not in no_checklist]
        areas_csv = ", ".join(classification["implement_files"])
        no_checklist_note = (
            f"No checklist yet, not counted in the denominator: {', '.join(no_checklist)}"
            if no_checklist else None
        )
        if not no_checklist:
            score_line_template = (
                f"Score: <P> / {total_checks} total checks across "
                f"{len(classification['implement_files'])} recommended areas (areas: {areas_csv})"
            )
        else:
            score_line_template = (
                f"Score: <P> / {total_checks} total checks across "
                f"{len(scored_areas)} of {len(classification['implement_files'])} recommended areas "
                f"(areas: {', '.join(scored_areas)}; no checklist yet: {', '.join(no_checklist)})"
            )

        if as_json:
            click.echo(json.dumps({
                "classification": classification,
                "checklists": checklists_by_area,
                "score_template": {
                    "total_checks": total_checks,
                    "recommended_areas_count": len(classification["implement_files"]),
                    "recommended_areas": classification["implement_files"],
                    "per_area_check_count": per_area_counts,
                    **({"areas_without_checklist": no_checklist, "note": no_checklist_note} if no_checklist else {}),
                    "score_line_template": score_line_template,
                },
            }, indent=2))
            return

        tier = classification["risk_tier"]
        tier_color = "red" if tier == "HIGH" else "yellow" if tier == "MEDIUM" else "green"
        console.print("[bold]═══ AIGIS GOVERNANCE AUDIT (SCOPED) ═══[/bold]\n")
        console.print(f"[bold]Risk tier:[/bold] [bold {tier_color}]{tier}[/bold {tier_color}]")
        console.print(f"[bold]Recommended areas:[/bold] {len(classification['implement_files'])}")
        console.print(f"[bold]Areas:[/bold] {areas_csv}")
        if no_checklist_note:
            console.print(f"[yellow]{no_checklist_note}[/yellow]")
        console.print(f"[bold]Total checks (deterministic denominator):[/bold] {total_checks}\n")

        console.print("[bold]Instructions for agent:[/bold]")
        console.print("[dim]Evaluate the existing codebase against each check below.[/dim]")
        console.print('[dim]Mark PASS / FAIL / PARTIAL with evidence (file:line or "not found").[/dim]')
        console.print("[dim]At the end of your report, emit this exact line (replace <P> with the PASS count):[/dim]")
        console.print(f"[dim]  {score_line_template}[/dim]\n")

        for f in scored_areas:
            click.echo(checklists_by_area[f])
            click.echo()

        console.print("[bold]═══ SCORING ═══[/bold]")
        scored_prefix = "" if not no_checklist else f"{len(scored_areas)} of "
        console.print(
            f"Denominator: {total_checks} total checks across "
            f"{scored_prefix}{len(classification['implement_files'])} recommended areas."
        )
        console.print(f"Areas: {areas_csv}")
        if no_checklist_note:
            console.print(no_checklist_note)
        console.print(f"Emit at end of report: [bold]{score_line_template}[/bold]")

        if classification["templates"]:
            console.print("\n[bold]Required documentation:[/bold]")
            for t in classification["templates"]:
                console.print(f"[yellow]  aigis template {t}[/yellow]")
        return

    console.print("[red]Provide --scan or --traits.[/red]")
    console.print("[dim]  aigis audit --scan                    # get scan prompt[/dim]")
    console.print("[dim]  aigis audit --traits uses-llm,...      # run audit\n[/dim]")
    sys.exit(1)


# ── search ──────────────────────────────────────────────────────────
@cli.command()
@click.argument("query", required=False, default=None)
@click.option("--list", "list_files", is_flag=True, help="List all available files")
def search(query: str | None, list_files: bool) -> None:
    """Search across all content."""
    if list_files:
        results = list_all()
        console.print("[bold]Available content:\n[/bold]")
        console.print("[bold]Implement files (governance patterns):[/bold]")
        for r in results["implement"]:
            console.print(f"  [cyan]{r['id']:<25}[/cyan] {r['title']}")
        console.print("\n[bold]Templates (compliance documentation):[/bold]")
        for r in results["templates"]:
            console.print(f"  [yellow]{r['id']:<25}[/yellow] {r['title']}")
        console.print("\n[bold]Verify checklists:[/bold]")
        console.print("[dim]  (one per implement file, auto-fetched via aigis verify <id>)[/dim]")
        return

    if not query:
        console.print("[red]Provide a search query or use --list.[/red]")
        sys.exit(1)

    results = run_search(query)
    if not results:
        console.print(f'[dim]No results found for "{query}"[/dim]')
        return
    console.print(f'[bold]Results for "{query}":\n[/bold]')
    for r in results:
        console.print(f"  [cyan]{r['id']:<25}[/cyan] {r['title']}")
        if r["matched_controls"]:
            console.print(f"  [dim]{'':<25} controls: {', '.join(r['matched_controls'])}[/dim]")


# ── annotate ────────────────────────────────────────────────────────
@cli.command()
@click.argument("file_id", required=False, default=None)
@click.argument("note", required=False, default=None)
@click.option("--list", "list_all_annotations", is_flag=True, help="List all annotations")
@click.option("--clear", is_flag=True, help="Clear annotations for a file")
def annotate(file_id: str | None, note: str | None,
             list_all_annotations: bool, clear: bool) -> None:
    """Attach or manage local notes on content files."""
    if list_all_annotations:
        all_notes = list_annotations()
        if not all_notes:
            console.print("[dim]No annotations yet.[/dim]")
            return
        console.print("[bold]Annotations:\n[/bold]")
        for fid, notes in all_notes.items():
            console.print(f"  [cyan]{fid}:[/cyan]")
            for n in notes:
                console.print(f'  [dim]  "{n["note"]}" ({n["date"]})[/dim]')
        return

    if not file_id:
        console.print("[red]Provide a file ID. Use --list to see annotations.[/red]")
        sys.exit(1)

    if clear:
        clear_annotation(file_id)
        console.print(f"[green]Cleared annotations for {file_id}[/green]")
        return

    if not note:
        console.print("[red]Provide a note in quotes.[/red]")
        console.print('[dim]Example: aigis annotate input-validation "Needs raw body for webhooks"[/dim]')
        sys.exit(1)

    add_annotation(file_id, note)
    console.print(f"[green]Annotation added to {file_id}[/green]")


# ── init ────────────────────────────────────────────────────────────
@cli.command("init")
@click.argument("ide")
@click.option("--refresh", is_flag=True, help="Replace the existing Aigis section with the current one and keep the rest of the file (use after Aigis updates or to fix a stale resolver block checksum)")
@click.option("--ci", default=None, help="Install CI workflow file. Currently supports: github (drops .github/workflows/aigis.yml).")
@click.option("--hook", is_flag=True, help="Install .git/hooks/pre-commit that runs aigis verify on areas declared in .aigisrc.json.")
def init_cmd(ide: str, refresh: bool, ci: str | None, hook: bool) -> None:
    """Set up aigis for your IDE (writes core skill + resolver block). Optional --ci and --hook activation surfaces.

    IDE: claude-code, codex, cursor, copilot, windsurf
    """
    run_init(ide, refresh=refresh, ci=ci, hook=hook)


# ── threats (v3.0, MITRE ATLAS; logic in threats.py) ────────────────
@cli.command("threats")
@click.argument("description", required=False, default=None)
@click.option("--traits", "traits_str", default=None, help="Comma-separated trait IDs (additive with the description)")
@click.option("--top", "top", default=None, help="Number of techniques to show, 1 to 25 (default 10)")
@click.option("--json", "as_json", is_flag=True, help="Output JSON instead of plain markdown")
@click.option("--redteam", is_flag=True, help="Add red-team test-case stubs for the top techniques")
def threats_cmd(description: str | None, traits_str: str | None, top: str | None, as_json: bool, redteam: bool) -> None:
    """Threat model for your system's entry points (MITRE ATLAS: a catalog, not a standard)"""
    from . import threats as th
    try:
        top_n = th.parse_top(top)
        resolved = th.resolve_threat_traits(description=description, traits_flag=traits_str)
        model = th.build_threat_model(**resolved, top=top_n, redteam=redteam)
        out = th.format_threats_json(model) if as_json else th.format_threats_text(model)
    except th.ThreatsInputError as err:
        sys.stderr.write(f"{err}\n")
        sys.exit(1)
    except th.AtlasCatalogError as err:
        sys.stderr.write(f"{th.catalog_error_line(err)}\n")
        sys.exit(2)
    click.echo(out, nl=False)


# ── traits ──────────────────────────────────────────────────────────
@cli.command()
def traits() -> None:
    """List all available classification traits."""
    console.print("[bold]Available traits (22):\n[/bold]")
    groups = {
        "AI architecture": ["uses-llm", "uses-rag", "uses-finetuned", "uses-thirdparty-api", "is-agentic", "is-multimodal"],
        "Data sensitivity": ["processes-pii", "handles-financial", "handles-health", "handles-proprietary", "handles-minors"],
        "Impact scope": ["influences-decisions", "accepts-user-input", "is-external", "is-internal", "is-high-volume"],
        "Output type": ["generates-code", "generates-content", "multi-model-pipeline"],
        "Jurisdiction": ["jurisdiction-eu", "jurisdiction-us-regulated", "jurisdiction-global"],
    }
    for group, trait_list in groups.items():
        console.print(f"  [dim]{group}:[/dim]")
        formatted = ", ".join(f"[cyan]{t}[/cyan]" for t in trait_list)
        console.print(f"  {formatted}\n")
