#!/usr/bin/env python3
"""Mechanical checker for the approved ATLAS gold files (EVALS §5.1 step 4).

Run with `python3 -I build/atlas/evals/check-gold.py [--yaml PATH] [--root REPO]`.

Checks, for every row (include and exclude alike):
  area-mitigations.json
    - mitigation id exists in the pinned YAML and mitigation_name equals MITRE's name
    - atlas_quote is a verbatim substring of the mitigation's description (whitespace-normalized)
    - every area_evidence string is a verbatim heading line in content/skills/areas/<area>.md
    - area is one of the 15 non-EU areas
  entry-points.json
    - technique id exists, technique_name equals MITRE's name (or the parent-qualified display name),
      maturity equals MITRE's maturity
    - atlas_quote is a verbatim substring of the technique's description (whitespace-normalized)
    - trait is in ALL_TRAITS (parsed from lib/classify.js as text; no Aigis code is executed)
  both files
    - atlas_version == 2026.10 and atlas_sha256 equals the pinned file's sha256 (which is checked first)
    - approved_by and approved_at are present; decision is include or exclude; no duplicate (key) rows
  gold/new-areas.json (optional, only when present)
    - framework "atlas" rows get the same id / name / quote / heading checks; other frameworks are reported
      as checked only when a local source file is named in the row and contains the quote.

Exit 0 when every check passes, 1 otherwise. Prints one line per failure and a summary.
Reads data only; the YAML is parsed with yaml.safe_load.
"""
import argparse
import hashlib
import json
import os
import re
import sys

PINNED_VERSION = "2026.10"
PINNED_SHA256 = "ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d"
NON_EU_AREAS = [
    "audit-logging", "bias-monitoring", "confidence-scoring", "data-integrity", "explainability",
    "fallback-patterns", "human-oversight", "input-validation", "monitoring", "output-sanitization",
    "pii-handling", "prompt-security", "rag-security", "rate-limiting", "supply-chain",
]
NEW_AREAS = ["agent-permissions", "agent-tool-safety"]

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_yaml(path):
    import yaml  # PyYAML; imported late so the sha check runs first
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_all_traits(root):
    src = open(os.path.join(root, "lib", "classify.js"), encoding="utf-8").read()
    m = re.search(r"const ALL_TRAITS = \[(.*?)\];", src, re.S)
    if not m:
        raise SystemExit("check-gold: cannot find ALL_TRAITS in lib/classify.js")
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return re.findall(r"'([a-z0-9-]+)'", body)


def headings(path):
    if not os.path.exists(path):
        return None
    out = set()
    in_fence = False
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and re.match(r"^#{1,6} ", line):
            out.add(line.rstrip())
    return out


class Checker:
    def __init__(self):
        self.fail = []
        self.ok = 0

    def check(self, cond, msg):
        if cond:
            self.ok += 1
        else:
            self.fail.append(msg)
        return cond


def display_name(techniques, tid):
    t = techniques[tid]
    if "." in tid[len("AML.T"):]:
        parent = tid.rsplit(".", 1)[0]
        if parent in techniques:
            return techniques[parent]["name"] + ": " + t["name"]
    return t["name"]


def check_envelope(c, name, doc):
    c.check(doc.get("atlas_version") == PINNED_VERSION, f"{name}: atlas_version {doc.get('atlas_version')!r} != {PINNED_VERSION}")
    c.check(doc.get("atlas_sha256") == PINNED_SHA256, f"{name}: atlas_sha256 does not equal the pinned sha256")
    c.check(bool(doc.get("approved_by")), f"{name}: approved_by missing")
    c.check(bool(doc.get("approved_at")), f"{name}: approved_at missing")
    c.check(isinstance(doc.get("rows"), list) and doc["rows"], f"{name}: rows missing or empty")


