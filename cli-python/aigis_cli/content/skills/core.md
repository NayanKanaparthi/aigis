---
name: aigis-core
description: AI governance for coding agents. Use before building any LLM feature or when auditing existing AI systems. Loads area skills and workflow skills on demand via the aigis CLI.
---

# Aigis core skill

Aigis ships governance patterns mapped to NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001. This file orients you. Detailed procedures (per-area + per-workflow) load on demand.

## When to use

When building a new AI/LLM feature, or auditing one. Do this BEFORE writing the LLM call, not after.

## The workflow (build a new feature)

1. **Classify.** `aigis classify --traits <comma-separated> --json` (or `aigis classify "<natural language description>"`). Returns the risk tier + the list of pattern areas relevant to your system.
2. **Pick a workflow.** Read the suggested workflow at the bottom of classify output and run `aigis workflow <type>` (e.g. `aigis workflow fastapi-llm`). The workflow tells you which file each pattern lives in for your stack — so the wiring is consistent.
3. **For each recommended area, one at a time:**
   - `aigis get <area-id>` — fetch the procedure
   - Implement the procedure step by step. Honor each "verification checkpoint."
   - `aigis verify <area-id> --auto .` — run the deterministic scanner against your project. Fix any FAIL or OVERCLAIM before moving on.
4. **Generate compliance docs** when all areas pass: `aigis template <id>` for each template the classify output named.

## The workflow (audit an existing project)

1. `aigis audit --scan` — discovery prompt. Walks you through inventory + trait detection + classify handoff.
2. `aigis audit --traits <detected> --json` — scoped checklist with the deterministic denominator.
3. For each area, run `aigis verify <id> --auto .` to surface PASS/FAIL/OVERCLAIM/JUDGMENT.
4. Implement fixes using `aigis get <id>` for the procedure.

## How to read `aigis verify <area> --auto` output

- **PASS**: code matches a deterministic pattern; cite the file:line.
- **FAIL**: pattern absent; either implement it or argue it's N/A in this context.
- **OVERCLAIM**: code passes the basic check but a structural anti-pattern is present (e.g. kill switch is restart-latched, injection detector logs without blocking).
- **JUDGMENT**: requires your evaluation; the scanner explains why.

When an OVERCLAIM is raised, the area is not complete — fix the anti-pattern before marking done.

## How to pick traits

Two ways to figure out which traits apply:

1. **CLI:** `aigis classify "<plain-English description of what you're building>"`. Reads the trigger map, returns high-confidence traits immediately, and asks one consolidated confirmation prompt for low-confidence triggers (if any).

2. **In-IDE:** scan the user's project description against the **AIGIS RESOLVER BLOCK** below in this rules file. Apply high-confidence triggers directly. For each low-confidence trigger that matches, ask the user the listed clarifying question (yes / no / unsure) before adding the trait.

Default to NO on low-confidence questions when the user is unsure — false-positive trait classification is worse than missing one trait the user can add manually with `aigis classify --traits ...`.

## Available commands

- `aigis classify` — risk tier + recommended areas
- `aigis workflow <type>` — canonical file layout + wiring contracts for a stack (run `aigis workflow --list` to see available)
- `aigis get <area-id> [--lang python|js|...] [--context web|agentic|rag|batch]` — area skill (the procedure)
- `aigis verify <area-id> [--auto <path>]` — checklist or deterministic scan
- `aigis template <id>` — compliance documentation template
- `aigis audit --scan | --traits <list>` — audit existing code
- `aigis infra <area>` — fetch infrastructure setup content (rate-limiting, secrets, logging). Use after the area procedure references it.

## What loads on demand vs always

This file (`core.md`) is always in your context after `aigis init`. **Area skills** load when you run `aigis get <id>`. **Workflow skills** load when you run `aigis workflow <type>`. Don't ask for them upfront — fetch them when classify points you at them.
