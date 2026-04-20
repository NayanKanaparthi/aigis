# Aigis

**AI governance that ships with your code.**

Aigis is a command-line tool that gives coding agents like Cursor, Claude Code, GitHub Copilot, and Windsurf curated AI governance patterns mapped to NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001.

You describe what you're building. Aigis classifies it against the frameworks that apply. Your agent pulls the right governance patterns and implements them. One command verifies the result.

## Install

```bash
npm install -g @aigis-ai/cli
# or
pip install aigis-cli
```

Verify:

```bash
aigis --version
# 2.0.1
```

## Quick start

```bash
aigis build "customer support chatbot with order history lookup"
```

Aigis will classify the description against NIST, OWASP, and ISO frameworks, identify relevant governance areas (PII handling, rate limiting, audit logging, prompt security), and produce a consolidated brief your agent can implement from.

Paste the brief into your coding agent's chat. The agent implements the patterns. Then:

```bash
aigis verify <area> --auto .
```

Runs deterministic checks on the implementation.

## What's new in v2.0

- **`aigis build`** — new command that produces one consolidated governance brief per project
- **Infrastructure content** — production-ready patterns for rate limiting, secrets management, and structured logging
- **Curated resolver** — 39 high-signal triggers mapped to traits, with interactive confirmation for low-confidence matches
- **Content architecture redesign** — areas, workflows, and infrastructure separated into layered skills, built around how modern AI agents actually read context

## How Aigis is different

**Structured.** Aigis is a compiler for agent instructions, not a prompt. The resolver uses deterministic rules. The procedures have explicit verification checkpoints. Brief generation is fully deterministic — same description produces byte-identical output.

**Honest.** Every iteration of v2.0 was benchmarked. The final numbers, against the same 10 descriptions:

- Baseline (no Aigis): P=0.737, R=0.905, F1=0.790
- v2.0 (aigis build): P=0.847, R=0.851, F1=0.837

F1 beats baseline by +0.047. Precision improved by +15%. Methodology and per-run tables live in `benchmarks/`.

**Open source.** Local. Never calls external LLMs. Never writes files to your project. Your code, your tools, your accountability.

## The principle behind Aigis

Governance isn't a content problem. It's an interface problem.

AI governance frameworks exist. NIST AI RMF, OWASP Top 10 for LLMs, ISO/IEC 42001 — all rigorous, all published, all sitting in documents that engineering teams never read.

Aigis treats governance as an agent-computer interface problem. Context layered for on-demand loading. Deterministic rules where accuracy isn't negotiable. Flexible reasoning where real projects don't fit rigid templates.

Inspired by [SWE-agent's work on agent-computer interfaces](https://arxiv.org/abs/2405.15793) — the idea that how information reaches an LM agent matters as much as what reaches it.

## Commands

```bash
aigis build "<description>"        # Generate governance brief (the main command)
aigis build "..." --list           # List areas without full brief
aigis build "..." --compact        # Pointer-only brief

aigis classify "<text>"            # Classify traits from description
aigis get <area>                   # Fetch governance procedure for an area
aigis infra <area>                 # Fetch infrastructure pattern (rate-limiting, secrets, logging)
aigis workflow <type>              # Fetch workflow template

aigis verify <area> --auto .       # Run deterministic checks on your implementation
aigis audit .                      # Summary audit of all implemented areas
aigis search --list                # List all available areas
```

Run `aigis --help` for full options.

## Supported agents

- Cursor
- Claude Code
- GitHub Copilot
- Windsurf

Run `aigis init <ide>` to set up your IDE rules. The resolver's trigger reference is embedded in the rules file with a checksum that automatically refreshes on `aigis init --refresh`.

## Contributing

Aigis is built around a curated trigger map for classification. Trigger contributions are welcome, with one-sentence use-case justification per the template in `.github/PULL_REQUEST_TEMPLATE/trigger_mapping.md`.

See `CONTRIBUTING.md` for the full contributor workflow, including how to add new governance areas, workflows, or infrastructure patterns.

## License

MIT
