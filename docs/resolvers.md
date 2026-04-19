# Resolvers

Aigis's resolver translates natural-language project descriptions into the trait set classify uses to recommend governance areas. The same source — `content/resolvers/triggers.json` — is consumed by both the CLI (when you run `aigis classify "<description>"`) and embedded in the IDE rules file by `aigis init` (so coding agents apply the same rules in-IDE).

## The two tiers

**High-confidence:** the phrase implies the listed traits in essentially every realistic project where it appears. There is no plausible counterexample. Auto-applied — no user prompt.

**Low-confidence:** the phrase implies the listed traits only some of the time. There is a realistic project where the phrase appears WITHOUT the trait applying. Requires a confirmation prompt (`yes / no / unsure`); applied only on `yes`.

## Decision rule for new entries

If you can describe a real project where the phrase appears but the trait does not apply, the entry is low-confidence. When in doubt, low-confidence — false-positive auto-application is worse than an extra confirmation prompt.

## How the resolver is consumed

**CLI flow:**

```
aigis classify "<plain English description>"
```

The CLI reads `triggers.json`, scans the description for phrases, and emits:

- `high_confidence_matches` — phrases that fired with their traits (auto-applied)
- `low_confidence_suggestions` — phrases that need confirmation
- `final_traits` — the resolved trait set after confirmations

In a TTY, the CLI prompts interactively for each low-confidence suggestion. With `--json`, with `--confirm <ids>`, with `--reject <ids>`, or in a non-TTY environment (CI, piped), no prompt is shown and low-confidence defaults to rejected unless explicitly confirmed.

**Agent flow:**

`aigis init <ide>` embeds a checksum-guarded markdown table into the IDE rules file (.cursorrules / SKILL.md / etc.). The agent reads the table inline alongside the user's chat message and applies the same matching rules — auto-apply for high-confidence, ask the user for low-confidence.

Both consumers see the exact same table because both load from `triggers.json`. The block in the rules file carries a SHA-256 of the canonical JSON content; running `aigis init` again confirms the block is up to date or surfaces a mismatch.

## Schema

```jsonc
{
  "version": "1.0",
  "tier_rule": "<the tier rule, inline>",
  "high_confidence": {
    "<phrase>": {
      "traits": ["<trait>", ...],
      "confidence": "high",
      "notes": "<one-line maintainer note>",
      "context_filter": ["web", "agentic"]    // OPTIONAL
    }
  },
  "low_confidence": {
    "<phrase>": {
      "traits": ["<trait>", ...],
      "confidence": "low",
      "confirmation_prompt": "<question ending in '(yes / no / unsure)'>",
      "notes": "<one-line maintainer note>",
      "context_filter": ["web"]               // OPTIONAL
    }
  }
}
```

Required fields are enforced by `scripts/validate-triggers.js` (run automatically on PRs touching this file via `.github/workflows/triggers-validation.yml`).

- `version`: `N.N` string. Bumped on schema changes, not on entry additions.
- `tier_rule`: prose, inline at the top so the JSON is self-documenting.
- `confidence`: redundant with the tier grouping but kept inline so future reorganizations don't restructure entries.
- `context_filter`: reserved for `aigis get --context` integration; safe to omit.
- Phrase keys must be sorted case-insensitively within each tier.

## Matching semantics

- Case-insensitive substring match against the input description.
- Multi-word phrases match contiguously.
- A phrase that appears only inside a longer word does match (e.g., "RAG" matches "RAGgedy"; this is acceptable for the v1.0 ruleset). Submit a high-precision boundary-aware mapping if it bites in practice.

## How to add a mapping

1. Open `content/resolvers/triggers.json`.
2. Decide tier per the decision rule above.
3. Insert the entry alphabetically within the appropriate tier.
4. For low-confidence: write a `confirmation_prompt` that ends with `(yes / no / unsure)` and is answerable in one sentence.
5. Run `node scripts/validate-triggers.js` locally before submitting.
6. Open a PR using `.github/PULL_REQUEST_TEMPLATE/trigger_mapping.md`.

## The use-case requirement

Every trigger PR must include a one-sentence use case: *"I'm building X and I needed this trigger because Y."* This is non-negotiable. We curate based on actual demand, not theoretical taxonomy completeness. PRs without a real use case are closed.

## Curation policy

- We accept high-confidence entries only when no plausible counterexample exists.
- We accept low-confidence entries when the confirmation prompt is answerable yes/no in one sentence.
- We reject phrases that are too generic to be useful (`AI`, `data`, `users`) — they would fire on every project.
- We prefer English phrasings with broad reach over jargon.
- When the same phrase has both a strict and a loose interpretation, low-confidence wins.

## Resolver block in the IDE rules file

After `aigis init <ide>`, the rules file (`.cursorrules`, `SKILL.md`, etc.) contains a delimited block:

```
# --- AIGIS RESOLVER BLOCK START (checksum: <sha256-hex>) ---
... rendered table ...
# --- AIGIS RESOLVER BLOCK END ---
```

The agent reads this block alongside the user's natural-language description and applies high-confidence matches directly, asking the user for low-confidence matches. The checksum lets `aigis init` detect when the block is stale (after Aigis updates) or has been hand-edited; on mismatch, init refuses unless `--refresh` is passed.

The block is regenerated deterministically from `triggers.json`. The rendering algorithm (column widths, ordering) is in `lib/init.js`'s `renderResolverBlock()` function. Two consecutive runs with the same `triggers.json` content produce byte-identical blocks.

## The fixed checksum determinism test

`test/checksum-determinism.test.js` pins the SHA-256 of the shipped `triggers.json` as a literal. Any change to the JSON content (even a trailing space) will break the test until the new checksum is committed alongside the JSON change. This catches platform-specific serialization bugs (line endings, BOM) that would otherwise produce silent drift between local and CI builds.
