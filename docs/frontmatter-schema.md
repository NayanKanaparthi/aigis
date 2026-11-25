# Area frontmatter schema

This document is the contract for YAML frontmatter on area files in `content/skills/areas/`. It is enforced by `scripts/validate-area-frontmatter.js` and tested in `test/frontmatter-schema.test.js`.

> **Scope.** This schema applies to `content/skills/areas/*.md` only. Workflows (`content/skills/workflows/`), infrastructure (`content/skills/infrastructure/`), templates (`content/templates/`), and the core skill (`content/skills/core.md`) have their own shapes and are not validated by this script.

## Shape

```yaml
---
id: <area-id>                                  # REQUIRED — must match the filename without .md
title: <descriptive title>                     # REQUIRED — single-line human-readable
controls:                                       # REQUIRED — at least three framework keys present
  owasp: [LLM02, ...]                          # REQUIRED key, array (may be empty)
  nist: [MAP-2.1, ...]                          # REQUIRED key, array (may be empty)
  iso42001: [Annex-A.7, ...]                   # REQUIRED key, array (may be empty)
  eu_ai_act: [Art-50, Art-13(1)(b)]            # OPTIONAL — list of EU AI Act article references
  atlas: [AML.M0020, AML.M0036]                # OPTIONAL: MITRE ATLAS mitigation ids this area helps implement (in part) (may be empty)
min_risk_tier: all                             # REQUIRED — one of: low | medium | high | all
system_traits: [processes-pii, ...]            # REQUIRED — non-empty array of trait identifiers
jurisdiction: [eu]                             # OPTIONAL — list of jurisdictions where this area applies
                                               #            absence = applies in all jurisdictions
---
```

## Field semantics

### `id` (required)

The area identifier. **Must equal the filename without the `.md` extension.** Used by `aigis get <id>`, `aigis verify <id>`, and frontmatter cross-references in briefs and IDE rules.

### `title` (required)

Human-readable single-line title. Surfaced in `aigis search --list`, brief headers, and compact-mode area pointers.

### `controls` (required)

Maps the area's verification checkpoints to external framework controls. Used by `aigis verify` to cite the regulatory provenance of each PASS/FAIL.

| Key | Required | Format | Examples |
|---|---|---|---|
| `owasp` | yes (may be empty) | `LLM##` | `LLM02`, `LLM10` |
| `nist` | yes (may be empty) | `<FUNCTION>-N.N` | `MAP-2.1`, `MEASURE-2.10`, `GOVERN-6.1` |
| `iso42001` | yes (may be empty) | `Clause-N` or `Annex-X[.N]` | `Clause-9.1`, `Annex-A.7`, `Annex-C` |
| `eu_ai_act` | no | `Art-N[(N)(letter)]` or `Annex-X[(N)]` | `Art-9`, `Art-10(2)(g)`, `Art-14(4)(c)`, `Annex-IV` |
| `atlas` | no (may be empty) | `AML.M####`, a mitigation in the pinned ATLAS catalog | `AML.M0020`, `AML.M0036` |

The `eu_ai_act` field is the v2.1 addition. It is optional on existing areas; new EU-specific areas declare it.

### `controls.atlas` (optional, v3.0 addition)

Lists the MITRE ATLAS mitigation ids that this area's procedure helps implement (in part). Written as one flow-style line, last key of `controls`, ids in ascending order. An empty list (`atlas: []`) means no approved link: the area helps no ATLAS mitigation in a way Aigis is willing to claim.

- **"Helps implement (in part)", never "implements" or "satisfies".** Following an area's procedure helps with the listed mitigation; it does not mean the mitigation is fully in place in your system. MITRE ATLAS is a threat catalog, not a standard, so there is nothing to comply with.
- **Mitigations, not techniques.** Every value matches `^AML\.M\d{4}$` and must exist in the vendored catalog `content/index/atlas.json` (ATLAS 2026.10). Technique ids (`AML.T####`) are rejected here. The techniques an area helps against are derived at runtime from MITRE's own `mitigates` links in the catalog (`lib/atlas.js`); they are never stored in frontmatter.
- **Never jurisdiction-gated.** ATLAS citations apply everywhere, so an area that declares `jurisdiction:` must not declare `atlas`. The four `eu-ai-act-*` areas carry no `atlas` key.
- **How a mapping change is approved.** The values come from the approved gold file `build/atlas/gold/area-mitigations.json` (rows with `decision: include`). Adding, removing or changing a link means editing that gold file and getting the project owner's (Nayan's) approval recorded in `build/atlas/gold/APPROVAL.md`, then updating the area frontmatter and `scripts/area-controls-baseline.json` in the same commit. The validator's no-deletion check protects `atlas` like the other framework arrays.
- If `content/index/atlas.json` is missing or is not the pinned release, `scripts/validate-area-frontmatter.js` fails (exit 1) with a message naming the catalog.

Raw file fetches (`aigis get`, `aigis search`) print the `atlas:` line verbatim as part of the stored frontmatter.

### `min_risk_tier` (required)

The minimum risk tier at which this area should be recommended. Values:
- `low` — recommended for low/medium/high risk systems
- `medium` — recommended for medium/high risk systems
- `high` — recommended for high-risk systems only
- `all` — equivalent to `low` (recommended for all tiers)

### `system_traits` (required, non-empty)

The trait identifiers that, when present in the user's resolved trait set, cause this area to be recommended. Logical OR — any single matching trait pulls the area in. Trait identifiers must be valid (defined in `lib/classify.js`'s `ALL_TRAITS` set).

### `jurisdiction` (optional — v2.1 addition)

Gates which framework controls render in the brief, **not** which areas appear (that's still trait-driven via `system_traits`).

| Value | Meaning |
|---|---|
| absent | Area's controls render under all jurisdictions |
| `[eu]` | Area's controls render only when `jurisdiction-eu` is in the user's trait set |
| `[us-regulated]` | Area's controls render only when `jurisdiction-us-regulated` is in the user's trait set |
| `[eu, us-regulated]` | Renders under either |

**Why this distinction matters.** `system_traits` decides whether an area appears in the brief at all. `jurisdiction` decides whether its EU-specific controls (and any other jurisdiction-bound content) get included. An area can apply universally as a procedure (e.g. `human-oversight`) while also having EU-specific extensions that only render for EU-jurisdictioned projects.

## Backward compatibility

All v2.0 area files satisfy this schema unchanged — `eu_ai_act`, `jurisdiction` and `atlas` are pure additions. The validator runs against the full `content/skills/areas/` directory in CI; any existing file that fails is a regression.
