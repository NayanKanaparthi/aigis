---
id: human-oversight
title: Human oversight and agency control
controls:
  owasp: [LLM06]
  nist: [MAP-3.5, MANAGE-1.3, MANAGE-4.1]
  iso42001: [Annex-A.9, Clause-8.4]
  eu_ai_act: [Art-14, Art-14(4)]
min_risk_tier: all
system_traits: [is-agentic, influences-decisions, handles-minors, generates-code]
---

## What this addresses

OWASP LLM06 addresses excessive agency — granting LLMs too much autonomy to take actions. As agentic AI grows, systems that can write to databases, execute code, call APIs, or send communications without human approval create significant risk. This file covers least privilege, approval gates, and override mechanisms.

## Implementation patterns

### Pattern 1: Principle of least privilege for tools

```python
# Define an explicit allowlist of tools the LLM can use
ALLOWED_TOOLS = {
    "get_claim": {"type": "read", "approval_required": False},
    "search_policies": {"type": "read", "approval_required": False},
    "update_claim_status": {"type": "write", "approval_required": True},
    "send_customer_email": {"type": "write", "approval_required": True},
}

def execute_tool(tool_name: str, params: dict, user_context: dict) -> dict:
    if tool_name not in ALLOWED_TOOLS:
        log_security_event("unauthorized_tool_attempt", tool=tool_name)
        return {"error": "Tool not available"}

    tool_config = ALLOWED_TOOLS[tool_name]

    if tool_config["approval_required"]:
        approval = request_human_approval(tool_name, params, user_context)
        if not approval.granted:
            return {"error": "Action requires human approval", "approval_id": approval.id}

    return tools[tool_name].execute(params)
```

```javascript
const ALLOWED_TOOLS = {
  getClaim: { type: 'read', approvalRequired: false },
  searchPolicies: { type: 'read', approvalRequired: false },
  updateClaimStatus: { type: 'write', approvalRequired: true },
  sendCustomerEmail: { type: 'write', approvalRequired: true },
};

async function executeTool(toolName, params, userContext) {
  if (!(toolName in ALLOWED_TOOLS)) {
    logSecurityEvent('unauthorized_tool_attempt', { tool: toolName });
    return { error: 'Tool not available' };
  }
  const config = ALLOWED_TOOLS[toolName];
  if (config.approvalRequired) {
    const approval = await requestHumanApproval(toolName, params, userContext);
    if (!approval.granted)
      return { error: 'Action requires human approval', approvalId: approval.id };
  }
  return tools[toolName].execute(params);
}
```


### Pattern 2: Human-in-the-loop for high-impact decisions

```python
class DecisionGate:
    def __init__(self, threshold: float, escalation_channel: str):
        self.threshold = threshold
        self.escalation_channel = escalation_channel

    def evaluate(self, ai_decision: dict) -> dict:
        ai_decision["human_override_available"] = True
        ai_decision["decision_source"] = "ai_recommendation"

        if ai_decision["confidence"] < self.threshold:
            ai_decision["requires_human_review"] = True
            ai_decision["review_reason"] = "low_confidence"
            self.notify_reviewer(ai_decision)
        elif ai_decision.get("impact_value", 0) > HIGH_VALUE_THRESHOLD:
            ai_decision["requires_human_review"] = True
            ai_decision["review_reason"] = "high_value"
            self.notify_reviewer(ai_decision)

        return ai_decision
```

```javascript
class DecisionGate {
  constructor(threshold, escalationChannel) {
    this.threshold = threshold;
    this.escalationChannel = escalationChannel;
  }

  evaluate(aiDecision) {
    aiDecision.humanOverrideAvailable = true;
    aiDecision.decisionSource = 'ai_recommendation';
    if (aiDecision.confidence < this.threshold) {
      aiDecision.requiresHumanReview = true;
      aiDecision.reviewReason = 'low_confidence';
      this.notifyReviewer(aiDecision);
    } else if ((aiDecision.impactValue || 0) > HIGH_VALUE_THRESHOLD) {
      aiDecision.requiresHumanReview = true;
      aiDecision.reviewReason = 'high_value';
      this.notifyReviewer(aiDecision);
    }
    return aiDecision;
  }
}
```


### Pattern 3: Action rate limiting

```python
from collections import defaultdict
import time

class ActionRateLimiter:
    def __init__(self):
        self.action_counts = defaultdict(list)

    def check(self, action_type: str, window_seconds: int = 60, max_actions: int = 10) -> bool:
        now = time.time()
        # Clean old entries
        self.action_counts[action_type] = [
            t for t in self.action_counts[action_type] if now - t < window_seconds
        ]
        if len(self.action_counts[action_type]) >= max_actions:
            log_security_event("action_rate_limit_exceeded", action=action_type)
            return False
        self.action_counts[action_type].append(now)
        return True
```

```javascript
class ActionRateLimiter {
  constructor() {
    this.actionCounts = new Map();
  }

  check(actionType, windowSeconds = 60, maxActions = 10) {
    const now = Date.now() / 1000;
    const counts = (this.actionCounts.get(actionType) || [])
      .filter(t => now - t < windowSeconds);
    if (counts.length >= maxActions) {
      logSecurityEvent('action_rate_limit_exceeded', { action: actionType });
      return false;
    }
    counts.push(now);
    this.actionCounts.set(actionType, counts);
    return true;
  }
}
```


