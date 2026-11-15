from pipeline.prompts import (avoid_prompt, default_prompt, escape_prompt, parse_escape,
                              parse_tags, parse_vs, passes_gate, tag_prompt)
from pipeline.taxonomy import MECHANISMS


def test_parse_vs_extracts_each_text():
    reply = """<response><text>Idea one.</text><probability>0.05</probability></response>
    <response>
      <text>Idea two,
      on two lines.</text>
      <probability>0.03</probability>
    </response>
    <response><text>  </text><probability>0.01</probability></response>"""
    assert parse_vs(reply) == ["Idea one.", "Idea two,\n      on two lines."]
    assert parse_vs("no tags here") == []


def test_parse_tags_accepts_valid_and_fenced_json():
    good = '{"mechanism": ["gamification", "habit_tracking"], "customer": "students", "revenue": "freemium", "form": "mobile_app"}'
    tags, problems = parse_tags(good)
    assert problems == [] and tags["mechanism"] == ["gamification", "habit_tracking"]
    tags, problems = parse_tags("Here you go:\n```json\n" + good + "\n```")
    assert problems == [] and tags["customer"] == "students"


def test_parse_tags_normalises_string_and_duplicates_and_extra_mechanisms():
    tags, problems = parse_tags('{"mechanism": "gamification", "customer": "students", "revenue": "freemium", "form": "mobile_app"}')
    assert problems == [] and tags["mechanism"] == ["gamification"]
    tags, problems = parse_tags('{"mechanism": ["gamification", "gamification", "habit_tracking", "ai_tutor_coach"], "customer": "students", "revenue": "freemium", "form": "mobile_app"}')
    assert problems == [] and tags["mechanism"] == ["gamification", "habit_tracking"]


def test_parse_tags_rejects_unknown_tags_and_garbage():
    tags, problems = parse_tags('{"mechanism": ["blockchain"], "customer": "students", "revenue": "freemium", "form": "mobile_app"}')
    assert tags is None and problems
    tags, problems = parse_tags("not json at all")
    assert tags is None and problems
    tags, problems = parse_tags('{"mechanism": ["gamification"], "customer": "students"}')
    assert tags is None and problems


def test_parse_escape_and_gate():
    reply = '{"idea": "A tool library run from a van.", "customer": "apartment renters in dense cities", "first_channel": "flyers in three building lobbies"}'
    parsed = parse_escape(reply)
    assert parsed["idea"].startswith("A tool library")
    assert passes_gate(parsed)
    assert not passes_gate({"idea": "x", "customer": "people", "first_channel": "online"})
    assert parse_escape('{"customer": "x"}') is None
    assert parse_escape("nope") is None


def test_prompts_contain_the_constraints():
    assert "remote teams" in default_prompt("remote teams")
    p = avoid_prompt("remote teams", ["chatbot_assistant", "ai_tutor_coach"])
    assert "chatbot assistant" in p and "ai tutor coach" in p
    e = escape_prompt("remote teams", ["chatbot_assistant"], [("form", "mobile_app")],
                      ("rental_sharing", "elderly"))
    assert "rental sharing" in e and "elderly" in e and "chatbot assistant" in e and "mobile app" in e
    t = tag_prompt("An app.")
    assert all(m in t for m in MECHANISMS)
