## Trigger mapping PR

Use this template for PRs that add or modify entries in `content/resolvers/triggers.json`. See `docs/resolvers.md` for the full curation policy.

### Phrase
<!-- the phrase that should trigger; case-insensitive substring match -->

### Tier
- [ ] High-confidence (phrase implies these traits in any realistic project; no plausible counterexample)
- [ ] Low-confidence (depends on context; requires user confirmation)

### Traits
<!-- list of traits this phrase should trigger; must be a subset of the 22 in lib/classify.js ALL_TRAITS -->

### Confirmation prompt (low-confidence only)
<!-- the question we ask the user; must end with "(yes / no / unsure)" and be answerable in one sentence -->

### Use case (required)
<!-- I'm building <X> and I needed this trigger because <Y>. PRs without a real use case are closed. -->

### Why this tier
<!--
HIGH: demonstrate that any reasonable project mentioning this phrase has these traits.
LOW: demonstrate a realistic counter-example — a project mentioning this phrase WITHOUT the trait applying.
-->

### Notes for maintainers
<!-- Anything that would help a future contributor understand the mapping. Optional. -->

### Validation
<!-- Confirm you ran `node scripts/validate-triggers.js` locally before submitting. -->
- [ ] Schema OK (`--schema`)
- [ ] All traits valid (`--traits`)
- [ ] Confirmation prompt OK (`--prompts`, low-confidence only)
- [ ] Alphabetical order preserved (`--ordering`)