### Pattern 4: Override mechanism in API responses

```python
def build_response(assessment: dict) -> dict:
    """Every AI-influenced response includes override capability."""
    return {
        "result": assessment,
        "metadata": {
            "decision_source": "ai",
            "model_version": MODEL_VERSION,
            "confidence": assessment["confidence"],
            "trace_id": generate_trace_id(),
        },
        "override": {
            "available": True,
            "endpoint": "/api/v1/override",
            "instructions": "Submit with override_reason to escalate to human review"
        }
    }
```

```javascript
function buildResponse(assessment) {
  return {
    result: assessment,
    metadata: {
      decisionSource: 'ai',
      modelVersion: MODEL_VERSION,
      confidence: assessment.confidence,
      traceId: generateTraceId(),
    },
    override: {
      available: true,
      endpoint: '/api/v1/override',
      instructions: 'Submit with override_reason to escalate to human review',
    },
  };
}
```


## Anti-patterns

- **Blocklist instead of allowlist for tools.** Always define what the LLM CAN do, not what it can't.
- **Autonomous write operations.** Any action that modifies state should require human approval in high-risk contexts.
- **No audit trail for AI-initiated actions.** Every action the LLM takes must be logged with trace ID.
- **Confidence threshold of zero.** Always require minimum confidence; route low-confidence outputs to humans.

## Related files

- **audit-logging.md:** Every action the LLM takes must be logged. Use audit-logging.md Pattern 3 (decision audit trail) for all AI-influenced decisions, and Pattern 2 (trace ID propagation) to correlate approval requests with their outcomes.
- **fallback-patterns.md:** When human approval is unavailable within a timeout, use fallback-patterns.md Pattern 1 (default safe response) as the fallback behavior rather than auto-approving. See edge case "Time-sensitive decisions" below.
- **confidence-scoring.md:** Confidence thresholds drive the human review gate. Use confidence-scoring.md Pattern 1 (structured confidence) to produce the scores that Pattern 2 of this file (decision gate) evaluates.

## Edge cases

- **Chained actions.** An agent executing a sequence of individually-harmless actions that are collectively dangerous. Implement cumulative impact assessment.
- **Approval fatigue.** If every action requires approval, humans rubber-stamp. Design tiered approval: auto-approve reads, flag writes, block deletes.
- **Time-sensitive decisions.** Some contexts need fast responses. Define fallback behavior for when human review isn't available within the timeout.

## EU AI Act extensions

> Renders only when `jurisdiction-eu` is in the user's trait set. Article 14 mandates effective oversight by natural persons. The procedure above already covers approval gates, override mechanisms, and audit logs; the additions below are the EU-specific obligations on the *natural-person* role itself.

### Article 14(4) — Five oversight capabilities

The natural persons assigned oversight must be enabled to:

- **(a) Understand capabilities and limitations** — they have read the deployer instructions (`aigis get eu-ai-act-art-13-deployer-transparency`); their training is documented.
- **(b) Remain aware of automation bias** — the operational design includes anti-automation-bias measures: cooling-off periods on high-volume confirms, randomized spot-check requirements, dashboards that surface override frequency.
- **(c) Correctly interpret output** — output presentation includes uncertainty indicators (cite `aigis get confidence-scoring`); operators know what each metric means and what action it triggers.
- **(d) Decide not to use, override, or reverse output** — interface enables single-action override AND single-action "do not use this output" (different — override implies replacement; do-not-use implies rejection without replacement).
- **(e) Intervene or interrupt** — the kill switch from `aigis get fallback-patterns` is operable by oversight personnel without engineering involvement, and tested quarterly.

### Article 14(5) — Dual control for biometric ID systems

For high-risk biometric identification systems (Annex III(1)(a)), Article 14(5) requires that "no action or decision is taken by the deployer on the basis of the identification resulting from the system unless that identification has been separately verified and confirmed by at least two natural persons with the necessary competence, training and authority."

If your system performs biometric identification:
- Implement a two-person confirmation gate — a single override does NOT enact a decision; two separate operators must independently confirm
- Each confirmation is logged with operator identity (Art 12 audit log)
- The two operators must be operationally independent (cannot be the same person logged in twice)
- Exception: Article 14(5) second paragraph allows single-person operation for narrow law enforcement, border control, migration, or essential public services scenarios — document if this exception is invoked.

### Verification checkpoint (EU jurisdiction)

- Each oversight role has documented training records covering Art 14(4)(a)–(e) capabilities.
- Override / do-not-use UI elements exist as separate actions, not a single confirmation flow.
- Kill switch test results within the last 90 days, performed by oversight personnel (not engineers).
- For biometric ID systems: dual-confirmation flow active in production, with both operator identities logged per decision.

### Cross-reference

- `aigis get fallback-patterns` — the kill switch this procedure references.
- `aigis get confidence-scoring` — Article 14(4)(c) "correctly interpret output" requires confidence/uncertainty signals.
- `aigis get eu-ai-act-art-13-deployer-transparency` — Article 14(4)(a) "understand capabilities and limitations" requires the deployer instructions document.
