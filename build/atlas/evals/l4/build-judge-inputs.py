"""Build blinded, redacted judge inputs from L4 run directories.

usage: python3 -I build-judge-inputs.py <runs_dir> <out_dir> <seed> <run> [<run> ...]
Writes <out_dir>/runs/RUN-<id>-<P>.txt and <out_dir>/../judge-key.json-style key at <out_dir>/key.json.

Each input = full `git diff HEAD` of the run (edits to existing files) + every new source file.
Fails loudly if a run has no tracked-file diff: the 2026-11-24 pass silently dropped
edits to existing files because of an invalid pathspec, see results/README.md.
"""
import json, os, random, re, subprocess, sys

RUNS, OUT, SEED, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
RED = re.compile(r"(?i)\baigis\b|\bMITRE\b|\bATLAS\b|AML\.[A-Z]\d{4}(\.\d{3})?|agent-tool-safety|agent-permissions|human-oversight|input-validation|prompt-security|output-sanitization|audit-logging|pii-handling|rate-limiting|fallback-patterns|\bOWASP\b|LLM0\d|LLM10|\bNIST\b")
EXC = [":(exclude)CLAUDE.md", ":(exclude).cursorrules", ":(exclude)**/__pycache__/**"]
EXT = (".py", ".js", ".ts", ".md", ".txt", ".toml", ".json", ".sql", ".yml", ".yaml")

os.makedirs(os.path.join(OUT, "runs"), exist_ok=True)
random.seed(SEED)
ids = random.sample(range(100, 1000), len(names))
key = {}
for name, i in zip(names, ids):
    d = os.path.join(RUNS, name)
    p = subprocess.run(["git", "-C", d, "diff", "HEAD", "--", "."] + EXC, capture_output=True, text=True)
    if p.returncode != 0 or "diff --git" not in p.stdout:
        sys.exit(f"{name}: empty or failed diff: {p.stderr.strip()}")
    text = p.stdout
    new = subprocess.run(["git", "-C", d, "ls-files", "--others", "--exclude-standard"], capture_output=True, text=True).stdout.split()
    for f in new:
        if f.endswith(EXT) and f != "CLAUDE.md" and "__pycache__" not in f:
            with open(os.path.join(d, f), encoding="utf-8", errors="replace") as fh:
                text += f"\n=== NEW FILE {f} ===\n" + fh.read()
    prompt = name.split("-")[1]
    with open(os.path.join(OUT, "runs", f"RUN-{i}-{prompt}.txt"), "w") as fh:
        fh.write(RED.sub("[X]", text))
    key[f"RUN-{i}"] = name
with open(os.path.join(OUT, "key.json"), "w") as fh:
    json.dump(key, fh, indent=1)
print(f"{len(key)} inputs written to {OUT}")
