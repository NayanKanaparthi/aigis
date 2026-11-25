/**
 * `aigis init codex` (AGENTS.md) and section-only `--refresh`, Node and Python.
 *
 * Every run happens in a fresh temp project dir with its own temp HOME, so the
 * real ~/.aigis and ~/.claude/skills are never read or written.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { buildFullContent } = require('../lib/init');

const ROOT = path.join(__dirname, '..');
const PY_ROOT = path.join(ROOT, 'cli-python');
const HEADER_LINE = '# Aigis core skill — installed by `aigis init`';
const END = '# --- AIGIS RESOLVER BLOCK END ---';

const tmpDirs = [];
function tmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aigis-init-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
function env(home) {
  return { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', FORCE_COLOR: '0', AIGIS_TEST_PY_ROOT: PY_ROOT, PYTHONDONTWRITEBYTECODE: '1' };
}
const RUNNERS = {
  node: (args, cwd, home) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'aigis.js'), ...args], { cwd, encoding: 'utf8', env: env(home) }),
  // The repo path can contain ':', so PYTHONPATH can't be used; put cli-python first on sys.path instead.
  python: (args, cwd, home) => spawnSync('python3', ['-c', PY_BOOT, ...args], { cwd, encoding: 'utf8', env: env(home) }),
};
const PY_BOOT = 'import os, sys; sys.path.insert(0, os.environ["AIGIS_TEST_PY_ROOT"]); from aigis_cli.cli import cli; cli()';
function out(r) { return `${r.stdout || ''}${r.stderr || ''}`; }

// Run `aigis <args>` in a fresh project seeded with `files`; returns the result and a file reader.
function runIn(lang, args, files = {}) {
  const cwd = tmp(`${lang}-proj`);
  const home = tmp(`${lang}-home`);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
    fs.writeFileSync(path.join(cwd, rel), text);
  }
  const r = RUNNERS[lang](args, cwd, home);
  return { r, cwd, home, read: (rel) => fs.readFileSync(path.join(cwd, rel), 'utf8') };
}

function pythonReady() {
  return spawnSync('python3', ['-c', 'import click, frontmatter, rich'], { encoding: 'utf8' }).status === 0;
}
function pythonIsThisRepo() {
  const r = spawnSync('python3', ['-c', PY_BOOT.replace('from aigis_cli.cli import cli; cli()', 'import aigis_cli; print(aigis_cli.__file__)')], { encoding: 'utf8', env: env(os.tmpdir()) });
  return (r.stdout || '').trim() === path.join(PY_ROOT, 'aigis_cli', '__init__.py');
}

// Current full Aigis content (what a fresh init writes and what the old whole-file refresh wrote).
const FRESH = buildFullContent().content;
// An out-of-date Aigis section: different resolver checksum and an edited core line.
const STALE = FRESH
  .replace(/\(checksum: [a-f0-9]+\)/, '(checksum: 000000000000)')
  .replace('# Aigis core skill\n', '# Aigis core skill (old copy)\n');
const freshSection = FRESH.slice(0, FRESH.lastIndexOf(END) + END.length);

const realClaudeSkill = path.join(os.homedir(), '.claude', 'skills', 'aigis', 'SKILL.md');
const realClaudeBefore = fs.existsSync(realClaudeSkill) ? fs.readFileSync(realClaudeSkill) : null;

const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('stale fixture really differs from fresh content', () => {
  assert.notStrictEqual(STALE, FRESH);
  assert.ok(FRESH.startsWith(HEADER_LINE + '\n'));
});

test('init codex creates AGENTS.md with the same content as other file targets (Node and Python identical)', () => {
  const node = runIn('node', ['init', 'codex']);
  assert.strictEqual(node.r.status, 0, out(node.r));
  const nodeBytes = node.read('AGENTS.md');
  assert.strictEqual(nodeBytes, FRESH);
  assert.match(node.r.stdout, /Created AGENTS\.md/);
  assert.match(node.r.stdout, /Codex reads AGENTS\.md/);
  const cursor = runIn('node', ['init', 'cursor']);
  assert.strictEqual(cursor.read('.cursorrules'), nodeBytes, 'codex and cursor content differ');

  const py = runIn('python', ['init', 'codex']);
  assert.strictEqual(py.r.status, 0, out(py.r));
  assert.strictEqual(py.read('AGENTS.md'), nodeBytes, 'Python AGENTS.md differs from Node');
  assert.match(py.r.stdout, /Codex reads AGENTS\.md/);
});

test('init codex appends to an existing AGENTS.md and keeps user content byte for byte', () => {
  const mine = '# Project rules\r\n\r\nUse tabs.\nNo trailing newline here';
  const results = ['node', 'python'].map((lang) => {
    const run = runIn(lang, ['init', 'codex'], { 'AGENTS.md': mine });
    assert.strictEqual(run.r.status, 0, `${lang}: ${out(run.r)}`);
    const text = run.read('AGENTS.md');
    assert.ok(text.startsWith(mine), `${lang}: user content changed`);
    assert.strictEqual(text, mine + '\n\n' + FRESH, `${lang}: unexpected append result`);
    return text;
  });
  assert.strictEqual(results[1], results[0]);
});

test('refresh replaces only the Aigis section, user content before and after unchanged', () => {
  const before = '# My agent notes\r\n\r\nAlways run the linter.\n\n';
  const after = '\n\n## Team rules\nKeep PRs small.\n';
  const results = ['node', 'python'].map((lang) => {
    const run = runIn(lang, ['init', 'codex', '--refresh'], { 'AGENTS.md': before + STALE.slice(0, -1) + after });
    assert.strictEqual(run.r.status, 0, `${lang}: ${out(run.r)}`);
    const text = run.read('AGENTS.md');
    assert.strictEqual(text, before + freshSection + after, `${lang}: refresh result wrong`);
    return text;
  });
  assert.strictEqual(results[1], results[0]);
});

test('refresh on an Aigis-only file is byte-identical to the old whole-file refresh (cursor, copilot, claude-code)', () => {
  for (const lang of ['node', 'python']) {
    for (const [ide, rel] of [['cursor', '.cursorrules'], ['copilot', '.github/copilot-instructions.md']]) {
      const run = runIn(lang, ['init', ide, '--refresh'], { [rel]: STALE });
      assert.strictEqual(run.r.status, 0, `${lang} ${ide}: ${out(run.r)}`);
      assert.strictEqual(run.read(rel), FRESH, `${lang} ${ide}: not identical to old refresh output`);
    }
    // claude-code writes under HOME; HOME is a temp dir here.
    const cwd = tmp(`${lang}-cc`);
    const home = tmp(`${lang}-cc-home`);
    const skill = path.join(home, '.claude', 'skills', 'aigis', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, STALE);
    const r = RUNNERS[lang](['init', 'claude-code', '--refresh'], cwd, home);
    assert.strictEqual(r.status, 0, `${lang} claude-code: ${out(r)}`);
    assert.strictEqual(fs.readFileSync(skill, 'utf8'), FRESH, `${lang} claude-code: not identical`);
  }
});

test('refresh refuses on two Aigis sections, a missing end marker or a missing header, and leaves the file untouched', () => {
  const bad = {
    'two sections': `# Mine\n\n${STALE}\n\n${STALE}`,
    'missing end marker': `# Mine\n\n${STALE.replace(END, '')}`,
    'missing header': `# Mine\n\n${STALE.replace(HEADER_LINE, '# my edited header')}`,
  };
  for (const lang of ['node', 'python']) {
    for (const [label, text] of Object.entries(bad)) {
      const run = runIn(lang, ['init', 'codex', '--refresh'], { 'AGENTS.md': text });
      assert.notStrictEqual(run.r.status, 0, `${lang} ${label}: should exit non-zero`);
      assert.match(out(run.r), /Could not refresh AGENTS\.md/, `${lang} ${label}: no clear error`);
      assert.match(out(run.r), /Nothing was changed/);
      assert.strictEqual(run.read('AGENTS.md'), text, `${lang} ${label}: file was modified`);
    }
  }
});

test('unknown IDE error lists codex (Node and Python)', () => {
  for (const lang of ['node', 'python']) {
    const run = runIn(lang, ['init', 'not-an-ide']);
    assert.notStrictEqual(run.r.status, 0);
    assert.match(out(run.r), /Unknown IDE: not-an-ide/);
    assert.match(out(run.r), /Available: claude-code, codex, cursor, copilot, windsurf/);
  }
});

test('real ~/.claude/skills/aigis/SKILL.md was not touched', () => {
  const now = fs.existsSync(realClaudeSkill) ? fs.readFileSync(realClaudeSkill) : null;
  assert.deepStrictEqual(now, realClaudeBefore);
});

let failures = 0;
if (!pythonReady()) {
  console.log('FAIL python3 with click, frontmatter and rich is required for Node/Python parity');
  failures++;
} else if (!pythonIsThisRepo()) {
  console.log('FAIL python3 did not import aigis_cli from this repo');
  failures++;
} else {
  for (const [name, fn] of cases) {
    try { fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${String(e.message).split('\n')[0]}`); }
  }
}
for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;
