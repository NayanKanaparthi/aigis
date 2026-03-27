from __future__ import annotations

import json
import sys

import click
from rich.console import Console

from . import __version__
from .classify import classify as run_classify
from .fetch import get as fetch_get, get_audit_scan, get_template, verify as fetch_verify
from .keywords import detect_traits_from_text
from .search import list_all, search as run_search
from .annotate import annotate as add_annotation, clear_annotation, list_annotations
from .init_ide import init as run_init

console = Console(highlight=False)


@click.group()
@click.version_option(__version__, prog_name="aigis")
def cli() -> None:
    """AI governance guardrails for coding agents."""


# ── classify ────────────────────────────────────────────────────────
@cli.command()
@click.argument("description", required=False, default=None)
@click.option("--traits", "traits_str", default=None, help="Comma-separated trait IDs")
@click.option("--interactive", is_flag=True, help="Confirm detected traits before classifying")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def classify(description: str | None, traits_str: str | None,
             interactive: bool, as_json: bool) -> None:
    """Classify an AI system and get recommended governance files."""
    traits: list[str] | None = None

    if traits_str:
        traits = [t.strip() for t in traits_str.split(",")]
    elif description:
        detected = detect_traits_from_text(description)
        if interactive:
            console.print("\n[bold]Detected traits from description:[/bold]\n")
            for d in detected:
                icon = "[green]✓[/green]" if d["confidence"] == "high" else "[yellow]?[/yellow]"
                console.print(f"  {icon} [cyan]{d['trait']}[/cyan]  (matched: \"{d['keyword']}\")")
            trait_list = ",".join(d["trait"] for d in detected)
            console.print("[dim]\nTo classify with these traits, run:[/dim]")
            console.print(f"[green]  aigis classify --traits {trait_list}[/green]\n")
            console.print("[dim]Add or remove traits as needed before running.\n[/dim]")
            return
        traits = [d["trait"] for d in detected]
        if not traits:
            console.print("[red]No traits detected from description.[/red]")
            console.print('[dim]Run "aigis traits" to see available traits, or use --traits flag.\n[/dim]')
            sys.exit(1)
        console.print(f"[dim]Detected traits: {', '.join(traits)}\n[/dim]")
    else:
        console.print("[red]Provide --traits or a quoted description.[/red]")
        console.print("[dim]Example: aigis classify --traits uses-llm,processes-pii[/dim]")
        console.print('[dim]Example: aigis classify "customer chatbot with RAG"\n[/dim]')
        sys.exit(1)

    try:
        result = run_classify(traits)
    except ValueError as exc:
        console.print(f"[red]{exc}[/red]")
        sys.exit(1)

    if as_json:
        click.echo(json.dumps(result, indent=2))
        return

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
@click.option("--lang", type=click.Choice(["py", "js"]), default=None, help="Filter code to py or js only")
@click.option("--no-frontmatter", "no_frontmatter", is_flag=True, help="Strip YAML frontmatter")
def get_cmd(files: tuple[str, ...], all_files: bool, lang: str | None,
            no_frontmatter: bool) -> None:
    """Fetch implementation pattern files."""
    content = fetch_get(list(files) or None, all_files=all_files,
                        strip_fm=not no_frontmatter, lang=lang)
    click.echo(content)


# ── verify ──────────────────────────────────────────────────────────
@cli.command()
@click.argument("files", nargs=-1, required=True)
def verify(files: tuple[str, ...]) -> None:
    """Fetch verification checklists."""
    click.echo(fetch_verify(list(files)))


# ── template ────────────────────────────────────────────────────────
@cli.command()
@click.argument("templates", nargs=-1, required=True)
def template(templates: tuple[str, ...]) -> None:
    """Fetch compliance documentation templates."""
    click.echo(get_template(list(templates)))


# ── audit ───────────────────────────────────────────────────────────
@cli.command()
@click.option("--scan", is_flag=True, help="Get structured scan prompt for the agent")
@click.option("--traits", "traits_str", default=None, help="Run audit with detected traits")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def audit(scan: bool, traits_str: str | None, as_json: bool) -> None:
    """Audit an existing codebase for governance gaps."""
    if scan:
        click.echo(get_audit_scan())
        return

    if traits_str:
        traits = [t.strip() for t in traits_str.split(",")]
        classification = run_classify(traits)

        if as_json:
            checklists = {}
            for f in classification["implement_files"]:
                checklists[f] = fetch_verify([f])
            click.echo(json.dumps({"classification": classification, "checklists": checklists}, indent=2))
            return

        tier = classification["risk_tier"]
        tier_color = "red" if tier == "HIGH" else "yellow" if tier == "MEDIUM" else "green"
        console.print("[bold]═══ AIGIS GOVERNANCE AUDIT ═══[/bold]\n")
        console.print(f"[bold]Risk tier:[/bold] [bold {tier_color}]{tier}[/bold {tier_color}]")
        console.print(f"[bold]Controls to assess:[/bold] {len(classification['implement_files'])} areas\n")

        console.print("[bold]Instructions for agent:[/bold]")
        console.print("[dim]Evaluate the existing codebase against each check below.[/dim]")
        console.print('[dim]Mark PASS / FAIL / PARTIAL with evidence (file:line or "not found").\n[/dim]')

        for f in classification["implement_files"]:
            checklist = fetch_verify([f])
            click.echo(checklist)
            click.echo()

        if classification["templates"]:
            console.print("[bold]Required documentation:[/bold]")
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
def init_cmd(ide: str) -> None:
    """Set up aigis for your IDE."""
    run_init(ide)


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
