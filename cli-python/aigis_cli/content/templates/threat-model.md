---
id: threat-model
title: Threat Model Worksheet (MITRE ATLAS)
framework: MITRE ATLAS v2026.10 (threat catalog)
required_when: not required by classify; fill it in when you design, extend, launch or investigate an AI system
---

# Threat model

> The agent fills in each section for the system being built, then reviews it with the user. Keep it next to the code and update it when the system changes.

MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.

## 1. Draw the system

List every place text gets in and everything the AI can do. Attacks start at these entry points.

| Where text gets in | Source (users, emails, documents, tickets, tool outputs, retrieved content) | Trusted? | Reaches the model how |
|---|---|---|---|
| [entry point] | [source] | [yes / no] | [prompt, system prompt, retrieval, tool result] |

| What the AI can do | Kind (tools, write access, memory, data source, who sees output) | Needs approval? | Worst case if misused |
|---|---|---|---|
| [capability] | [kind] | [yes / no] | [what an attacker gains] |

## 2. Walk the tactics

For each tactic, ask: could an attacker do this here? Answer yes, no or unsure, with one line of reasoning tied to an entry point or capability from step 1.

| # | Tactic | Could an attacker do this here? | Why |
|---|---|---|---|
| 1 | Reconnaissance | | |
| 2 | Resource Development | | |
| 3 | AI Attack Adaptation | | |
| 4 | Initial Access | | |
| 5 | AI Model Access | | |
| 6 | Execution | | |
| 7 | Persistence | | |
| 8 | Privilege Escalation | | |
| 9 | Defense Evasion | | |
| 10 | Credential Access | | |
| 11 | Discovery | | |
| 12 | Lateral Movement | | |
| 13 | Collection | | |
| 14 | Command and Control | | |
| 15 | Exfiltration | | |
| 16 | Impact | | |

## 3. Prioritize

Run `aigis threats --traits <traits>` for this system. It lists the techniques for your entry points with Realized ones first (seen in real attacks), then Demonstrated, then Feasible. Order your work the same way, then by how bad the outcome would be for this system. ATLAS gives no number for this; the ordering is a judgment you write down.

| Priority | Technique (from `aigis threats`) | Entry point | Why it matters here |
|---|---|---|---|
| 1 | | | |

## 4. Pick defenses and record gaps

For each priority technique, list the mitigations MITRE links to it and the Aigis areas that help implement each one (in part). A gap is a mitigation with no mapped Aigis area. Never mark a gap as handled.

| Mitigation | Aigis area | Status (implemented, partial, gap) | Accepted or planned (owner, date) |
|---|---|---|---|
| | | | |

## 5. Red-team

Write one test case per top technique from `aigis threats`. Run it against the real system and record the result.

| Technique | Entry point | Attempt | Expected defense | Pass criteria | Result | Date |
|---|---|---|---|---|---|---|
| | | | | | | |

## Rerun when

- You add new tools
- You add write access
- You add memory
- You add a new data source
- Before launch
- After an incident
