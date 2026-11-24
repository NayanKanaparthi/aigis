#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export HTTP_PROXY=http://127.0.0.1:9
export HTTPS_PROXY=http://127.0.0.1:9
export NO_PROXY=localhost,127.0.0.1
FAILURES=0

need_feature() {
  test -f "$ROOT/content/index/atlas.json" || { echo "content/index/atlas.json missing" >&2; return 1; }
  test -f "$ROOT/content/index/atlas-NOTICE.md" || { echo "content/index/atlas-NOTICE.md missing" >&2; return 1; }
  test -f "$ROOT/content/index/atlas-entry-points.json" || { echo "content/index/atlas-entry-points.json missing" >&2; return 1; }
}
case_run() {
  local id="$1"; shift
  if ( "$@" ); then echo "PASS $id"; else echo "FAIL $id"; FAILURES=$((FAILURES + 1)); fi
}
make_tarball() {
  local out="$1"
  (cd "$ROOT" && npm pack --silent --pack-destination "$out")
}

e2e01() {
  need_feature || return
  local tmp tgz
  tmp="$(mktemp -d)" || return
  tgz="$(make_tarball "$tmp")" || { rm -rf "$tmp"; return 1; }
  (cd "$tmp" && npm init -y >/dev/null && npm install --ignore-scripts "./$tgz" >/dev/null 2>&1 && test "$(node_modules/.bin/aigis --version)" = 3.0.0)
  local status=$?; rm -rf "$tmp"; return "$status"
}
e2e02() {
  need_feature || return
  local classify command
  classify="$(node "$ROOT/bin/aigis.js" classify --traits uses-llm,is-agentic,accepts-user-input,is-external,uses-thirdparty-api --json)" || return
  command="$(printf '%s' "$classify" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).atlas.threats_command))')" || return
  (cd "$ROOT" && node bin/aigis.js ${command#aigis } | head -1 | grep -q '^# Aigis threat model') || return
  node "$ROOT/bin/aigis.js" build "Build me a customer support chatbot that uses Claude to answer questions about our product. It should remember conversation history." | grep -q '## Threat model (MITRE ATLAS)' || return
  node "$ROOT/bin/aigis.js" template threat-model >/dev/null
}
e2e03() {
  need_feature || return
  local project="$ROOT/test/fixtures/atlas/project"
  node "$ROOT/bin/aigis.js" verify rate-limiting --auto "$project" | grep -q 'MITRE ATLAS v2026.10' || return
  node "$ROOT/bin/aigis.js" report --areas input-validation,rate-limiting --project "$project" | grep -q 'MITRE ATLAS mitigations' || return
  node "$ROOT/bin/aigis.js" report --areas input-validation,rate-limiting --project "$project" | grep -q 'MITRE ATLAS is a threat catalog'
}
e2e04() {
  need_feature || return
  local tmp tgz cli rules areas
  tmp="$(mktemp -d)" || return
  tgz="$(make_tarball "$tmp")" || { rm -rf "$tmp"; return 1; }
  (cd "$tmp" && npm init -y >/dev/null && npm install --ignore-scripts "./$tgz" >/dev/null 2>&1) || { rm -rf "$tmp"; return 1; }
  cli="$tmp/node_modules/.bin/aigis"
  (cd "$tmp" && "$cli" init cursor >/dev/null) || { rm -rf "$tmp"; return 1; }
  rules="$tmp/.cursorrules"
  grep -q 'without being asked.*new AI feature.*tools, write access, memory or a new data source.*launch.*audit an existing project.*incident' "$rules" || { rm -rf "$tmp"; return 1; }
  grep -q '1\. Derive the traits' "$rules" || { rm -rf "$tmp"; return 1; }
  grep -q '^2\. .*aigis threats --traits.*fall back' "$rules" || { rm -rf "$tmp"; return 1; }
  grep -q '^3\. .*aigis get <area>.*aigis verify <area> --auto' "$rules" || { rm -rf "$tmp"; return 1; }
  grep -q '^4\. .*gap.*Never report a gap as handled' "$rules" || { rm -rf "$tmp"; return 1; }
  grep -q '^5\. Rerun' "$rules" || { rm -rf "$tmp"; return 1; }
  node - "$ROOT" "$tmp/.cursorrules" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[2],rules=fs.readFileSync(process.argv[3],'utf8');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/atlas/baseline/init-cursor.json')));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const block=t=>(t.match(/# --- AIGIS RESOLVER BLOCK START \(checksum: [a-f0-9]+\) ---[\s\S]*?# --- AIGIS RESOLVER BLOCK END ---/)||[])[0];
if(!block(rules)||block(rules)!==block(baseline.content)||block(rules).includes('aigis threats'))process.exit(1);
NODE
  local status=$?; test "$status" -eq 0 || { rm -rf "$tmp"; return "$status"; }
  areas="$("$cli" threats --traits uses-llm,is-agentic,accepts-user-input --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),a=new Set(j.recommended_areas||[]);for(const t of j.techniques||[])for(const m of t.mitigations||[])for(const x of m.areas||[])a.add(typeof x==="string"?x:x.id||x.area);process.stdout.write([...a].filter(Boolean).sort().join("\n"))})')" || { rm -rf "$tmp"; return 1; }
  test -n "$areas" || { rm -rf "$tmp"; return 1; }
  while IFS= read -r area; do "$cli" get "$area" >/dev/null || { rm -rf "$tmp"; return 1; }; done <<<"$areas"
  rm -rf "$tmp"
}
e2e05() {
  need_feature || return
  local tmp
  tmp="$(mktemp -d)" || return
  (cd "$ROOT/cli-python" && python3 -m build --wheel --outdir "$tmp" >/dev/null) || { rm -rf "$tmp"; return 1; }
  python3 -m venv "$tmp/venv" || { rm -rf "$tmp"; return 1; }
  "$tmp/venv/bin/pip" install "$tmp"/*.whl >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  test "$("$tmp/venv/bin/aigis" --version)" = 3.0.0 || { rm -rf "$tmp"; return 1; }
  "$tmp/venv/bin/aigis" classify --traits uses-llm,accepts-user-input,uses-rag --json >/dev/null || { rm -rf "$tmp"; return 1; }
  if test -f "$ROOT/cli-python/aigis_cli/threats.py"; then
    diff <(node "$ROOT/bin/aigis.js" threats --traits uses-llm,accepts-user-input,uses-rag --json) <("$tmp/venv/bin/aigis" threats --traits uses-llm,accepts-user-input,uses-rag --json) || { rm -rf "$tmp"; return 1; }
  fi
  rm -rf "$tmp"
}
e2e06() {
  need_feature || return
  local tmp tgz
  tmp="$(mktemp -d)" || return
  tgz="$(make_tarball "$tmp")" || { rm -rf "$tmp"; return 1; }
  tar -tzf "$tmp/$tgz" >"$tmp/tar.list" || return
  for f in atlas.json atlas-NOTICE.md atlas-entry-points.json threat-model.md; do grep -q "$f" "$tmp/tar.list" || return; done
  grep -Eq '(^|/)(build/|\.claude/|\.context/|recovery|.*\.tgz$)' "$tmp/tar.list" && return 1
  (cd "$ROOT/cli-python" && python3 -m build --wheel --outdir "$tmp" >/dev/null) || return
  python3 -m zipfile -l "$tmp"/*.whl >"$tmp/wheel.list" || return
  for f in atlas.json atlas-NOTICE.md atlas-entry-points.json threat-model.md; do grep -q "$f" "$tmp/wheel.list" || return; done
  rm -rf "$tmp"
}
e2e07() {
  need_feature || return
  test "$(node "$ROOT/scripts/build-atlas-index.js" --source /tmp/atlas-src/ATLAS-2026.10.yaml --check)" = OK
}
e2e08() {
  need_feature || return
  local output
  output="$(script -q /dev/null node "$ROOT/bin/aigis.js" classify --traits uses-llm,accepts-user-input,uses-rag 2>/dev/null)" || return
  printf '%s' "$output" | grep -q 'ATLAS mitigations' || return
  printf '%s' "$output" | grep -q 'Threat model (MITRE ATLAS):' || return
  printf '%s' "$output" | grep -q 'MITRE ATLAS is a threat catalog'
}
e2e09() {
  need_feature || return
  test -f "$ROOT/build/atlas/gold/new-areas.json" || return 1
  local tmp tgz cli classify area_text verify threats
  tmp="$(mktemp -d)" || return
  tgz="$(make_tarball "$tmp")" || { rm -rf "$tmp"; return 1; }
  (cd "$tmp" && npm init -y >/dev/null && npm install --ignore-scripts "./$tgz" >/dev/null 2>&1) || { rm -rf "$tmp"; return 1; }
  cli="$tmp/node_modules/.bin/aigis"
  classify="$("$cli" classify --traits uses-llm,is-agentic,accepts-user-input --json)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$classify" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).implement_files;if(!a.includes("agent-permissions")||!a.includes("agent-tool-safety"))process.exit(1)})' || { rm -rf "$tmp"; return 1; }
  area_text="$("$cli" get agent-tool-safety)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$area_text" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=s.indexOf("## Complete working example"),e=s.indexOf("\n## ",p+4),m=s.slice(p,e<0?undefined:e).match(/```python\n([\s\S]*?)```/);if(!m)process.exit(1);fs.writeFileSync(process.argv[1],m[1]);});' "$tmp/example.py"
  test -f "$tmp/example.py" || { rm -rf "$tmp"; return 1; }
  verify="$(cd "$tmp" && "$cli" verify agent-tool-safety --auto .)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | grep -Eq 'Auto-verified: [0-9]+ PASS, 0 FAIL out of [0-9]+ automatic checks' || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | grep -q 'MITRE ATLAS' || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const g=JSON.parse(fs.readFileSync(process.argv[1])),ids=g.rows.filter(r=>r.area==="agent-tool-safety"&&r.framework==="atlas"&&r.decision==="include").map(r=>r.id);if(!ids.length||ids.some(id=>!s.includes(id)))process.exit(1);});' "$ROOT/build/atlas/gold/new-areas.json" || { rm -rf "$tmp"; return 1; }
  threats="$("$cli" threats --traits uses-llm,is-agentic,accepts-user-input --json)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$threats" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),g=JSON.parse(fs.readFileSync(process.argv[1])),want=g.rows.filter(r=>r.decision==="include"&&r.framework==="atlas"),seen=new Map;for(const t of j.techniques||[])for(const m of t.mitigations||[])seen.set(m.id,new Set((m.areas||[]).map(a=>typeof a==="string"?a:a.id||a.area)));for(const r of want)if(!seen.get(r.id)?.has(r.area))process.exit(1);});' "$ROOT/build/atlas/gold/new-areas.json"
  local status=$?; rm -rf "$tmp"; return "$status"
}

case_run E2E-01 e2e01
case_run E2E-02 e2e02
case_run E2E-03 e2e03
case_run E2E-04 e2e04
case_run E2E-05 e2e05
case_run E2E-06 e2e06
case_run E2E-07 e2e07
case_run E2E-08 e2e08
case_run E2E-09 e2e09
exit "$FAILURES"
