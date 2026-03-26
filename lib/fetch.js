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

function filterLanguage(content, lang) {
  if (!lang) return content;

  const keep = lang === 'py' ? 'python' : 'javascript';
  const remove = lang === 'py' ? 'javascript' : 'python';

  // Remove code blocks of the unwanted language
  const regex = new RegExp('```' + remove + '[\\s\\S]*?```\\n?', 'g');
  return content.replace(regex, '');
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
    fileIds = listDir('implement');
  }

  if (!fileIds || fileIds.length === 0) {
    throw new Error('Provide file IDs or use --all. Run "aigis search --list" to see available files.');
  }

  const outputs = [];
  for (const id of fileIds) {
    let content = readFile('implement', id);

    if (opts.frontmatter === false) {
      content = stripFrontmatter(content);
    }

    if (opts.lang) {
      content = filterLanguage(content, opts.lang);
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

module.exports = { get, verify, getTemplate, getAuditScan, readFile, listDir };
