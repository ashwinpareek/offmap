"""The export only reshapes results. These check it does not invent or mangle anything."""
from pipeline.export_web import MECHANISM_LABELS, layer_stats, name_key, split_name
from pipeline.taxonomy import MECHANISMS


def idea(text, mech):
    return {"text": text, "tags": {"mechanism": mech, "customer": "students",
                                   "revenue": "subscription", "form": "mobile_app"}}


def test_every_mechanism_has_a_label():
    assert set(MECHANISMS) <= set(MECHANISM_LABELS)


def test_name_from_bold_opener_keeps_the_sentence():
    name, text = split_name("**StudySwap** is a marketplace for notes.")
    assert name == "StudySwap"
    assert text == "StudySwap is a marketplace for notes."


def test_name_from_fully_bold_first_sentence():
    name, text = split_name("**CampusSwap: A peer-to-peer marketplace for books.** Students list items.")
    assert name == "CampusSwap"
    assert text.startswith("CampusSwap: A peer-to-peer marketplace")


def test_generic_label_is_not_a_name():
    name, text = split_name("**Idea:** A campus lab app that books equipment.")
    assert name == ""
    assert text == "A campus lab app that books equipment."


def test_no_name_is_invented():
    name, text = split_name("Launch a platform that connects students with tutors.")
    assert name == ""
    assert text == "Launch a platform that connects students with tutors."


def test_spelling_variants_are_one_name():
    assert name_key("Campus‑Swap") == name_key("CampusSwap") == name_key("Campus Swap")
    ideas = [idea("**CampusSwap** rents books.", ["rental_sharing"]),
             idea("**CampusSwap** rents gear.", ["rental_sharing"]),
             idea("**Campus-Swap** rents rooms.", ["rental_sharing"]),
             idea("**NoteNest** stores notes.", ["summarization_notes"])]
    stats = layer_stats(ideas, 0.15)
    assert stats["topName"] == {"name": "CampusSwap", "count": 3, "variants": True}


def test_counts_match_the_ideas():
    ideas = [idea("a", ["marketplace_two_sided", "rental_sharing"]),
             idea("b", ["marketplace_two_sided"]),
             idea("c", ["gamification"])]
    stats = layer_stats(ideas, 0.15)
    assert stats["n"] == 3 and stats["distinct"] == 2 and stats["top3"] == 3
    assert dict(stats["primary"]) == {"marketplace_two_sided": 2, "gamification": 1}
    assert dict(stats["used"]) == {"marketplace_two_sided": 2, "rental_sharing": 1, "gamification": 1}
    assert "topName" not in stats
