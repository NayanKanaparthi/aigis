/**
 * auto-verify.js — deterministic scanner for `aigis verify <area> --auto <path>`.
 *
 * Philosophy: heuristic regex over the project's source files. Each rule
 * declares patterns; if ANY pattern matches ANY scanned file, the rule is
 * PASS. Some rules are inverse: presence of the pattern = FAIL (anti-pattern
 * detectors, e.g. `eval(`).
 *
 * Out of scope: AST parsing, cross-file flow analysis. Those would raise
 * confidence but also lock the scanner to specific languages. Regex keeps
 * the scanner language-agnostic for Python, JS, TS, and Go without extra
 * infra.
 *
 * Rules live in content/index/auto-verify-rules.json.
 * Special recognizers (overclaim detectors) live in lib/special-recognizers.js.
 */

const fs = require('fs');
const path = require('path');
const { REGISTRY: SPECIAL } = require('./special-recognizers');

const RULES_PATH = path.join(__dirname, '..', 'content', 'index', 'auto-verify-rules.json');

// Default glob: scan typical source files, skip noise.
const DEFAULT_INCLUDE_EXTS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.go', '.rb', '.java', '.kt',
]);
const DEFAULT_CONFIG_FILES = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock',
  'poetry.lock', 'go.mod', 'Gemfile', 'Gemfile.lock', 'pom.xml',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.venv', 'venv', 'env', '__pycache__', '.pytest_cache',
  'dist', 'build', '.git', '.tox', 'target', 'coverage', '.next', '.nuxt',
  '.cache', '.idea', '.vscode',
]);

function loadRules() {
  const raw = fs.readFileSync(RULES_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  // Strip _schema_* helper keys so they don't appear as areas
  const cleaned = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k.startsWith('_schema_')) continue;
    cleaned[k] = v;
  }
  return cleaned;
}

function* walkFiles(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.') && !['', '.'].includes(entry.name)) {
          // Skip hidden and heavy dirs, except allow the root itself
          if (SKIP_DIRS.has(entry.name)) continue;
          if (entry.name.startsWith('.')) continue;
        }
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (DEFAULT_INCLUDE_EXTS.has(ext) || DEFAULT_CONFIG_FILES.has(entry.name)) {
          yield full;
        }
      }
    }
  }
}

function loadFiles(rootDir) {
  const files = [];
  for (const p of walkFiles(rootDir)) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      const relPath = path.relative(rootDir, p);
      files.push({ path: relPath, absolutePath: p, content });
    } catch {
      // skip unreadable
    }
  }
  return files;
}

/**
 * Special rule type: exists_path. Returns PASS if any file in the project
 * matches any of the listed path globs. Used for "does a tests/ directory
 * exist" style checks that are filename-based, not content-based.
 */
function existsPathRule(rule, files) {
  const globs = rule.path_globs || [];
  const evidence = [];
  for (const { path: relPath } of files) {
    for (const g of globs) {
      if (matchesGlob(relPath, g)) {
        evidence.push({ file: relPath, line: 1, snippet: '(path match)', pattern: 0 });
        if (evidence.length >= 5) break;
      }
    }
    if (evidence.length >= 5) break;
  }
  return {
    status: evidence.length > 0 ? 'PASS' : 'FAIL',
    evidence,
    matched_patterns: evidence.length > 0 ? [0] : [],
    total_patterns: 1,
    inverse: false,
    require: 'any',
  };
}

/**
 * Scan files for a rule. Returns { status, evidence, matched } where
 * evidence is an array of { file, line, snippet } for the first handful
 * of matches.
 */
