---
name: aigis
description: AI governance for coding agents. Three-layer skill system (core, area, workflow) loaded on demand with the aigis CLI. Mapped to NIST AI RMF, OWASP Top 10 for LLMs and ISO/IEC 42001, with MITRE ATLAS threat modeling.
---

# Aigis skill system

Aigis ships skills in three layers. Agents load them on demand with the CLI, not by reading this file.

## Layers

- **Core skill**: `content/skills/core.md`. `aigis init <ide>` writes it into the agent's rules file. It tells the agent when to use Aigis, the build and audit workflows, how to read verify output, and when to threat-model.
- **Area skills**: `content/skills/areas/<id>.md`, one per governance area (input-validation, pii-handling, agent-permissions and so on). 21 today, 17 of them with a verify checklist. Loaded by `aigis get <id>` when classify points the agent at that area.
- **Workflow skills**: `content/skills/workflows/<type>.md`. Loaded by `aigis workflow <type>` after classify identifies the project shape. `fastapi-llm` ships today.

## How an agent uses Aigis

After `aigis init` writes the core skill, the agent runs:

1. `aigis classify --traits <traits> --json` to get the risk tier, the recommended areas and a workflow suggestion.
2. `aigis workflow <type>` to get the file layout and wiring for the stack.
3. `aigis get <area>` and `aigis verify <area> --auto .` for each area, one at a time.
4. `aigis threats --traits <traits>` to build a threat model. It lists attacker techniques for the system's entry points (Realized first), the mitigations MITRE links to each, the Aigis areas that help implement each one (in part), and gaps. A gap is a mitigation with no mapped Aigis area. The agent fetches and verifies every area it names and tells the user about every gap.

To audit an existing project, the agent starts with `aigis audit --scan` instead.

MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.

See `content/skills/core.md` for the full text the agent sees.

## Setup per IDE

Run once in the project root:

- `aigis init cursor` writes `.cursorrules`
- `aigis init claude-code` writes `~/.claude/skills/aigis/SKILL.md`
- `aigis init codex` writes `AGENTS.md` (appends if the file already exists)
- `aigis init windsurf` writes `.windsurfrules`
- `aigis init copilot` writes `.github/copilot-instructions.md`

All five receive the same content: `content/skills/core.md`. Area and workflow skills load on demand; they are not pre-installed into the rules file.
