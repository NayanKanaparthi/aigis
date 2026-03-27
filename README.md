# Aigis

AI governance guardrails for coding agents. Curated, agent-consumable security and compliance patterns from NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@aigis-ai/cli)](https://www.npmjs.com/package/@aigis-ai/cli)
[![PyPI](https://img.shields.io/pypi/v/aigis-cli)](https://pypi.org/project/aigis-cli/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%3E%3D3.9-blue)](https://www.python.org/)

## The problem

Coding agents hallucinate security patterns and build AI systems without governance controls. When your agent writes an LLM-powered endpoint, it doesn't know about prompt injection, PII redaction, bias monitoring, or the compliance documentation your organization needs.

## What Aigis does

Aigis gives your coding agent curated governance patterns it can fetch via a simple CLI. The agent reads the patterns, applies them when writing code, and verifies its own output against checklists — all mapped to real framework control IDs.

```
Without Aigis                          With Aigis
───────────────────                    ─────────────────
Agent writes LLM code                  Agent classifies the system
No input validation                    Fetches governance patterns
No PII redaction                       Writes code with controls built in
No audit logging                       Self-verifies against checklists
Compliance team finds gaps later       Compliance documentation generated alongside code
Rework cycle                           Ships compliant on first pass
```

## Quick start

Install the CLI with **npm** (JavaScript / Node.js) or **pip** (Python). Both packages expose the same `aigis` command and behavior.

**JavaScript developers — npm**

```bash
npm install -g @aigis-ai/cli
```

**Python developers — pip**

```bash
pip install aigis-cli
```

**After installing (either toolchain)**

```bash
# Set up for your IDE
aigis init cursor        # or: claude-code, windsurf, copilot

# Classify your system
aigis classify --traits uses-llm,accepts-user-input,processes-pii,is-external

# Fetch patterns
aigis get input-validation pii-handling audit-logging

# After writing code, verify
aigis verify input-validation pii-handling audit-logging

# Generate compliance documentation (if HIGH/MEDIUM risk)
aigis template ai-impact-assessment intended-purpose-doc
```

## How it works

Aigis has three layers:

**1. Classify** — Describe what you're building using 22 system traits. Aigis determines the risk tier (HIGH/MEDIUM/LOW) and tells you which governance files to fetch.

**2. Implement** — Fetch the relevant pattern files. Each file contains concrete code patterns (Python + JavaScript) for one security/governance concern, tagged with NIST, OWASP, and ISO control IDs.

**3. Verify** — After writing code, fetch the matching checklists. The agent evaluates its own code against each check and reports PASS/FAIL with evidence.

## Commands

| Command | Purpose |
|---------|---------|
| `aigis classify --traits <list>` | Classify system, get risk tier and recommended files |
| `aigis classify "<description>"` | Same, using natural language (keyword matching) |
| `aigis get <id> [id...]` | Fetch implementation pattern files |
| `aigis get <id> --lang py\|js` | Fetch filtered to one language |
| `aigis verify <id> [id...]` | Fetch verification checklists |
| `aigis template <id> [id...]` | Fetch compliance documentation templates |
| `aigis audit --scan` | Get structured prompt for auditing existing codebases |
| `aigis audit --traits <list>` | Run full audit (classify + all checklists bundled) |
| `aigis search <query>` | Search content by keyword or control ID |
| `aigis search --list` | List all available files |
| `aigis annotate <id> "<note>"` | Attach a local note for future sessions |
| `aigis init <ide>` | Set up for cursor, claude-code, windsurf, or copilot |
| `aigis traits` | List all 22 classification traits |

## Classification traits (22)

**AI architecture:** uses-llm, uses-rag, uses-finetuned, uses-thirdparty-api, is-agentic, is-multimodal

**Data sensitivity:** processes-pii, handles-financial, handles-health, handles-proprietary, handles-minors

**Impact scope:** influences-decisions, accepts-user-input, is-external, is-internal, is-high-volume

**Output type:** generates-code, generates-content, multi-model-pipeline

**Jurisdiction:** jurisdiction-eu, jurisdiction-us-regulated, jurisdiction-global

## Governance content (15 pattern files)

Each file covers one security/governance concern with Python + JavaScript code patterns, anti-patterns, edge cases, and cross-references to related files.

| File | OWASP | What it covers |
|------|-------|----------------|
| input-validation | LLM01 | Sanitization, length limits, prompt separation, schema enforcement, injection detection |
| output-sanitization | LLM05 | HTML encoding, parameterized queries, code sandboxing, content type validation |
| pii-handling | LLM02 | PII detection/redaction, data minimization, output filtering, separated storage |
| prompt-security | LLM07 | No secrets in prompts, minimal prompts, leakage detection, server-side enforcement |
| human-oversight | LLM06 | Tool allowlists, approval gates, action rate limiting, override mechanisms |
| supply-chain | LLM03 | Model version pinning, regression testing, fallback providers, version tracking |
| data-integrity | LLM04 | Data provenance, RAG validation, checksums, distribution monitoring, batch rollback |
| rag-security | LLM08 | Vector DB access control, tenant isolation, context validation, permission inheritance |
| confidence-scoring | LLM09 | Confidence metadata, grounding verification, recommendation framing |
| rate-limiting | LLM10 | Per-user limits, token budgets, cost monitoring, request timeouts |
| audit-logging | — | Structured entries, trace ID propagation, decision records |
| bias-monitoring | — | Fairness metadata, distribution monitoring, periodic reports |
| fallback-patterns | — | Default safe responses, circuit breakers, kill switches |
| monitoring | — | Key metrics, drift detection, user feedback, incident logging |
| explainability | — | Decision explanations, model cards, audit-friendly records |

## Compliance templates (4)

| Template | Framework | When required |
|----------|-----------|---------------|
| ai-impact-assessment | ISO 42001 Clause 8.4 | HIGH risk, EU jurisdiction, decisions about individuals |
| intended-purpose-doc | NIST MAP 1.1 | HIGH and MEDIUM risk |
| risk-characterization | NIST MAP 5.1 | HIGH risk |
| third-party-assessment | GOVERN 6 / LLM03 | Third-party API at MEDIUM or HIGH risk |

## Auditing existing projects

Aigis can audit codebases that already exist, not just new code:

```bash
# Get the structured scan prompt
aigis audit --scan

# The agent scans the codebase following the prompt, detects traits, then:
aigis audit --traits uses-llm,processes-pii,is-external

# Output: classification + all relevant checklists
# Agent evaluates existing code against each check → gap report
```

## Self-improving agents

Aigis supports a learning loop where agents get smarter over time:

```bash
# Agent discovers a workaround during coding
aigis annotate input-validation "Needs raw body for webhook verification"

# Next session, the annotation appears automatically
aigis get input-validation
# ... content includes annotation at the bottom
```

## Agent-agnostic design

Aigis works with any coding agent that can execute shell commands:

- **Cursor** — `aigis init cursor` writes `.cursorrules`
- **Claude Code** — `aigis init claude-code` creates `~/.claude/skills/aigis/SKILL.md`
- **Windsurf** — `aigis init windsurf` writes `.windsurfrules`
- **GitHub Copilot** — `aigis init copilot` writes `.github/copilot-instructions.md`
- **Any agent** — if it can run a terminal command and read stdout, it works

## Framework coverage

Aigis maps every code pattern to specific control IDs across three frameworks:

- **OWASP Top 10 for LLM Applications (2025)** — all 10 risks covered
- **NIST AI Risk Management Framework (AI RMF 1.0)** — 25 subcategories mapped
- **ISO/IEC 42001:2023** — 15 control references mapped

Control IDs are in each file's YAML frontmatter, enabling compliance teams to trace code decisions back to framework requirements.

## Architecture

The governance content lives under `content/` and is shared by both CLIs.

**npm package** [`@aigis-ai/cli`](https://www.npmjs.com/package/@aigis-ai/cli) (Node.js)

```
@aigis-ai/cli
├── bin/aigis.js        # CLI entry point (commander.js)
├── lib/
│   ├── classify.js     # Classification engine + guardrails
│   ├── fetch.js        # Content reader + annotation injection
│   ├── keywords.js     # Natural language → trait mapping
│   ├── search.js       # Content search
│   ├── annotate.js     # Local annotation store
│   └── init.js         # IDE setup
├── content/
│   ├── implement/      # 15 governance pattern files
│   ├── verify/         # 15 verification checklists
│   ├── templates/      # 4 compliance doc templates
│   └── index/          # Taxonomy, frameworks index, guardrails, audit scan
├── SKILL.md            # Portable agent skill file
└── package.json
```

**PyPI package** [`aigis-cli`](https://pypi.org/project/aigis-cli/) (Python)

```
cli-python/
├── pyproject.toml
└── aigis_cli/          # click + rich + python-frontmatter; mirrors the JS CLI
    ├── cli.py
    ├── classify.py, fetch.py, keywords.py, search.py, annotate.py, init_ide.py
    ├── content/        # same markdown + JSON as above (bundled as package data)
    └── SKILL.md
```

No network calls. No telemetry. No LLM API calls. No databases. Everything runs locally, reads local files, prints to stdout.

## Contributing

Content is plain markdown with YAML frontmatter, submitted as pull requests. See the existing files in `content/implement/` for the format.

To add a new governance pattern:
1. Create `content/implement/your-pattern.md` following the existing format
2. Create `content/verify/checklist-your-pattern.md` with verification checks
3. Add the pattern to the trait-to-file mapping in `content/index/taxonomy.md`
4. Add control IDs to the YAML frontmatter
5. Submit a PR

## License

[MIT](LICENSE)
