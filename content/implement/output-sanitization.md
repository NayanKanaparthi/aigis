---
id: output-sanitization
title: Output sanitization and handling
controls:
  owasp: [LLM05]
  nist: [MEASURE-2.6, MEASURE-2.7]
  iso42001: [Clause-8.2]
min_risk_tier: all
system_traits: [uses-llm]
---

## What this addresses

LLM output is untrusted data. When passed to downstream systems without validation, it becomes an attack vector: XSS via web rendering, SQL injection via database queries, command injection via shell execution, or code injection via eval. OWASP LLM05 specifically addresses this failure to treat LLM output as potentially hostile.

## Implementation patterns

### Pattern 1: Treat LLM output as untrusted user input

```python
# Apply the SAME sanitization to LLM output that you apply to user input
def process_llm_response(raw_response: str, output_context: str) -> str:
    if output_context == "html":
        return html_encode(raw_response)
    elif output_context == "sql":
        return parameterize_query(raw_response)  # Never interpolate
    elif output_context == "shell":
        return shlex.quote(raw_response)
    elif output_context == "json_api":
        return validate_against_schema(raw_response)
    else:
        return raw_response  # Log warning: unknown context
```

```javascript
function processLlmResponse(rawResponse, outputContext) {
  switch (outputContext) {
    case 'html': return escapeHtml(rawResponse);
    case 'sql': return parameterizeQuery(rawResponse);
    case 'json_api': return validateAgainstSchema(rawResponse);
    default:
      logWarning('unknown_output_context', { context: outputContext });
      return rawResponse;
  }
}
```


### Pattern 2: HTML encoding for web display

```python
import html

def safe_render_llm_output(llm_text: str) -> str:
    """Encode LLM output before inserting into HTML."""
    encoded = html.escape(llm_text, quote=True)
    # Strip any remaining HTML tags the encoding might have missed
    encoded = re.sub(r'<[^>]+>', '', encoded)
    return encoded
```

```javascript
function safeRenderLlmOutput(llmText) {
  const div = document.createElement('div');
  div.textContent = llmText;  // textContent auto-escapes
  return div.innerHTML;
}
```

### Pattern 3: Parameterized queries for database operations

```python
# CORRECT: parameterized query
def store_llm_result(result: str, claim_id: str):
    cursor.execute(
        "INSERT INTO assessments (claim_id, result) VALUES (%s, %s)",
        (claim_id, result)
    )

# WRONG: string interpolation
cursor.execute(f"INSERT INTO assessments VALUES ('{claim_id}', '{result}')")
```

```javascript
// CORRECT: parameterized query
async function storeLlmResult(result, claimId) {
  await db.query(
    'INSERT INTO assessments (claim_id, result) VALUES ($1, $2)',
    [claimId, result]
  );
}

// WRONG: string interpolation
// await db.query(`INSERT INTO assessments VALUES ('${claimId}', '${result}')`);
```


### Pattern 4: Sandbox execution for generated code

```python
# If LLM generates code that must be executed, isolate it
import subprocess

def execute_llm_code(code: str, timeout: int = 10) -> str:
    # Never use eval() or exec() directly
    result = subprocess.run(
        ["python", "-c", code],
        capture_output=True, text=True, timeout=timeout,
        # Restrict: no network, limited filesystem, limited memory
        env={"PATH": "/usr/bin"},
        cwd="/tmp/sandbox"
    )
    if result.returncode != 0:
        log_anomaly("code_execution_failure", code, result.stderr)
    return result.stdout
```

```javascript
const vm = require('vm');

function executeLlmCode(code, timeout = 10000) {
  const context = vm.createContext({ console: { log: () => {} } });
  try {
    return vm.runInContext(code, context, { timeout });
  } catch (e) {
    logAnomaly('code_execution_failure', code, e.message);
    return null;
  }
}
```


### Pattern 5: Content type validation

```python
def validate_response_content_type(response: str, expected: str) -> bool:
    """Ensure LLM response matches expected content type."""
    if expected == "json":
        try:
            json.loads(response)
            return True
        except json.JSONDecodeError:
            return False
    elif expected == "number":
        return response.strip().replace('.', '', 1).isdigit()
    elif expected == "enum":
        return response.strip() in ALLOWED_VALUES
    return False
```

```javascript
function validateResponseContentType(response, expected) {
  switch (expected) {
    case 'json':
      try { JSON.parse(response); return true; } catch { return false; }
    case 'number':
      return !isNaN(Number(response.trim()));
    case 'enum':
      return ALLOWED_VALUES.includes(response.trim());
    default:
      return false;
  }
}
```


## Anti-patterns

- **Direct rendering of LLM output in HTML.** Always encode first.
- **Using LLM output in SQL without parameterization.** Always parameterize.
- **eval() or exec() on LLM-generated code.** Always sandbox.
- **Assuming LLM output is safe because the prompt asked for safe output.** Prompts are not security controls.

## Related files

- **input-validation.md:** Input validation and output sanitization are complementary — together they create a validated I/O boundary around the LLM. Input validation (Pattern 4: output schema enforcement) is the first line of defense; output sanitization handles what gets through. Always implement both.
- **fallback-patterns.md:** When output validation fails (Pattern 1, Pattern 4), use fallback-patterns.md Pattern 1 (default safe response) to return a safe value instead of crashing.

## Edge cases

- **Markdown rendering.** If rendering LLM markdown as HTML, use a sanitizing markdown parser that strips scripts and event handlers.
- **Structured output with embedded content.** JSON fields may contain strings with injection payloads. Sanitize each field individually.
- **Multi-step pipelines.** If LLM A's output feeds into LLM B, sanitize at each boundary.
