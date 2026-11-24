#!/usr/bin/env python3
"""Independent oracle for the ATLAS evals (EVALS §1, §2).

Built from the pinned MITRE YAML plus the approved gold files ONLY. It never imports, executes or reads Aigis
code or Aigis-generated data (no lib/, no content/index/atlas*.json). The sha256 of the YAML is checked first.

Usage (always `python3 -I`):
  python3 -I oracle.py                 # check the pinned counts, print a summary, exit 1 on mismatch
  python3 -I oracle.py --emit          # full oracle JSON (catalog facts, techniques, mitigations, links, gold maps)
  python3 -I oracle.py --expect        # read {"trait_sets": {label: [traits]}, "area_sets": {label: [areas]}, "top": N}
                                       # from stdin and print the expected outputs for each set
Options: --yaml PATH (default /tmp/atlas-src/ATLAS-2026.10.yaml), --root REPO, --no-new-areas.

Definitions (SPEC S0, S2, S5.3; restated here so the oracle does not depend on the implementation):
  - MITRE link: one of the `mitigates` relationships (mitigation -> technique). Direct only, no parent/child inheritance.
  - case_studies(t): number of distinct case studies with an `employs` relationship to t.
  - tactics(t): targets of t's own `achieves` relationships, in matrix order.
  - display name: "<parent name>: <name>" for a sub-technique (parent via `specializes`), else name.
  - order: maturity rank (Realized 0, Demonstrated 1, Feasible 2), then case_studies desc, then id asc.
  - in-scope techniques for a trait set: union of gold entry-point techniques (decision include) over the traits.
  - area labels: gold area-mitigations include rows, plus gold/new-areas.json atlas include rows when that file
    exists and carries approved_by (disable with --no-new-areas).
  - gap: a mitigation MITRE links to >= 1 in-scope technique that no labeled area cites. Sorted by number of
    in-scope techniques desc, then id. unmitigated: in-scope techniques with no MITRE link at all.
"""
import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict

PINNED_VERSION = "2026.10"
PINNED_SHA256 = "ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d"
PINNED_FACTS = {
    "tactics": 16, "techniques": 221, "sub_techniques": 92, "mitigations": 44, "mitigates_links": 494,
    "case_studies": 77, "maturity": {"Realized": 117, "Demonstrated": 78, "Feasible": 26},
    "techniques_without_mitigation": 53,
}
MATRIX_ORDER = ["AML.TA0002", "AML.TA0003", "AML.TA0001", "AML.TA0004", "AML.TA0000", "AML.TA0005", "AML.TA0006",
                "AML.TA0012", "AML.TA0007", "AML.TA0013", "AML.TA0008", "AML.TA0015", "AML.TA0009", "AML.TA0014",
                "AML.TA0010", "AML.TA0011"]
