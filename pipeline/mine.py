"""Deterministic constraint mining. No LLM is called anywhere in this file.

Input: a list of tagged baseline ideas (see taxonomy.validate_tags for shape).
Output: what the models overuse, and which sensible combinations never appear.

Three kinds of constraint come out:
  bans        mechanisms that appear in >= ban_share of baseline ideas
  structural  a revenue model or form factor that dominates the baseline
  holes       two kinds of unexplored territory:
              supported gaps: (mechanism, customer) pairs where both sides are
              common on their own but never appear together, ranked by how many
              times the pair would be expected if the two were independent;
              neglected mechanisms: vocabulary mechanisms the baseline barely
              or never used, which still have to pass the stress test.
"""
from __future__ import annotations

import math
import random
from collections import Counter
from itertools import product

from .taxonomy import CATCH_ALL, MECHANISMS


def _share(count: int, n: int) -> float:
    return count / n if n else 0.0


def effective_number(counts: Counter) -> float:
    """Hill number of order 1: exp(Shannon entropy).

    Reads as "the baseline behaves as if it had this many equally common
    mechanisms". 1.0 means every idea used the same one.
    """
    total = sum(counts.values())
    if total == 0:
        return 0.0
    h = -sum((c / total) * math.log(c / total) for c in counts.values() if c)
    return math.exp(h)


def frequency_tables(ideas: list[dict]) -> dict:
    """Count tags. An idea with two mechanism tags counts once for each."""
    n = len(ideas)
    mech, primary, cust, rev, form = Counter(), Counter(), Counter(), Counter(), Counter()
    pair = Counter()
    for idea in ideas:
        t = idea["tags"]
        mechs = list(dict.fromkeys(t["mechanism"]))
        primary[mechs[0]] += 1
        for m in mechs:
            mech[m] += 1
            pair[(m, t["customer"])] += 1
        cust[t["customer"]] += 1
        rev[t["revenue"]] += 1
        form[t["form"]] += 1
    return {"n": n, "mechanism": mech, "primary_mechanism": primary,
            "customer": cust, "revenue": rev, "form": form, "pair": pair}


