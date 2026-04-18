const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { getAnnotations } = require('./annotate');

const CONTENT_DIR = path.join(__dirname, '..', 'content');

function readFile(dir, id) {
  const filepath = path.join(CONTENT_DIR, dir, `${id}.md`);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${dir}/${id}.md`);
  }
  return fs.readFileSync(filepath, 'utf8');
}

function listDir(dir) {
  const dirpath = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(dirpath)) return [];
  return fs.readdirSync(dirpath)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}

function stripFrontmatter(content) {
  const parsed = matter(content);
  return parsed.content.trim();
}

// Canonical language names → the list of fenced-block tags that should be KEPT
// for that language. Lookup is case-insensitive after normalization.
// Aliases (py, js, ts) resolve to the same canonical as their full names.
const LANG_ALIASES = {
  py: 'python', python: 'python',
  js: 'javascript', javascript: 'javascript', node: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  go: 'go', golang: 'go',
  rust: 'rust', rs: 'rust',
};
// What fenced-tag to treat as "the same language" for each canonical.
// TypeScript keeps both ts and js fences since the content currently only
// ships js examples (ts callers still benefit).
const LANG_FENCE_KEEPS = {
  python: ['python', 'py'],
  javascript: ['javascript', 'js', 'node'],
  typescript: ['typescript', 'ts', 'javascript', 'js'],
  go: ['go'],
  rust: ['rust', 'rs'],
};
// All fence tags recognized as "a code language we might filter".
const ALL_LANG_FENCES = new Set(['python', 'py', 'javascript', 'js', 'node', 'typescript', 'ts', 'go', 'rust', 'rs']);

function canonicalizeLang(lang) {
  if (!lang) return null;
  const normalized = lang.toLowerCase();
  const canonical = LANG_ALIASES[normalized];
  if (!canonical) {
    throw new Error(`Unknown language "${lang}". Known: py, python, js, javascript, ts, typescript, go, rust.`);
  }
  return canonical;
}

/**
 * Filter fenced code blocks by language. Keeps blocks whose fence tag is in
 * LANG_FENCE_KEEPS[canonical]. Removes blocks whose fence tag is in
 * ALL_LANG_FENCES but not in the keep list. Blocks with tags we don't
 * recognize (or no tag at all) are always preserved — prose remains untouched.
 *
 * Trailing blank lines left by a removed block are collapsed so the output
 * reads naturally when the agent consumes it.
 */
function filterLanguage(content, lang) {
  const canonical = canonicalizeLang(lang);
  if (!canonical) return content;
  const keepSet = new Set(LANG_FENCE_KEEPS[canonical]);

  // Match ```<tag>...\n<body>\n``` blocks. The tag is captured in group 1.
  const blockRe = /^```([A-Za-z0-9_+-]*)\s*\n[\s\S]*?^```\s*$\n?/gm;
  let out = content.replace(blockRe, (match, tag) => {
    const lowerTag = (tag || '').toLowerCase();
    // Unknown tags (empty, bash, shell, json, etc.) always preserved
    if (!ALL_LANG_FENCES.has(lowerTag)) return match;
    // Language-tagged block: keep or drop based on the language filter
    return keepSet.has(lowerTag) ? match : '';
  });

  // Collapse 3+ consecutive blank lines to 2 (from removed blocks)
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

// ─── Context filter ────────────────────────────────────────────────────
// Manifest-driven. The rules file lives at content/index/context-rules.json
// and declares, per-file, which patterns apply to which contexts. Patterns
// not listed in the manifest are always preserved.

const VALID_CONTEXTS = new Set(['web', 'agentic', 'rag', 'batch']);
let _contextRulesCache = null;

function loadContextRules() {
  if (_contextRulesCache) return _contextRulesCache;
  const rulesPath = path.join(CONTENT_DIR, 'index', 'context-rules.json');
  if (!fs.existsSync(rulesPath)) {
    _contextRulesCache = { rules: [] };
    return _contextRulesCache;
  }
  const raw = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  _contextRulesCache = raw;
  return raw;
}

function canonicalizeContext(context) {
  if (!context) return null;
  const normalized = context.toLowerCase();
  if (!VALID_CONTEXTS.has(normalized)) {
    throw new Error(`Unknown context "${context}". Known: web, agentic, rag, batch.`);
  }
  return normalized;
}

/**
 * Given the full markdown content of an implement file, remove pattern
 * subsections whose heading is listed in the context rules with contexts
 * that do NOT include the requested context. A "pattern subsection" is a
 * `### Pattern N:` level-3 heading and everything until the next `### ` at
 * the same level (or the next `## ` section boundary, or EOF).
 *
 * Pattern headings with no rule in the manifest are preserved unconditionally.
 */
function filterContext(content, context, fileId) {
  const canonical = canonicalizeContext(context);
  if (!canonical) return content;

  const rules = loadContextRules().rules || [];
  const fileRules = rules.filter((r) => r.file === fileId);
  if (fileRules.length === 0) return content;

  const lines = content.split('\n');
  const keepLines = new Array(lines.length).fill(true);

  for (const rule of fileRules) {
    if (rule.contexts.includes(canonical)) continue; // pattern applies; keep
    // Find the heading line that starts with the prefix
    const headerRe = new RegExp('^###\\s+' + escapeRegex(rule.pattern_heading_prefix) + '\\b');
    for (let i = 0; i < lines.length; i++) {
      if (!headerRe.test(lines[i])) continue;
      // Mark lines from header until next ### or ## or EOF for removal
      let j = i;
      while (j < lines.length) {
        if (j > i && /^(##\s|###\s)/.test(lines[j])) break;
        keepLines[j] = false;
        j++;
      }
    }
  }

  const filtered = lines.filter((_, i) => keepLines[i]).join('\n');
  return filtered.replace(/\n{3,}/g, '\n\n');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendAnnotations(content, fileId) {
  const annotations = getAnnotations(fileId);
  if (annotations.length === 0) return content;

  let annotationBlock = '\n\n---\n## Local annotations\n\n';
  for (const a of annotations) {
    annotationBlock += `- ${a.note} _(${a.date})_\n`;
  }
  return content + annotationBlock;
}

function get(fileIds, opts = {}) {
  if (opts.all) {
    fileIds = listDir('skills/areas');
  }

  if (!fileIds || fileIds.length === 0) {
    throw new Error('Provide file IDs or use --all. Run "aigis search --list" to see available files.');
  }

  const outputs = [];
  for (const id of fileIds) {
    let content = readFile('skills/areas', id);

    if (opts.frontmatter === false) {
      content = stripFrontmatter(content);
    }

    if (opts.lang) {
      content = filterLanguage(content, opts.lang);
    }

    if (opts.context) {
      content = filterContext(content, opts.context, id);
    }

    content = appendAnnotations(content, id);
    outputs.push(content);
  }

  return outputs.join('\n\n---\n\n');
}

function verify(fileIds) {
  if (!fileIds || fileIds.length === 0) {
    throw new Error('Provide file IDs to verify.');
  }

  const outputs = [];
  for (const id of fileIds) {
    const checklistId = `checklist-${id}`;
    const content = readFile('verify', checklistId);
    outputs.push(content);
  }

  return outputs.join('\n\n---\n\n');
}

function getTemplate(templateIds) {
  if (!templateIds || templateIds.length === 0) {
    throw new Error('Provide template IDs.');
  }

  const outputs = [];
  for (const id of templateIds) {
    const content = readFile('templates', id);
    outputs.push(content);
  }

  return outputs.join('\n\n---\n\n');
}

function getAuditScan() {
  return readFile('index', 'audit-scan');
}

function getCore() {
  return readFile('skills', 'core');
}

function getWorkflow(type) {
  if (!type) {
    throw new Error('Provide a workflow type. Run "aigis workflow --list" to see available workflows.');
  }
  return readFile('skills/workflows', type);
}

function listWorkflows() {
  return listDir('skills/workflows');
}

module.exports = { get, verify, getTemplate, getAuditScan, getCore, getWorkflow, listWorkflows, readFile, listDir };
