/**
 * Determinism tests for `aigis infra <area>`.
 *
 * The infrastructure files are pure content — no resolvers, no templating,
 * no environment-dependent rendering. Output for the same area must be
 * byte-identical across repeated invocations and across platforms.
 *
 * If a test fails, suspect: line-ending drift (CRLF vs LF), BOM
 * insertion by an editor, or a non-deterministic processor in the
 * fetch path.
 */

const { getInfra, listInfras } = require('../lib/fetch');

const AREAS = ['rate-limiting', 'secrets', 'logging'];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}\n  expected: ${expected}\n  actual:   ${actual}`);
}

test('listInfras returns the three expected areas in case-insensitive alphabetical order', () => {
  const list = listInfras();
  assertEq(list.length, AREAS.length, `expected ${AREAS.length} infra areas, got ${list.length}`);
  const expectedSorted = [...AREAS].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  assertEq(list.join(','), expectedSorted.join(','), 'listInfras output must be sorted case-insensitively');
});

for (const area of AREAS) {
  test(`infra "${area}" — byte-identical across 10 sequential invocations`, () => {
    const outputs = new Set();
    for (let i = 0; i < 10; i++) outputs.add(getInfra(area));
    assertEq(outputs.size, 1, `all 10 invocations of "${area}" should produce identical output`);
  });
}

for (const area of AREAS) {
  test(`infra "${area}" — output contains expected frontmatter id`, () => {
    const out = getInfra(area);
    assert(out.startsWith('---\n'), `"${area}" output must begin with frontmatter delimiter`);
    assert(out.includes(`id: infra-${area}`), `"${area}" output must declare id: infra-${area}`);
  });
}

test('unknown infra area raises', () => {
  let threw = false;
  try { getInfra('nonexistent-area'); } catch (e) { threw = true; }
  assert(threw, 'getInfra must raise on unknown area');
});

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
