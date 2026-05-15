/**
 * Tests for v2.1 `aigis report` (lib/report.js).
 *
 * Asserts:
 *   - buildReport produces a structured tree with the documented shape
 *   - format determinism: same project + same options + frozen timestamp
 *     produces byte-identical markdown report (timestamp is the only
 *     non-deterministic field; we inject a frozen Date)
 *   - JSON format is valid JSON and round-trips
 *   - jurisdiction gating: report header shows "(none — pass --jurisdiction eu)"
 *     when no jurisdiction; surfaces "Jurisdictions in scope: eu" otherwise
 *   - cross-framework count is correct
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buildReport, formatReportMarkdown, formatReportJSON } = require('../lib/report');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
}

const FROZEN_TS = new Date('2026-04-19T00:00:00.000Z');

// Set up a tiny project fixture
const PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'aigis-report-test-'));
fs.writeFileSync(path.join(PROJECT, 'app.py'), `
import re
import logging

logger = logging.getLogger("audit")

PII_PATTERNS = {
    "ssn": re.compile(r"\\b\\d{3}-\\d{2}-\\d{4}\\b"),
    "email": re.compile(r"\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b"),
    "phone": re.compile(r"\\b\\d{3}-\\d{3}-\\d{4}\\b"),
    "credit_card": re.compile(r"\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b"),
    "address": re.compile(r"\\b\\d+\\s+\\w+\\s+(St|Ave)\\b"),
}

def redact_pii(text):
    for name, pattern in PII_PATTERNS.items():
        text = pattern.sub(f"[{name.upper()}_REDACTED]", text)
    return text
`);

function cleanup() {
  try { fs.rmSync(PROJECT, { recursive: true, force: true }); } catch (_) {}
}

function maskTimestamp(s) {
  return s.replace(/^> Generated: [^\n]+$/m, '> Generated: <TS>')
          .replace(/^> Aigis version: [^\n]+$/m, '> Aigis version: <VERSION>');
}
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// ── Structural tests ─────────────────────────────────────────────────
test('buildReport: returns documented shape', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['pii-handling'],
    jurisdictions: [],
    timestamp: FROZEN_TS,
  });
  assert(r.generated_at, 'has generated_at');
  assert(r.aigis_version, 'has aigis_version');
  assertEq(r.project_dir, PROJECT, 'project_dir matches');
  assert(Array.isArray(r.user_jurisdictions), 'user_jurisdictions is array');
  assertEq(r.user_jurisdictions.length, 0, 'no jurisdictions specified');
  assertEq(r.summary.areas_evaluated, 1, 'one area');
  assert(r.summary.cross_framework_coverage, 'has cross_framework_coverage');
  assertEq(r.per_area.length, 1, 'per_area length');
  assertEq(r.per_area[0].area, 'pii-handling', 'area id correct');
  assert(['PASS', 'PARTIAL', 'FAIL', 'NO_CHECKS'].includes(r.per_area[0].status), 'status valid');
});

test('buildReport: errors gracefully on missing area', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['nonexistent-area'],
    jurisdictions: [],
    timestamp: FROZEN_TS,
  });
  assertEq(r.per_area[0].status, 'ERROR', 'missing area → ERROR status');
  assert(r.per_area[0].error, 'error message present');
});

// ── Determinism (modulo timestamp + version) ─────────────────────────
test('formatReportMarkdown: byte-identical across 3 runs (post-mask)', () => {
  const hashes = new Set();
  for (let i = 0; i < 3; i++) {
    const r = buildReport({
      projectDir: PROJECT,
      areas: ['pii-handling', 'audit-logging'],
      jurisdictions: ['eu'],
      timestamp: FROZEN_TS,
    });
    hashes.add(hash(maskTimestamp(formatReportMarkdown(r))));
  }
  assertEq(hashes.size, 1, 'three runs produce identical markdown (post-mask)');
});

test('formatReportJSON: valid JSON, round-trips', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['pii-handling'],
    jurisdictions: [],
    timestamp: FROZEN_TS,
  });
  const j = formatReportJSON(r);
  const parsed = JSON.parse(j);
  assertEq(parsed.summary.areas_evaluated, 1, 'JSON round-trips');
});

// ── Jurisdiction surfacing in markdown ───────────────────────────────
test('markdown: no jurisdiction → header notes "(none — pass --jurisdiction eu)"', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['pii-handling'],
    jurisdictions: [],
    timestamp: FROZEN_TS,
  });
  const md = formatReportMarkdown(r);
  assert(md.includes('Jurisdictions in scope: (none'), 'no-jurisdiction header present');
});

test('markdown: --jurisdiction eu → header lists eu', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['pii-handling'],
    jurisdictions: ['eu'],
    timestamp: FROZEN_TS,
  });
  const md = formatReportMarkdown(r);
  assert(md.includes('Jurisdictions in scope: eu'), 'eu header present');
});

test('markdown: EU AI Act citations only surface for areas that declare eu_ai_act AND user is in eu', () => {
  // human-oversight has eu_ai_act: [Art-14, Art-14(4)] (added in Step 3)
  const rEu = buildReport({
    projectDir: PROJECT,
    areas: ['human-oversight'],
    jurisdictions: ['eu'],
    timestamp: FROZEN_TS,
  });
  const rNoEu = buildReport({
    projectDir: PROJECT,
    areas: ['human-oversight'],
    jurisdictions: [],
    timestamp: FROZEN_TS,
  });
  assert(formatReportMarkdown(rEu).includes('EU AI Act: `Art-14`'), 'EU citation present in EU report');
  assert(!formatReportMarkdown(rNoEu).includes('EU AI Act: `Art-14`'), 'EU citation absent in non-EU report');
});

// ── Cross-framework coverage count ───────────────────────────────────
test('summary.cross_framework_coverage: counts unique citations across areas', () => {
  const r = buildReport({
    projectDir: PROJECT,
    areas: ['pii-handling', 'audit-logging'],
    jurisdictions: ['eu'],
    timestamp: FROZEN_TS,
  });
  const c = r.summary.cross_framework_coverage;
  assert(c.owasp_count >= 1, 'owasp count > 0 (LLM02 from pii)');
  assert(c.nist_count >= 4, 'nist count >= 4 (multiple from both)');
  assert(c.iso42001_count >= 4, 'iso count >= 4');
  assert(c.eu_ai_act_count >= 1, 'eu_ai_act count >= 1 (audit-logging Art 12)');
});

// ── runner ───────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
cleanup();
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
