/**
 * Special recognizers for overclaim patterns that can't be expressed as
 * "match-any-regex" rules. Called from auto-verify.js when a checklist has
 * an `overclaim` entry naming the recognizer.
 *
 * Each recognizer receives:
 *   - files: array of { path, content } pre-loaded by the scanner
 *   - ctx:   { rootDir, areaId, checkId }
 *
 * Each returns:
 *   { flagged: boolean, evidence: [ { file, line, snippet } ], notes: string }
 *
 * These are heuristics. Goal is to catch the common overclaim pattern, not
 * to be a full static analyzer. False negatives are acceptable; loud false
 * positives are not — when in doubt, return flagged=false with a note
 * explaining what was inconclusive.
 */

/**
 * kill_switch_restart_latched
 *
 * Baseline evidence: all three runs built env-var kill switches that meet
 * the literal "env variable" wording of V3 but are read only at module
 * load. Flipping them in production requires a restart, which defeats the
 * incident-response intent.
 *
 * Structural signals (any one = flag):
 *   (a) `@lru_cache` decorator on a function that returns Settings / settings
 *   (b) `settings = Settings()` or similar module-level instantiation AND
 *       the kill-switch flag is referenced as `settings.<flag>` in a
 *       handler (i.e. read from the cached object, not re-fetched per request)
 *   (c) A bare `KILL_SWITCH = os.getenv(...)` at module scope (value
 *       frozen at import)
 */
function killSwitchRestartLatched(files, ctx) {
  const evidence = [];
  const flagReasons = [];

  const killSwitchTokens = [
    /ai_system_enabled/i,
    /kill_switch/i,
    /KILL_SWITCH/,
    /feature_flag/i,
    /ai_enabled/i,
  ];

  // Signal (a): @lru_cache on a Settings-returning function
  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/@lru_cache\b/.test(lines[i])) {
        // Look at the next 5 lines for a function that returns Settings
        const follow = lines.slice(i + 1, i + 6).join('\n');
        if (/def\s+(get_)?settings\b|->\s*Settings\b|return\s+Settings\s*\(/.test(follow)) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: lines.slice(i, Math.min(i + 4, lines.length)).join('\n'),
          });
          flagReasons.push('@lru_cache on Settings retrieval (pydantic-settings cached at first call)');
        }
      }
    }
  }

  // Signal (b): module-level `settings = Settings()` AND a flag is read from it in a handler
  const moduleSettingsFiles = [];
  for (const { path, content } of files) {
    if (/^settings\s*=\s*Settings\s*\(\s*\)/m.test(content)) {
      moduleSettingsFiles.push(path);
    }
  }
  if (moduleSettingsFiles.length > 0) {
    // Check if any handler uses `settings.<kill_switch_flag>`
    for (const { path, content } of files) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/settings\.(ai_system_enabled|kill_switch|ai_enabled|feature_flag)/.test(line)
            && /^\s*if\s+not\s+settings\./.test(line) === false
            || /if\s+not\s+settings\.(ai_system_enabled|kill_switch|ai_enabled|feature_flag)/.test(line)) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: line.trim(),
          });
          flagReasons.push('Module-level `settings = Settings()` read inside handler (frozen at import)');
          break;
        }
      }
    }
  }

  // Signal (c): bare module-level os.getenv for a kill-switch variable
  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Module-level (no leading indent) assignment from os.getenv for a kill-switch-named var
      if (/^(KILL_SWITCH|AI_ENABLED|AI_SYSTEM_ENABLED)\s*=\s*os\.getenv/.test(line)) {
        evidence.push({
          file: path,
          line: i + 1,
          snippet: line.trim(),
        });
        flagReasons.push('Module-level `<FLAG> = os.getenv(...)` (value frozen at import)');
      }
    }
  }

  // If the codebase has evidence of re-reading env per-request, partial exoneration
  let rereadsPerRequest = false;
  for (const { content } of files) {
    // Heuristic: os.getenv called inside a function whose body contains `async def` or a route decorator nearby
    // Keep simple: did we see any os.getenv inside a function body that looks like a handler?
    if (/@app\.(get|post|put|delete)|@router\.(get|post|put|delete)/.test(content)
        && /^(?!\s*#).*os\.getenv\s*\(\s*['"](?:AI_SYSTEM_ENABLED|KILL_SWITCH|AI_ENABLED)/m.test(content)) {
      rereadsPerRequest = true;
    }
  }

  const flagged = evidence.length > 0 && !rereadsPerRequest;
  return {
    flagged,
    evidence,
    notes: flagged
      ? `Kill switch appears restart-latched. Reasons: ${[...new Set(flagReasons)].join('; ')}. This meets Aigis V3 literal wording ("env variable") but cannot be toggled during a live incident without a process restart. Verify manually; if confirmed, mark PARTIAL rather than PASS.`
      : (evidence.length > 0
          ? 'Restart-latched signals present but counter-signals (per-request env reads) also found. Manual review recommended.'
          : 'No restart-latched signals detected (no @lru_cache on Settings, no bare module-level env reads of kill-switch var).'),
  };
}

