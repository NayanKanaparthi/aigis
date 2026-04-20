"""Mirror of lib/build.js — `aigis build "<description>"` (Step 8).

Pure functions. CLI wrapper in cli.py handles the interactive prompt loop,
--confirm/--reject flags, TTY detection, and stdout. See lib/build.js for the
canonical design notes — this file mirrors it line-for-line in behavior.

Modes:
  - auto    (default): try buildFull at AUTO_FULL_CAP; on overflow, fall back
            to compact with a warning the CLI surfaces on stderr.
  - full              : buildFull at FULL_HARD_CAP. Raises BriefTooLargeError.
  - compact           : buildCompact, no cap concern.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import datetime, timezone

import frontmatter

from .classify import classify
from .keywords import detect_traits_from_text
from .fetch import get_infra

CONTENT_DIR = Path(__file__).resolve().parent / "content"

AUTO_FULL_CAP = 120_000
FULL_HARD_CAP = 200_000


class BriefTooLargeError(Exception):
    def __init__(self, char_count: int, char_cap: int, areas: list[str]):
        super().__init__(
            f"Brief is {char_count} chars; cap is {char_cap}. Your description matched "
            f"{len(areas)} area{'' if len(areas) == 1 else 's'} ({', '.join(areas)}). "
            f"Try a more focused description, or split the build into per-domain runs. "
            f'To see what would be included without rendering: aigis build "..." --list'
        )
        self.char_count = char_count
        self.char_cap = char_cap
        self.areas = areas


def normalize_description(raw: str) -> str:
    if not isinstance(raw, str):
        return ""
    s = raw.strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.!?]+$", "", s)
    return s.lower()


def phrase_to_slug(phrase: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", phrase.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    if len(slug) > 24:
        truncated = slug[:24]
        last_dash = truncated.rfind("-")
        slug = truncated[:last_dash] if last_dash > 0 else truncated
    return f"t-{slug or 'trigger'}"


def assign_unique_slugs(low_conf_matches: list[dict]) -> list[dict]:
    slug_counts: dict[str, int] = {}
    out: list[dict] = []
    for m in low_conf_matches:
        base = phrase_to_slug(m["phrase"])
        count = slug_counts.get(base, 0)
        slug_counts[base] = count + 1
        slug = base if count == 0 else f"{base}-{count + 1}"
        out.append({**m, "slug": slug})
    return out


def strip_frontmatter_raw(content: str) -> str:
    if not content.startswith("---\n"):
        return content.strip()
    end = content.find("\n---\n", 4)
    if end == -1:
        return content.strip()
    return content[end + 5:].strip()


def extract_infra_references(area_content: str) -> list[str]:
    block = re.search(r"##\s+Related infrastructure\s*\n([\s\S]*?)(?:\n##\s|$)", area_content)
    if not block:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in re.finditer(r"aigis infra ([a-z0-9][a-z0-9-]*)", block.group(1), re.IGNORECASE):
        i = m.group(1).lower()
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def collect_infra_references(areas: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for area in areas:
        try:
            content = (CONTENT_DIR / "skills" / "areas" / f"{area}.md").read_text(encoding="utf-8")
        except FileNotFoundError:
            continue
        for i in extract_infra_references(content):
            if i not in seen:
                seen.add(i)
                out.append(i)
    return out


def resolve_traits(detection: dict, decision_map: dict, *, uncertain_as_included: bool = True) -> dict:
    confirmed: set[str] = set(detection["traits_auto_applied"])
    uncertain: set[str] = set()
    user_decisions: list[dict] = []

    for sug in detection["low_confidence_matches"]:
        raw = decision_map.get(sug["id"], "unsure" if uncertain_as_included else "no").lower()
        if raw in ("y", "yes"):
            decision = "yes"
        elif raw in ("n", "no"):
            decision = "no"
        else:
            decision = "unsure"
        user_decisions.append({**sug, "user_decision": decision})
        if decision == "yes":
            for t in sug["traits"]:
                confirmed.add(t)
        elif decision == "unsure":
            for t in sug["traits"]:
                if t not in confirmed:
                    uncertain.add(t)

    uncertain -= confirmed
    return {
        "confirmed_traits": sorted(confirmed),
        "uncertain_traits": sorted(uncertain),
        "all_traits": sorted(confirmed | uncertain),
        "user_decisions": user_decisions,
    }


def _read_title(subdir: str, file_id: str) -> str:
    try:
        raw = (CONTENT_DIR / subdir / f"{file_id}.md").read_text(encoding="utf-8")
        parsed = frontmatter.loads(raw)
        title = parsed.metadata.get("title")
        return str(title) if title else file_id
    except Exception:
        return file_id


def _iso_ms(timestamp: datetime | None) -> str:
    """ISO-8601 with millisecond precision and 'Z' suffix — matches JS Date.toISOString()."""
    dt = timestamp or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _read_version() -> str:
    try:
        from . import __version__
        return __version__
    except Exception:
        return "unknown"


def _prepare(description: str, decisions: dict) -> dict:
    normalized = normalize_description(description)
    if not normalized:
        raise ValueError('Provide a description in quotes. Example: aigis build "customer chatbot with RAG"')
    detection = detect_traits_from_text(normalized)
    low_conf_with_slugs = assign_unique_slugs(detection["low_confidence_matches"])
    detection_with_slugs = {**detection, "low_confidence_matches": low_conf_with_slugs}

    numeric_decisions: dict[str, str] = {}
    for m in low_conf_with_slugs:
        if m["slug"] in decisions:
            numeric_decisions[m["id"]] = decisions[m["slug"]]
        elif m["id"] in decisions:
            numeric_decisions[m["id"]] = decisions[m["id"]]

    resolved = resolve_traits(detection_with_slugs, numeric_decisions, uncertain_as_included=True)
    if not resolved["all_traits"]:
        raise ValueError(
            "No traits resolved from description. Try a more specific description, "
            'or use `aigis classify --traits ...` directly.'
        )
    cls = classify(resolved["all_traits"])
    areas = cls["implement_files"]
    infra_ids = collect_infra_references(areas)

    return {
        "normalized": normalized,
        "raw_input": description,
        "detection": detection,
        "low_conf_with_slugs": low_conf_with_slugs,
        "resolved": resolved,
        "cls": cls,
        "areas": areas,
        "infra_ids": infra_ids,
    }


def _make_meta(prep: dict, brief: str, mode: str, cap: int | None, ts: str, version: str, fell_back: bool) -> dict:
    return {
        "mode": mode,
        "auto_fallback": fell_back,
        "normalized_description": prep["normalized"],
        "input_was_normalized": prep["normalized"] != prep["raw_input"],
        "raw_input": prep["raw_input"],
        "confirmed_traits": prep["resolved"]["confirmed_traits"],
        "uncertain_traits": prep["resolved"]["uncertain_traits"],
        "all_traits": prep["resolved"]["all_traits"],
        "risk_tier": prep["cls"]["risk_tier"],
        "areas": prep["areas"],
        "infra": prep["infra_ids"],
        "templates": prep["cls"]["templates"],
        "char_count": len(brief),
        "char_cap": cap,
        "low_confidence_matches": [
            {
                "slug": m["slug"],
                "phrase": m["phrase"],
                "traits": m["traits"],
                "confirmation_prompt": m["confirmation_prompt"],
                "notes": m["notes"],
            }
            for m in prep["low_conf_with_slugs"]
        ],
        "user_decisions": prep["resolved"]["user_decisions"],
        "generated_at": ts,
        "version": version,
    }


def _render_common_sections(*, normalized, version, ts, mode_note, cls, resolved, areas, infra_ids):
    s: list[str] = []
    s.append("# Aigis governance brief")
    s.append("")
    s.append(f'> Generated by `aigis build "{normalized}"`')
    s.append(f"> aigis {version} — generated {ts}")
    if mode_note:
        s.append(f"> {mode_note}")
    s.append("> Determinism note: same description + same trait decisions produces byte-identical brief (timestamp masked).")
    s.append("")

    s.append("## Input")
    s.append("")
    s.append(f"- Description: `{normalized}`")
    s.append(f"- Risk tier: **{cls['risk_tier']}** _({cls['reason']})_")
    confirmed_str = ", ".join(f"`{t}`" for t in resolved["confirmed_traits"]) or "(none)"
    s.append(f"- Confirmed traits ({len(resolved['confirmed_traits'])}): {confirmed_str}")
    if resolved["uncertain_traits"]:
        s.append(f"- Uncertain traits ({len(resolved['uncertain_traits'])}, marked ⚠ in this brief):")
        for t in resolved["uncertain_traits"]:
            s.append(f"  - ⚠ `{t}` — surfaced from a low-confidence trigger; treat as *possibly applicable*. Ask the user before assuming.")
    else:
        s.append("- Uncertain traits (0)")
    s.append("")

    s.append("## Instructions for the agent")
    s.append("")
    s.append("The following are governance areas Aigis identified based on the description above. **Treat them as a starting point, not a closed list.**")
    s.append("")
    s.append("1. Verify these match your understanding of *this* codebase before implementing. If any area clearly does not apply (e.g. `pii-handling` for a system that genuinely handles no user data), say so to the user and skip it with a written reason.")
    s.append("2. If the codebase reveals concerns Aigis missed (a webhook surface, a privileged tool the LLM can call, a regulated jurisdiction), add the matching area. Run `aigis search --list` to see what's available.")
    s.append("3. For each area below, follow the procedure step by step. Honor every **verification checkpoint** — those are not suggestions.")
    s.append("4. Run `aigis verify <area> --auto .` after implementing each area. Fix any FAIL or OVERCLAIM before moving on.")
    s.append("5. For uncertain traits (⚠ above), pause before implementing the dependent area and ask the user to confirm it applies.")
    s.append("")
    return s


def _render_verification(*, areas, resolved, cls):
    s: list[str] = []
    s.append("## Verification")
    s.append("")
    s.append("After implementing the areas above, the agent should confirm:")
    s.append("")
    s.append("- [ ] Every area's verification checkpoints pass.")
    for area in areas:
        s.append(f"- [ ] `aigis verify {area} --auto .` returns no FAIL or OVERCLAIM.")
    s.append("- [ ] If any area was added or removed from the recommended set, document the reason in the PR description.")
    if resolved["uncertain_traits"]:
        plural = "" if len(resolved["uncertain_traits"]) == 1 else "s"
        traits_str = ", ".join(f"`{t}`" for t in resolved["uncertain_traits"])
        s.append(f"- [ ] Uncertain trait{plural} ({traits_str}) confirmed or rejected with the user before relevant code paths shipped.")
    if cls["templates"]:
        s.append("- [ ] Documentation templates generated:")
        for t in cls["templates"]:
            s.append(f"  - [ ] `aigis template {t}`")
    s.append("")
    s.append("---")
    s.append("")
    s.append("*Generated by aigis. This brief is content, not a scaffold — Aigis writes nothing into your project. The agent and the user remain responsible for what ships.*")
    s.append("")
    return s


def build_compact(description: str, decisions: dict | None = None, *,
                  timestamp: datetime | None = None,
                  version_string: str | None = None,
                  fell_back_from_full: bool = False) -> dict:
    decisions = decisions or {}
    prep = _prepare(description, decisions)
    ts = _iso_ms(timestamp)
    version = version_string or _read_version()

    if fell_back_from_full:
        mode_note = (
            f"Compact mode (auto-fallback): full brief would exceed {AUTO_FULL_CAP:,} chars. "
            f'Run `aigis build "{prep["normalized"]}" --full` to force inlined content; '
            f"you may need to split into per-domain runs."
        )
    else:
        mode_note = f'Compact mode: pointer-only. Run `aigis build "{prep["normalized"]}" --full` to inline procedure content.'

    s = _render_common_sections(
        normalized=prep["normalized"], version=version, ts=ts, mode_note=mode_note,
        cls=prep["cls"], resolved=prep["resolved"], areas=prep["areas"], infra_ids=prep["infra_ids"],
    )

    s.append(f"## Areas ({len(prep['areas'])})")
    s.append("")
    s.append("For each area below, run `aigis get <area>` to fetch the full procedure, then implement step by step. Run `aigis verify <area> --auto .` after.")
    s.append("")
    for i, area in enumerate(prep["areas"], 1):
        title = _read_title("skills/areas", area)
        s.append(f"{i}. **{area}** — {title}")
        s.append(f"   - Fetch:  `aigis get {area}`")
        s.append(f"   - Verify: `aigis verify {area} --auto .`")
    s.append("")

    if prep["infra_ids"]:
        s.append(f"## Infrastructure ({len(prep['infra_ids'])})")
        s.append("")
        s.append("The areas above reference these infrastructure files. Fetch as needed:")
        s.append("")
        for i in prep["infra_ids"]:
            title = _read_title("skills/infrastructure", i)
            s.append(f"- `aigis infra {i}` — {title}")
        s.append("")

    s.extend(_render_verification(areas=prep["areas"], resolved=prep["resolved"], cls=prep["cls"]))
    brief = "\n".join(s)
    return {"brief": brief, "meta": _make_meta(prep, brief, "compact", None, ts, version, fell_back_from_full)}


def build_full(description: str, decisions: dict | None = None, *,
               char_cap: int = FULL_HARD_CAP,
               timestamp: datetime | None = None,
               version_string: str | None = None) -> dict:
    decisions = decisions or {}
    prep = _prepare(description, decisions)
    ts = _iso_ms(timestamp)
    version = version_string or _read_version()

    s = _render_common_sections(
        normalized=prep["normalized"], version=version, ts=ts, mode_note=None,
        cls=prep["cls"], resolved=prep["resolved"], areas=prep["areas"], infra_ids=prep["infra_ids"],
    )

    s.append("## Areas")
    s.append("")
    for i, area in enumerate(prep["areas"], 1):
        try:
            raw = (CONTENT_DIR / "skills" / "areas" / f"{area}.md").read_text(encoding="utf-8")
        except FileNotFoundError:
            continue
        stripped = strip_frontmatter_raw(raw)
        s.append(f"### {i}. {area}")
        s.append("")
        s.append(stripped)
        s.append("")
        s.append("---")
        s.append("")

    if prep["infra_ids"]:
        s.append("## Infrastructure")
        s.append("")
        s.append("The areas above reference these infrastructure files. Apply whichever shape (from-scratch / existing) matches the project.")
        s.append("")
        for i in prep["infra_ids"]:
            try:
                raw = get_infra(i)
            except Exception:
                continue
            stripped = strip_frontmatter_raw(raw)
            s.append(f"### {i}")
            s.append("")
            s.append(stripped)
            s.append("")
            s.append("---")
            s.append("")

    s.extend(_render_verification(areas=prep["areas"], resolved=prep["resolved"], cls=prep["cls"]))
    brief = "\n".join(s)
    if len(brief) > char_cap:
        raise BriefTooLargeError(len(brief), char_cap, prep["areas"])
    return {"brief": brief, "meta": _make_meta(prep, brief, "full", char_cap, ts, version, False)}


def build_brief(description: str, decisions: dict | None = None, *,
                mode: str = "auto",
                timestamp: datetime | None = None,
                version_string: str | None = None) -> dict:
    """Dispatcher. mode ∈ {'auto', 'full', 'compact'}."""
    decisions = decisions or {}
    if mode == "compact":
        r = build_compact(description, decisions, timestamp=timestamp, version_string=version_string)
        return {**r, "mode": "compact", "auto_fallback": False}
    if mode == "full":
        r = build_full(description, decisions, char_cap=FULL_HARD_CAP, timestamp=timestamp, version_string=version_string)
        return {**r, "mode": "full", "auto_fallback": False}
    # auto
    try:
        r = build_full(description, decisions, char_cap=AUTO_FULL_CAP, timestamp=timestamp, version_string=version_string)
        return {**r, "mode": "full", "auto_fallback": False}
    except BriefTooLargeError as e:
        compact = build_compact(description, decisions, timestamp=timestamp, version_string=version_string, fell_back_from_full=True)
        return {
            **compact,
            "mode": "compact",
            "auto_fallback": True,
            "auto_fallback_full_chars": e.char_count,
            "auto_fallback_full_cap": e.char_cap,
        }


def build_list(description: str) -> str:
    """Shape A — text output for `aigis build --list`."""
    prep = _prepare(description, {})
    lines: list[str] = []
    lines.append(f"Description: {prep['normalized']}")
    lines.append(f"Risk tier: {prep['cls']['risk_tier']}")
    lines.append("")
    lines.append(f"Confirmed traits ({len(prep['resolved']['confirmed_traits'])}):")
    lines.append(f"  {', '.join(prep['resolved']['confirmed_traits']) or '(none)'}")
    lines.append("")
    lines.append(f"Uncertain traits ({len(prep['resolved']['uncertain_traits'])}):")
    if not prep["low_conf_with_slugs"]:
        lines.append("  (none)")
    else:
        for m in prep["low_conf_with_slugs"]:
            lines.append(f"  [{m['slug']}] {', '.join(m['traits'])}  ← \"{m['phrase']}\"")
        lines.append("")
        lines.append("Pre-build flags (run non-interactively):")
        slugs = ",".join(m["slug"] for m in prep["low_conf_with_slugs"])
        lines.append(f'  aigis build "{prep["normalized"]}" --confirm {slugs}')
        lines.append(f'  aigis build "{prep["normalized"]}" --reject {slugs}')
    lines.append("")
    lines.append(f"Recommended areas ({len(prep['areas'])}):")
    for a in prep["areas"]:
        lines.append(f"  aigis get {a}")
    if prep["infra_ids"]:
        lines.append("")
        lines.append(f"Referenced infrastructure ({len(prep['infra_ids'])}):")
        for i in prep["infra_ids"]:
            lines.append(f"  aigis infra {i}")
    if prep["cls"]["templates"]:
        lines.append("")
        lines.append(f"Documentation templates ({len(prep['cls']['templates'])}):")
        for t in prep["cls"]["templates"]:
            lines.append(f"  aigis template {t}")
    return "\n".join(lines) + "\n"