function scanRule(rule, files) {
  if (rule.type === 'exists_path') {
    return existsPathRule(rule, files);
  }
  // Compile with 'gmi' (case-insensitive) by default. Identifier-level
  // patterns are almost always case-mixed in practice (X-User-Id vs
  // x-user-id; API_KEY vs api_key), and false positives from case-folding
  // on identifier regexes are rare in our use case.
  const flags = rule.case_sensitive ? 'gm' : 'gmi';
  const patterns = (rule.patterns || []).map((p) => {
    try {
      return new RegExp(p, flags);
    } catch {
      return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }
  });
  const require = rule.require || 'any';
  const inverse = !!rule.inverse;
  const maxEvidence = 5;

  const matchedPatterns = new Set();
  const evidence = [];
  for (const { path: relPath, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < patterns.length; i++) {
      if (matchedPatterns.has(i) && evidence.length >= maxEvidence) continue;
      const re = patterns[i];
      re.lastIndex = 0;
      const matches = content.matchAll(re);
      for (const m of matches) {
        matchedPatterns.add(i);
        if (evidence.length < maxEvidence) {
          // Compute line number from match index
          const before = content.slice(0, m.index);
          const line = (before.match(/\n/g) || []).length + 1;
          const snippet = (lines[line - 1] || '').trim().slice(0, 160);
          evidence.push({ file: relPath, line, snippet, pattern: i });
        }
        if (evidence.length >= maxEvidence) break;
      }
      if (evidence.length >= maxEvidence) break;
    }
    if (evidence.length >= maxEvidence && (require === 'any' || matchedPatterns.size === patterns.length)) break;
  }

  let passed;
  if (require === 'all') {
    passed = matchedPatterns.size === patterns.length;
  } else {
    passed = matchedPatterns.size >= 1;
  }
  // Inverse rules: presence of pattern = FAIL
  if (inverse) {
    passed = !passed;
  }

  return {
    status: passed ? 'PASS' : 'FAIL',
    evidence,
    matched_patterns: [...matchedPatterns],
    total_patterns: patterns.length,
    inverse,
    require,
  };
}

function runSpecialRecognizer(name, files, ctx) {
  const fn = SPECIAL[name];
  if (!fn) {
    return {
      flagged: false,
      evidence: [],
      notes: `Unknown recognizer: ${name}`,
    };
  }
  return fn(files, ctx);
}

/**
 * Given a pattern-area id (e.g. 'input-validation') and a project
 * directory, run all AUTO and OVERCLAIM rules and return a structured
 * result the CLI can format.
 */
function autoVerifyArea(areaId, projectDir) {
  const rules = loadRules();
  const area = rules[areaId];
  if (!area) {
    throw new Error(`No auto-verify rules for pattern area "${areaId}". Known areas: ${Object.keys(rules).join(', ')}`);
  }

  const files = loadFiles(projectDir);

  const autoResults = {};
  for (const [checkId, rule] of Object.entries(area.auto || {})) {
    // Optional per-rule file glob override is not implemented here — we scan the
    // default set, then filter by the rule's hint if provided. Simple filter for
    // supply-chain V5 / V3 style where we want e.g. requirements.txt specifically.
    let scanFiles = files;
    if (rule.file_glob) {
      const globs = rule.file_glob.split(',').map((g) => g.trim());
      scanFiles = files.filter((f) => globs.some((g) => matchesGlob(f.path, g)));
    }
    autoResults[checkId] = { ...rule, ...scanRule(rule, scanFiles) };
  }

  const overclaimResults = {};
  for (const [checkId, entry] of Object.entries(area.overclaim || {})) {
    const recog = runSpecialRecognizer(entry.recognizer, files, {
      rootDir: projectDir, areaId, checkId,
    });
    // An overclaim raises concern only if the corresponding auto rule (also_auto) was PASS.
    const alsoAuto = entry.also_auto;
    let raise = recog.flagged;
    if (alsoAuto && autoResults[alsoAuto] && autoResults[alsoAuto].status !== 'PASS') {
      raise = false; // auto didn't pass, the overclaim question is moot
    }
    overclaimResults[checkId] = {
      desc: entry.desc,
      recognizer: entry.recognizer,
      also_auto: alsoAuto,
      raised: raise,
      flagged: recog.flagged,
      evidence: recog.evidence,
      notes: recog.notes,
    };
  }

  const judgmentResults = {};
  for (const [checkId, desc] of Object.entries(area.judgment || {})) {
    judgmentResults[checkId] = { desc, status: 'JUDGMENT' };
  }

  // Summary
  const autoList = Object.entries(autoResults);
  const autoPass = autoList.filter(([, r]) => r.status === 'PASS').length;
  const autoFail = autoList.filter(([, r]) => r.status === 'FAIL').length;
  const overclaimsRaised = Object.values(overclaimResults).filter((r) => r.raised).length;
  const judgmentCount = Object.keys(judgmentResults).length;

  return {
    area: areaId,
    project_dir: projectDir,
    files_scanned: files.length,
    summary: {
      auto_total: autoList.length,
      auto_pass: autoPass,
      auto_fail: autoFail,
      overclaims_raised: overclaimsRaised,
      judgment_required: judgmentCount,
    },
    auto_checks: autoResults,
    overclaim_checks: overclaimResults,
    judgment_checks: judgmentResults,
  };
}