MATURITY_RANK = {"Realized": 0, "Demonstrated": 1, "Feasible": 2}

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Oracle:
    def __init__(self, yaml_path, root, use_new_areas=True):
        sha = sha256_file(yaml_path)
        if sha != PINNED_SHA256:
            raise SystemExit(f"oracle: pinned YAML sha256 mismatch ({sha})")
        import yaml  # after the sha check
        with open(yaml_path, encoding="utf-8") as f:
            y = yaml.safe_load(f)
        if str(y["collection"]["version"]) != PINNED_VERSION:
            raise SystemExit("oracle: collection.version is not 2026.10")
        self.sha = sha
        self.tactics = {k: v["name"] for k, v in y["tactics"].items()}
        rel = [x for v in y["relationships"].values() for lst in v.values() for x in lst]
        by = defaultdict(list)
        for x in rel:
            by[x["relationship-type"]].append(x)
        self.rel_counts = {k: len(v) for k, v in by.items()}
        parent = {x["source"]: x["target"] for x in by["specializes"]}
        achieves = defaultdict(set)
        for x in by["achieves"]:
            achieves[x["source"]].add(x["target"])
        cs = defaultdict(set)
        for x in by["employs"]:
            if x["source"].startswith("AML.CS"):
                cs[x["target"]].add(x["source"])
        self.links = sorted({(x["target"], x["source"]) for x in by["mitigates"]})  # (technique, mitigation)
        self.mit_of_tech = defaultdict(set)
        self.tech_of_mit = defaultdict(set)
        for t, m in self.links:
            self.mit_of_tech[t].add(m)
            self.tech_of_mit[m].add(t)
        self.techniques = {}
        for tid, t in y["techniques"].items():
            p = parent.get(tid)
            self.techniques[tid] = {
                "id": tid, "name": t["name"],
                "display_name": (y["techniques"][p]["name"] + ": " + t["name"]) if p else t["name"],
                "maturity": t.get("maturity"), "parent": p,
                "tactics": [{"id": ta, "name": self.tactics[ta]} for ta in MATRIX_ORDER if ta in achieves[tid]],
                "case_studies": len(cs[tid]),
                "mitigations": sorted(self.mit_of_tech[tid]),
            }
        self.mitigations = {mid: {"id": mid, "name": m["name"], "techniques": self.sort_techniques(self.tech_of_mit[mid])}
                            for mid, m in y["mitigations"].items()}
        self.case_study_count = len(y["case-studies"])
        self._load_gold(root, use_new_areas)

    def _load_gold(self, root, use_new_areas):
        gold = os.path.join(root, "build", "atlas", "gold")
        am = json.load(open(os.path.join(gold, "area-mitigations.json"), encoding="utf-8"))
        ep = json.load(open(os.path.join(gold, "entry-points.json"), encoding="utf-8"))
        for d, n in ((am, "area-mitigations"), (ep, "entry-points")):
            if d.get("atlas_sha256") != PINNED_SHA256 or not d.get("approved_by"):
                raise SystemExit(f"oracle: gold {n} is not the approved, pinned copy")
        self.area_map = defaultdict(set)
        for r in am["rows"]:
            if r["decision"] == "include":
                self.area_map[r["area"]].add(r["mitigation"])
        self.new_areas_used = False
        p = os.path.join(gold, "new-areas.json")
        if use_new_areas and os.path.exists(p):
            na = json.load(open(p, encoding="utf-8"))
            if na.get("approved_by"):
                self.new_areas_used = True
                for r in na["rows"]:
                    if r.get("framework") == "atlas" and r.get("decision") == "include":
                        self.area_map[r["area"]].add(r["id"])
        self.entry = defaultdict(set)
        for r in ep["rows"]:
            if r["decision"] == "include":
                self.entry[r["trait"]].add(r["technique"])
        self.cited = defaultdict(set)  # mitigation -> areas
        for a, ms in self.area_map.items():
            for m in ms:
                self.cited[m].add(a)

    def key(self, tid):
        t = self.techniques[tid]
        return (MATURITY_RANK[t["maturity"]], -t["case_studies"], tid)

    def sort_techniques(self, ids):
        return sorted(ids, key=self.key)

    def facts(self):
        mat = defaultdict(int)
        for t in self.techniques.values():
            mat[t["maturity"]] += 1
        return {
            "tactics": len(self.tactics), "techniques": len(self.techniques),
            "sub_techniques": sum(1 for t in self.techniques.values() if t["parent"]),
            "mitigations": len(self.mitigations), "mitigates_links": len(self.links),
            "case_studies": self.case_study_count, "maturity": dict(sorted(mat.items())),
            "techniques_without_mitigation": sum(1 for t in self.techniques if not self.mit_of_tech[t]),
        }

    def expect_traits(self, traits, top=10):
        traits = sorted(set(traits))
        eps = [t for t in traits if self.entry.get(t)]
        in_scope = self.sort_techniques({x for t in eps for x in self.entry[t]})
        pairs = sorted((t, m) for t in in_scope for m in self.mit_of_tech[t])
        linked = sorted({m for _, m in pairs})
        gaps = []
        for m in linked:
            if not self.cited.get(m):
                gaps.append({"id": m, "techniques": sorted(t for t in in_scope if m in self.mit_of_tech[t])})
        gaps.sort(key=lambda g: (-len(g["techniques"]), g["id"]))
        return {
            "traits": traits,
            "entry_points": [{"trait": t, "techniques": sorted(self.entry[t])} for t in eps],
            "techniques_in_scope": len(in_scope),
            "in_scope": in_scope,
            "techniques_top": in_scope[:top],
            "pairs": [list(p) for p in pairs],
            "mitigations_linked": linked,
            "mitigations_with_area": [m for m in linked if self.cited.get(m)],
            "gaps": gaps,
            "unmitigated_techniques": sorted(t for t in in_scope if not self.mit_of_tech[t]),
            "mitigation_counts": {"in_scope": len(linked), "with_area": sum(1 for m in linked if self.cited.get(m)),
                                  "without_area": len(gaps)},
        }

    def expect_areas(self, areas):
        mits = sorted({m for a in areas for m in self.area_map.get(a, ())})
        techs = {t for m in mits for t in self.tech_of_mit[m]}
        c = defaultdict(int)
        for t in techs:
            c[self.techniques[t]["maturity"]] += 1
        return {"mitigations": mits, "techniques_addressed": {
            "total": len(techs), "realized": c["Realized"], "demonstrated": c["Demonstrated"], "feasible": c["Feasible"]},
            "top_techniques": self.sort_techniques(techs)[:2]}

    def emit(self):
        return {
            "atlas_version": PINNED_VERSION, "source_sha256": self.sha, "facts": self.facts(),
            "relationship_counts": self.rel_counts, "new_areas_gold_used": self.new_areas_used,
            "tactics": self.tactics, "techniques": self.techniques, "mitigations": self.mitigations,
            "links": [list(p) for p in self.links],
            "gold_area_map": {a: sorted(v) for a, v in sorted(self.area_map.items())},
            "gold_entry_points": {t: sorted(v) for t, v in sorted(self.entry.items())},
            "all_seeded_traits": self.expect_traits(sorted(self.entry), top=25),
        }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yaml", default="/tmp/atlas-src/ATLAS-2026.10.yaml")
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--expect", action="store_true")
    ap.add_argument("--no-new-areas", action="store_true")
    a = ap.parse_args()
    o = Oracle(a.yaml, a.root, use_new_areas=not a.no_new_areas)
    if a.emit:
        json.dump(o.emit(), sys.stdout, indent=1, sort_keys=False)
        print()
        return 0
    if a.expect:
        req = json.load(sys.stdin)
        top = int(req.get("top", 10))
        out = {"trait_sets": {k: o.expect_traits(v, top) for k, v in req.get("trait_sets", {}).items()},
               "area_sets": {k: o.expect_areas(v) for k, v in req.get("area_sets", {}).items()}}
        json.dump(out, sys.stdout, indent=1)
        print()
        return 0
    f = o.facts()
    bad = {k: (f[k], v) for k, v in PINNED_FACTS.items() if f[k] != v}
    seeded = o.expect_traits(sorted(o.entry), top=25)
    print(json.dumps({"facts": f, "pinned_facts_match": not bad, "mismatches": bad,
                      "all_seeded_traits": {k: seeded[k] for k in ("traits", "techniques_in_scope", "mitigation_counts",
                                                                     "unmitigated_techniques")},
                      "new_areas_gold_used": o.new_areas_used}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
