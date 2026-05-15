/**
 * Tests for area frontmatter schema (v2.1 addition).
 *
 *   1. All current area files satisfy the schema (regression catch).
 *   2. The validator actually detects each documented schema violation
 *      (positive control on the validator itself).
 *
 * If a contributor adds a new area or extends frontmatter, both test suites
 * must continue to pass. If contributor extends the schema, update the
 * negative-test fixtures too — they are the contract.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { validateOne, listAreaFiles } = require('../scripts/validate-area-frontmatter');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

// ── 1. All current area files pass ─────────────────────────────────────
test('all area files in content/skills/areas/ satisfy the schema', () => {
  const files = listAreaFiles();
  assert(files.length >= 15, `expected at least 15 area files, got ${files.length}`);
  const failures = {};
  for (const f of files) {
    const errs = validateOne(f);
    if (errs.length > 0) failures[f] = errs;
  }
  assertEq(
    Object.keys(failures).length, 0,
    `expected zero schema failures; got: ${JSON.stringify(failures, null, 2)}`
  );
});

// ── 2. Negative-control fixtures — validator must detect each violation ──
//
// Strategy: write a temp area file with the violation, run validateOne against
// it via a temp-area-dir mock, assert the expected error string appears.
//
// We can't easily pass a custom directory to validateOne (it reads from a
// fixed AREAS_DIR). Instead we reproduce the validation logic against a
// fake fm object — i.e. test the *rules* that the validator encodes by
// asserting the validator raises on a fixture file we drop into a temp
// area-dir-like location and reload with require.cache invalidation.
//
// Simpler: drop fixture files into a sibling temp dir, then run the
// validator's per-file logic through a thin wrapper. We reuse validateOne
// by writing each fixture into the actual areas dir under a `xtest-`
// prefix and immediately deleting after the test.

const AREAS_DIR = path.join(__dirname, '..', 'content', 'skills', 'areas');
const FIXTURE_PREFIX = 'xtest-';

function withFixture(filename, contents, fn) {
  const fullName = FIXTURE_PREFIX + filename;
  const fullPath = path.join(AREAS_DIR, fullName);
  fs.writeFileSync(fullPath, contents);
  try {
    return fn(fullName);
  } finally {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
}

const VALID_BASE = `---
id: xtest-fixture
title: Fixture area
controls:
  owasp: [LLM01]
  nist: [MAP-2.1]
  iso42001: [Annex-A.7]
min_risk_tier: all
system_traits: [uses-llm]
---

Body content.
`;

test('negative: missing required field "title" raises', () => {
  const broken = VALID_BASE.replace(/^title:.*\n/m, '');
  withFixture('fixture.md', broken, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /missing required field: title/.test(e)),
      `expected "missing required field: title" error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: id mismatch with filename raises', () => {
  withFixture('fixture.md', VALID_BASE.replace(/^id:.*$/m, 'id: wrong-id'), (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /must match filename/.test(e)),
      `expected id-mismatch error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: invalid OWASP control format raises', () => {
  const bad = VALID_BASE.replace('owasp: [LLM01]', 'owasp: [LLM-99-bad]');
  withFixture('fixture.md', bad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /controls\.owasp/.test(e)),
      `expected controls.owasp error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: invalid min_risk_tier raises', () => {
  const bad = VALID_BASE.replace('min_risk_tier: all', 'min_risk_tier: critical');
  withFixture('fixture.md', bad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /min_risk_tier/.test(e)),
      `expected min_risk_tier error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: empty system_traits raises', () => {
  const bad = VALID_BASE.replace('system_traits: [uses-llm]', 'system_traits: []');
  withFixture('fixture.md', bad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /system_traits.*non-empty/.test(e)),
      `expected non-empty system_traits error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: unknown trait in system_traits raises', () => {
  const bad = VALID_BASE.replace('system_traits: [uses-llm]', 'system_traits: [uses-llm, made-up-trait]');
  withFixture('fixture.md', bad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /made-up-trait/.test(e) && /ALL_TRAITS/.test(e)),
      `expected unknown-trait error, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: invalid jurisdiction value raises', () => {
  const bad = VALID_BASE.replace('---\n\nBody', '---\njurisdiction: [mars]\n---\n\nBody');
  // Slight rewrite for the field placement
  const correctBad = VALID_BASE.replace(/^min_risk_tier: all$/m, 'min_risk_tier: all\njurisdiction: [mars]');
  withFixture('fixture.md', correctBad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /jurisdiction.*mars/.test(e)),
      `expected jurisdiction enum error, got: ${JSON.stringify(errs)}`);
  });
});

// ── 3. Positive: new optional fields parse correctly ──────────────────
test('positive: eu_ai_act control field validates', () => {
  const withEu = VALID_BASE.replace(
    'iso42001: [Annex-A.7]',
    'iso42001: [Annex-A.7]\n  eu_ai_act: [Art-50, Art-13(1)(b), Annex-IV]'
  );
  withFixture('fixture.md', withEu, (fname) => {
    const errs = validateOne(fname);
    assertEq(errs.length, 0, `expected 0 errors with eu_ai_act, got: ${JSON.stringify(errs)}`);
  });
});

test('positive: jurisdiction field validates', () => {
  const withJ = VALID_BASE.replace(
    /^min_risk_tier: all$/m,
    'min_risk_tier: all\njurisdiction: [eu]'
  );
  withFixture('fixture.md', withJ, (fname) => {
    const errs = validateOne(fname);
    assertEq(errs.length, 0, `expected 0 errors with jurisdiction, got: ${JSON.stringify(errs)}`);
  });
});

test('negative: malformed eu_ai_act value raises', () => {
  const bad = VALID_BASE.replace(
    'iso42001: [Annex-A.7]',
    'iso42001: [Annex-A.7]\n  eu_ai_act: [Article-50]'  // wrong format (should be Art-)
  );
  withFixture('fixture.md', bad, (fname) => {
    const errs = validateOne(fname);
    assert(errs.some((e) => /eu_ai_act.*Article-50/.test(e)),
      `expected eu_ai_act format error, got: ${JSON.stringify(errs)}`);
  });
});

// ── runner ────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