// Glob matcher supporting `*` and `**`. `**/` at the start matches any number
// of leading path segments including zero (so `**/foo/**` matches `foo/bar.py`).
function matchesGlob(filePath, glob) {
  const norm = filePath.replace(/\\/g, '/');
  let pattern = glob.replace(/\\/g, '/');
  // A leading `**/` should optionally match — `**/tests/**` should match both
  // `app/tests/x.py` and `tests/x.py`.
  let reSrc = pattern
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*\//g, '@@GLOBSTAR_SLASH@@')
    .replace(/\*\*/g, '@@GLOBSTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@GLOBSTAR_SLASH@@/g, '(?:.*/)?')
    .replace(/@@GLOBSTAR@@/g, '.*');
  const re = new RegExp('^' + reSrc + '$');
  return re.test(norm);
}

/**
 * Format a text report for the CLI. Returns a string.
 */
function formatTextReport(result) {
  const lines = [];
  lines.push(`═══ AUTO-VERIFY: ${result.area} ═══\n`);
  lines.push(`Project: ${result.project_dir}`);
  lines.push(`Files scanned: ${result.files_scanned}`);
  const s = result.summary;
  lines.push(`Auto-verified: ${s.auto_pass}/${s.auto_total} PASS, ${s.auto_fail} FAIL`);
  lines.push(`Overclaim recognizers raised: ${s.overclaims_raised}`);
  lines.push(`Judgment required: ${s.judgment_required} check(s)\n`);

  // AUTO section
  if (Object.keys(result.auto_checks).length > 0) {
    lines.push('── AUTO CHECKS ──');
    for (const [checkId, r] of Object.entries(result.auto_checks)) {
      const badge = r.status === 'PASS' ? '[PASS]' : '[FAIL]';
      const inv = r.inverse ? ' (inverse: presence of pattern = FAIL)' : '';
      lines.push(`\n${badge} ${checkId}: ${r.desc}${inv}`);
      if (r.evidence.length > 0) {
        for (const e of r.evidence.slice(0, 3)) {
          lines.push(`       ${e.file}:${e.line}  ${e.snippet}`);
        }
      } else if (r.status === 'FAIL' && !r.inverse) {
        lines.push(`       no matches for any of ${r.total_patterns} pattern(s)`);
      } else if (r.status === 'PASS' && r.inverse) {
        lines.push(`       no anti-pattern instances found`);
      }
    }
    lines.push('');
  }

  // OVERCLAIM section
  if (Object.keys(result.overclaim_checks).length > 0) {
    lines.push('── OVERCLAIM RECOGNIZERS ──');
    for (const [checkId, r] of Object.entries(result.overclaim_checks)) {
      const badge = r.raised ? '[OVERCLAIM RAISED]' : '[no signal]';
      lines.push(`\n${badge} ${checkId}: ${r.desc}`);
      lines.push(`       recognizer: ${r.recognizer}`);
      lines.push(`       ${r.notes}`);
      if (r.evidence.length > 0) {
        for (const e of r.evidence.slice(0, 3)) {
          lines.push(`       ${e.file}:${e.line}  ${e.snippet}`);
        }
      }
    }
    lines.push('');
  }

  // JUDGMENT section
  if (Object.keys(result.judgment_checks).length > 0) {
    lines.push('── JUDGMENT REQUIRED (agent must evaluate) ──');
    for (const [checkId, r] of Object.entries(result.judgment_checks)) {
      lines.push(`\n[JUDGMENT] ${checkId}: ${r.desc}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('═══ SUMMARY ═══');
  lines.push(`Auto-verified: ${s.auto_pass} PASS, ${s.auto_fail} FAIL out of ${s.auto_total} automatic checks`);
  lines.push(`Overclaim flags raised: ${s.overclaims_raised}`);
  lines.push(`Judgment required: ${s.judgment_required} checks`);
  lines.push('');
  lines.push('Interpretation:');
  lines.push('  PASS / FAIL are deterministic based on regex match against project files.');
  lines.push('  Overclaim flags mean the literal checklist wording is satisfied but a stricter');
  lines.push('    operational bar may not be. Mark PARTIAL rather than PASS unless you can');
  lines.push('    rebut the flag with evidence.');
  lines.push('  JUDGMENT checks are not auto-gradable. The agent must evaluate them.');

  return lines.join('\n');
}

module.exports = {
  autoVerifyArea,
  formatTextReport,
  loadRules,
};
