/**
 * Determinism tests for content/resolvers/triggers.json checksum.
 * The pinned hash catches platform-specific serialization bugs
 * (line endings, BOM) that would silently drift between local and CI.
 *
 * If you modify triggers.json intentionally, update PINNED_HASH below
 * in the same commit. Run `node lib/checksum.js` (or just print the new hash)
 * to get the current value.
 */

const fs = require('fs');
const path = require('path');
const { computeFileChecksum, computeChecksum } = require('../lib/checksum');

const TRIGGERS_PATH = path.join(__dirname, '..', 'content', 'resolvers', 'triggers.json');
const PINNED_HASH = '2caa1e410b62257d1c13482a8a9f9ec38719aef76a36ebd1c4dc032a1348e9cc';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}\n  expected: ${expected}\n  actual:   ${actual}`);
}

test('checksum identical across 10 sequential invocations', () => {
  const checksums = new Set();
  for (let i = 0; i < 10; i++) checksums.add(computeFileChecksum(TRIGGERS_PATH));
  assertEq(checksums.size, 1, 'all 10 invocations should produce the same hash');
});

test('checksum matches the pinned PINNED_HASH literal', () => {
  const actual = computeFileChecksum(TRIGGERS_PATH);
  assertEq(
    actual,
    PINNED_HASH,
    'checksum drift detected. If you intentionally modified triggers.json, ' +
    'update PINNED_HASH in test/checksum-determinism.test.js to match. ' +
    'If you did NOT modify triggers.json, your environment is producing a different hash ' +
    '(check line endings, BOM, file encoding).'
  );
});

test('checksum changes when content changes', () => {
  const original = fs.readFileSync(TRIGGERS_PATH, 'utf8');
  const before = computeFileChecksum(TRIGGERS_PATH);
  const tweaked = original.replace('"version": "1.0"', '"version": "1.0 "');
  fs.writeFileSync(TRIGGERS_PATH, tweaked);
  try {
    const after = computeFileChecksum(TRIGGERS_PATH);
    assert(after !== before, 'modifying triggers.json should change the checksum');
  } finally {
    fs.writeFileSync(TRIGGERS_PATH, original);
  }
});

test('canonicalization: BOM + CRLF produce same hash as plain LF', () => {
  const plain = '{"a":1}\n';
  const withBom = '\ufeff' + plain;
  const withCrlf = '{"a":1}\r\n';
  const withBomCrlf = '\ufeff{"a":1}\r\n';
  const h = computeChecksum(plain);
  assertEq(computeChecksum(withBom), h, 'BOM should be stripped');
  assertEq(computeChecksum(withCrlf), h, 'CRLF should normalize to LF');
  assertEq(computeChecksum(withBomCrlf), h, 'BOM + CRLF should normalize to plain LF');
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
