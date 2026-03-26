const fs = require('fs');
const path = require('path');
const os = require('os');

const AIGIS_DIR = path.join(os.homedir(), '.aigis');
const ANNOTATIONS_FILE = path.join(AIGIS_DIR, 'annotations.json');

function ensureDir() {
  if (!fs.existsSync(AIGIS_DIR)) {
    fs.mkdirSync(AIGIS_DIR, { recursive: true });
  }
}

function loadAnnotations() {
  if (!fs.existsSync(ANNOTATIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ANNOTATIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAnnotations(data) {
  ensureDir();
  fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(data, null, 2));
}

function annotate(fileId, note) {
  const data = loadAnnotations();
  if (!data[fileId]) data[fileId] = [];
  data[fileId].push({
    note,
    date: new Date().toISOString().split('T')[0],
  });
  saveAnnotations(data);
}

function getAnnotations(fileId) {
  const data = loadAnnotations();
  return data[fileId] || [];
}

function listAnnotations() {
  return loadAnnotations();
}

function clearAnnotation(fileId) {
  const data = loadAnnotations();
  delete data[fileId];
  saveAnnotations(data);
}

module.exports = { annotate, getAnnotations, listAnnotations, clearAnnotation };
