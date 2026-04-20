# Contributing to Aigis

Thanks for your interest in contributing. This guide is short on purpose — most contributions follow one of a few well-trodden paths.

## Where to put what

- **Governance pattern content** (the procedures agents follow): `content/skills/areas/<id>.md`
- **Workflow scaffolding** (canonical file layouts per project type): `content/skills/workflows/<type>.md`
- **Trigger mappings** (natural-language → trait): `content/resolvers/triggers.json` — see [Trigger mappings](#trigger-mappings) below.
- **Verification checklists** (used by `aigis verify`): `content/verify/checklist-<id>.md`
- **Auto-verify rules** (deterministic scanner patterns): `content/index/auto-verify-rules.json`
- **CLI behavior**: `bin/aigis.js` and `lib/*.js`

## Trigger mappings

To add or modify entries in `content/resolvers/triggers.json`:

1. Read [`docs/resolvers.md`](docs/resolvers.md) — the tier rule and curation policy.
2. Pick a tier per the decision rule. When in doubt, low-confidence.
3. Insert the entry alphabetically within the appropriate tier (case-insensitive sort).
4. Run validation locally: `node scripts/validate-triggers.js`
5. Open a PR using `.github/PULL_REQUEST_TEMPLATE/trigger_mapping.md`.

**The use-case requirement is non-negotiable.** Every trigger PR includes a one-sentence real use case (`"I'm building X and I needed this trigger because Y."`). PRs without a real use case are closed. We curate based on actual demand, not theoretical taxonomy completeness.

The PR template enforces structure; CI runs four validations on the JSON via `.github/workflows/triggers-validation.yml`.

## CLI / library changes

- Add CLI-deterministic tests next to the change. Where existing tests exist (e.g., `test/checksum-determinism.test.js`), follow their pattern.
- Backward compatibility: not promised across alpha releases. After v2.0 final ships, breaking changes go through a deprecation notice and a major version bump.
- Python CLI mirrors the JS CLI structurally (see `cli-python/aigis_cli/`). Functional parity is best-effort; JS is the primary runtime for the v2.0 benchmark.

## Running aigis from this checkout

```
git clone <repo>
cd aigis-cli
npm install
npm link               # makes the in-repo build the global `aigis`
aigis --version        # confirms you're on the branch's version
```

To restore the published version: `npm unlink -g @aigis-ai/cli && npm install -g @aigis-ai/cli`.

## Tests

```
node scripts/validate-triggers.js     # JSON validation (schema, traits, prompts, ordering)
node test/checksum-determinism.test.js  # checksum reproducibility
```

(Test runner is the standard Node test runner via the `test:` script in `package.json`. We do not use a heavyweight test framework.)
