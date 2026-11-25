#!/usr/bin/env node
'use strict';
/*
 * EVALS harness for MITRE ATLAS in Aigis (build/atlas/EVALS.md). Owner: E0.
 *
 *   node build/atlas/evals/run-evals.js --label <label> [--baseline results/baseline.json] [--sets dev,heldout]
 *                                       [--root <repo>] [--yaml <pinned yaml>] [--npm-test] [--quiet]
 *
 * Runs the CLI (`node bin/aigis.js ...`, deterministic, no network, no model calls) on every dev and held-out
 * description, N = 2 runs per command, and computes every metric of EVALS §2, §6 and §9 from the artifacts:
 * command outputs, area frontmatter, the shipped index files. Expected values come from oracle.py (pinned YAML +
 * approved gold only), never from Aigis code. Writes build/atlas/evals/results/<label>.json.
 *
 * Works on pre-feature code (no `threats` command, no ATLAS keys): the capability metrics are then reported as
 * "no prior capability" and only the guard/baseline columns are filled. With --baseline it also computes the
 * guards that compare against the baseline (exact-delta, citation loss, brief growth, trait identity).
 *
 * Exit code: 0 when all hard gates that could be evaluated pass (always 0 for --label baseline), 1 otherwise.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const args = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(args.root || path.join(HERE, '..', '..', '..'));
const YAML = args.yaml || '/tmp/atlas-src/ATLAS-2026.10.yaml';
const LABEL = args.label || 'run';
const SETS = (args.sets || 'dev,heldout').split(',');
const BIN = path.join(ROOT, 'bin', 'aigis.js');
const FIXTURE_PROJECT = path.join(ROOT, 'test', 'fixtures', 'atlas', 'project');
const NEW_AREAS = ['agent-permissions', 'agent-tool-safety'];
const IDES = ['cursor', 'windsurf', 'copilot', 'claude-code'];
const N_RUNS = 2;
const FORBIDDEN = /ATLAS[ -]?(compliant|compliance|certified|certification)|complies with ATLAS|risk[ -]?scor(e|es|ed|ing)/i;
const DISCLAIMER_SPEC = 'MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.';
// The sentence removed before the FORBIDDEN scan is the one the product ships: read (as text, not executed) from
// lib/atlas.js. Falls back to the SPEC S0 sentence on pre-feature code. A mismatch with SPEC is reported.
function shippedDisclaimer(root) {
  const f = path.join(root, 'lib', 'atlas.js');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/const DISCLAIMER = '((?:[^'\\]|\\.)*)';/);
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}
const ID_RE = /AML\.(?:TA|CS|M|T)\d{4}(?:\.\d{3})?/g;
const CAPS = { brief_growth: 1500, core_md: 5650, threats_text_default: 7000, threats_text_top25: 16000,
  threats_json_default: 20000, threats_json_top25: 45000, catalog_bytes: 64000, new_area_chars: 12000,
  compact_fallback_cap: 120000 };
// EVALS §9.1 planner labels for the dev set. dev.json is frozen (do not edit), so the label lives here;
// held-out labels are stored in heldout.json.
const DEV_NEEDS_AGENT_SECURITY = { D1: false, D2: false, D3: false, D4: false, D5: false, D6: false, D7: false,
  D8: false, D9: true, D10: false };

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    if (i + 1 < a.length && !a[i + 1].startsWith('--')) o[k] = a[++i]; else o[k] = true;
  }
  return o;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const uniq = (a) => [...new Set(a)];
const sorted = (a) => [...a].sort();
const ratio = (n, d) => (d === 0 ? null : Number((n / d).toFixed(4)));
const eqArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function log(...m) { if (!args.quiet) process.stderr.write(m.join(' ') + '\n'); }

// ---------------------------------------------------------------- CLI runner + volatile masking (EV-M6)
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
function mask(s) {
  // The volatile fields listed in TESTPLAN (brief header line, report generated_at / "> Generated:"), plus the
  // package version so that baseline and feature outputs can be compared.
  return s
    .replace(/> aigis [^\s"\\]+ — generated [0-9TZ:.+-]+/g, '> aigis <v> — generated <ts>')
    .replace(/"generated_at":\s*"[^"]*"/g, '"generated_at": "<ts>"')
    .replace(/^> Generated: .*$/gm, '> Generated: <ts>')
    .split(PKG_VERSION).join('<version>');
}
const DISCLAIMER = shippedDisclaimer(ROOT) || DISCLAIMER_SPEC;
// FORBIDDEN scan (SPEC S0, T-HON-01). JSON output is parsed first and every key and string value is scanned as
// decoded text, so the disclaimer's quoted "ATLAS compliant" (escaped as \"ATLAS compliant\" in raw JSON) is
// removed exactly; text output is scanned as is. Returns the matched phrases (empty = clean).
function stringsOf(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsOf(x, acc));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.push(k); stringsOf(x, acc); }
  return acc;
}
function forbiddenHits(stdout) {
  let texts;
  try { texts = stringsOf(JSON.parse(stdout)); } catch (_) { texts = [stdout]; }
  const hits = [];
  for (const t of texts) {
    const re = new RegExp(FORBIDDEN.source, 'gi');
    const clean = t.split(DISCLAIMER).join('');
    let m;
    while ((m = re.exec(clean))) hits.push(m[0]);
  }
  return hits;
}
function forbiddenSelfTest() {
  // The disclaimer alone, raw or inside JSON, is clean; one planted phrase is caught in both forms.
  const planted = 'This system is ATLAS compliant.';
  const cases = [
    [DISCLAIMER, 0], [JSON.stringify({ atlas: { disclaimer: DISCLAIMER } }, null, 2), 0],
    [DISCLAIMER + '\n' + planted, 1], [JSON.stringify({ atlas: { disclaimer: DISCLAIMER }, note: planted }, null, 2), 1],
    [JSON.stringify({ text: 'We compute a risk score.' }), 1],
  ];
  return cases.every(([s, n]) => forbiddenHits(s).length === n);
}
const OUTPUTS = []; // { cmd, kind, stdout } for id scans and the FORBIDDEN scan
const DETERMINISM = { commands: 0, identical: 0, differing: [] };
function cli(argv, { cwd = ROOT, env = {}, kind = argv[0], keep = true } = {}) {
  const runs = [];
  for (let i = 0; i < N_RUNS; i++) {
    const r = spawnSync(process.execPath, [BIN, ...argv], {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runs.push({ status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' });
  }
  DETERMINISM.commands++;
  const same = runs.every((r) => mask(r.stdout) === mask(runs[0].stdout) && r.status === runs[0].status);
  if (same) DETERMINISM.identical++; else DETERMINISM.differing.push(argv.join(' ').slice(0, 160));
  const r = runs[0];
  if (keep) OUTPUTS.push({ cmd: argv.join(' ').slice(0, 200), kind, stdout: r.stdout });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* text output */ }
  return { argv, exit: r.status, stdout: r.stdout, json, chars: r.stdout.length, sha256: sha(mask(r.stdout)),
    stderr_first_line: (r.stderr.split('\n')[0] || '').slice(0, 200) };
}
function brief(res) { return { exit: res.exit, chars: res.chars, sha256: res.sha256, stderr_first_line: res.stderr_first_line }; }

