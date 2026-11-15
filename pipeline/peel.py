"""Peeling: go one layer further off the map each round.

Layer 0 is what the models give everyone. Each next layer is generated with every
mechanism that was common in ANY earlier layer banned, then tagged, verified and
mined again. The model picks its own mechanism each time; nothing is handed to it.

  python -m pipeline.peel --topic "..." --models provider:model ... --tagger provider:model
"""
from __future__ import annotations

import argparse
import json

from . import prompts
from .mine import mine, summarize_set
from .providers import generate
from .run import DATA, Gen, _save, slug, split_model, tag_ideas


def peel(topic: str, baseline: list[dict], models: list[str], tagger: str, gen: Gen,
         layers: int = 2, n_per_model: int = 10, ban_share: float = 0.10,
         base_ban_share: float = 0.15, pause: float = 0.0) -> dict:
    mined = mine(baseline, ban_share=base_ban_share)
    banned: list[str] = [b["tag"] for b in mined["bans"]]
    out = {"topic": topic, "models": models, "tagger": tagger,
           "layers": [{"layer": 0, "new_bans": list(banned), "ideas": baseline,
                       "summary": summarize_set(baseline, banned)}]}
    for depth in range(1, layers + 1):
        raw = []
        for spec in models:
            provider, model = split_model(spec)
            for i in range(n_per_model):
                text = gen(provider, model, prompts.avoid_prompt(topic, banned),
                           sample=i, pause=pause).strip()
                raw.append({"id": f"L{depth}:{spec}#{i}", "model": spec, "text": text})
        tagged, failed = tag_ideas(raw, tagger, gen, pause)
        # verified = no banned mechanism survives re-tagging
        kept = [i for i in tagged if not set(i["tags"]["mechanism"]) & set(banned)]
        leaked = [i for i in tagged if set(i["tags"]["mechanism"]) & set(banned)]
        layer_mined = mine(kept, ban_share=ban_share) if kept else {"bans": []}
        new_bans = [b["tag"] for b in layer_mined["bans"] if b["tag"] not in banned]
        out["layers"].append({
            "layer": depth, "banned_going_in": list(banned), "new_bans": new_bans,
            "generated": len(raw), "verified": len(kept), "leaked": len(leaked),
            "untagged": len(failed), "ideas": kept,
            "summary": summarize_set(kept, banned) if kept else None,
        })
        banned = banned + new_bans
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--topic", required=True)
    ap.add_argument("--models", nargs="+", required=True)
    ap.add_argument("--tagger", required=True)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--pause", type=float, default=0.0)
    args = ap.parse_args()
    out_dir = DATA / slug(args.topic)
    baseline = json.loads((out_dir / "baseline.json").read_text())["ideas"]
    result = peel(args.topic, baseline, args.models, args.tagger, generate,
                  args.layers, args.n, pause=args.pause)
    _save(out_dir / "peel.json", result)
    for layer in result["layers"]:
        print(layer["layer"], "new bans:", layer["new_bans"],
              "| verified:", layer.get("verified", len(layer["ideas"])),
              "leaked:", layer.get("leaked", "-"), "|", layer["summary"])


if __name__ == "__main__":
    main()
