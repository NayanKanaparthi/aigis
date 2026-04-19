from __future__ import annotations

import json
import sys

import click
from rich.console import Console

from . import __version__
from .classify import classify as run_classify
from .fetch import get as fetch_get, get_audit_scan, get_infra, get_template, get_workflow, list_infras, list_workflows, verify as fetch_verify
from .keywords import detect_traits_from_text
from .search import list_all, search as run_search
from .annotate import annotate as add_annotation, clear_annotation, list_annotations
from .init_ide import init as run_init

console = Console(highlight=False)


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
def classify(description: str | None, traits_str: str | None, as_json: bool,
             confirm_str: str | None, reject_str: str | None) -> None:
    """Classify an AI system and get recommended governance files."""
    from .keywords import apply_confirmations
    if not traits_str and not description:
        console.print("[red]Provide --traits, a quoted description, or both.[/red]")
        console.print("[dim]Example: aigis classify --traits uses-llm,processes-pii[/dim]")
        console.print('[dim]Example: aigis classify "customer chatbot with RAG"[/dim]')
        console.print('[dim]Example: aigis classify "chatbot" --traits handles-financial   (additive)\n[/dim]')
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
    final_traits = sorted(set(resolved["final_traits"]) | set(traits_from_flag))

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
            console.print(f"[red]{msg}[/red]")
            console.print('[dim]Run "aigis traits" to see available traits.\n[/dim]')
        sys.exit(1)

    try:
        result = run_classify(final_traits)
    except ValueError as exc:
        console.print(f"[red]{exc}[/red]")
        sys.exit(1)
    if resolver_report:
        result["resolver"] = resolver_report

    if json_mode:
        click.echo(json.dumps(result, indent=2))
        return

    if resolver_report:
        console.print("[bold]═══ AIGIS RESOLVER ═══[/bold]")
        if detection["high_confidence_matches"]:
            console.print("\n[bold]High-confidence triggers (auto-applied):[/bold]")
            for m in detection["high_confidence_matches"]:
                console.print(f"  [green]✓[/green] \"{m['phrase']}\" → {', '.join(m['traits'])}")
        if resolved["low_confidence_decisions"]:
            console.print("\n[bold]Low-confidence decisions:[/bold]")
            for d in resolved["low_confidence_decisions"]:
                icon = "[green]✓[/green]" if d["user_decision"] == "yes" else ("[yellow]?[/yellow]" if d["user_decision"] == "unsure" else "[dim]✗[/dim]")
                console.print(f"  {icon} [{d['id']}] \"{d['phrase']}\" → {', '.join(d['traits'])}  (decision: {d['user_decision']})")
        if traits_from_flag:
            console.print(f"\n[bold]Added via --traits flag:[/bold] {', '.join(traits_from_flag)}")
        console.print(f"\n[bold]Final trait set ({len(final_traits)}):[/bold] {', '.join(final_traits)}\n")
        console.print("[dim]═══════════════════════[/dim]\n")

    tier = result["risk_tier"]
    tier_color = "red" if tier == "HIGH" else "yellow" if tier == "MEDIUM" else "green"
    console.print(f"[bold]Risk tier:[/bold] [bold {tier_color}]{tier}[/bold {tier_color}]")
    console.print(f"[bold]Reason:[/bold] {result['reason']}\n")

    for w in result["warnings"]:
        console.print(f"[yellow]⚠ {w}[/yellow]")
    if result["warnings"]:
        console.print()

    console.print(f"[bold]Implement files ({len(result['implement_files'])}):[/bold]")
    for f in result["implement_files"]:
        console.print(f"[green]  aigis get {f}[/green]")

    if result["templates"]:
        console.print(f"\n[bold]Templates ({len(result['templates'])}):[/bold]")
        for t in result["templates"]:
            console.print(f"[yellow]  aigis template {t}[/yellow]")

    if result["guardrails_fired"]:
        console.print("\n[bold]Guardrails fired:[/bold]")
        for g in result["guardrails_fired"]:
            console.print(f"[yellow]  {g['id']}: {g['action']} — {g['rationale']}[/yellow]")

    console.print("\n[bold]Verify after implementation:[/bold]")
    for f in result["implement_files"]:
        console.print(f"[green]  aigis verify {f}[/green]")

    c = result["controls"]
    console.print(f"\n[dim]Controls: {len(c['owasp'])} OWASP, {len(c['nist'])} NIST, {len(c['iso'])} ISO[/dim]")


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
def verify(files: tuple[str, ...], auto_path: str | None, as_json: bool) -> None:
    """Fetch verification checklists, or run deterministic auto-verify with --auto."""
    if not auto_path:
        click.echo(fetch_verify(list(files)))
        return

    from pathlib import Path
    from .auto_verify import auto_verify_area, format_text_report

    proj = Path(auto_path).resolve()
    if not proj.exists():
        console.print(f"[red]Project path does not exist: {proj}[/red]")
        sys.exit(1)

    results = []
    for area in files:
        try:
            results.append(auto_verify_area(area, str(proj)))
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
        checklists_by_area: dict[str, str] = {}
        per_area_counts: dict[str, int] = {}
        total_checks = 0
        for f in classification["implement_files"]:
            checklist = fetch_verify([f])
            checklists_by_area[f] = checklist
            row_matches = re.findall(r"^\| V\d+\b", checklist, flags=re.MULTILINE)
            per_area_counts[f] = len(row_matches)
            total_checks += len(row_matches)
        areas_csv = ", ".join(classification["implement_files"])
        score_line_template = (
            f"Score: <P> / {total_checks} total checks across "
            f"{len(classification['implement_files'])} recommended areas (areas: {areas_csv})"
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
        console.print(f"[bold]Total checks (deterministic denominator):[/bold] {total_checks}\n")

        console.print("[bold]Instructions for agent:[/bold]")
        console.print("[dim]Evaluate the existing codebase against each check below.[/dim]")
        console.print('[dim]Mark PASS / FAIL / PARTIAL with evidence (file:line or "not found").[/dim]')
        console.print("[dim]At the end of your report, emit this exact line (replace <P> with the PASS count):[/dim]")
        console.print(f"[dim]  {score_line_template}[/dim]\n")

        for f in classification["implement_files"]:
            click.echo(checklists_by_area[f])
            click.echo()

        console.print("[bold]═══ SCORING ═══[/bold]")
        console.print(
            f"Denominator: {total_checks} total checks across "
            f"{len(classification['implement_files'])} recommended areas."
        )
        console.print(f"Areas: {areas_csv}")
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
@click.option("--refresh", is_flag=True, help="Overwrite existing aigis content (destructive — use after Aigis updates or to fix a stale resolver block checksum)")
def init_cmd(ide: str, refresh: bool) -> None:
    """Set up aigis for your IDE (writes core skill + resolver block)."""
    run_init(ide, refresh=refresh)


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
