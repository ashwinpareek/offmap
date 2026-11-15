"""The three-day test, as commands.

  python -m pipeline.run models                      list models each key can use
  python -m pipeline.run baseline --topic "..."      sample default ideas, tag, mine
  python -m pipeline.run compare  --topic "..."      Default vs Diverse vs Avoid-list vs Escape

Models are given as provider:model, e.g. gemini:<name> groq:<name>.
Results go to data/<slug>/ as JSON, with every raw reply kept in data/cache.jsonl.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
from pathlib import Path
from typing import Callable

from . import prompts
from .mine import mine, summarize_set, violations
from .providers import ProviderError, generate, list_models

DATA = Path(__file__).resolve().parent.parent / "data"
Gen = Callable[..., str]


def slug(topic: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:60]


def split_model(spec: str) -> tuple[str, str]:
    provider, _, model = spec.partition(":")
    if not model:
        raise SystemExit(f"model must be provider:model, got {spec!r}")
    return provider, model


def collect_baseline(topic: str, models: list[str], n_per_model: int, gen: Gen,
                     pause: float = 0.0) -> list[dict]:
    """One idea per call at the provider's default settings: what a normal user sees."""
    ideas = []
    for spec in models:
        provider, model = split_model(spec)
        for i in range(n_per_model):
            text = gen(provider, model, prompts.default_prompt(topic), sample=i, pause=pause)
            ideas.append({"id": f"{spec}#{i}", "model": spec, "text": text.strip()})
    return ideas


def tag_ideas(ideas: list[dict], tagger: str, gen: Gen, pause: float = 0.0) -> tuple[list[dict], list[dict]]:
    """Tag each idea with the fixed vocabulary. One retry, then the idea is set aside."""
    provider, model = split_model(tagger)
    tagged, failed = [], []
    for idea in ideas:
        tags, problems = None, []
        for attempt in range(2):
            reply = gen(provider, model, prompts.tag_prompt(idea["text"]), temperature=0.0,
                        sample=attempt, json_mode=True, pause=pause)
            tags, problems = prompts.parse_tags(reply)
            if tags:
                break
        if tags:
            tagged.append({**idea, "tags": tags})
        else:
            failed.append({**idea, "problems": problems})
    return tagged, failed


def run_escape(topic: str, mined: dict, generator: str, tagger: str, n: int, gen: Gen,
               pause: float = 0.0) -> tuple[list[dict], list[dict]]:
    """Generate under mined constraints, then verify each result by re-tagging it."""
    provider, model = split_model(generator)
    bans = [b["tag"] for b in mined["bans"]]
    structural = [(s["field"], s["tag"]) for s in mined["structural"]]
    holes = mined["holes"]
    if not holes:
        raise SystemExit("the miner found no gaps to target; nothing for Escape to do")
    accepted, rejected = [], []
    attempt = 0
    while len(accepted) < n and attempt < 3 * n:
        hole = holes[attempt % len(holes)]
        require = (hole["mechanism"], hole["customer"])
        reply = gen(provider, model, prompts.escape_prompt(topic, bans, structural, require),
                    sample=attempt, json_mode=True, pause=pause)
        attempt += 1
        parsed = prompts.parse_escape(reply)
        record = {"id": f"escape#{attempt}", "model": generator, "require": list(require)}
        if not parsed:
            rejected.append({**record, "reason": "unparseable reply"})
            continue
        record.update(text=parsed["idea"], customer=parsed["customer"],
                      first_channel=parsed["first_channel"])
        if not prompts.passes_gate(parsed):
            rejected.append({**record, "reason": "failed usefulness gate"})
            continue
        tagged, failed = tag_ideas([record], tagger, gen, pause)
        if failed:
            rejected.append({**record, "reason": "could not be tagged"})
            continue
        broken = violations(tagged[0]["tags"], bans, structural, require)
        if broken:
            rejected.append({**tagged[0], "reason": "; ".join(broken)})
            continue
        accepted.append(tagged[0])
    return accepted, rejected


