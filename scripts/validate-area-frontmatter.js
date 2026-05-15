#!/usr/bin/env node
/**
 * Validates frontmatter on every file in content/skills/areas/*.md.
 *
 * Schema: scripts/area-frontmatter.schema.json (reference doc, also validated
 * here by a hand-rolled subset of JSON Schema — same approach as
 * scripts/validate-triggers.js, no ajv dep).
 *
 * Doc:    docs/frontmatter-schema.md
 *
 * Exit codes:
 *   0  All area files satisfy the schema.
 *   1  At least one file failed; offending entries printed to stderr.
 *
 * Used by .github/workflows/area-frontmatter-validation.yml on PRs that touch
 * content/skills/areas/. Also runs locally:
 *   node scripts/validate-area-frontmatter.js
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const AREAS_DIR = path.join(ROOT, 'content', 'skills', 'areas');
const BASELINE_PATH = path.join(__dirname, 'area-controls-baseline.json');
const { ALL_TRAITS } = require(path.join(ROOT, 'lib', 'classify.js'));
const ALL_TRAITS_SET = new Set(ALL_TRAITS);

// v2.1 no-deletion baseline: existing area files (those listed in
// area-controls-baseline.json, captured at v2.0.2) must preserve their
// owasp/nist/iso42001 control arrays. Adding new framework citations
// (eu_ai_act) is fine; removing or modifying existing ones is a
// regression that breaks audit traceability.
let _baselineCache = null;
function loadBaseline() {
  if (_baselineCache) return _baselineCache;
  if (!fs.existsSync(BASELINE_PATH)) {
    _baselineCache = {};
    return _baselineCache;
  }
  _baselineCache = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return _baselineCache;
}

function arraysEqualSet(a, b) {
  const sa = new Set(a || []); const sb = new Set(b || []);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

const RISK_TIERS = new Set(['low', 'medium', 'high', 'all']);
const JURISDICTIONS = new Set(['eu', 'us-regulated']);

const RE_ID = /^[a-z][a-z0-9-]*$/;
const RE_OWASP = /^LLM\d{2}$/;
const RE_NIST = /^(MAP|MEASURE|MANAGE|GOVERN)-\d+(\.\d+)?$/;
const RE_ISO = /^(Clause-\d+(\.\d+)?|Annex-[A-Z](\.\d+)?|Annex-[A-Z])$/;
const RE_EU_AI_ACT = /^(Art-\d+(\([0-9a-z]+\))*|Annex-[IVX]+(\([0-9a-z]+\))*)$/;

function listAreaFiles() {
  return fs.readdirSync(AREAS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

function validateOne(filename) {
  const errors = [];
  const filepath = path.join(AREAS_DIR, filename);
  const expectedId = filename.replace(/\.md$/, '');
  const raw = fs.readFileSync(filepath, 'utf8');

  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    return [`frontmatter parse error: ${e.message}`];
  }
  const fm = parsed.data;

  // ── Required fields present
  for (const field of ['id', 'title', 'controls', 'min_risk_tier', 'system_traits']) {
    if (!(field in fm)) errors.push(`missing required field: ${field}`);
  }
  if (errors.length > 0) return errors;

  // ── id must match filename
  if (typeof fm.id !== 'string' || !RE_ID.test(fm.id)) {
    errors.push(`id "${fm.id}" must be lowercase-kebab-case`);
  } else if (fm.id !== expectedId) {
    errors.push(`id "${fm.id}" must match filename "${expectedId}"`);
  }

  // ── title is non-empty string
  if (typeof fm.title !== 'string' || fm.title.length === 0) {
    errors.push('title must be a non-empty string');
  }

  // ── controls shape
  if (typeof fm.controls !== 'object' || Array.isArray(fm.controls) || fm.controls === null) {
    errors.push('controls must be an object');
  } else {
    for (const key of ['owasp', 'nist', 'iso42001']) {
      if (!(key in fm.controls)) {
        errors.push(`controls.${key} is required (may be an empty array)`);
      } else if (!Array.isArray(fm.controls[key])) {
        errors.push(`controls.${key} must be an array`);
      }
    }
    // Validate control identifier patterns where the array exists
    for (const v of fm.controls.owasp || []) {
      if (typeof v !== 'string' || !RE_OWASP.test(v)) {
        errors.push(`controls.owasp value "${v}" does not match LLM##`);
      }
    }
    for (const v of fm.controls.nist || []) {
      if (typeof v !== 'string' || !RE_NIST.test(v)) {
        errors.push(`controls.nist value "${v}" does not match <FUNCTION>-N.N`);
      }
    }
    for (const v of fm.controls.iso42001 || []) {
      if (typeof v !== 'string' || !RE_ISO.test(v)) {
        errors.push(`controls.iso42001 value "${v}" does not match Clause-N or Annex-X[.N]`);
      }
    }
    // eu_ai_act is OPTIONAL — only validate if present
    if ('eu_ai_act' in fm.controls) {
      if (!Array.isArray(fm.controls.eu_ai_act)) {
        errors.push('controls.eu_ai_act must be an array if present');
      } else {
        for (const v of fm.controls.eu_ai_act) {
          if (typeof v !== 'string' || !RE_EU_AI_ACT.test(v)) {
            errors.push(`controls.eu_ai_act value "${v}" does not match Art-N[(N)(letter)] or Annex-X[(N)]`);
          }
        }
      }
    }
    // No other keys allowed under controls
    for (const k of Object.keys(fm.controls)) {
      if (!['owasp', 'nist', 'iso42001', 'eu_ai_act'].includes(k)) {
        errors.push(`controls.${k} is not a recognized framework key`);
      }
    }
    // ── v2.1 no-deletion check: existing areas must preserve their
    // owasp/nist/iso42001 arrays from the v2.0.2 baseline. Adding
    // eu_ai_act is fine; modifying the original three is a regression.
    const baseline = loadBaseline();
    if (baseline[expectedId]) {
      for (const fw of ['owasp', 'nist', 'iso42001']) {
        if (!arraysEqualSet(fm.controls[fw], baseline[expectedId][fw])) {
          const before = JSON.stringify(baseline[expectedId][fw]);
          const after = JSON.stringify(fm.controls[fw] || []);
          errors.push(
            `controls.${fw} changed from baseline ${before} → ${after}. ` +
            `Existing framework controls must be preserved (additive-only rule). ` +
            `If the change is intentional, update scripts/area-controls-baseline.json in the same commit.`
          );
        }
      }
    }
  }

  // ── min_risk_tier
  if (!RISK_TIERS.has(fm.min_risk_tier)) {
    errors.push(`min_risk_tier "${fm.min_risk_tier}" must be one of low | medium | high | all`);
  }

  // ── system_traits
  if (!Array.isArray(fm.system_traits) || fm.system_traits.length === 0) {
    errors.push('system_traits must be a non-empty array');
  } else {
    for (const t of fm.system_traits) {
      if (typeof t !== 'string' || !RE_ID.test(t)) {
        errors.push(`system_traits value "${t}" must be lowercase-kebab-case`);
      } else if (!ALL_TRAITS_SET.has(t)) {
        errors.push(`system_traits value "${t}" is not in lib/classify.js ALL_TRAITS`);
      }
    }
  }

  // ── jurisdiction (optional)
  if ('jurisdiction' in fm) {
    if (!Array.isArray(fm.jurisdiction) || fm.jurisdiction.length === 0) {
      errors.push('jurisdiction must be a non-empty array if present');
    } else {
      for (const j of fm.jurisdiction) {
        if (!JURISDICTIONS.has(j)) {
          errors.push(`jurisdiction value "${j}" must be one of: ${[...JURISDICTIONS].join(', ')}`);
        }
      }
    }
  }

  return errors;
}

function main() {
  const files = listAreaFiles();
  if (files.length === 0) {
    console.error(`No area files found in ${AREAS_DIR}`);
    process.exit(1);
  }

  let totalErrors = 0;
  let firstErrorFile = null;
  for (const f of files) {
    const errs = validateOne(f);
    if (errs.length > 0) {
      totalErrors += errs.length;
      if (!firstErrorFile) firstErrorFile = f;
      console.error(`\n✗ ${f}`);
      for (const e of errs) console.error(`    ${e}`);
    } else {
      console.log(`  ✓ ${f}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\nFAIL: ${totalErrors} schema error${totalErrors === 1 ? '' : 's'} across ${files.length} area file${files.length === 1 ? '' : 's'} (first failure: ${firstErrorFile}).`);
    console.error('See docs/frontmatter-schema.md for the schema contract.');
    process.exit(1);
  }
  console.log(`\nPASS: all ${files.length} area files satisfy the schema.`);
}

if (require.main === module) main();
module.exports = { validateOne, listAreaFiles };
