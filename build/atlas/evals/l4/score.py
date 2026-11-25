"""Score L4 agent runs from artifacts only (command log + files written). See RUBRIC.md.

usage: python3 -I score.py <runs_dir> <aigis_v3_bin> <out.json>
"""
import json
import os
import re
import subprocess
import sys

RUNS, AIGIS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
AREAS = ["agent-tool-safety", "agent-permissions", "input-validation", "prompt-security"]


def commands(log_path):
    cmds = []
    with open(log_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") != "assistant":
                continue
            for c in (ev.get("message") or {}).get("content") or []:
                if c.get("type") == "tool_use" and c.get("name") == "Bash":
                    cmds.append((c.get("input") or {}).get("command", ""))
    return cmds


def final_text(log_path):
    text = ""
    with open(log_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") == "result":
                text = ev.get("result") or ""
    return text


def verify(run_dir, area):
    r = subprocess.run([AIGIS, "verify", area, "--auto", run_dir, "--json"],
                       capture_output=True, text=True, timeout=120)
    try:
        s = json.loads(r.stdout)["summary"]
        return {"pass": s["auto_pass"], "total": s["auto_total"], "overclaims": s["overclaims_raised"]}
    except Exception:
        return {"pass": None, "total": None, "overclaims": None, "error": (r.stderr or r.stdout)[:200]}


rows = []
for name in sorted(os.listdir(RUNS)):
    run_dir = os.path.join(RUNS, name)
    log = run_dir + ".log.jsonl"
    if not os.path.isdir(run_dir) or not os.path.exists(log):
        continue
    cond, prompt, n = name.split("-")
    cmds = commands(log)
    joined = "\n".join(cmds)
    aig = [c for c in cmds if re.search(r"(^|[\s;&|(])aigis\s", c)]
    final = final_text(log)
    row = {
        "run": name, "condition": cond, "prompt": prompt, "n": int(n),
        "R1_threats": any(re.search(r"aigis\s+threats\b", c) for c in cmds),
        "R2_traits_agentic": any(re.search(r"aigis\s+(threats|classify|build)\b.*--traits[ =][^ ]*is-agentic", c) for c in cmds),
        "R3_get_agent_area": any(re.search(r"aigis\s+get\b.*agent-(permissions|tool-safety)", c) for c in cmds),
        "R3b_any_get": any(re.search(r"aigis\s+get\b", c) for c in cmds),
        "R4_verify_auto": any(re.search(r"aigis\s+verify\b.*--auto", c) for c in cmds),
        "R5_any_aigis": bool(aig),
        "aigis_commands": aig[:40],
        "mentions_gap": bool(re.search(r"\bgap|not covered|no mapped Aigis area", final, re.I)),
        "bash_commands": len(cmds),
        "outcome": {a: verify(run_dir, a) for a in AREAS},
    }
    rows.append(row)

summary = {}
for cond in sorted({r["condition"] for r in rows}):
    rs = [r for r in rows if r["condition"] == cond]
    s = {"runs": len(rs)}
    for k in ["R1_threats", "R2_traits_agentic", "R3_get_agent_area", "R3b_any_get", "R4_verify_auto", "R5_any_aigis", "mentions_gap"]:
        s[k] = f"{sum(1 for r in rs if r[k])}/{len(rs)}"
    for a in AREAS:
        ok = [r["outcome"][a] for r in rs if r["outcome"][a]["total"]]
        p = sum(o["pass"] for o in ok); t = sum(o["total"] for o in ok)
        s[f"{a}_auto_pass"] = f"{p}/{t}" + (f" ({p / t:.0%})" if t else "")
        s[f"{a}_overclaims"] = sum(o["overclaims"] or 0 for o in ok)
    summary[cond] = s

json.dump({"rows": rows, "summary": summary}, open(OUT, "w"), indent=1)
print(json.dumps(summary, indent=1))
