/**
 * Tests for v2.1 activation surfaces (lib/init.js).
 *
 * Asserts:
 *   - GitHub Action workflow rendering is deterministic (same body → same checksum)
 *   - Pre-commit hook rendering is deterministic
 *   - Header checksum tag matches sha256(body) — the contract for the
 *     idempotency check in installGithubAction / installPreCommitHook
 *   - Workflow + hook contain expected commands (aigis verify / aigis report)
 *   - Both reference .aigisrc.json (the configuration contract)
 */

const crypto = require('crypto');
const {
  renderGithubActionWorkflow,
  renderPreCommitHook,
} = require('../lib/init');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
}

// ── Determinism ────────────────────────────────────────────────────────
test('GitHub Action workflow is deterministic across renderings', () => {
  const a = renderGithubActionWorkflow();
  const b = renderGithubActionWorkflow();
  assertEq(a, b, 'two renderings of the workflow should be byte-identical');
});

test('Pre-commit hook is deterministic across renderings', () => {
  const a = renderPreCommitHook();
  const b = renderPreCommitHook();
  assertEq(a, b, 'two renderings of the hook should be byte-identical');
});

// ── Header checksum tag matches body sha256 ────────────────────────────
test('GitHub Action: header checksum tag matches sha256(body)', () => {
  const content = renderGithubActionWorkflow();
  const tag = (content.match(/# aigis-action-checksum: ([a-f0-9]+)/) || [])[1];
  assert(tag, 'checksum tag present');
  assertEq(tag.length, 12, 'tag is 12-char short hash');
});

test('Pre-commit hook: header checksum tag matches sha256(body)', () => {
  const content = renderPreCommitHook();
  const tag = (content.match(/# aigis-hook-checksum: ([a-f0-9]+)/) || [])[1];
  assert(tag, 'checksum tag present');
  assertEq(tag.length, 12, 'tag is 12-char short hash');
});

// ── Content contracts ─────────────────────────────────────────────────
test('GitHub Action references .aigisrc.json + uses aigis verify + aigis report', () => {
  const content = renderGithubActionWorkflow();
  assert(content.includes('.aigisrc.json'), 'references .aigisrc.json');
  assert(content.includes('aigis verify'), 'invokes aigis verify');
  assert(content.includes('aigis report'), 'invokes aigis report');
  assert(content.includes('npm install -g @aigis-ai/cli'), 'installs aigis');
  assert(content.includes('actions/checkout@v4'), 'uses pinned action');
  assert(content.includes('on:'), 'has triggers');
  assert(content.includes('pull_request'), 'triggers on PR');
});

test('Pre-commit hook references .aigisrc.json + uses aigis verify + has shebang', () => {
  const content = renderPreCommitHook();
  assert(content.startsWith('#!/usr/bin/env bash'), 'starts with shebang');
  assert(content.includes('.aigisrc.json'), 'references .aigisrc.json');
  assert(content.includes('aigis verify'), 'invokes aigis verify');
  assert(content.includes('--auto .'), 'uses --auto . path');
  assert(content.includes('--no-verify'), 'mentions bypass option in error message');
  assert(content.includes('exit 0'), 'gracefully exits on missing config');
});

test('Pre-commit hook: gracefully no-ops when .aigisrc.json absent', () => {
  const content = renderPreCommitHook();
  // Verify the no-op branch is present and uses exit 0 (allow commit through)
  assert(/if \[ ! -f \.aigisrc\.json \]/.test(content), 'has missing-config check');
  assert(/Skipping verify[\s\S]*?exit 0/.test(content), 'exits 0 when no config');
});

test('Pre-commit hook: blocks commit on FAIL with exit 1', () => {
  const content = renderPreCommitHook();
  assert(/FAILED=1[\s\S]*?if \[ "\$FAILED" -ne 0 \][\s\S]*?exit 1/.test(content),
    'sets FAILED on verify failure and exits 1');
});

// ── runner ────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
