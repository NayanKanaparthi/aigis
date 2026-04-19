#!/usr/bin/env node
/**
 * Validates content/resolvers/triggers.json against four checks:
 *   --schema    JSON shape valid (uses scripts/triggers.schema.json)
 *   --traits    every trait used appears in lib/classify.js ALL_TRAITS
 *   --prompts   every low-confidence entry has a confirmation_prompt
 *   --ordering  entries are alphabetical (case-insensitive) within each tier
 *
 * No flags: run all four. Exits non-zero on first failure with a clear message
 * pointing at the offending entry.
 *
 * Used by .github/workflows/triggers-validation.yml on PRs touching the file.
 * Also runs locally: `node scripts/validate-triggers.js`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TRIGGERS_PATH = path.join(ROOT, 'content', 'resolvers', 'triggers.json');
const SCHEMA_PATH = path.join(__dirname, 'triggers.schema.json');
const { ALL_TRAITS } = require(path.join(ROOT, 'lib', 'classify.js'));

function loadTriggers() {
  return JSON.parse(fs.readFileSync(TRIGGERS_PATH, 'utf8'));
}

// ── --schema ───────────────────────────────────────────────────────────
// Minimal hand-rolled JSON Schema validator (subset sufficient for our schema).
// Avoids pulling in ajv as a runtime dep; the schema file remains useful as a
// reference for editors/contributors regardless.
function validateSchema() {
  const t = loadTriggers();
  const errors = [];

  if (!t.version || typeof t.version !== 'string' || !/^\d+\.\d+$/.test(t.version)) {
    errors.push('version: missing or not in N.N format');
  }
  if (!t.tier_rule || typeof t.tier_rule !== 'string' || t.tier_rule.length < 50) {
    errors.push('tier_rule: missing or shorter than 50 chars');
  }
  if (!t.high_confidence || typeof t.high_confidence !== 'object') {
    errors.push('high_confidence: missing or not an object');
  }
  if (!t.low_confidence || typeof t.low_confidence !== 'object') {
    errors.push('low_confidence: missing or not an object');
  }

  const allowedHighKeys = new Set(['traits', 'confidence', 'notes', 'context_filter']);
  const allowedLowKeys = new Set(['traits', 'confidence', 'confirmation_prompt', 'notes', 'context_filter']);
  const allowedContexts = new Set(['web', 'agentic', 'rag', 'batch']);

  function checkEntry(tier, key, entry, allowed, expectedConfidence) {
    const where = `${tier}.${key}`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where}: not an object`); return;
    }
    for (const k of Object.keys(entry)) {
      if (!allowed.has(k)) errors.push(`${where}: unknown key '${k}'`);
    }
    if (!Array.isArray(entry.traits) || entry.traits.length === 0) {
      errors.push(`${where}: traits must be a non-empty array`);
    }
    if (entry.confidence !== expectedConfidence) {
      errors.push(`${where}: confidence must be '${expectedConfidence}'`);
    }
    if (!entry.notes || typeof entry.notes !== 'string') {
      errors.push(`${where}: notes required`);
    }
    if (entry.context_filter !== undefined) {
      if (!Array.isArray(entry.context_filter)) {
        errors.push(`${where}: context_filter must be an array`);
      } else {
        for (const c of entry.context_filter) {
          if (!allowedContexts.has(c)) errors.push(`${where}: unknown context '${c}'`);
        }
      }
    }
  }

  for (const [k, v] of Object.entries(t.high_confidence || {})) {
    checkEntry('high_confidence', k, v, allowedHighKeys, 'high');
  }
  for (const [k, v] of Object.entries(t.low_confidence || {})) {
    checkEntry('low_confidence', k, v, allowedLowKeys, 'low');
  }
  return errors;
}

// ── --traits ──────────────────────────────────────────────────────────
function validateTraits() {
  const t = loadTriggers();
  const errors = [];
  const valid = new Set(ALL_TRAITS);
  function check(tier, entries) {
    for (const [phrase, entry] of Object.entries(entries || {})) {
      for (const trait of (entry.traits || [])) {
        if (!valid.has(trait)) {
          errors.push(`${tier}.${phrase}: unknown trait '${trait}'. Must be one of: ${ALL_TRAITS.join(', ')}`);
        }
      }
    }
  }
  check('high_confidence', t.high_confidence);
  check('low_confidence', t.low_confidence);
  return errors;
}

// ── --prompts ─────────────────────────────────────────────────────────
function validatePrompts() {
  const t = loadTriggers();
  const errors = [];
  for (const [phrase, entry] of Object.entries(t.low_confidence || {})) {
    if (!entry.confirmation_prompt || typeof entry.confirmation_prompt !== 'string' || entry.confirmation_prompt.length < 20) {
      errors.push(`low_confidence.${phrase}: confirmation_prompt missing or shorter than 20 chars`);
    } else if (!/\(yes\s*\/\s*no\s*\/\s*unsure\)/i.test(entry.confirmation_prompt)) {
      errors.push(`low_confidence.${phrase}: confirmation_prompt must end with '(yes / no / unsure)'`);
    }
  }
  return errors;
}

// ── --ordering ────────────────────────────────────────────────────────
function validateOrdering() {
  const t = loadTriggers();
  const errors = [];
  function check(tier, entries) {
    const keys = Object.keys(entries || {});
    const sorted = [...keys].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== sorted[i]) {
        errors.push(`${tier}: entries not alphabetical (case-insensitive). First mismatch at index ${i}: got '${keys[i]}', expected '${sorted[i]}'.`);
        break;
      }
    }
  }
  check('high_confidence', t.high_confidence);
  check('low_confidence', t.low_confidence);
  return errors;
}

// ── runner ────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const flags = args.length > 0 ? args : ['--schema', '--traits', '--prompts', '--ordering'];
  const checks = {
    '--schema': ['Schema', validateSchema],
    '--traits': ['Trait validity', validateTraits],
    '--prompts': ['Confirmation prompts', validatePrompts],
    '--ordering': ['Alphabetical ordering', validateOrdering],
  };

  let totalErrors = 0;
  for (const flag of flags) {
    if (!checks[flag]) {
      console.error(`Unknown flag: ${flag}`);
      process.exit(2);
    }
    const [name, fn] = checks[flag];
    const errors = fn();
    if (errors.length === 0) {
      console.log(`✓ ${name} OK`);
    } else {
      console.log(`✗ ${name} (${errors.length}):`);
      for (const e of errors) console.log(`    ${e}`);
      totalErrors += errors.length;
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} validation error(s).`);
    process.exit(1);
  }
}

if (require.main === module) main();