def check_area_row(c, where, row, mitigations, root, area_list):
    area = row.get("area")
    mid = row.get("mitigation") or row.get("id")
    c.check(area in area_list, f"{where}: area {area!r} is not a labelable area")
    c.check(row.get("decision") in ("include", "exclude"), f"{where}: decision {row.get('decision')!r}")
    if not c.check(mid in mitigations, f"{where}: mitigation {mid!r} not in pinned YAML"):
        return
    m = mitigations[mid]
    name = row.get("mitigation_name", row.get("name"))
    c.check(name == m["name"], f"{where}: name {name!r} != MITRE {m['name']!r}")
    q = row.get("atlas_quote", row.get("quote"))
    c.check(bool(norm(q)) and norm(q) in norm(m.get("description", "")),
            f"{where}: atlas_quote is not a verbatim substring of {mid} description: {q!r}")
    ev = row.get("area_evidence") or []
    c.check(isinstance(ev, list) and len(ev) > 0, f"{where}: area_evidence empty")
    hs = headings(os.path.join(root, "content", "skills", "areas", f"{area}.md"))
    if not c.check(hs is not None, f"{where}: area file content/skills/areas/{area}.md missing"):
        return
    for h in ev:
        c.check(h.rstrip() in hs, f"{where}: area_evidence {h!r} is not a heading in {area}.md")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yaml", default="/tmp/atlas-src/ATLAS-2026.10.yaml")
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--json", action="store_true", help="print a JSON summary instead of text")
    a = ap.parse_args()

    c = Checker()
    sha = sha256_file(a.yaml)
    if sha != PINNED_SHA256:
        print(f"FAIL pinned YAML sha256 {sha} != {PINNED_SHA256}")
        return 1
    y = load_yaml(a.yaml)
    if str(y.get("collection", {}).get("version")) != PINNED_VERSION:
        print("FAIL pinned YAML collection.version != 2026.10")
        return 1
    techniques, mitigations = y["techniques"], y["mitigations"]
    all_traits = parse_all_traits(a.root)
    gold = os.path.join(a.root, "build", "atlas", "gold")
    summary = {}

    # A. area-mitigations
    doc = json.load(open(os.path.join(gold, "area-mitigations.json"), encoding="utf-8"))
    check_envelope(c, "area-mitigations", doc)
    seen = set()
    for i, row in enumerate(doc["rows"]):
        where = f"area-mitigations row {i} ({row.get('area')} {row.get('mitigation')})"
        key = (row.get("area"), row.get("mitigation"))
        c.check(key not in seen, f"{where}: duplicate row")
        seen.add(key)
        check_area_row(c, where, row, mitigations, a.root, NON_EU_AREAS)
    inc = [r for r in doc["rows"] if r.get("decision") == "include"]
    summary["area-mitigations"] = {"rows": len(doc["rows"]), "include": len(inc),
                                   "areas_labeled": len({r["area"] for r in inc}),
                                   "distinct_mitigations": len({r["mitigation"] for r in inc})}

    # B. entry-points
    doc = json.load(open(os.path.join(gold, "entry-points.json"), encoding="utf-8"))
    check_envelope(c, "entry-points", doc)
    seen = set()
    for i, row in enumerate(doc["rows"]):
        tid, trait = row.get("technique"), row.get("trait")
        where = f"entry-points row {i} ({trait} {tid})"
        c.check((trait, tid) not in seen, f"{where}: duplicate row")
        seen.add((trait, tid))
        c.check(trait in all_traits, f"{where}: trait {trait!r} not in ALL_TRAITS")
        c.check(row.get("decision") in ("include", "exclude"), f"{where}: decision {row.get('decision')!r}")
        if not c.check(tid in techniques, f"{where}: technique {tid!r} not in pinned YAML"):
            continue
        t = techniques[tid]
        nm = row.get("technique_name")
        c.check(nm in (t["name"], display_name(techniques, tid)),
                f"{where}: technique_name {nm!r} != MITRE {t['name']!r} / {display_name(techniques, tid)!r}")
        c.check(row.get("maturity") == t.get("maturity"), f"{where}: maturity {row.get('maturity')!r} != MITRE {t.get('maturity')!r}")
        q = row.get("atlas_quote")
        c.check(bool(norm(q)) and norm(q) in norm(t.get("description", "")),
                f"{where}: atlas_quote is not a verbatim substring of {tid} description: {q!r}")
    inc = [r for r in doc["rows"] if r.get("decision") == "include"]
    summary["entry-points"] = {"rows": len(doc["rows"]), "include": len(inc),
                               "traits": len({r["trait"] for r in inc}),
                               "distinct_techniques": len({r["technique"] for r in inc})}

    # C. new-areas (optional; does not exist before GATE A2)
    p = os.path.join(gold, "new-areas.json")
    if os.path.exists(p):
        doc = json.load(open(p, encoding="utf-8"))
        check_envelope(c, "new-areas", doc)
        other = {"checked": 0, "unverifiable": 0}
        for i, row in enumerate(doc["rows"]):
            where = f"new-areas row {i} ({row.get('area')} {row.get('framework')} {row.get('id')})"
            if row.get("framework") == "atlas":
                check_area_row(c, where, {**row, "mitigation": row.get("id"), "mitigation_name": row.get("name"),
                                          "atlas_quote": row.get("quote")}, mitigations, a.root, NEW_AREAS)
            else:
                src = row.get("source")
                if isinstance(src, str) and os.path.exists(src):
                    txt = norm(open(src, encoding="utf-8", errors="replace").read())
                    c.check(norm(row.get("quote")) in txt, f"{where}: quote not found in {src}")
                    other["checked"] += 1
                else:
                    other["unverifiable"] += 1
        summary["new-areas"] = {"rows": len(doc["rows"]), **other}
    else:
        summary["new-areas"] = "absent (not yet approved); skipped"

    summary["checks_passed"] = c.ok
    summary["failures"] = c.fail
    if a.json:
        print(json.dumps(summary, indent=2))
    else:
        for f in c.fail:
            print("FAIL " + f)
        for k in ("area-mitigations", "entry-points", "new-areas"):
            print(f"{k}: {summary[k]}")
        print(f"check-gold: {c.ok} checks passed, {len(c.fail)} failed")
    return 0 if not c.fail else 1


if __name__ == "__main__":
    sys.exit(main())