// ---------------------------------------------------------------- oracle (python3 -I, independent of lib/)
function oracle(mode, input) {
  const r = spawnSync('python3', ['-I', path.join(HERE, 'oracle.py'), mode, '--yaml', YAML, '--root', ROOT],
    { input: input ? JSON.stringify(input) : undefined, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('oracle.py failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

// ---------------------------------------------------------------- static artifacts
function readFrontmatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { controls: {}, body: src };
  const controls = {};
  let inControls = false;
  for (const line of m[1].split('\n')) {
    if (/^controls:\s*$/.test(line)) { inControls = true; continue; }
    if (inControls) {
      const mm = line.match(/^\s+([a-z0-9_]+):\s*\[(.*)\]\s*(#.*)?$/);
      if (mm) { controls[mm[1]] = mm[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean); continue; }
      if (/^\S/.test(line)) inControls = false;
    }
  }
  return { controls, body: src.slice(m[0].length) };
}
function areaFiles() {
  const dir = path.join(ROOT, 'content', 'skills', 'areas');
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const fm = readFrontmatter(path.join(dir, f));
    out[f.replace(/\.md$/, '')] = { controls: fm.controls, file_chars: fs.readFileSync(path.join(dir, f), 'utf8').length,
      body_chars: fm.body.length, body_chars_no_comments: fm.body.replace(/<!--[\s\S]*?-->/g, '').length };
  }
  return out;
}
function staticArtifacts() {
  const core = path.join(ROOT, 'content', 'skills', 'core.md');
  const cat = path.join(ROOT, 'content', 'index', 'atlas.json');
  const ep = path.join(ROOT, 'content', 'index', 'atlas-entry-points.json');
  let entry_points = null;
  if (fs.existsSync(ep)) { try { entry_points = JSON.parse(fs.readFileSync(ep, 'utf8')); } catch (e) { entry_points = { error: String(e) }; } }
  return {
    core_md_chars: fs.readFileSync(core, 'utf8').length,
    catalog_bytes: fs.existsSync(cat) ? fs.statSync(cat).size : null,
    entry_points_bytes: fs.existsSync(ep) ? fs.statSync(ep).size : null,
    entry_points,
    areas: areaFiles(),
  };
}
function initOnce(ide) {
  // Fresh project + HOME per run: init is not idempotent on an existing rules file, and claude-code writes under
  // $HOME/.claude, so the real home is never touched.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aigis-e0-init-'));
  const home = path.join(tmp, 'home');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(home); fs.mkdirSync(proj);
  spawnSync('git', ['init', '-q', proj]);
  const r = spawnSync(process.execPath, [BIN, 'init', ide], { cwd: proj, encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const files = {};
  const texts = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(p); else {
        const c = fs.readFileSync(p, 'utf8');
        const rb = c.match(/# --- AIGIS RESOLVER BLOCK START[\s\S]*?# --- AIGIS RESOLVER BLOCK END ---/);
        const rel = path.relative(tmp, p);
        files[rel] = { chars: c.length, sha256: sha(mask(c)), resolver_block_sha256: rb ? sha(rb[0]) : null };
        texts[rel] = c;
      }
    }
  };
  walk(tmp);
  const stdout = (r.stdout || '').split(tmp).join('<tmp>');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { exit: r.status, stdout, stderr: (r.stderr || '').split(tmp).join('<tmp>'), files, texts };
}
function initRuns() {
  const out = {};
  for (const ide of IDES) {
    const runs = [];
    for (let i = 0; i < N_RUNS; i++) runs.push(initOnce(ide));
    const a = runs[0];
    DETERMINISM.commands++;
    const same = runs.every((x) => x.exit === a.exit && mask(x.stdout) === mask(a.stdout) && JSON.stringify(x.files) === JSON.stringify(a.files));
    if (same) DETERMINISM.identical++; else DETERMINISM.differing.push(`init ${ide}`);
    OUTPUTS.push({ cmd: `init ${ide}`, kind: 'init', stdout: a.stdout });
    for (const [rel, c] of Object.entries(a.texts)) OUTPUTS.push({ cmd: `init ${ide} -> ${rel}`, kind: 'init-file', stdout: c });
    out[ide] = { exit: a.exit, stdout_chars: a.stdout.length, stderr_first_line: (a.stderr.split('\n')[0] || '').slice(0, 200), files: a.files };
  }
  return out;
}

// ---------------------------------------------------------------- per-description runs
function loadSet(name) {
  const f = path.join(HERE, name === 'dev' ? 'dev.json' : 'heldout.json');
  return JSON.parse(fs.readFileSync(f, 'utf8')).descriptions.map((d) => ({
    set: name, id: d.id, text: d.text, gt: sorted(d.ground_truth_traits),
    needs_agent_security: name === 'dev' ? DEV_NEEDS_AGENT_SECURITY[d.id] : d.needs_agent_security,
  }));
}
function classifyFields(j) {
  if (!j) return null;
  const { resolver, atlas, ...rest } = j;
  return { ...rest, resolver: resolver ? { ...resolver, input: undefined } : undefined, has_atlas_key: atlas !== undefined, atlas };
}
function buildFields(res) {
  if (!res.json) return { exit: res.exit, stderr_first_line: res.stderr_first_line, stdout_chars: res.chars, no_brief: true };
  const { meta } = res.json;
  const { atlas, ...m } = meta;
  return { exit: res.exit, brief_chars: (res.json.brief || '').length, char_count: meta.char_count, mode: meta.mode,
    auto_fallback: meta.auto_fallback, meta: { ...m, raw_input: undefined, normalized_description: undefined },
    has_threat_section: /## Threat model \(MITRE ATLAS\)/.test(res.json.brief || ''), meta_atlas: atlas };
}
function threatsFields(res) {
  if (!res.json) return { exit: res.exit, stderr_first_line: res.stderr_first_line };
  const j = res.json;
  return { exit: res.exit, chars: res.chars, traits: j.traits, uncertain_traits: j.uncertain_traits,
    entry_points: (j.entry_points || []).map((e) => ({ trait: e.trait, techniques: e.techniques, uncertain: e.uncertain })),
    techniques_in_scope: j.techniques_in_scope, techniques_shown: j.techniques_shown,
    techniques: (j.techniques || []).map((t) => ({ id: t.id, mitigations: (t.mitigations || []).map((m) => m.id) })),
    gaps: j.gaps, unmitigated_techniques: j.unmitigated_techniques, mitigation_counts: j.mitigation_counts,
    recommended_areas: j.recommended_areas };
}
function techniqueEntries(text) {
  // Numbered technique entries of the "## Techniques" section: the "N. AML.T..." line plus its indented lines.
  const sec = text.split(/^## /m).find((s) => s.startsWith('Techniques'));
  if (!sec) return [];
  const out = [];
  let cur = null;
  for (const line of sec.split('\n').slice(1)) {
    const m = line.match(/^\d+\. (AML\.T\d{4}(?:\.\d{3})?)/);
    if (m) { cur = { id: m[1], chars: line.length + 1 }; out.push(cur); } else if (cur && /^\s+\S/.test(line)) cur.chars += line.length + 1; else if (line.trim() === '') cur = null;
  }
  return out;
}

function runDescription(d, hasThreats) {
  log(`  ${d.id}`);
  const rec = { set: d.set, id: d.id, gt_traits: d.gt, needs_agent_security: d.needs_agent_security };
  const cd = cli(['classify', d.text, '--json']);
  const cg = cli(['classify', '--traits', d.gt.join(','), '--json']);
  const b = cli(['build', d.text, '--json']);
  rec.classify_desc = { exit: cd.exit, chars: cd.chars, ...classifyFields(cd.json) };
  rec.classify_gt = { exit: cg.exit, chars: cg.chars, ...classifyFields(cg.json) };
  rec.build = buildFields(b);
  if (b.json && b.json.meta && b.json.meta.auto_fallback) {
    // The auto brief fell back to compact (full brief over the 120,000 cap). Measure the full-mode brief too,
    // so growth is judged on like-for-like content and the fallback is reported, not hidden (EVALS §9.3).
    const bf = cli(['build', d.text, '--full', '--json']);
    rec.build.full_mode = bf.json ? { exit: bf.exit, char_count: bf.json.meta.char_count, mode: bf.json.meta.mode } : { exit: bf.exit };
  }
  const areas = (cg.json && cg.json.implement_files) || [];
  if (areas.length) {
    const rj = cli(['report', '--areas', areas.join(','), '--project', FIXTURE_PROJECT, '--format', 'json']);
    const rm = cli(['report', '--areas', areas.join(','), '--project', FIXTURE_PROJECT]);
    let s = null;
    if (rj.json) s = rj.json.summary || null;
    rec.report = { json: brief(rj), md: brief(rm), has_atlas_key: !!(rj.json && rj.json.atlas),
      cross_framework_citations: s && s.cross_framework_citations };
  }
  if (hasThreats) {
    const tg = cli(['threats', '--traits', d.gt.join(','), '--json']);
    const tg25 = cli(['threats', '--traits', d.gt.join(','), '--top', '25', '--json']);
    const tgt = cli(['threats', '--traits', d.gt.join(',')]);
    const tgt25 = cli(['threats', '--traits', d.gt.join(','), '--top', '25']);
    const td = cli(['threats', d.text, '--json']);
    const tdt = cli(['threats', d.text]);
    rec.threats = {
      gt: threatsFields(tg), gt_top25: threatsFields(tg25), desc: threatsFields(td),
      gt_text: { exit: tgt.exit, chars: tgt.chars, entries: techniqueEntries(tgt.stdout) },
      gt_text_top25: { exit: tgt25.exit, chars: tgt25.chars, entries: techniqueEntries(tgt25.stdout) },
      desc_text: { exit: tdt.exit, chars: tdt.chars },
      json_chars: { default: tg.chars, top25: tg25.chars },
    };
    rec._threats_raw = { gt: tg.json, gt_top25: tg25.json, desc: td.json };
  }
  return rec;
}

// ---------------------------------------------------------------- id accuracy (EV-M3a)
function idAccuracy(o) {
  const T = o.techniques, M = o.mitigations, TA = o.tactics;
  const acc = { ids_printed: 0, ids_valid: 0, unknown_ids: [], name_checks: 0, name_ok: 0, name_bad: [],
    maturity_checks: 0, maturity_ok: 0, maturity_bad: [], by_command: {}, distinct_ids: new Set(), max_distinct_techniques_in_one_output: 0 };
  const exists = (id) => T[id] || M[id] || TA[id] || id.startsWith('AML.CS');
  const nameOf = (id) => (T[id] ? [T[id].display_name, T[id].name] : M[id] ? [M[id].name] : TA[id] ? [TA[id]] : []);
  const checkName = (id, name, where) => {
    acc.name_checks++;
    if (nameOf(id).includes(name)) acc.name_ok++; else acc.name_bad.push(`${where}: ${id} "${name}"`);
  };
  const checkMat = (id, mat, where) => {
    acc.maturity_checks++;
    if (T[id] && T[id].maturity === mat) acc.maturity_ok++; else acc.maturity_bad.push(`${where}: ${id} ${mat}`);
  };
  const walk = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, where));
    if (!v || typeof v !== 'object') return;
    if (typeof v.id === 'string' && /^AML\./.test(v.id)) {
      if (typeof v.name === 'string') checkName(v.id, v.name, where);
      if (typeof v.maturity === 'string') checkMat(v.id, v.maturity, where);
    }
    if (typeof v.technique === 'string' && /^AML\.T/.test(v.technique) && typeof v.name === 'string') checkName(v.technique, v.name, where);
    for (const [k, x] of Object.entries(v)) {
      if (k === 'mitigation_names' && x && typeof x === 'object') for (const [mid, nm] of Object.entries(x)) checkName(mid, nm, where);
      else walk(x, where);
    }
  };
  for (const out of OUTPUTS) {
    const ids = out.stdout.match(ID_RE) || [];
    if (!ids.length) continue;
    const bc = (acc.by_command[out.kind] = acc.by_command[out.kind] || { printed: 0, valid: 0 });
    const techs = new Set(ids.filter((i) => /^AML\.T\d/.test(i)));
    acc.max_distinct_techniques_in_one_output = Math.max(acc.max_distinct_techniques_in_one_output, techs.size);
    for (const id of ids) {
      acc.ids_printed++; bc.printed++; acc.distinct_ids.add(id);
      if (exists(id)) { acc.ids_valid++; bc.valid++; } else acc.unknown_ids.push(`${out.cmd}: ${id}`);
    }
    let json = null;
    try { json = JSON.parse(out.stdout); } catch (_) { /* text */ }
    if (json) { walk(json, out.cmd); continue; }
    // Text: "<id> <Name...>" must start with MITRE's (display) name; "[Maturity]" right after the name must match.
    const re = /(AML\.(?:M|T)\d{4}(?:\.\d{3})?) ([A-Z][^\n]*)/g;
    let m;
    while ((m = re.exec(out.stdout))) {
      const id = m[1], rest = m[2];
      const names = nameOf(id).sort((a, b) => b.length - a.length);
      const hit = names.find((n) => rest.startsWith(n));
      acc.name_checks++;
      if (hit) {
        acc.name_ok++;
        const mm = rest.slice(hit.length).match(/^ \[(Realized|Demonstrated|Feasible)\]/);
        if (mm) checkMat(id, mm[1], out.cmd);
      } else acc.name_bad.push(`${out.cmd}: ${id} "${rest.slice(0, 60)}"`);
    }
  }
  const checks = acc.ids_printed + acc.name_checks + acc.maturity_checks;
  const ok = acc.ids_valid + acc.name_ok + acc.maturity_ok;
  return { ...acc, distinct_ids: acc.distinct_ids.size, accuracy: checks ? ratio(ok, checks) : null,
    unknown_ids: acc.unknown_ids.slice(0, 50), name_bad: acc.name_bad.slice(0, 50), maturity_bad: acc.maturity_bad.slice(0, 50) };
}

// ---------------------------------------------------------------- metrics
function pr(pred, gold) {
  const P = new Set(pred), G = new Set(gold);
  const tp = [...P].filter((x) => G.has(x)).length;
  return { tp, pred: P.size, gold: G.size, precision: ratio(tp, P.size), recall: ratio(tp, G.size),
    fp: [...P].filter((x) => !G.has(x)), fn: [...G].filter((x) => !P.has(x)) };
}
function micro(list) {
  const tp = list.reduce((s, x) => s + x.tp, 0), p = list.reduce((s, x) => s + x.pred, 0), g = list.reduce((s, x) => s + x.gold, 0);
  const mean = (k) => { const v = list.map((x) => x[k]).filter((x) => x !== null && x !== undefined); return v.length ? ratio(v.reduce((a, b) => a + b, 0), v.length) : null; };
  return { tp, pred: p, gold: g, precision: ratio(tp, p), recall: ratio(tp, g), macro_precision: mean('precision'), macro_recall: mean('recall') };
}
const existingOnly = (a) => (a || []).filter((x) => !NEW_AREAS.includes(x));

function computeMetrics(recs, stat, init, o, base, hasThreats) {
  const M = {};
  const sets = uniq(recs.map((r) => r.set));
  const bySet = (fn) => Object.fromEntries(sets.map((s) => [s, fn(recs.filter((r) => r.set === s))]));
  const hasAtlas = recs.some((r) => r.classify_gt.has_atlas_key);

  // Expected outputs from the oracle for GT traits and for the traits each path resolved.
  const tsets = {}, asets = {};
  for (const r of recs) {
    tsets[`${r.id}:gt`] = r.gt_traits;
    tsets[`${r.id}:build`] = (r.build.meta && r.build.meta.all_traits) || [];
    tsets[`${r.id}:classify`] = r.classify_desc.traits || [];
    if (r.threats && r.threats.desc.traits) tsets[`${r.id}:threats_desc`] = r.threats.desc.traits;
    if (r.threats && r.threats.gt.traits) tsets[`${r.id}:threats_gt`] = r.threats.gt.traits;
    asets[`${r.id}:gt`] = r.classify_gt.implement_files || [];
    asets[`${r.id}:desc`] = r.classify_desc.implement_files || [];
  }
  for (const a of Object.keys(stat.areas)) asets[`area:${a}`] = [a];
  const ex = oracle('--expect', { trait_sets: tsets, area_sets: asets, top: 10 });
  const ex25 = oracle('--expect', { trait_sets: tsets, area_sets: {}, top: 25 });

  // ---- resolver properties (inherited, reported): build-path trait P/R, classify-path area P/R
  M.resolver = bySet((rs) => ({
    build_path_traits: micro(rs.map((r) => pr((r.build.meta && r.build.meta.all_traits) || [], r.gt_traits))),
    classify_path_traits: micro(rs.map((r) => pr(r.classify_desc.traits || [], r.gt_traits))),
    classify_path_areas_existing: micro(rs.map((r) => pr(existingOnly(r.classify_desc.implement_files), existingOnly(r.classify_gt.implement_files)))),
    build_path_areas_existing: micro(rs.map((r) => pr(existingOnly(r.build.meta && r.build.meta.areas), existingOnly(r.classify_gt.implement_files)))),
    description_path_technique_recall_implied_by_build_traits: micro(rs.map((r) => pr(ex.trait_sets[`${r.id}:build`].in_scope, ex.trait_sets[`${r.id}:gt`].in_scope))),
  }));
  M.gold_in_scope_sizes = bySet((rs) => {
    const sz = rs.map((r) => ex.trait_sets[`${r.id}:gt`].techniques_in_scope);
    return { per_description: Object.fromEntries(rs.map((r, i) => [r.id, sz[i]])), max: Math.max(...sz) };
  });
  M.all_seeded_traits = { traits: o.all_seeded_traits.traits.length, techniques_in_scope: o.all_seeded_traits.techniques_in_scope,
    mitigation_counts: o.all_seeded_traits.mitigation_counts, unmitigated: o.all_seeded_traits.unmitigated_techniques };

  // ---- EV-M3a id accuracy
  M['EV-M3a'] = idAccuracy(o);
  if (!M['EV-M3a'].ids_printed) M['EV-M3a'].note = 'no ATLAS id printed (no prior capability)';

  // ---- EV-M3c area labels (frontmatter controls.atlas vs gold), plus classify controls.atlas vs gold union
  const goldAreaPairs = Object.entries(o.gold_area_map).flatMap(([a, ms]) => ms.map((m) => `${a}|${m}`));
  const shippedAreaPairs = Object.entries(stat.areas).flatMap(([a, v]) => (v.controls.atlas || []).map((m) => `${a}|${m}`));
  const anyAtlasKey = Object.values(stat.areas).some((v) => v.controls.atlas !== undefined);
  M['EV-M3c'] = anyAtlasKey ? pr(shippedAreaPairs, goldAreaPairs) : { note: 'no controls.atlas key in any area (no prior capability)' };
  if (anyAtlasKey) {
    const nonEu = Object.keys(stat.areas).filter((a) => !a.startsWith('eu-ai-act-'));
    M['EV-M3c'].areas_missing_key = nonEu.filter((a) => stat.areas[a].controls.atlas === undefined);
    M['EV-M3c'].eu_areas_with_key = Object.keys(stat.areas).filter((a) => a.startsWith('eu-ai-act-') && stat.areas[a].controls.atlas !== undefined);
    M['EV-M3c'].new_areas_gold_used = o.new_areas_gold_used;
  }
  if (hasAtlas) {
    const rows = recs.flatMap((r) => ['gt', 'desc'].map((p) => {
      const c = p === 'gt' ? r.classify_gt : r.classify_desc;
      if (!c.controls) return null;
      const want = ex.area_sets[`${r.id}:${p}`];
      const ok = eqArr(c.controls.atlas || [], want.mitigations);
      const cnt = c.atlas && c.atlas.techniques_addressed;
      return { id: r.id, path: p, atlas_ok: ok, count_ok: !!cnt && eqArr(cnt, want.techniques_addressed) };
    })).filter(Boolean);
    M['EV-M3c'].classify_controls_atlas = { checked: rows.length, correct: rows.filter((x) => x.atlas_ok).length,
      bad: rows.filter((x) => !x.atlas_ok).map((x) => `${x.id}:${x.path}`) };
    M.classify_technique_counts = { checked: rows.length, correct: rows.filter((x) => x.count_ok).length,
      bad: rows.filter((x) => !x.count_ok).map((x) => `${x.id}:${x.path}`) };
  }

  // ---- EV-M3d entry points
  const goldEp = Object.entries(o.gold_entry_points).flatMap(([t, ts]) => ts.map((x) => `${t}|${x}`));
  const shipped = stat.entry_points && stat.entry_points.entry_points;
  M['EV-M3d'] = shipped ? pr(Object.entries(shipped).flatMap(([t, v]) => (v.techniques || []).map((x) => `${t}|${x}`)), goldEp)
    : { note: 'content/index/atlas-entry-points.json absent (no prior capability)' };

  // ---- EV-M3e no citation lost (needs baseline)
  if (base) {
    const lost = [];
    for (const [a, v] of Object.entries(base.static.areas)) {
      const now = stat.areas[a];
      for (const [fw, ids] of Object.entries(v.controls)) {
        if (fw === 'atlas') continue;
        const cur = new Set(now ? now.controls[fw] || [] : []);
        for (const id of ids) if (!cur.has(id)) lost.push(`area ${a} ${fw} ${id}`);
      }
    }
    for (const r of recs) {
      const b = base.descriptions.find((x) => x.id === r.id && x.set === r.set);
      if (!b) continue;
      for (const p of ['classify_desc', 'classify_gt']) {
        for (const fw of ['owasp', 'nist', 'iso', 'eu_ai_act']) {
          const was = (b[p].controls && b[p].controls[fw]) || [];
          const cur = new Set((r[p].controls && r[p].controls[fw]) || []);
          for (const id of was) if (!cur.has(id)) lost.push(`${r.id} ${p} ${fw} ${id}`);
        }
      }
    }
    M['EV-M3e'] = { lost: lost.length, details: lost.slice(0, 50), pass: lost.length === 0 };
  }

  // ---- threats metrics: EV-M3b, EV-M1(ii)(iii), EV-M2(ii)(iii), EV-M5(iii)(iv)
  if (hasThreats) {
    const linkSet = new Set(o.links.map(([t, m]) => `${t}|${m}`));
    const linkStats = { printed: 0, correct: 0, expected: 0, found: 0, fp: [], fn: [], gap_checks: 0, gap_ok: 0, gap_bad: [] };
    const m1 = [], m1iii = [];
    for (const r of recs) {
      for (const [k, tj] of Object.entries(r._threats_raw)) {
        if (!tj || !Array.isArray(tj.techniques)) continue;
        for (const t of tj.techniques) {
          const printed = (t.mitigations || []).map((m) => `${t.id}|${m.id}`);
          const expected = ((o.techniques[t.id] && o.techniques[t.id].mitigations) || []).map((m) => `${t.id}|${m}`);
          linkStats.printed += printed.length; linkStats.expected += expected.length;
          for (const p of printed) if (linkSet.has(p)) linkStats.correct++; else linkStats.fp.push(`${r.id}:${k} ${p}`);
          for (const e of expected) if (printed.includes(e)) linkStats.found++; else linkStats.fn.push(`${r.id}:${k} ${e}`);
        }
        const want = ex.trait_sets[`${r.id}:${k === 'desc' ? 'threats_desc' : 'threats_gt'}`];
        linkStats.gap_checks++;
        const gapsOk = want && eqArr(tj.gaps, want.gaps) && eqArr(tj.unmitigated_techniques, want.unmitigated_techniques) &&
          eqArr(tj.mitigation_counts, want.mitigation_counts);
        if (gapsOk) linkStats.gap_ok++; else linkStats.gap_bad.push(`${r.id}:${k}`);
        for (const g of tj.gaps || []) for (const t of g.techniques || []) if (!linkSet.has(`${t}|${g.id}`)) linkStats.fp.push(`${r.id}:${k} gap ${t}|${g.id}`);
      }
      // EV-M1(ii)/EV-M2(ii): --traits path
      const tg = r._threats_raw.gt;
      const want = ex.trait_sets[`${r.id}:gt`], want25 = ex25.trait_sets[`${r.id}:gt`];
      if (tg && tg.entry_points) {
        const got = uniq(tg.entry_points.flatMap((e) => e.techniques));
        const x = pr(got, want.in_scope);
        const order_ok = eqArr((tg.techniques || []).map((t) => t.id), want.techniques_top);
        const t25 = r._threats_raw.gt_top25;
        const order25_ok = !!t25 && eqArr((t25.techniques || []).map((t) => t.id), want25.techniques_top);
        const count_ok = tg.techniques_in_scope === want.techniques_in_scope;
        const ep_ok = eqArr(tg.entry_points.map((e) => [e.trait, sorted(e.techniques)]), want.entry_points.map((e) => [e.trait, e.techniques]));
        m1.push({ id: r.id, set: r.set, ...x, order_ok, order25_ok, count_ok, ep_ok });
      } else m1.push({ id: r.id, set: r.set, tp: 0, pred: 0, gold: want.techniques_in_scope, precision: null, recall: 0, error: `exit ${r.threats.gt.exit}` });
      // EV-M1(iii)/EV-M2(iii): description path
      const td = r._threats_raw.desc;
      const gotD = td && td.entry_points ? uniq(td.entry_points.flatMap((e) => e.techniques)) : [];
      const x3 = pr(gotD, want.in_scope);
      const implied = td && td.traits ? pr(ex.trait_sets[`${r.id}:threats_desc`].in_scope, want.in_scope) : pr([], want.in_scope);
      const resolverSame = td && td.traits ? eqArr(sorted(td.traits), sorted((r.build.meta && r.build.meta.all_traits) || [])) : !(r.build.meta && r.build.meta.all_traits && r.build.meta.all_traits.length);
      m1iii.push({ id: r.id, set: r.set, ...x3, implied_recall: implied.recall, implied_tp: implied.tp, no_extra_loss: x3.tp === implied.tp, traits_equal_build_resolution: resolverSame, exit: r.threats.desc.exit });
    }
    M['EV-M3b'] = { pairs_printed: linkStats.printed, precision: ratio(linkStats.correct, linkStats.printed), recall: ratio(linkStats.found, linkStats.expected),
      fp: linkStats.fp.slice(0, 30), fn: linkStats.fn.slice(0, 30), gaps_equal_oracle: `${linkStats.gap_ok}/${linkStats.gap_checks}`, gaps_bad: linkStats.gap_bad,
      classify_technique_counts: M.classify_technique_counts };
    M['EV-M1ii_M2ii'] = bySet((rs) => {
      const l = m1.filter((x) => rs.some((r) => r.id === x.id));
      return { ...micro(l), order_ok: l.every((x) => x.order_ok), order25_ok: l.every((x) => x.order25_ok), counts_ok: l.every((x) => x.count_ok),
        entry_points_ok: l.every((x) => x.ep_ok), per_description: l.map(({ id, recall, precision, order_ok, order25_ok, count_ok, ep_ok, error }) => ({ id, recall, precision, order_ok, order25_ok, count_ok, ep_ok, error })) };
    });
    M['EV-M1iii_M2iii'] = bySet((rs) => {
      const l = m1iii.filter((x) => rs.some((r) => r.id === x.id));
      return { ...micro(l), no_extra_loss: l.every((x) => x.no_extra_loss), traits_equal_build_resolution: l.every((x) => x.traits_equal_build_resolution),
        per_description: l.map(({ id, recall, precision, implied_recall, no_extra_loss, traits_equal_build_resolution, exit }) => ({ id, recall, precision, implied_recall, no_extra_loss, traits_equal_build_resolution, exit })) };
    });
    // EV-M5(iii)(iv)
    const sizes = recs.map((r) => ({ id: r.id, text_default: r.threats.gt_text.chars, text_top25: r.threats.gt_text_top25.chars,
      json_default: r.threats.json_chars.default, json_top25: r.threats.json_chars.top25 }));
    let inChars = 0, allChars = 0;
    for (const r of recs) {
      const inScope = new Set(ex.trait_sets[`${r.id}:gt`].in_scope);
      for (const e of r.threats.gt_text.entries.concat(r.threats.gt_text_top25.entries)) { allChars += e.chars; if (inScope.has(e.id)) inChars += e.chars; }
    }
    M['EV-M5iii'] = { max_text_default: Math.max(...sizes.map((s) => s.text_default)), cap_text_default: CAPS.threats_text_default,
      max_text_top25: Math.max(...sizes.map((s) => s.text_top25)), cap_text_top25: CAPS.threats_text_top25,
      max_json_default: Math.max(...sizes.map((s) => s.json_default)), cap_json_default: CAPS.threats_json_default,
      max_json_top25: Math.max(...sizes.map((s) => s.json_top25)), cap_json_top25: CAPS.threats_json_top25, per_description: sizes };
    M['EV-M5iv'] = { size_weighted_precision: ratio(inChars, allChars), in_scope_chars: inChars, all_chars: allChars };
  } else {
    const note = 'aigis threats does not exist (no prior capability)';
    M['EV-M3b'] = { note }; M['EV-M1ii_M2ii'] = { note, recall: 0 }; M['EV-M1iii_M2iii'] = { note, recall: 0 }; M['EV-M5iii'] = { note }; M['EV-M5iv'] = { note };
  }

  // ---- EV-RT routing
  const both = (a) => NEW_AREAS.every((x) => (a || []).includes(x));
  const rt = (pick) => {
    const tp = recs.filter((r) => r.needs_agent_security && both(pick(r))).length;
    const pos = recs.filter((r) => r.needs_agent_security).length;
    const pred = recs.filter((r) => both(pick(r))).length;
    return { tp, positives: pos, predicted: pred, recall: ratio(tp, pos), precision: pred ? ratio(tp, pred) : null };
  };
  M['EV-RT'] = {
    i_gt_traits_path: rt((r) => r.classify_gt.implement_files),
    ii_description_path_build: bySet(() => rt((r) => r.build.meta && r.build.meta.areas)),
    ii_floor_new_areas_iff_resolver_is_agentic: recs.every((r) => {
      const tr = (r.build.meta && r.build.meta.all_traits) || [];
      const ar = (r.build.meta && r.build.meta.areas) || [];
      return tr.includes('is-agentic') ? both(ar) : !NEW_AREAS.some((x) => ar.includes(x));
    }),
  };
  M['EV-RT'].ii_description_path_build = Object.fromEntries(sets.map((s) => {
    const rs = recs.filter((r) => r.set === s);
    const tp = rs.filter((r) => r.needs_agent_security && both(r.build.meta && r.build.meta.areas)).length;
    const pos = rs.filter((r) => r.needs_agent_security).length;
    const pred = rs.filter((r) => both(r.build.meta && r.build.meta.areas)).length;
    return [s, { tp, positives: pos, predicted: pred, recall: ratio(tp, pos), precision: pred ? ratio(tp, pred) : null }];
  }));

  // ---- EV-M5 (i)(ii)(v) context
  M['EV-M5ii'] = { core_md_chars: stat.core_md_chars, cap: CAPS.core_md };
  M['EV-M5v'] = { catalog_bytes: stat.catalog_bytes, cap: CAPS.catalog_bytes, max_distinct_techniques_in_one_output: M['EV-M3a'].max_distinct_techniques_in_one_output,
    printed_whole: M['EV-M3a'].max_distinct_techniques_in_one_output >= o.facts.techniques };
  M.new_area_sizes = Object.fromEntries(NEW_AREAS.filter((a) => stat.areas[a]).map((a) => [a, { file_chars: stat.areas[a].file_chars, body_chars: stat.areas[a].body_chars, cap: CAPS.new_area_chars }]));
  if (base) {
    const allowanceExtra = NEW_AREAS.reduce((s, a) => s + ((stat.areas[a] && stat.areas[a].body_chars) || 0), 0);
    const rows = recs.map((r) => {
      const b = base.descriptions.find((x) => x.id === r.id && x.set === r.set);
      if (!b || b.build.char_count == null || r.build.char_count == null) return { id: r.id, set: r.set, note: 'no brief', baseline: b && b.build.char_count, now: r.build.char_count };
      const agentic = ((r.build.meta && r.build.meta.all_traits) || []).includes('is-agentic');
      const cap = CAPS.brief_growth + (agentic ? allowanceExtra : 0);
      const moved = b.build.mode === 'full' && r.build.mode !== 'full';
      if (!moved) {
        const delta = r.build.char_count - b.build.char_count;
        return { id: r.id, set: r.set, baseline: b.build.char_count, now: r.build.char_count, delta, cap, agentic, ok: delta <= cap,
          mode_before: b.build.mode, mode_after: r.build.mode, moved_to_compact: false };
      }
      // Separate case: auto brief crossed the cap and fell back to compact. The auto-mode delta is negative and
      // meaningless as growth; growth is measured on the --full brief, and the move itself is judged by the
      // GOALS rule: allowed only for an agentic description whose baseline was within 26,000 of the cap.
      const full = r.build.full_mode && r.build.full_mode.char_count;
      const fullDelta = full != null ? full - b.build.char_count : null;
      const nearCap = b.build.char_count >= CAPS.compact_fallback_cap - 26000;
      return { id: r.id, set: r.set, baseline: b.build.char_count, now: r.build.char_count, auto_mode_delta: r.build.char_count - b.build.char_count,
        full_mode_chars: full, delta: fullDelta, cap, agentic, mode_before: b.build.mode, mode_after: r.build.mode, moved_to_compact: true,
        baseline_within_26000_of_cap: nearCap, fallback_allowed: agentic && nearCap, ok: fullDelta != null && fullDelta <= cap && agentic && nearCap };
    });
    M['EV-M5i'] = { per_description: rows, all_ok: rows.every((x) => x.ok !== false),
      non_agentic_moved_to_compact: rows.filter((x) => x.moved_to_compact && !x.agentic).map((x) => x.id),
      agentic_moved_to_compact: rows.filter((x) => x.moved_to_compact && x.agentic).map((x) => x.id),
      note: 'delta is the auto-mode growth, or for a description that moved to compact, the --full brief growth (auto_mode_delta kept for the record).' };
  }

  // ---- §6 / §9.2 guards vs baseline
  if (base) {
    const v = [];
    const newCtl = (fw) => sorted(uniq(NEW_AREAS.flatMap((a) => (stat.areas[a] && stat.areas[a].controls[fw === 'iso' ? 'iso42001' : fw]) || [])));
    for (const r of recs) {
      const b = base.descriptions.find((x) => x.id === r.id && x.set === r.set);
      if (!b) { v.push(`${r.id}: missing in baseline`); continue; }
      for (const p of ['classify_desc', 'classify_gt']) {
        const cur = r[p], was = b[p];
        if (!eqArr(cur.traits, was.traits)) v.push(`${r.id} ${p}: traits differ`);
        const agentic = (cur.traits || []).includes('is-agentic');
        const expectFiles = agentic ? uniq([...(was.implement_files || []), ...NEW_AREAS]) : was.implement_files;
        if (agentic ? !(eqArr(existingOnly(cur.implement_files), was.implement_files) && both(cur.implement_files)) : !eqArr(cur.implement_files, expectFiles)) v.push(`${r.id} ${p}: implement_files delta not exact`);
        for (const fw of ['owasp', 'nist', 'iso']) {
          const w = (was.controls && was.controls[fw]) || [];
          const expect = agentic ? sorted(uniq([...w, ...newCtl(fw)])) : w;
          const c = (cur.controls && cur.controls[fw]) || [];
          if (!eqArr(sorted(c), sorted(expect))) v.push(`${r.id} ${p}: controls.${fw} delta not exact`);
        }
        for (const k of ['risk_tier', 'reason', 'templates', 'guardrails_fired', 'warnings', 'filtered_by_jurisdiction', 'error']) {
          if (JSON.stringify(cur[k]) !== JSON.stringify(was[k])) v.push(`${r.id} ${p}: ${k} differs`);
        }
        if (JSON.stringify(cur.resolver) !== JSON.stringify(was.resolver)) v.push(`${r.id} ${p}: resolver output differs`);
      }
      const bm = b.build.meta, cm = r.build.meta;
      if (!!bm !== !!cm) v.push(`${r.id} build: brief presence differs`);
      else if (bm) {
        for (const k of ['confirmed_traits', 'uncertain_traits', 'all_traits', 'risk_tier', 'templates', 'infra', 'low_confidence_matches', 'user_decisions']) {
          if (JSON.stringify(cm[k]) !== JSON.stringify(bm[k])) v.push(`${r.id} build: meta.${k} differs`);
        }
        const agentic = (cm.all_traits || []).includes('is-agentic');
        if (agentic ? !(eqArr(existingOnly(cm.areas), bm.areas) && both(cm.areas)) : !eqArr(cm.areas, bm.areas)) v.push(`${r.id} build: areas delta not exact`);
      } else if (b.build.exit !== r.build.exit) v.push(`${r.id} build: exit code differs`);
    }
    // init: rules file grows only by core.md growth; resolver block unchanged
    const coreGrowth = stat.core_md_chars - base.static.core_md_chars;
    for (const ide of IDES) {
      const was = base.init[ide], cur = init[ide];
      if (!was || !cur) continue;
      if (was.exit !== cur.exit) v.push(`init ${ide}: exit differs`);
      for (const [f, info] of Object.entries(was.files)) {
        const c = cur.files[f];
        if (!c) { v.push(`init ${ide}: ${f} missing`); continue; }
        if (c.chars - info.chars !== coreGrowth) v.push(`init ${ide}: ${f} grew ${c.chars - info.chars}, core.md grew ${coreGrowth}`);
        if (c.resolver_block_sha256 !== info.resolver_block_sha256) v.push(`init ${ide}: ${f} resolver block changed`);
      }
    }
    M.guards = { violations: v.length, details: v.slice(0, 80), core_md_growth: coreGrowth };
  }
  // FORBIDDEN phrase scan on every captured output (after removing each DISCLAIMER occurrence)
  const forb = OUTPUTS.map((x) => ({ cmd: x.cmd, hits: forbiddenHits(x.stdout) })).filter((x) => x.hits.length);
  M.forbidden_phrase = { outputs_scanned: OUTPUTS.length, method: 'JSON parsed, keys and string values scanned; exact DISCLAIMER removed first',
    disclaimer_source: shippedDisclaimer(ROOT) ? 'lib/atlas.js' : 'SPEC S0 (lib/atlas.js has none)', disclaimer_equals_spec: DISCLAIMER === DISCLAIMER_SPEC,
    scanner_selftest: forbiddenSelfTest(), hits: forb.length, details: forb.slice(0, 20).map((x) => `${x.cmd.slice(0, 120)}: ${uniq(x.hits).join(', ')}`) };

  // ---- EV-M6 determinism
  M['EV-M6'] = { commands: DETERMINISM.commands, identical: DETERMINISM.identical, differing: DETERMINISM.differing, runs_per_command: N_RUNS };
  return M;
}

function gates(M, hasThreats, base) {
  const g = [];
  const add = (id, pass, value, target) => g.push({ id, pass, value, target });
  if (M['EV-M3a'].ids_printed) add('EV-M3a', M['EV-M3a'].accuracy === 1, M['EV-M3a'].accuracy, 1);
  if (hasThreats) add('EV-M3b', M['EV-M3b'].precision === 1 && M['EV-M3b'].recall === 1 && !M['EV-M3b'].gaps_bad.length, [M['EV-M3b'].precision, M['EV-M3b'].recall], 'P 1, R 1, gaps equal');
  if (M['EV-M3c'].precision !== undefined) add('EV-M3c', M['EV-M3c'].precision === 1 && M['EV-M3c'].recall === 1, [M['EV-M3c'].precision, M['EV-M3c'].recall], 'P 1, R 1');
  if (M['EV-M3d'].precision !== undefined) add('EV-M3d', M['EV-M3d'].precision === 1 && M['EV-M3d'].recall === 1, [M['EV-M3d'].precision, M['EV-M3d'].recall], 'P 1, R 1');
  if (M['EV-M3e']) add('EV-M3e', M['EV-M3e'].pass, M['EV-M3e'].lost, 0);
  if (hasThreats) for (const [s, x] of Object.entries(M['EV-M1ii_M2ii'])) add(`EV-M1ii/M2ii ${s}`, x.recall === 1 && x.precision === 1 && x.order_ok && x.order25_ok && x.counts_ok && x.entry_points_ok, [x.recall, x.precision], 'R 1, P 1, order exact');
  if (hasThreats) add('EV-M5iv', M['EV-M5iv'].size_weighted_precision === 1, M['EV-M5iv'].size_weighted_precision, 1);
  if (hasThreats) add('EV-M5iii', M['EV-M5iii'].max_text_default <= CAPS.threats_text_default && M['EV-M5iii'].max_text_top25 <= CAPS.threats_text_top25 && M['EV-M5iii'].max_json_default <= CAPS.threats_json_default && M['EV-M5iii'].max_json_top25 <= CAPS.threats_json_top25, M['EV-M5iii'].max_text_default, 'caps');
  add('EV-M5ii', M['EV-M5ii'].core_md_chars <= CAPS.core_md, M['EV-M5ii'].core_md_chars, CAPS.core_md);
  if (M['EV-M5v'].catalog_bytes != null) add('EV-M5v', M['EV-M5v'].catalog_bytes <= CAPS.catalog_bytes && !M['EV-M5v'].printed_whole, M['EV-M5v'].catalog_bytes, CAPS.catalog_bytes);
  if (M['EV-M5i']) add('EV-M5i', M['EV-M5i'].all_ok && !M['EV-M5i'].non_agentic_moved_to_compact.length, M['EV-M5i'].per_description.map((x) => x.delta), '<= cap');
  if (base) add('EV-RT(i)', M['EV-RT'].i_gt_traits_path.recall === 1 && M['EV-RT'].i_gt_traits_path.precision === 1, [M['EV-RT'].i_gt_traits_path.recall, M['EV-RT'].i_gt_traits_path.precision], 'R 1, P 1');
  if (M.guards) add('guards §6/§9.2', M.guards.violations === 0, M.guards.violations, 0);
  add('FORBIDDEN', M.forbidden_phrase.hits === 0 && M.forbidden_phrase.scanner_selftest, M.forbidden_phrase.hits, 0);
  add('EV-M6 determinism', M['EV-M6'].differing.length === 0, `${M['EV-M6'].identical}/${M['EV-M6'].commands}`, 'all identical');
  if (M.npm_test) add('EV-M6 npm test', M.npm_test.exit === 0, M.npm_test.exit, 0);
  return g;
}

// ---------------------------------------------------------------- main
function main() {
  const t0 = Date.now();
  const help = spawnSync(process.execPath, [BIN, 'threats', '--help'], { cwd: ROOT, encoding: 'utf8' });
  const hasThreats = help.status === 0 && /threats/.test(help.stdout || '');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain', '--', 'lib', 'bin', 'content', 'package.json'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  log(`run-evals: label=${LABEL} root=${ROOT} head=${head.slice(0, 7)} threats=${hasThreats}`);
  const o = oracle('--emit');
  const base = args.baseline ? JSON.parse(fs.readFileSync(path.resolve(args.baseline), 'utf8')) : null;
  const descs = SETS.flatMap(loadSet);
  const recs = descs.map((d) => runDescription(d, hasThreats));
  // verify --auto per area (EV-M3a surfaces + technique counts per area)
  const verify = {};
  const allAreas = uniq(recs.flatMap((r) => [...(r.classify_gt.implement_files || []), ...(r.classify_desc.implement_files || [])])).sort();
  for (const a of allAreas) {
    const vj = cli(['verify', a, '--auto', FIXTURE_PROJECT, '--json'], { kind: 'verify' });
    const vt = cli(['verify', a, '--auto', FIXTURE_PROJECT], { kind: 'verify' });
    verify[a] = { json: brief(vj), text: brief(vt), cited_controls: vj.json && vj.json.cited_controls, atlas: vj.json && vj.json.atlas };
  }
  const stat = staticArtifacts();
  const init = initRuns();
  const M = computeMetrics(recs, stat, init, o, base, hasThreats);
  // verify technique counts vs oracle (part of EV-M3b "every technique count in verify/classify")
  const withAtlas = Object.entries(verify).filter(([, v]) => v.atlas);
  if (withAtlas.length) {
    const ex = oracle('--expect', { trait_sets: {}, area_sets: Object.fromEntries(withAtlas.map(([a]) => [a, [a]])) });
    const bad = withAtlas.filter(([a, v]) => !eqArr(v.atlas.techniques_addressed, ex.area_sets[a].techniques_addressed) ||
      !eqArr((v.atlas.mitigations || []).map((m) => m.id), ex.area_sets[a].mitigations)).map(([a]) => a);
    M.verify_technique_counts = { checked: withAtlas.length, correct: withAtlas.length - bad.length, bad };
    if (M['EV-M3b'].pairs_printed !== undefined) M['EV-M3b'].verify_technique_counts = M.verify_technique_counts;
  }
  if (args['npm-test']) {
    const r = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    M.npm_test = { exit: r.status, tail: (r.stdout + r.stderr).split('\n').slice(-15).join('\n') };
  }
  for (const r of recs) delete r._threats_raw;
  const G = gates(M, hasThreats, base);
  const out = {
    label: LABEL, generated_by: 'build/atlas/evals/run-evals.js', git_head: head, product_tree_dirty: !!dirty,
    package_version: PKG_VERSION, atlas_source_sha256: o.source_sha256, oracle_facts: o.facts,
    capability: { threats_command: hasThreats, atlas_keys_in_classify: recs.some((r) => r.classify_gt.has_atlas_key) },
    sets: Object.fromEntries(SETS.map((s) => [s, descs.filter((d) => d.set === s).length])),
    seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    gates: G, metrics: M, static: stat, init, verify, descriptions: recs,
  };
  const dir = path.join(HERE, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  log(`wrote ${path.relative(ROOT, file)} in ${out.seconds}s`);
  for (const x of G) log(`${x.pass ? 'PASS' : 'FAIL'} ${x.id}: ${JSON.stringify(x.value)} (target ${JSON.stringify(x.target)})`);
  if (LABEL === 'baseline') return 0;
  return G.every((x) => x.pass) ? 0 : 1;
}
process.exitCode = main();