def run_compare(topic: str, mined: dict, generator: str, tagger: str, n: int, gen: Gen,
                pause: float = 0.0) -> dict:
    """Four methods, same model, same number of ideas each."""
    provider, model = split_model(generator)
    bans = [b["tag"] for b in mined["bans"]]

    default = [{"id": f"default#{i}", "model": generator,
                "text": gen(provider, model, prompts.default_prompt(topic),
                            sample=10_000 + i, pause=pause).strip()} for i in range(n)]

    diverse = []
    for call in range(math.ceil(n / prompts.VS_K) + 2):
        if len(diverse) >= n:
            break
        reply = gen(provider, model, prompts.default_prompt(topic), system=prompts.VS_SYSTEM,
                    sample=call, pause=pause)
        for text in prompts.parse_vs(reply):
            if len(diverse) < n:
                diverse.append({"id": f"diverse#{len(diverse)}", "model": generator, "text": text})

    avoid = [{"id": f"avoid#{i}", "model": generator,
              "text": gen(provider, model, prompts.avoid_prompt(topic, bans),
                          sample=i, pause=pause).strip()} for i in range(n)]

    escape, escape_rejected = run_escape(topic, mined, generator, tagger, n, gen, pause)

    sets, failures = {"escape": escape}, {}
    for name, ideas in (("default", default), ("diverse", diverse), ("avoid_list", avoid)):
        sets[name], failures[name] = tag_ideas(ideas, tagger, gen, pause)
    summary = {name: summarize_set(ideas, bans) for name, ideas in sets.items() if ideas}
    return {"topic": topic, "generator": generator, "tagger": tagger, "n_requested": n,
            "bans": bans, "summary": summary, "sets": sets,
            "escape_rejected": escape_rejected, "tag_failures": failures}


def write_rating_sheet(result: dict, out_dir: Path, seed: int = 7) -> None:
    """Shuffled sheet for blind human rating; the answer key is a separate file."""
    rows = [(name, idea) for name, ideas in result["sets"].items() for idea in ideas]
    random.Random(seed).shuffle(rows)
    with (out_dir / "rating_sheet.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["item", "idea", "surprise_1_to_5", "plausibility_1_to_5"])
        for k, (_, idea) in enumerate(rows, 1):
            w.writerow([k, idea["text"], "", ""])
    with (out_dir / "rating_key.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["item", "method", "id"])
        for k, (name, idea) in enumerate(rows, 1):
            w.writerow([k, name, idea["id"]])


def _save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("models")
    b = sub.add_parser("baseline")
    b.add_argument("--topic", required=True)
    b.add_argument("--models", nargs="+", required=True)
    b.add_argument("--n", type=int, default=50, help="ideas per model")
    b.add_argument("--tagger", required=True)
    b.add_argument("--pause", type=float, default=0.0)
    c = sub.add_parser("compare")
    c.add_argument("--topic", required=True)
    c.add_argument("--generator", required=True)
    c.add_argument("--tagger", required=True)
    c.add_argument("--n", type=int, default=10)
    c.add_argument("--pause", type=float, default=0.0)
    args = ap.parse_args()

    if args.cmd == "models":
        for provider in ("gemini", "groq", "openrouter"):
            try:
                names = list_models(provider)
                print(f"{provider}: {len(names)} models\n  " + "\n  ".join(names))
            except (ProviderError, Exception) as e:  # noqa: BLE001 - report and move on
                print(f"{provider}: unavailable ({e})")
        return

    out = DATA / slug(args.topic)
    if args.cmd == "baseline":
        ideas = collect_baseline(args.topic, args.models, args.n, generate, args.pause)
        tagged, failed = tag_ideas(ideas, args.tagger, generate, args.pause)
        mined = mine(tagged)
        _save(out / "baseline.json", {"topic": args.topic, "models": args.models,
                                      "tagger": args.tagger, "ideas": tagged, "untagged": failed})
        _save(out / "mined.json", mined)
        print(json.dumps(mined["stats"], indent=2))
        print("bans:", [(b["tag"], b["share"]) for b in mined["bans"]])
        print("structural:", [(s["field"], s["tag"], s["share"]) for s in mined["structural"]])
        print("top gaps:", [(h["mechanism"], h["customer"], h["expected_if_independent"])
                            for h in mined["holes"][:6]])
        print(f"untagged: {len(failed)} of {len(ideas)}")
    else:
        mined = json.loads((out / "mined.json").read_text())
        result = run_compare(args.topic, mined, args.generator, args.tagger, args.n, generate, args.pause)
        _save(out / "compare.json", result)
        write_rating_sheet(result, out)
        print(json.dumps(result["summary"], indent=2))
        print(f"escape rejected: {len(result['escape_rejected'])}")


if __name__ == "__main__":
    main()
