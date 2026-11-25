#!/usr/bin/env bash
# End-to-end journeys (TESTPLAN E2E-01..09).
#
# Network policy: installing the package's normal dependencies (npm: commander,
# chalk, gray-matter; pip: click, pyyaml, rich) is allowed to use the network.
# Aigis itself must not touch the network at RUNTIME, so every `aigis` invocation
# (Node and Python) goes through `offline`, which points every proxy variable at a
# dead port; a runtime network call would fail there.
# Each case has a hard timeout (E2E_TIMEOUT seconds, default 180) so one hang
# cannot eat the run.
set -u

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FAILURES=0
CASE_TIMEOUT="${E2E_TIMEOUT:-180}"
DEAD_PROXY=http://127.0.0.1:9
NPM_INSTALL_FLAGS="--ignore-scripts --prefer-offline --no-audit --no-fund"

offline() {
  env HTTP_PROXY="$DEAD_PROXY" HTTPS_PROXY="$DEAD_PROXY" ALL_PROXY="$DEAD_PROXY" \
    http_proxy="$DEAD_PROXY" https_proxy="$DEAD_PROXY" all_proxy="$DEAD_PROXY" \
    NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 NODE_USE_ENV_PROXY=1 "$@"
}
aigis_node() { offline node "$ROOT/bin/aigis.js" "$@"; }

