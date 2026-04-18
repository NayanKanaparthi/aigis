from __future__ import annotations

import sys
from pathlib import Path

from rich.console import Console

from .fetch import get_core

console = Console(highlight=False)

HEADER = (
    "# Aigis core skill — installed by `aigis init`\n"
    "# Re-run `aigis init <ide>` to refresh this file when Aigis updates.\n"
    "# Area + workflow skills load on demand via the aigis CLI; they are NOT in this file.\n\n"
)

IDE_DESTINATIONS: dict[str, dict] = {
    "cursor": {
        "file": ".cursorrules",
        "description": "Cursor rules file",
        "instruction": "Cursor will read these instructions on every interaction in this project.",
    },
    "windsurf": {
        "file": ".windsurfrules",
        "description": "Windsurf rules file",
        "instruction": "Windsurf will read these instructions on every interaction in this project.",
    },
    "copilot": {
        "file": ".github/copilot-instructions.md",
        "description": "GitHub Copilot instructions",
        "instruction": "Copilot will read these instructions for this repository.",
    },
    "claude-code": {
        "file": None,
        "description": "Claude Code skill file",
        "instruction": "Claude Code will read this skill file. Restart Claude Code for it to take effect.",
    },
}


def init(ide: str) -> None:
    ide_lower = ide.lower()
    dest = IDE_DESTINATIONS.get(ide_lower)

    if not dest:
        console.print(f"[red]Unknown IDE: {ide}[/red]")
        console.print("[dim]Available: cursor, claude-code, windsurf, copilot\n[/dim]")
        sys.exit(1)

    content = HEADER + get_core()

    if ide_lower == "claude-code":
        skill_dir = Path.home() / ".claude" / "skills" / "aigis"
        skill_file = skill_dir / "SKILL.md"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_file.write_text(content, encoding="utf-8")
        console.print(f"\n[green]✓ Created {skill_file}[/green]\n")
        console.print(f"[dim]{dest['instruction']}\n[/dim]")
        return

    target_file = Path.cwd() / dest["file"]
    target_file.parent.mkdir(parents=True, exist_ok=True)

    if target_file.exists():
        existing = target_file.read_text(encoding="utf-8")
        if "aigis-core" in existing:
            console.print(f"\n[yellow]⚠ {dest['file']} already contains aigis core skill.[/yellow]")
            console.print("[dim]No changes made. Remove the existing aigis section first to refresh it.\n[/dim]")
            return
        with target_file.open("a", encoding="utf-8") as f:
            f.write("\n\n" + content)
        console.print(f"\n[green]✓ Appended aigis core skill to {dest['file']}[/green]\n")
        console.print("[dim]Your existing rules are preserved.\n[/dim]")
    else:
        target_file.write_text(content, encoding="utf-8")
        console.print(f"\n[green]✓ Created {dest['file']}[/green]\n")

    console.print(f"[dim]{dest['instruction']}\n[/dim]")
