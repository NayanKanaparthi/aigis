---
name: aigis
description: AI governance for coding agents. Three-layer skill system — core / area / workflow. Use the aigis CLI to load skills on demand. Mapped to NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001.
---

# Aigis skill system

Aigis ships skills in three layers. Agents load them on demand via the CLI, not by reading this file.

## Layers

- **Core skill** — `content/skills/core.md`. Always loaded into the agent's context by `aigis init <ide>`. Orients the agent to the workflow + the four CLI commands. ~50 lines.
- **Area skills** — `content/skills/areas/<id>.md`, one per governance area (input-validation, pii-handling, etc.). 15 today. Loaded by `aigis get <id>` when classify points the agent at that area.
- **Workflow skills** — `content/skills/workflows/<type>.md`. Loaded by `aigis workflow <type>` after classify identifies the project shape. Step 5 ships `fastapi-llm`; future workflows: `express-llm`, `nextjs-llm`, `agentic`, `rag-service`.

## How an agent uses Aigis

After `aigis init` writes the core skill into the agent's rules file, the agent runs:

1. `aigis classify` — get risk tier + recommended areas + workflow suggestion
2. `aigis workflow <type>` — get the canonical file layout + wiring contracts
3. `aigis get <area>` and `aigis verify <area> --auto .` per area, in order

See `content/skills/core.md` for the full prose version that the agent sees.

## Setup per IDE

Run once in the project root:

- `aigis init cursor` — writes `.cursorrules`
- `aigis init claude-code` — writes `~/.claude/skills/aigis/SKILL.md`
- `aigis init windsurf` — writes `.windsurfrules`
- `aigis init copilot` — writes `.github/copilot-instructions.md`

All four destinations receive the same content: `content/skills/core.md`. Area and workflow skills load on demand; they are not pre-installed into the rules file.
