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
  (cd "$tmp" && npm init -y >/dev/null && npm install --ignore-scripts "./$tgz" >/dev/null 2>&1 && test "$(node_modules/.bin/aigis --version)" = 2.2.0)
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
  local tmp
  tmp="$(mktemp -d)" || return
  (cd "$tmp" && node "$ROOT/bin/aigis.js" init cursor >/dev/null && grep -q 'aigis threats' .cursorrules) || { rm -rf "$tmp"; return 1; }
  node - "$ROOT" "$tmp/.cursorrules" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[2],rules=fs.readFileSync(process.argv[3],'utf8');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/atlas/baseline/init-cursor.json')));
const {renderResolverBlock}=require(path.join(root,'lib/init'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
if(sha(renderResolverBlock())!==baseline.resolver_sha256)process.exit(1);
NODE
  local status=$?; rm -rf "$tmp"; return "$status"
}
e2e05() {
  need_feature || return
  local tmp
  tmp="$(mktemp -d)" || return
  (cd "$ROOT/cli-python" && python3 -m build --wheel --outdir "$tmp" >/dev/null) || { rm -rf "$tmp"; return 1; }
  python3 -m venv "$tmp/venv" || { rm -rf "$tmp"; return 1; }
  "$tmp/venv/bin/pip" install "$tmp"/*.whl >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  test "$("$tmp/venv/bin/aigis" --version)" = 2.2.0 || { rm -rf "$tmp"; return 1; }
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

case_run E2E-01 e2e01
case_run E2E-02 e2e02
case_run E2E-03 e2e03
case_run E2E-04 e2e04
case_run E2E-05 e2e05
case_run E2E-06 e2e06
case_run E2E-07 e2e07
case_run E2E-08 e2e08
exit "$FAILURES"