/**
 * injection_log_only
 *
 * Baseline evidence: all three runs implemented an injection-pattern
 * detector whose callsite set a flag or logged, but continued execution
 * to the LLM call without blocking. That meets Aigis V5 literal wording
 * ("even if just logging") but is a logging feature, not a security
 * feature.
 *
 * Detection approach:
 *   1. Find the detector function name (regex for common names +
 *      SUSPICIOUS_PATTERNS module-level list).
 *   2. Find every callsite of that function.
 *   3. For each callsite, look at the next N lines up to a suitable
 *      boundary. If we see a control-flow break (raise, return,
 *      HTTPException, reject) that depends on the detector's return
 *      value BEFORE we see evidence of the LLM call continuing, the
 *      detector blocks — unflagged. Otherwise flag as log-only.
 */
function injectionLogOnly(files, ctx) {
  const evidence = [];
  const callsiteLog = [];

  // Matches common detector names: check_injection, detect_injection,
  // scan_injection, scan_prompt_injection, _scan_prompt_injection,
  // injection_check, injection_detect, run_injection_scan, etc.
  // Also matches direct uses of INJECTION_PATTERN.search / .match / .test / .exec.
  const detectorNameRegex = /\b_?(?:check|detect|scan|run|test|is)_?(?:prompt_?)?injection[a-z_]*\b|INJECTION_PATTERN\s*\.\s*(?:search|match|test|exec)/;

  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip the definition of the detector itself
      if (/^\s*def\s+/.test(line) && detectorNameRegex.test(line)) continue;
      // Callsite: the detector is referenced (not as `def`)
      if (detectorNameRegex.test(line) && !/^\s*def\s+/.test(line) && !/^\s*from\s+|^\s*import\s+/.test(line)) {
        // This is a callsite. Inspect next 20 lines for block/continue pattern.
        const window = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
        // Strong signals the detector blocks on detection:
        //   - `raise HTTPException` / `raise ValueError` inside an `if ...flagged` / `if ...inj` block
        //   - `return <non-llm>` under `if ...flagged`
        //   - `reject`, `block` keywords
        const blockPatterns = [
          /if\s+(?:injection|inj|result|flagged|inject[a-z_]*)[\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)/i,
          /if\s+[^\n]*\[[\"']flagged[\"']\][\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)/i,
          /if\s+[^\n]*\.flagged[\s\S]{0,120}?(?:raise|return|HTTPException|abort)/i,
        ];
        let blocks = false;
        for (const pat of blockPatterns) {
          if (pat.test(window)) {
            blocks = true;
            break;
          }
        }

        callsiteLog.push({
          file: path,
          line: i + 1,
          snippet: line.trim(),
          blocks,
        });

        if (!blocks) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: line.trim() + `  // next 20 lines do not contain a control-flow break based on the detection result`,
          });
        }
      }
    }
  }

  const flagged = callsiteLog.length > 0 && callsiteLog.every((c) => !c.blocks);
  const partiallyFlagged = callsiteLog.some((c) => !c.blocks) && callsiteLog.some((c) => c.blocks);

  let notes;
  if (callsiteLog.length === 0) {
    notes = 'No injection detector callsites found (the detector may not be invoked, or the scanner could not identify it).';
  } else if (flagged) {
    notes = `${callsiteLog.length} callsite(s) of the injection detector found; none branch on the result. Meets Aigis V5 literal wording ("even if just logging") but the LLM call still runs on flagged inputs. Verify manually; if confirmed, mark PARTIAL rather than PASS.`;
  } else if (partiallyFlagged) {
    notes = `Some callsites block on detection, others do not. Review the non-blocking ones.`;
  } else {
    notes = 'All callsites of the injection detector branch on the result (raise/return/reject). No log-only pattern detected.';
  }

  return {
    flagged: flagged || partiallyFlagged,
    evidence,
    notes,
  };
}

/**
 * pii_incomplete_classes
 *
 * Baseline evidence: all three runs implemented PII redaction that
 * covered only 3-4 of the 5 required classes (typically missing
 * `address`, sometimes missing `credit_card` or `phone`). The literal
 * Aigis V1 wording ("is PII detected and redacted before being sent to
 * the LLM") is satisfied as long as a redactor exists, but the redactor
 * leaks any class it doesn't know about.
 *
 * Detection approach: look at PII pattern definitions in the codebase
 * (either as a dict keyed by class name, or as discrete regex variables)
 * and check which of the required 5 classes are represented.
 */
