"""Tests for the deterministic miner. The ideas here are hand-made fixtures used only
to check the arithmetic; they are not model output and never appear in results."""
import math

import pytest

from pipeline.mine import effective_number, frequency_tables, mine, summarize_set, violations
from pipeline.taxonomy import FIELDS, validate_tags
from collections import Counter


def idea(mech, cust, rev="subscription", form="mobile_app"):
    return {"tags": {"mechanism": mech if isinstance(mech, list) else [mech],
                     "customer": cust, "revenue": rev, "form": form}}


def fixture():
    ideas = []
    ideas += [idea("ai_tutor_coach", "students") for _ in range(8)]          # 40%
    ideas += [idea("chatbot_assistant", "students") for _ in range(4)]       # 20%
    ideas += [idea("marketplace_two_sided", "freelancers_creators", "transaction_fee_commission",
                   "web_platform") for _ in range(3)]
    ideas += [idea("gamification", "students", "freemium") for _ in range(2)]
    ideas += [idea("gamification", "elderly", "freemium")]
    ideas += [idea("rental_sharing", "elderly", "transaction_fee_commission", "web_platform")
              for _ in range(2)]
    return ideas  # 20 ideas


def test_effective_number_edges():
    assert effective_number(Counter()) == 0.0
    assert effective_number(Counter({"a": 10})) == pytest.approx(1.0)
    assert effective_number(Counter({"a": 5, "b": 5})) == pytest.approx(2.0)
    assert effective_number(Counter({"a": 1, "b": 1, "c": 1, "d": 1})) == pytest.approx(4.0)


def test_frequency_counts():
    f = frequency_tables(fixture())
    assert f["n"] == 20
    assert f["mechanism"]["ai_tutor_coach"] == 8
    assert f["customer"]["students"] == 14
    assert f["pair"][("gamification", "elderly")] == 1
    assert sum(f["primary_mechanism"].values()) == 20


def test_two_mechanism_tags_count_once_each_and_no_double_count():
    ideas = [idea(["gamification", "habit_tracking"], "students"),
             idea(["gamification", "gamification"], "students")]
    f = frequency_tables(ideas)
    assert f["mechanism"]["gamification"] == 2
    assert f["mechanism"]["habit_tracking"] == 1
    assert f["primary_mechanism"]["gamification"] == 2


def test_bans_use_threshold_inclusively():
    out = mine(fixture(), ban_share=0.15, min_support=3)
    tags = [b["tag"] for b in out["bans"]]
    # 8/20=0.40, 4/20=0.20, 3/20=0.15 (inclusive), 3/20 gamification
    assert tags[:2] == ["ai_tutor_coach", "chatbot_assistant"]
    assert set(tags) == {"ai_tutor_coach", "chatbot_assistant", "marketplace_two_sided", "gamification"}
    out2 = mine(fixture(), ban_share=0.16, min_support=3)
    assert [b["tag"] for b in out2["bans"]] == ["ai_tutor_coach", "chatbot_assistant"]


def test_holes_are_absent_pairs_ranked_by_expected_count():
    out = mine(fixture(), ban_share=0.16, min_support=3)
    supported = [h for h in out["holes"] if h["kind"] == "supported_gap"]
    holes = {(h["mechanism"], h["customer"]): h for h in supported}
    # marketplace (3) x students (14): never together -> expected 3*14/20 = 2.1
    assert ("marketplace_two_sided", "students") in holes
    assert holes[("marketplace_two_sided", "students")]["expected_if_independent"] == pytest.approx(2.1)
    # gamification x students does occur, so it is not a hole
    assert ("gamification", "students") not in holes
    # banned mechanisms never appear in holes
    assert all(h["mechanism"] not in {"ai_tutor_coach", "chatbot_assistant"} for h in out["holes"])
    # sorted by expected count, descending
    exp = [h["expected_if_independent"] for h in supported]
    assert exp == sorted(exp, reverse=True)
    # both sides meet min_support
    assert all(h["mechanism_count"] >= 3 and h["customer_count"] >= 3 for h in supported)
    # supported gaps come before neglected mechanisms
    kinds = [h["kind"] for h in out["holes"]]
    assert kinds == sorted(kinds, key=lambda k: k != "supported_gap")


