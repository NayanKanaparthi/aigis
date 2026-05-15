/**
 * Tests for v2.1 jurisdiction filtering helpers (lib/jurisdiction.js).
 * Pure-function tests; no fixtures needed.
 */

const fs = require('fs');
const path = require('path');
const {
  getUserJurisdictions,
  filterAreasByJurisdiction,
  stripJurisdictionGatedSections,
  readAreaJurisdictions,
  TRAIT_TO_JURISDICTION,
} = require('../lib/jurisdiction');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
}
function assertSetEq(a, b, msg) {
  const sa = a instanceof Set ? a : new Set(a);
  const sb = b instanceof Set ? b : new Set(b);
  if (sa.size !== sb.size || ![...sa].every((x) => sb.has(x))) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify([...sb])}\n  actual:   ${JSON.stringify([...sa])}`);
  }
}

// ── getUserJurisdictions ────────────────────────────────────────────────
test('getUserJurisdictions: empty', () => {
  assertSetEq(getUserJurisdictions([]), new Set(), 'empty traits → empty jurisdictions');
});
test('getUserJurisdictions: jurisdiction-eu → eu', () => {
  assertSetEq(getUserJurisdictions(['uses-llm', 'jurisdiction-eu']), new Set(['eu']), 'eu jurisdiction extracted');
});
test('getUserJurisdictions: jurisdiction-us-regulated → us-regulated', () => {
  assertSetEq(getUserJurisdictions(['handles-financial', 'jurisdiction-us-regulated']), new Set(['us-regulated']), 'us-regulated extracted');
});
test('getUserJurisdictions: both eu and us-regulated', () => {
  assertSetEq(getUserJurisdictions(['jurisdiction-eu', 'jurisdiction-us-regulated']), new Set(['eu', 'us-regulated']), 'both extracted');
});
test('getUserJurisdictions: jurisdiction-global ignored (meta-trait)', () => {
  assertSetEq(getUserJurisdictions(['jurisdiction-global']), new Set(), 'global is meta, no specific jurisdiction');
});
test('getUserJurisdictions: ignores non-jurisdiction traits', () => {
  assertSetEq(getUserJurisdictions(['uses-llm', 'processes-pii', 'is-eu-high-risk']), new Set(), 'no jurisdiction triggers');
});

// ── readAreaJurisdictions (real-file integration) ──────────────────────
test('readAreaJurisdictions: universal area (pii-handling) → null', () => {
  assertEq(readAreaJurisdictions('pii-handling'), null, 'pii-handling has no jurisdiction field');
});
test('readAreaJurisdictions: EU area (eu-ai-act-art-50-...) → ["eu"]', () => {
  const j = readAreaJurisdictions('eu-ai-act-art-50-transparency-disclosure');
  assertEq(JSON.stringify(j), '["eu"]', 'Art 50 declares jurisdiction: [eu]');
});
test('readAreaJurisdictions: missing file → null (fail-open)', () => {
  assertEq(readAreaJurisdictions('nonexistent-area'), null, 'missing file returns null');
});

// ── filterAreasByJurisdiction ──────────────────────────────────────────
test('filterAreasByJurisdiction: non-EU user drops EU areas', () => {
  const input = ['pii-handling', 'eu-ai-act-art-9-risk-management', 'audit-logging', 'eu-ai-act-art-50-transparency-disclosure'];
  const out = filterAreasByJurisdiction(input, new Set());
  assertEq(JSON.stringify(out), JSON.stringify(['pii-handling', 'audit-logging']), 'non-EU keeps universal areas only');
});
test('filterAreasByJurisdiction: EU user keeps EU areas', () => {
  const input = ['pii-handling', 'eu-ai-act-art-9-risk-management', 'audit-logging', 'eu-ai-act-art-50-transparency-disclosure'];
  const out = filterAreasByJurisdiction(input, new Set(['eu']));
  assertEq(JSON.stringify(out), JSON.stringify(input), 'EU user keeps everything (preserves order)');
});
test('filterAreasByJurisdiction: us-regulated user drops EU-only areas', () => {
  const input = ['pii-handling', 'eu-ai-act-art-9-risk-management'];
  const out = filterAreasByJurisdiction(input, new Set(['us-regulated']));
  assertEq(JSON.stringify(out), JSON.stringify(['pii-handling']), 'EU-tagged area dropped for US user');
});

// ── stripJurisdictionGatedSections ────────────────────────────────────
const SAMPLE_WITH_EU = `## Body of area

Some content here.

## EU AI Act extensions

### Article 14 stuff

EU-specific content.

## Anti-patterns

These exist regardless of jurisdiction.
`;

const SAMPLE_EU_AT_END = `## Body of area

Content.

## EU AI Act extensions

EU section at the very end of file.
`;

test('stripJurisdictionGatedSections: EU user gets unchanged content', () => {
  const out = stripJurisdictionGatedSections(SAMPLE_WITH_EU, new Set(['eu']));
  assertEq(out, SAMPLE_WITH_EU, 'EU user content unmodified');
});

test('stripJurisdictionGatedSections: non-EU user has EU section removed (mid-document)', () => {
  const out = stripJurisdictionGatedSections(SAMPLE_WITH_EU, new Set());
  assert(!out.includes('EU AI Act extensions'), 'EU heading removed');
  assert(!out.includes('EU-specific content'), 'EU body removed');
  assert(out.includes('## Anti-patterns'), 'subsequent ## heading preserved');
  assert(out.includes('Body of area'), 'preceding section preserved');
});

test('stripJurisdictionGatedSections: non-EU user has EU section removed (at EOF)', () => {
  const out = stripJurisdictionGatedSections(SAMPLE_EU_AT_END, new Set());
  assert(!out.includes('EU AI Act extensions'), 'EU heading removed at EOF');
  assert(out.includes('Body of area'), 'preceding content preserved');
});

test('stripJurisdictionGatedSections: us-regulated user (not EU) also strips EU section', () => {
  const out = stripJurisdictionGatedSections(SAMPLE_WITH_EU, new Set(['us-regulated']));
  assert(!out.includes('EU AI Act extensions'), 'us-regulated is not eu, so EU section stripped');
});

test('stripJurisdictionGatedSections: content without EU section is unchanged', () => {
  const plain = '## Body\n\nContent.\n## Anti-patterns\n\nMore.\n';
  assertEq(stripJurisdictionGatedSections(plain, new Set()), plain, 'no-op when no EU section');
  assertEq(stripJurisdictionGatedSections(plain, new Set(['eu'])), plain, 'no-op for EU user too');
});

test('stripJurisdictionGatedSections: real-world area file (human-oversight) — non-EU strips EU section', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content', 'skills', 'areas', 'human-oversight.md'), 'utf8');
  assert(content.includes('## EU AI Act extensions'), 'precondition: human-oversight has EU section');
  const out = stripJurisdictionGatedSections(content, new Set());
  assert(!out.includes('## EU AI Act extensions'), 'EU section removed for non-EU user');
  assert(out.includes('## What this addresses'), 'core area content preserved');
});

// ── runner ────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