function piiIncompleteClasses(files, ctx) {
  const REQUIRED = ['ssn', 'email', 'phone', 'credit_card', 'address'];
  // Acceptable name variants per class (lowercased)
  const CLASS_TOKENS = {
    ssn: ['ssn', 'social_security', 'socialsecurity', 'socsec'],
    email: ['email', 'e_mail', 'e-mail'],
    phone: ['phone', 'phone_number', 'telephone', 'mobile'],
    credit_card: ['credit_card', 'creditcard', 'card', 'card_number', 'cardnumber', 'pan', 'cc_number', 'payment_card'],
    address: ['address', 'street', 'postal_address', 'mailing_address'],
  };
  const present = {};
  const evidence = [];

  for (const cls of REQUIRED) present[cls] = false;

  for (const { path, content } of files) {
    for (const cls of REQUIRED) {
      if (present[cls]) continue;
      for (const token of CLASS_TOKENS[cls]) {
        const upper = token.toUpperCase();
        const patterns = [
          // Dict keys: "ssn": or 'ssn':
          new RegExp('["\'`]' + token + '["\'`]\\s*:', 'g'),
          // Named variable: SSN_PATTERN = re.compile or ssn = re.compile
          new RegExp('\\b' + token + '\\s*[:=]\\s*re\\.compile', 'gi'),
          new RegExp('\\b' + upper + '_PATTERN', 'g'),
          // Replacement strings: [SSN_REDACTED], [REDACTED_SSN], <SSN>
          new RegExp('\\[' + upper + '_REDACTED\\]', 'g'),
          new RegExp('\\[REDACTED_' + upper + '\\]', 'g'),
          // Function names: redact_ssn, redactSsn
          new RegExp('\\b(?:redact|mask|scrub)_' + token + '\\b', 'gi'),
        ];
        for (const re of patterns) {
          re.lastIndex = 0;
          const m = re.exec(content);
          if (m) {
            present[cls] = true;
            const line = (content.slice(0, m.index).match(/\n/g) || []).length + 1;
            evidence.push({
              file: path,
              line,
              snippet: `${cls}: ` + (content.split('\n')[line - 1] || '').trim().slice(0, 120),
            });
            break;
          }
        }
      }
    }
  }

  const missing = REQUIRED.filter((c) => !present[c]);
  const flagged = missing.length > 0;
  const notes = flagged
    ? `PII redactor is missing pattern coverage for: ${missing.join(', ')}. `
      + `Aigis V1 literal wording ("redaction called") is met, but inputs containing `
      + `${missing.join(' or ')} will reach the LLM (and logs) unredacted. `
      + `Add all 5 required classes: ${REQUIRED.join(', ')}.`
    : `All 5 required PII classes detected in the code.`;
  return { flagged, evidence, notes };
}

/**
 * rate_limit_no_retry_after
 *
 * Baseline evidence: every run built rate limiting that returned 429 on
 * block but without a Retry-After header. Well-behaved clients (every
 * major LLM SDK) read that header to drive retry backoff. Absent
 * Retry-After, clients either retry immediately (making the problem
 * worse) or give up entirely.
 *
 * Detection approach: find every 429 response construction and check
 * whether a Retry-After header is set on or near it (within ~15 lines).
 */
function rateLimitNoRetryAfter(files, ctx) {
  const evidence = [];
  const siteLog = [];

  // Match common 429 construction patterns
  const responseSiteRe = /(?:status_code\s*=\s*429|HTTPException\s*\(\s*(?:status_code\s*=\s*)?429|status\(429\)|response\.status\s*=\s*429)/g;
  const retryAfterRe = /Retry-After|retry_after|retryAfter/i;

  for (const { path, content } of files) {
    const lines = content.split('\n');
    let m;
    responseSiteRe.lastIndex = 0;
    while ((m = responseSiteRe.exec(content)) !== null) {
      const line = (content.slice(0, m.index).match(/\n/g) || []).length + 1;
      // Look at a window around the site: 5 lines before, 15 lines after
      const start = Math.max(0, line - 6);
      const end = Math.min(lines.length, line + 15);
      const window = lines.slice(start, end).join('\n');
      const hasHeader = retryAfterRe.test(window);
      siteLog.push({ file: path, line, hasHeader });
      if (!hasHeader) {
        evidence.push({
          file: path,
          line,
          snippet: (lines[line - 1] || '').trim() + '  // no Retry-After within surrounding 20 lines',
        });
      }
    }
  }

  const flagged = siteLog.length > 0 && siteLog.every((s) => !s.hasHeader);
  const partial = siteLog.some((s) => !s.hasHeader) && siteLog.some((s) => s.hasHeader);
  let notes;
  if (siteLog.length === 0) {
    notes = 'No 429 response sites found.';
  } else if (flagged) {
    notes = `${siteLog.length} site(s) returning 429 found; none set a Retry-After header. `
      + `Aigis V1 literal wording ("per-user rate limit") is met, but clients have no retry-backoff signal. `
      + `Add Retry-After computed from the actual bucket TTL.`;
  } else if (partial) {
    notes = 'Some 429 sites set Retry-After, others do not. Review the ones without.';
  } else {
    notes = 'All 429 response sites set a Retry-After header.';
  }
  return { flagged: flagged || partial, evidence, notes };
}

const REGISTRY = {
  kill_switch_restart_latched: killSwitchRestartLatched,
  injection_log_only: injectionLogOnly,
  pii_incomplete_classes: piiIncompleteClasses,
  rate_limit_no_retry_after: rateLimitNoRetryAfter,
};

module.exports = { REGISTRY };