def test_neglected_mechanisms_fill_in_when_customer_is_fixed():
    ideas = [idea("marketplace_two_sided", "students") for _ in range(12)] + \
            [idea("rental_sharing", "students") for _ in range(6)] + \
            [idea("gamification", "students"), idea("gamification", "students")]
    out = mine(ideas, ban_share=0.5, min_support=3)
    assert not [h for h in out["holes"] if h["kind"] == "supported_gap"]
    neglected = [h for h in out["holes"] if h["kind"] == "neglected_mechanism"]
    assert neglected and all(h["customer"] == "students" for h in neglected)
    assert all(h["mechanism_count"] < 3 for h in neglected)
    assert neglected[0]["mechanism"] == "gamification"          # seen-but-rare comes first
    assert all(h["mechanism"] not in {"marketplace_two_sided", "other"} for h in neglected)
    assert out["unused_mechanisms"] == 68 - 3
    # deterministic: same input, same order
    assert [h["mechanism"] for h in mine(ideas, ban_share=0.5)["holes"]] == [h["mechanism"] for h in out["holes"]]


def test_structural_flag():
    out = mine(fixture(), structural_share=0.40)
    flagged = {(s["field"], s["tag"]) for s in out["structural"]}
    assert ("revenue", "subscription") in flagged      # 12/20
    assert ("form", "mobile_app") in flagged           # 15/20
    assert ("revenue", "freemium") not in flagged


def test_catch_all_never_banned_and_reported():
    ideas = [idea("other", "other", "unspecified", "unspecified") for _ in range(9)] + [idea("gamification", "students")]
    out = mine(ideas, ban_share=0.15, min_support=1)
    assert all(b["tag"] != "other" for b in out["bans"])
    assert out["stats"]["catch_all_share"] == pytest.approx(0.9)
    assert all(s["tag"] != "unspecified" for s in out["structural"])


def test_stats():
    s = mine(fixture())["stats"]
    assert s["n_ideas"] == 20
    assert s["distinct_primary_mechanisms"] == 5
    assert s["top3_primary_mechanism_share"] == pytest.approx(15 / 20)
    p = [8, 4, 3, 3, 2]
    expected = math.exp(-sum((c / 20) * math.log(c / 20) for c in p))
    assert s["effective_number_of_mechanisms"] == pytest.approx(expected, abs=0.01)


def test_empty_input_raises():
    with pytest.raises(ValueError):
        mine([])


def test_violations():
    t = idea(["rental_sharing"], "students")["tags"]
    assert violations(t, bans=["ai_tutor_coach"]) == []
    assert violations(t, bans=["rental_sharing"]) == ["uses banned mechanism rental_sharing"]
    assert violations(t, bans=[], structural=[("form", "mobile_app")]) == ["uses banned form mobile_app"]
    assert violations(t, bans=[], require=("rental_sharing", "students")) == []
    assert len(violations(t, bans=[], require=("gamification", "elderly"))) == 2


def test_summarize_set():
    s = summarize_set(fixture(), bans=["ai_tutor_coach", "chatbot_assistant"])
    assert s["share_using_overused_mechanism"] == pytest.approx(12 / 20)
    assert s["distinct_mechanism_customer_pairs"] == 6


def test_taxonomy_is_clean():
    for name, values in FIELDS.items():
        assert len(values) == len(set(values)), f"duplicate tag in {name}"
        assert all(v == v.lower() and " " not in v for v in values)
    good = {"mechanism": ["gamification"], "customer": "students", "revenue": "freemium", "form": "mobile_app"}
    assert validate_tags(good) == []
    assert validate_tags({**good, "mechanism": []})
    assert validate_tags({**good, "mechanism": ["gamification", "gamification"]})
    assert validate_tags({**good, "mechanism": ["made_up"]})
    assert validate_tags({**good, "customer": "aliens"})
