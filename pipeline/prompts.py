"""Every prompt the pipeline sends, in one place, plus the parsers for the replies."""
from __future__ import annotations

import json
import re

from .taxonomy import FIELDS, validate_tags


def label(tag: str) -> str:
    return tag.replace("_", " ")


# --- 1. Default: what an ordinary user gets -------------------------------------------------

def default_prompt(topic: str) -> str:
    return f"Give me one startup idea for {topic}. Describe it in two or three sentences."


# --- 2. Diverse: Verbalized Sampling (Zhang et al.), template from the authors' README -------

VS_K = 5
VS_SYSTEM = (
    "You are a helpful assistant. For each query, please generate a set of five possible "
    "responses, each within a separate <response> tag. Each <response> must include a <text> "
    "and a numeric <probability>. Please sample at random from the tails of the distribution, "
    "such that the probability of each response is less than 0.10."
)

_VS_RE = re.compile(r"<response>.*?<text>(.*?)</text>.*?</response>", re.S | re.I)


def parse_vs(reply: str) -> list[str]:
    return [t.strip() for t in _VS_RE.findall(reply) if t.strip()]


# --- 3. Avoid-list: the cheap trick Escape has to beat ---------------------------------------

def avoid_prompt(topic: str, bans: list[str]) -> str:
    listed = "; ".join(label(b) for b in bans)
    return (f"Give me one startup idea for {topic}. Describe it in two or three sentences. "
            f"Do not use any of these overused approaches: {listed}.")


# --- 4. Escape: mined bans + one required gap ------------------------------------------------

def escape_prompt(topic: str, bans: list[str], structural: list[tuple[str, str]],
                  require: tuple[str, str]) -> str:
    mech, cust = require
    lines = [
        f"Propose one startup idea for {topic}.",
        "Hard rules:",
        f"- The core mechanism must be: {label(mech)}.",
        f"- The paying customer or main user must be: {label(cust)}.",
    ]
    if bans:
        lines.append("- It must not rely on any of: " + "; ".join(label(b) for b in bans) + ".")
    for field, tag in structural:
        lines.append(f"- Its {field} must not be: {label(tag)}.")
    lines += [
        "- It must be something a small team could realistically start.",
        'Reply with JSON only: {"idea": "two or three sentences", '
        '"customer": "who exactly pays or uses it", '
        '"first_channel": "the first concrete way to reach those customers"}',
    ]
    return "\n".join(lines)


def parse_escape(reply: str) -> dict | None:
    obj = _json(reply)
    if not isinstance(obj, dict):
        return None
    idea = str(obj.get("idea", "")).strip()
    if not idea:
        return None
    return {"idea": idea, "customer": str(obj.get("customer", "")).strip(),
            "first_channel": str(obj.get("first_channel", "")).strip()}


def passes_gate(parsed: dict) -> bool:
    """Usefulness gate: a named customer and a concrete first channel, both non-trivial."""
    return len(parsed.get("customer", "")) >= 8 and len(parsed.get("first_channel", "")) >= 12


# --- 5. Tagging ------------------------------------------------------------------------------

def tag_prompt(idea_text: str) -> str:
    vocab = "\n".join(f"{name}: {', '.join(values)}" for name, values in FIELDS.items())
    return (
        "Classify this startup idea using ONLY the tags listed. Judge what the idea does, "
        "not the words it uses.\n\n"
        f"{vocab}\n\n"
        "Rules: mechanism is a list of one or two tags, the most central first. customer, "
        "revenue and form are one tag each. Use other/unspecified only when nothing fits or "
        "the idea does not say.\n\n"
        f"Idea: {idea_text}\n\n"
        'Reply with JSON only: {"mechanism": ["..."], "customer": "...", "revenue": "...", "form": "..."}'
    )


def parse_tags(reply: str) -> tuple[dict | None, list[str]]:
    obj = _json(reply)
    if not isinstance(obj, dict):
        return None, ["reply was not a JSON object"]
    if isinstance(obj.get("mechanism"), str):
        obj["mechanism"] = [obj["mechanism"]]
    if isinstance(obj.get("mechanism"), list):
        obj["mechanism"] = list(dict.fromkeys(obj["mechanism"]))[:2]
    tags = {k: obj.get(k) for k in ("mechanism", "customer", "revenue", "form")}
    problems = validate_tags(tags)
    return (tags if not problems else None), problems


def _json(reply: str):
    text = reply.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None
