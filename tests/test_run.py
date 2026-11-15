"""End-to-end test of the orchestration with a scripted fake model. No network, no real output."""
import csv
import json

from pipeline import prompts
from pipeline.mine import mine
from pipeline.run import collect_baseline, run_compare, slug, tag_ideas, write_rating_sheet

TAGS = {
    "TUTOR": {"mechanism": ["ai_tutor_coach"], "customer": "students", "revenue": "subscription", "form": "mobile_app"},
    "MARKET": {"mechanism": ["marketplace_two_sided"], "customer": "freelancers_creators", "revenue": "transaction_fee_commission", "form": "web_platform"},
    "RENT": {"mechanism": ["rental_sharing"], "customer": "elderly", "revenue": "service_fee", "form": "physical_service"},
    "GOODESC": None,  # filled per call from the required pair
}


class FakeModel:
    def __init__(self):
        self.calls = 0

    def __call__(self, provider, model, prompt, system=None, temperature=None, sample=0,
                 json_mode=False, pause=0.0):
        self.calls += 1
        if prompt.startswith("Classify this startup idea"):
            idea = prompt.split("Idea: ", 1)[1].split("\n", 1)[0]
            if "BADJSON" in idea:
                return "sorry, no"
            if "ESC[" in idea:
                mech, cust = idea.split("ESC[", 1)[1].split("]", 1)[0].split("|")
                return json.dumps({"mechanism": [mech], "customer": cust, "revenue": "service_fee", "form": "physical_service"})
            for key, tags in TAGS.items():
                if key in idea:
                    return json.dumps(tags)
            return json.dumps(TAGS["TUTOR"])
        if prompt.startswith("Propose one startup idea"):
            mech = prompt.split("core mechanism must be: ", 1)[1].split(".", 1)[0].replace(" ", "_")
            cust = prompt.split("main user must be: ", 1)[1].split(".", 1)[0].replace(" ", "_")
            if sample == 0:   # first attempt disobeys: uses the banned tutor mechanism
                return json.dumps({"idea": "TUTOR again", "customer": "university students", "first_channel": "campus posters near libraries"})
            if sample == 1:   # second attempt fails the usefulness gate
                return json.dumps({"idea": f"ESC[{mech}|{cust}] thin", "customer": "people", "first_channel": "ads"})
            return json.dumps({"idea": f"ESC[{mech}|{cust}] idea {sample}", "customer": "a clearly named group", "first_channel": "a concrete first channel"})
        if system == prompts.VS_SYSTEM:
            return "".join(f"<response><text>MARKET v{sample}-{k}</text><probability>0.05</probability></response>" for k in range(5))
        if "Do not use any of these overused approaches" in prompt:
            return "RENT idea"
        # default prompt: mostly tutors, some marketplaces and rentals
        return ["TUTOR idea", "TUTOR idea", "TUTOR idea", "MARKET idea", "RENT idea"][sample % 5]


def test_slug():
    assert slug("Remote Teams & Async!") == "remote-teams-async"


def test_baseline_tag_mine_compare_roundtrip(tmp_path):
    fake = FakeModel()
    ideas = collect_baseline("students", ["fake:a", "fake:b"], 20, fake)
    assert len(ideas) == 40 and ideas[0]["id"] == "fake:a#0"
    ideas.append({"id": "x", "model": "fake:a", "text": "BADJSON idea"})
    tagged, failed = tag_ideas(ideas, "fake:tagger", fake)
    assert len(tagged) == 40 and len(failed) == 1 and failed[0]["problems"]

    # tutors are 60% of this fixture; a 50% threshold bans only them and leaves gaps to target
    mined = mine(tagged, ban_share=0.5, min_support=3)
    assert [b["tag"] for b in mined["bans"]] == ["ai_tutor_coach"]
    assert mined["holes"], "fixture must produce at least one gap"

    result = run_compare("students", mined, "fake:gen", "fake:tagger", 5, fake)
    sets = result["sets"]
    assert {k: len(v) for k, v in sets.items()} == {"escape": 5, "default": 5, "diverse": 5, "avoid_list": 5}
    # every accepted escape idea obeys its own required pair and avoids every ban
    for idea in sets["escape"]:
        assert idea["tags"]["mechanism"][0] == idea["require"][0]
        assert idea["tags"]["customer"] == idea["require"][1]
        assert not set(idea["tags"]["mechanism"]) & set(result["bans"])
    reasons = [r["reason"] for r in result["escape_rejected"]]
    assert any("banned mechanism" in r or "missing required" in r for r in reasons)
    assert "failed usefulness gate" in reasons
    assert result["summary"]["escape"]["share_using_overused_mechanism"] == 0.0
    assert result["summary"]["default"]["share_using_overused_mechanism"] > 0.0

    write_rating_sheet(result, tmp_path)
    sheet = list(csv.DictReader((tmp_path / "rating_sheet.csv").open()))
    key = list(csv.DictReader((tmp_path / "rating_key.csv").open()))
    assert len(sheet) == len(key) == 20
    assert "method" not in sheet[0] and {r["method"] for r in key} == set(sets)
    assert [r["item"] for r in sheet] == [r["item"] for r in key]
