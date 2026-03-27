from __future__ import annotations

import sys
from pathlib import Path

from rich.console import Console

SKILL_FILE = Path(__file__).resolve().parent / "SKILL.md"

console = Console(highlight=False)

CURSOR_RULES = """\
# Aigis AI Governance
# Added by: aigis init cursor
# Docs: https://github.com/aigis-ai/aigis

When building any AI or LLM feature, use the aigis CLI for governance patterns:

1. Before writing LLM code, classify the system:
   Run: aigis classify --traits <relevant-traits> --json
   
2. Fetch implementation patterns for each recommended file:
   Run: aigis get <file-id> [file-id...]

3. Apply the patterns when writing code.

4. After writing code, verify:
   Run: aigis verify <file-id> [file-id...]

5. For HIGH/MEDIUM risk systems, generate compliance docs:
   Run: aigis template <template-id>

6. To audit an existing project:
   Run: aigis audit --scan

Available traits: uses-llm, uses-rag, uses-finetuned, uses-thirdparty-api, is-agentic, is-multimodal, processes-pii, handles-financial, handles-health, handles-proprietary, handles-minors, influences-decisions, accepts-user-input, is-external, is-internal, is-high-volume, generates-code, generates-content, multi-model-pipeline, jurisdiction-eu, jurisdiction-us-regulated, jurisdiction-global

Run "aigis search --list" to see all available governance patterns.
Run "aigis traits" to see trait descriptions.
"""

IDE_CONFIG: dict[str, dict] = {
    "cursor": {
        "file": ".cursorrules",
        "content": CURSOR_RULES,
        "description": "Cursor rules file",
        "instruction": "Cursor will read these instructions on every interaction in this project.",
    },
    "windsurf": {
        "file": ".windsurfrules",
        "content": CURSOR_RULES,
        "description": "Windsurf rules file",
        "instruction": "Windsurf will read these instructions on every interaction in this project.",
    },
    "copilot": {
        "file": ".github/copilot-instructions.md",
        "content": CURSOR_RULES,
        "description": "GitHub Copilot instructions",
        "instruction": "Copilot will read these instructions for this repository.",
    },
    "claude-code": {
        "file": None,
        "content": None,
        "description": "Claude Code skill file",
        "instruction": None,
    },
}


def init(ide: str) -> None:
    ide_lower = ide.lower()
    config = IDE_CONFIG.get(ide_lower)

    if not config:
        console.print(f"[red]Unknown IDE: {ide}[/red]")
        console.print("[dim]Available: cursor, claude-code, windsurf, copilot\n[/dim]")
        sys.exit(1)

    if ide_lower == "claude-code":
        skill_dir = Path.home() / ".claude" / "skills" / "aigis"
        skill_file = skill_dir / "SKILL.md"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_content = SKILL_FILE.read_text(encoding="utf-8")
        skill_file.write_text(skill_content, encoding="utf-8")
        console.print(f"\n[green]✓ Created {skill_file}[/green]\n")
        console.print("[dim]Claude Code will automatically read this skill file.[/dim]")
        console.print("[dim]Restart Claude Code for the skill to take effect.\n[/dim]")
        return

    target_file = Path.cwd() / config["file"]
    target_file.parent.mkdir(parents=True, exist_ok=True)

    if target_file.exists():
        existing = target_file.read_text(encoding="utf-8")
        if "aigis" in existing:
            console.print(f"\n[yellow]⚠ {config['file']} already contains aigis configuration.[/yellow]\n")
            console.print("[dim]No changes made. Remove the existing aigis section first if you want to update.\n[/dim]")
            return
        with target_file.open("a", encoding="utf-8") as f:
            f.write("\n\n" + config["content"])
        console.print(f"\n[green]✓ Appended aigis configuration to {config['file']}[/green]\n")
        console.print("[dim]Your existing rules are preserved.\n[/dim]")
    else:
        target_file.write_text(config["content"], encoding="utf-8")
        console.print(f"\n[green]✓ Created {config['file']}[/green]\n")

    console.print(f"[dim]{config['instruction']}\n[/dim]")
