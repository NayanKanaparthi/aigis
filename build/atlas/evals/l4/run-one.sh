#!/usr/bin/env bash
# usage: run-one.sh <v2|v3> <P1|P2> <n>
set -u
C=$1; P=$2; N=$3; W=/tmp/aigis-l4; E="/Users/nayankanaparthi/conductor/workspaces/aigis:cli/miami/aigis-cli/build/atlas/evals/l4"
D=$W/runs/$C-$P-$N; rm -rf "$D"; mkdir -p "$D"; cp -R "$E/fixture/." "$D/"
cd "$D" && git init -q && git add -A && git -c user.email=l4@local -c user.name=l4 commit -qm fixture
export PATH="$W/$C/node_modules/.bin:$PATH"
aigis init cursor >/dev/null 2>&1 && cp .cursorrules CLAUDE.md && git add -A && git -c user.email=l4@local -c user.name=l4 commit -qm "aigis init"
PROMPT=$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$E/prompts.json" "$P")
start=$(date +%s)
timeout 900 claude -p "$PROMPT" --model sonnet --dangerously-skip-permissions --setting-sources project,local --disable-slash-commands --strict-mcp-config --output-format stream-json --verbose > "$W/runs/$C-$P-$N.log.jsonl" 2> "$W/runs/$C-$P-$N.err" < /dev/null
echo "$C-$P-$N exit=$? secs=$(( $(date +%s)-start ))" >> $W/runs/status.txt
