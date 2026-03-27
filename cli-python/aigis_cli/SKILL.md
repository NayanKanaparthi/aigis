---
name: aigis
description: AI governance skill for coding agents. Provides framework-aligned security and compliance patterns from NIST AI RMF, OWASP Top 10 for LLMs, and ISO/IEC 42001. Use before building any AI/LLM feature or when auditing existing AI systems.
---

# Aigis — AI Governance Skill

Use the aigis CLI for governance patterns when building or auditing AI/LLM features.

## Quick start — new feature
1. aigis classify --traits <relevant-traits> --json
2. For EACH file in the implement_files list, one at a time:
   a. aigis get <file-id>
   b. Implement the patterns in the code
   c. aigis verify <file-id>
   d. Fix any FAIL or PARTIAL items until all checks pass
   e. Move to the next file
3. After all files pass, generate required templates:
   aigis template <template-id>

IMPORTANT: Do NOT fetch all implement files at once. Work through them one at a time. Implement fully and verify before moving to the next.

## Quick start — audit existing project
\`\`\`bash
# 1. Get the structured audit scan prompt
aigis audit --scan

# 2. Follow the scan instructions: inventory the project, detect traits, classify

# 3. Run the full audit with detected traits
aigis audit --traits uses-llm,processes-pii,is-external

# 4. Evaluate existing code against each check, produce gap report
\`\`\`

## When to use
- Before writing any LLM API call or AI feature (new code)
- When auditing an existing AI system for governance gaps (existing code)
- Before processing any sensitive data through an AI system
- Before deploying any AI feature to production
- When onboarding to a new AI project to understand what controls exist

## Commands
- \`aigis classify --traits <comma-separated>\` — get risk tier and relevant files
- \`aigis classify "<description>"\` — same, using natural language (keyword matching)
- \`aigis get <file-id> [file-id...]\` — fetch implementation patterns (one or more)
- \`aigis get <file-id> --lang py|js\` — fetch filtered to one language
- \`aigis verify <file-id> [file-id...]\` — fetch verification checklists
- \`aigis template <template-id> [template-id...]\` — fetch compliance documentation templates
- \`aigis audit --scan\` — get structured audit prompt for scanning existing codebases
- \`aigis audit --traits <comma-separated>\` — get bundled classification + all checklists for audit
- \`aigis search <query>\` — search across all content by keyword or control ID
- \`aigis search --list\` — list all available files
- \`aigis annotate <file-id> "<note>"\` — attach a local note for future sessions
- \`aigis annotate --list\` — list all annotations
- \`aigis init cursor|claude-code|windsurf|copilot\` — set up aigis for your IDE

## Available traits (22)
AI architecture: uses-llm, uses-rag, uses-finetuned, uses-thirdparty-api, is-agentic, is-multimodal
Data sensitivity: processes-pii, handles-financial, handles-health, handles-proprietary, handles-minors
Impact scope: influences-decisions, accepts-user-input, is-external, is-internal, is-high-volume
Output type: generates-code, generates-content, multi-model-pipeline
Jurisdiction: jurisdiction-eu, jurisdiction-us-regulated, jurisdiction-global

## Integration
- Claude Code: place this file in ~/.claude/skills/aigis/SKILL.md
- Cursor: run \`aigis init cursor\` in your project root
- Windsurf: run \`aigis init windsurf\` in your project root
- GitHub Copilot: run \`aigis init copilot\` in your project root
- Any agent: include aigis usage instructions in system prompt