def mine(ideas: list[dict], ban_share: float = 0.15, structural_share: float = 0.40,
         min_support: int = 3, max_holes: int = 40, seed: int = 7) -> dict:
    """Mine constraints from tagged baseline ideas.

    ban_share         a mechanism present in at least this share of ideas is banned
    structural_share  a revenue/form value at or above this share is flagged
    min_support       both sides of a hole must appear in at least this many ideas,
                      which is the evidence that each side is sensible for this prompt
    """
    if not ideas:
        raise ValueError("no ideas to mine")
    f = frequency_tables(ideas)
    n = f["n"]

    ranked_mech = f["mechanism"].most_common()
    bans = [
        {"tag": m, "count": c, "share": round(_share(c, n), 4)}
        for m, c in ranked_mech
        if m not in CATCH_ALL and _share(c, n) >= ban_share
    ]
    banned = {b["tag"] for b in bans}

    structural = []
    for field in ("revenue", "form"):
        # only the single most common value per field, so the constraint stays satisfiable
        for tag, c in f[field].most_common(1):
            if tag not in CATCH_ALL and _share(c, n) >= structural_share:
                structural.append({"field": field, "tag": tag, "count": c,
                                   "share": round(_share(c, n), 4)})

    cust_ok = [c for c, k in f["customer"].items()
               if k >= min_support and c not in CATCH_ALL]
    holes = []
    # 1. Supported gaps: mechanism and customer are each common, never seen together.
    mech_ok = [m for m, c in f["mechanism"].items()
               if c >= min_support and m not in CATCH_ALL and m not in banned]
    for m, c in product(mech_ok, cust_ok):
        if f["pair"][(m, c)] == 0:
            expected = f["mechanism"][m] * f["customer"][c] / n
            holes.append({"mechanism": m, "customer": c, "kind": "supported_gap",
                          "mechanism_count": f["mechanism"][m],
                          "customer_count": f["customer"][c],
                          "expected_if_independent": round(expected, 3),
                          "observed": 0})
    holes.sort(key=lambda h: (-h["expected_if_independent"], h["mechanism"], h["customer"]))
    # 2. Neglected mechanisms: in the vocabulary, but used by fewer than min_support
    #    baseline ideas (often zero). When a prompt fixes the customer, every idea shares
    #    it and there are no supported gaps, so this is where the unexplored space is.
    #    The baseline gives no evidence these are sensible here, so they are ordered by a
    #    fixed-seed shuffle and must earn their place in the stress test.
    neglected = [m for m in MECHANISMS
                 if m not in CATCH_ALL and m not in banned and f["mechanism"][m] < min_support]
    random.Random(seed).shuffle(neglected)
    neglected.sort(key=lambda m: -f["mechanism"][m])  # stable: seen-once before never-seen
    top_customers = sorted(cust_ok, key=lambda c: (-f["customer"][c], c))[:2]
    for m in neglected:
        for c in top_customers:
            if f["pair"][(m, c)] == 0 or f["mechanism"][m] < min_support:
                holes.append({"mechanism": m, "customer": c, "kind": "neglected_mechanism",
                              "mechanism_count": f["mechanism"][m],
                              "customer_count": f["customer"][c],
                              "expected_if_independent": round(f["mechanism"][m] * f["customer"][c] / n, 3),
                              "observed": f["pair"][(m, c)]})

    top3 = sum(c for _, c in f["primary_mechanism"].most_common(3))
    catch_all = sum(c for m, c in f["primary_mechanism"].items() if m in CATCH_ALL)
    stats = {
        "n_ideas": n,
        "distinct_primary_mechanisms": len(f["primary_mechanism"]),
        "effective_number_of_mechanisms": round(effective_number(f["primary_mechanism"]), 2),
        "top3_primary_mechanism_share": round(_share(top3, n), 4),
        "catch_all_share": round(_share(catch_all, n), 4),
    }
    return {
        "stats": stats,
        "mechanism_frequency": [{"tag": m, "count": c, "share": round(_share(c, n), 4)}
                                for m, c in ranked_mech],
        "customer_frequency": [{"tag": t, "count": c, "share": round(_share(c, n), 4)}
                               for t, c in f["customer"].most_common()],
        "revenue_frequency": [{"tag": t, "count": c, "share": round(_share(c, n), 4)}
                              for t, c in f["revenue"].most_common()],
        "form_frequency": [{"tag": t, "count": c, "share": round(_share(c, n), 4)}
                           for t, c in f["form"].most_common()],
        "bans": bans,
        "structural": structural,
        "holes": holes[:max_holes],
        "unused_mechanisms": sum(1 for m in MECHANISMS if m not in CATCH_ALL and f["mechanism"][m] == 0),
        "params": {"ban_share": ban_share, "structural_share": structural_share,
                   "min_support": min_support},
    }


def violations(tags: dict, bans: list[str], structural: list[tuple[str, str]] = (),
               require: tuple[str, str] | None = None) -> list[str]:
    """Check one generated idea's tags against constraints. Empty list = obeys all.

    This is how Escape output is verified: the generator is asked to obey the
    constraints, then the result is re-tagged and checked here with exact matches.
    """
    out = []
    for m in tags["mechanism"]:
        if m in bans:
            out.append(f"uses banned mechanism {m}")
    for field, tag in structural:
        if tags.get(field) == tag:
            out.append(f"uses banned {field} {tag}")
    if require is not None:
        m, c = require
        if m not in tags["mechanism"]:
            out.append(f"missing required mechanism {m}")
        if tags["customer"] != c:
            out.append(f"missing required customer {c}")
    return out


def summarize_set(ideas: list[dict], bans: list[str]) -> dict:
    """Diversity summary used to compare Default vs Diverse vs Escape on equal terms."""
    f = frequency_tables(ideas)
    n = f["n"]
    in_banned = sum(1 for i in ideas if any(m in bans for m in i["tags"]["mechanism"]))
    return {
        "n_ideas": n,
        "distinct_primary_mechanisms": len(f["primary_mechanism"]),
        "effective_number_of_mechanisms": round(effective_number(f["primary_mechanism"]), 2),
        "distinct_mechanism_customer_pairs": len(
            {(i["tags"]["mechanism"][0], i["tags"]["customer"]) for i in ideas}),
        "share_using_overused_mechanism": round(_share(in_banned, n), 4),
    }
