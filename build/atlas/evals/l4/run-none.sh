#!/usr/bin/env bash
# usage: run-none.sh <P1|P2> <n>   -- same fixture, same prompts, NO Aigis (no rules file, no aigis on PATH)
set -u
P=$1; N=$2; W=/tmp/aigis-l4; E="/Users/nayankanaparthi/conductor/workspaces/aigis:cli/miami/aigis-cli/build/atlas/evals/l4"
D=$W/runs/none-$P-$N; rm -rf "$D"; mkdir -p "$D"; cp -R "$E/fixture/." "$D/"
cd "$D" && git init -q && git add -A && git -c user.email=l4@local -c user.name=l4 commit -qm fixture
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v -E "npm-global|aigis-l4|miniconda3" | paste -sd: -)
command -v aigis >/dev/null && { echo "aigis still on PATH" >&2; exit 3; }
PROMPT=$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$E/prompts.json" "$P")
start=$(date +%s)
timeout 900 claude -p "$PROMPT" --model sonnet --dangerously-skip-permissions --setting-sources project,local --disable-slash-commands --strict-mcp-config --output-format stream-json --verbose > "$W/runs/none-$P-$N.log.jsonl" 2> "$W/runs/none-$P-$N.err" < /dev/null
echo "none-$P-$N exit=$? secs=$(( $(date +%s)-start ))" >> $W/runs/status-none.txt
