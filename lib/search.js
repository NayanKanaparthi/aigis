const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CONTENT_DIR = path.join(__dirname, '..', 'content');

function loadFileMeta(dir) {
  const dirpath = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(dirpath)) return [];

  return fs.readdirSync(dirpath)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(dirpath, f), 'utf8');
      const parsed = matter(content);
      return {
        id: parsed.data.id || f.replace('.md', ''),
        title: parsed.data.title || f.replace('.md', ''),
        controls: parsed.data.controls || {},
        dir,
        filename: f,
        content: content.toLowerCase(),
      };
    });
}

function search(query) {
  const queryLower = query.toLowerCase();
  const results = [];

  const implement = loadFileMeta('implement');
  const templates = loadFileMeta('templates');
  const all = [...implement, ...templates];

  for (const file of all) {
    const matchedControls = [];

    // Check title match
    const titleMatch = file.title.toLowerCase().includes(queryLower);

    // Check control ID match
    if (file.controls) {
      for (const [framework, ids] of Object.entries(file.controls)) {
        for (const id of (ids || [])) {
          if (id.toLowerCase().includes(queryLower)) {
            matchedControls.push(`${framework}:${id}`);
          }
        }
      }
    }

    // Check content match
    const contentMatch = file.content.includes(queryLower);

    if (titleMatch || matchedControls.length > 0 || contentMatch) {
      results.push({
        id: file.id,
        title: file.title,
        dir: file.dir,
        matched_controls: matchedControls,
        relevance: (titleMatch ? 3 : 0) + (matchedControls.length * 2) + (contentMatch ? 1 : 0),
      });
    }
  }

  return results.sort((a, b) => b.relevance - a.relevance);
}

function listAll() {
  return {
    implement: loadFileMeta('implement').map(f => ({ id: f.id, title: f.title })),
    templates: loadFileMeta('templates').map(f => ({ id: f.id, title: f.title })),
  };
}

module.exports = { search, listAll };
