/**
 * Deterministic file checksum for Aigis content artifacts.
 *
 * Algorithm (locked, documented so it's reproducible from this spec):
 *   1. Read the file as UTF-8 bytes.
 *   2. Strip a leading UTF-8 BOM (\uFEFF) if present.
 *   3. Normalize line endings: convert CRLF and lone CR to LF.
 *   4. SHA-256 the resulting bytes.
 *   5. Return the lowercase hex digest.
 *
 * Why canonicalize: the checksum gets written into IDE rules files and
 * compared on subsequent invocations of `aigis init`. Editors / git-attribute
 * settings can flip line endings or insert BOMs without the user noticing,
 * which would otherwise produce spurious mismatches.
 */

const fs = require('fs');
const crypto = require('crypto');

function canonicalizeBytes(text) {
  // Strip leading BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  // CRLF and lone CR → LF
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function computeChecksum(text) {
  const canonical = canonicalizeBytes(text);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function computeFileChecksum(filepath) {
  const text = fs.readFileSync(filepath, 'utf8');
  return computeChecksum(text);
}

module.exports = { computeChecksum, computeFileChecksum, canonicalizeBytes };