need_feature() {
  test -f "$ROOT/content/index/atlas.json" || { echo "content/index/atlas.json missing" >&2; return 1; }
  test -f "$ROOT/content/index/atlas-NOTICE.md" || { echo "content/index/atlas-NOTICE.md missing" >&2; return 1; }
  test -f "$ROOT/content/index/atlas-entry-points.json" || { echo "content/index/atlas-entry-points.json missing" >&2; return 1; }
}
case_run() {
  local id="$1" fn="$2" log start rc elapsed watcher pid reason
  log="$(mktemp)"; start=$SECONDS
  ( set -x; "$fn" ) >"$log" 2>&1 &
  pid=$!
  ( sleep "$CASE_TIMEOUT"; kill -TERM -- "-$pid" 2>/dev/null; sleep 3; kill -KILL -- "-$pid" 2>/dev/null ) >/dev/null 2>&1 &
  watcher=$!
  wait "$pid" 2>/dev/null; rc=$?
  kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
  elapsed=$((SECONDS - start))
  if [ "$rc" -eq 0 ]; then
    echo "PASS $id (${elapsed}s)"
  else
    FAILURES=$((FAILURES + 1))
    if [ "$elapsed" -ge "$CASE_TIMEOUT" ] && { [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; }; then
      reason="timed out after ${CASE_TIMEOUT}s; last step: $(grep -v '^$' "$log" | tail -1 | cut -c1-200)"
    else
      reason="exit $rc; last output: $(grep -v '^$' "$log" | tail -2 | tr '\n' '|' | cut -c1-300)"
    fi
    echo "FAIL $id (${elapsed}s): $reason"
  fi
  rm -f "$log"
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
  (cd "$tmp" && npm init -y >/dev/null && npm install $NPM_INSTALL_FLAGS "./$tgz" >/dev/null && test "$(offline node_modules/.bin/aigis --version)" = 3.0.0)
  local status=$?; rm -rf "$tmp"; return "$status"
}
e2e02() {
  need_feature || return
  local classify command
  classify="$(aigis_node classify --traits uses-llm,is-agentic,accepts-user-input,is-external,uses-thirdparty-api --json)" || return
  command="$(printf '%s' "$classify" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).atlas.threats_command))')" || return
  (cd "$ROOT" && aigis_node ${command#aigis } | head -1 | grep -q '^# Aigis threat model') || return
  aigis_node build "Build me a customer support chatbot that uses Claude to answer questions about our product. It should remember conversation history." | grep -q '## Threat model (MITRE ATLAS)' || return
  aigis_node template threat-model >/dev/null
}
e2e03() {
  need_feature || return
  local project="$ROOT/test/fixtures/atlas/project"
  aigis_node verify rate-limiting --auto "$project" | grep -q 'MITRE ATLAS v2026.10' || return
  aigis_node report --areas input-validation,rate-limiting --project "$project" | grep -q 'MITRE ATLAS mitigations' || return
  aigis_node report --areas input-validation,rate-limiting --project "$project" | grep -q 'MITRE ATLAS is a threat catalog'
}
e2e04() {
  need_feature || return
  local tmp tgz cli rules areas
  tmp="$(mktemp -d)" || return
  tgz="$(make_tarball "$tmp")" || { rm -rf "$tmp"; return 1; }
  (cd "$tmp" && npm init -y >/dev/null && npm install $NPM_INSTALL_FLAGS "./$tgz" >/dev/null) || { rm -rf "$tmp"; return 1; }
  cli="$tmp/node_modules/.bin/aigis"
  (cd "$tmp" && offline "$cli" init cursor >/dev/null) || { rm -rf "$tmp"; return 1; }
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
  areas="$(offline "$cli" threats --traits uses-llm,is-agentic,accepts-user-input --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),a=new Set(j.recommended_areas||[]);for(const t of j.techniques||[])for(const m of t.mitigations||[])for(const x of m.areas||[])a.add(typeof x==="string"?x:x.id||x.area);process.stdout.write([...a].filter(Boolean).sort().join("\n"))})')" || { rm -rf "$tmp"; return 1; }
  test -n "$areas" || { rm -rf "$tmp"; return 1; }
  while IFS= read -r area; do offline "$cli" get "$area" >/dev/null || { rm -rf "$tmp"; return 1; }; done <<<"$areas"
  rm -rf "$tmp"
}
e2e05() {
  need_feature || return
  local tmp
  tmp="$(mktemp -d)" || return
  (cd "$ROOT/cli-python" && python3 -m build --wheel --outdir "$tmp" >/dev/null) || { rm -rf "$tmp"; return 1; }
  python3 -m venv "$tmp/venv" || { rm -rf "$tmp"; return 1; }
  "$tmp/venv/bin/pip" install --disable-pip-version-check "$tmp"/*.whl >/dev/null || { rm -rf "$tmp"; return 1; }
  test "$(offline "$tmp/venv/bin/aigis" --version | awk '{print $NF}')" = 3.0.0 || { rm -rf "$tmp"; return 1; }
  offline "$tmp/venv/bin/aigis" classify --traits uses-llm,accepts-user-input,uses-rag --json >/dev/null || { rm -rf "$tmp"; return 1; }
  if test -f "$ROOT/cli-python/aigis_cli/threats.py"; then
    diff <(aigis_node threats --traits uses-llm,accepts-user-input,uses-rag --json) <(offline "$tmp/venv/bin/aigis" threats --traits uses-llm,accepts-user-input,uses-rag --json) || { rm -rf "$tmp"; return 1; }
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
  # The generator prints "OK (source sha256 <hash>)": the first word is OK and the hash is the pinned source hash.
  local out
  out="$(offline node "$ROOT/scripts/build-atlas-index.js" --source /tmp/atlas-src/ATLAS-2026.10.yaml --check)" || return
  case "$out" in "OK"|"OK "*) ;; *) return 1 ;; esac
  case "$out" in "OK") ;; *ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d*) ;; *) return 1 ;; esac
}
e2e08() {
  need_feature || return
  local output
  output="$(offline script -q /dev/null node "$ROOT/bin/aigis.js" classify --traits uses-llm,accepts-user-input,uses-rag </dev/null 2>/dev/null)" || return
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
  (cd "$tmp" && npm init -y >/dev/null && npm install $NPM_INSTALL_FLAGS "./$tgz" >/dev/null) || { rm -rf "$tmp"; return 1; }
  cli="$tmp/node_modules/.bin/aigis"
  classify="$(offline "$cli" classify --traits uses-llm,is-agentic,accepts-user-input --json)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$classify" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).implement_files;if(!a.includes("agent-permissions")||!a.includes("agent-tool-safety"))process.exit(1)})' || { rm -rf "$tmp"; return 1; }
  area_text="$(offline "$cli" get agent-tool-safety)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$area_text" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=s.indexOf("## Complete working example"),e=s.indexOf("\n## ",p+4),m=s.slice(p,e<0?undefined:e).match(/```python\n([\s\S]*?)```/);if(!m)process.exit(1);fs.writeFileSync(process.argv[1],m[1]);});' "$tmp/example.py"
  test -f "$tmp/example.py" || { rm -rf "$tmp"; return 1; }
  verify="$(cd "$tmp" && offline "$cli" verify agent-tool-safety --auto .)" || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | grep -Eq 'Auto-verified: [0-9]+ PASS, 0 FAIL out of [0-9]+ automatic checks' || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | grep -q 'MITRE ATLAS' || { rm -rf "$tmp"; return 1; }
  printf '%s' "$verify" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const g=JSON.parse(fs.readFileSync(process.argv[1])),ids=g.rows.filter(r=>r.area==="agent-tool-safety"&&r.framework==="atlas"&&r.decision==="include").map(r=>r.id);if(!ids.length||ids.some(id=>!s.includes(id)))process.exit(1);});' "$ROOT/build/atlas/gold/new-areas.json" || { rm -rf "$tmp"; return 1; }
  threats="$(offline "$cli" threats --traits uses-llm,is-agentic,accepts-user-input --json)" || { rm -rf "$tmp"; return 1; }
  # A mitigation can only appear in the output when MITRE links it to a technique in scope for these traits (here 10 techniques, all shown).
  # For every approved gold row whose mitigation is linked to a shown technique, the output must name the gold area for it, and it must not be listed as a gap.
  # At least one row per new area must be linked, so the check cannot pass vacuously.
  printf '%s' "$threats" | node -e 'const fs=require("fs");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),g=JSON.parse(fs.readFileSync(process.argv[1])),c=JSON.parse(fs.readFileSync(process.argv[2])),want=g.rows.filter(r=>r.decision==="include"&&r.framework==="atlas"),shown=new Set((j.techniques||[]).map(t=>t.id)),seen=new Map,gaps=new Set((j.gaps||[]).map(x=>x.id)),checked={};for(const t of j.techniques||[])for(const m of t.mitigations||[])seen.set(m.id,new Set((m.areas||[]).map(a=>typeof a==="string"?a:a.id||a.area)));for(const r of want){const linked=c.mitigations[r.id].techniques.some(x=>shown.has(x));if(!linked)continue;if(!seen.get(r.id)?.has(r.area)||gaps.has(r.id))process.exit(1);checked[r.area]=(checked[r.area]||0)+1;}if(!checked["agent-permissions"]||!checked["agent-tool-safety"])process.exit(1);});' "$ROOT/build/atlas/gold/new-areas.json" "$ROOT/content/index/atlas.json"
  local status=$?; rm -rf "$tmp"; return "$status"
}

set -m
E2E_START=$SECONDS
case_run E2E-01 e2e01
case_run E2E-02 e2e02
case_run E2E-03 e2e03
case_run E2E-04 e2e04
case_run E2E-05 e2e05
case_run E2E-06 e2e06
case_run E2E-07 e2e07
case_run E2E-08 e2e08
case_run E2E-09 e2e09
echo "TOTAL $((SECONDS - E2E_START))s, $FAILURES failed"
exit "$FAILURES"
