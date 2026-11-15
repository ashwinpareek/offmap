"""Turn the pipeline's results into the compact files the web app reads.

  python -m pipeline.export_web            # every topic that has baseline.json and peel.json

Nothing is computed here that the pipeline did not already measure: this only
reshapes, counts and renames.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from . import prompts
from .mine import effective_number
from .run import DATA
from .taxonomy import MECHANISMS

OUT = Path(__file__).resolve().parent.parent / "web" / "src" / "data"

MECHANISM_LABELS = {
    "chatbot_assistant": "Chatbot assistant",
    "ai_tutor_coach": "AI tutor or coach",
    "recommendation_matching": "Matching and recommendations",
    "marketplace_two_sided": "Two-sided marketplace",
    "scheduling_planning": "Scheduling and planning",
    "analytics_dashboard": "Analytics dashboard",
    "automation_workflow": "Workflow automation",
    "content_generation": "Content generation",
    "summarization_notes": "Summaries and notes",
    "search_knowledge_base": "Search and knowledge base",
    "community_social_network": "Community or social network",
    "gamification": "Gamification",
    "subscription_box_physical": "Subscription box",
    "hardware_device_iot": "Hardware device",
    "wearable_sensor": "Wearable sensor",
    "computer_vision_scan": "Camera scanning",
    "voice_interface": "Voice interface",
    "ar_vr_immersive": "AR or VR",
    "peer_to_peer_exchange": "Peer-to-peer exchange",
    "rental_sharing": "Rental and sharing",
    "on_demand_gig_service": "On-demand gig service",
    "delivery_logistics": "Delivery and logistics",
    "booking_reservation": "Booking and reservations",
    "payments_fintech_tool": "Payments tool",
    "budgeting_finance_tracker": "Budget tracker",
    "lending_credit": "Lending and credit",
    "insurance_risk": "Insurance",
    "crowdfunding_pooling": "Crowdfunding and pooling",
    "verification_trust_reputation": "Verification and reputation",
    "compliance_audit": "Compliance and audit",
    "monitoring_alerting": "Monitoring and alerts",
    "prediction_forecasting": "Forecasting",
    "optimization_routing": "Optimisation and routing",
    "simulation_digital_twin": "Simulation",
    "translation_localization": "Translation",
    "accessibility_adaptation": "Accessibility",
    "mentorship_expert_network": "Mentors and expert network",
    "hiring_talent_matching": "Hiring and talent",
    "skills_assessment_credential": "Skills tests and credentials",
    "micro_learning_course": "Short courses",
    "collaboration_workspace": "Shared workspace",
    "communication_async_video": "Async video and messaging",
    "developer_tool_api": "Developer tool or API",
    "no_code_builder": "No-code builder",
    "data_pipeline_labeling": "Data pipeline and labelling",
    "security_privacy_tool": "Security and privacy",
    "health_tracking": "Health tracking",
    "telehealth_remote_care": "Remote care",
    "mental_wellness": "Mental wellness",
    "nutrition_meal_planning": "Meal planning",
    "fitness_training": "Fitness training",
    "habit_tracking": "Habit tracking",
    "journaling_reflection": "Journaling",
    "carbon_tracking": "Carbon tracking",
    "recycling_circular_reuse": "Recycling and reuse",
    "energy_management": "Energy management",
    "precision_agriculture": "Precision farming",
    "supply_chain_traceability": "Supply chain tracing",
    "repair_maintenance": "Repair and maintenance",
    "group_buying_cooperative": "Group buying and co-ops",
    "events_meetups": "Events and meetups",
    "travel_itinerary": "Travel planning",
    "local_discovery": "Local discovery",
    "browser_extension_overlay": "Browser extension",
    "open_data_public_goods": "Open data and public goods",
    "physical_space_venue": "Physical space or venue",
    "human_concierge_service": "Human concierge",
    "game_entertainment": "Games and entertainment",
    "other": "Something else",
}

# the thresholds pipeline.peel ran with (its defaults)
BASE_BAN_SHARE, BAN_SHARE = 0.15, 0.10

REVENUE_PHRASES = {
    "subscription": "a subscription",
    "freemium": "a free tier with paid upgrades",
    "transaction_fee_commission": "a cut of each transaction",
    "one_time_purchase": "a one-time purchase",
    "advertising": "advertising",
    "b2b_license_saas": "licences sold to organisations",
    "usage_based": "pay-per-use pricing",
    "hardware_sale": "selling hardware",
    "service_fee": "a service fee",
    "grants_donations": "grants and donations",
    "data_licensing": "licensing data",
}

MODEL_LABELS = {
    "gemini:gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
    "groq:openai/gpt-oss-120b": "GPT-OSS 120B",
    "groq:qwen/qwen3.8-27b": "Qwen 3.8 27B",
}


def model_label(spec: str) -> str:
    return MODEL_LABELS.get(spec, spec.split(":", 1)[-1].split("/")[-1])


# bold openers that are labels, not product names
GENERIC = {"idea", "the idea", "startup idea", "startup", "concept", "the concept", "name",
           "pitch", "startup name", "business idea", "startup concept"}


def split_name(text: str) -> tuple[str, str]:
    """Models usually open with a product name ("**CampusSwap** is..." or "CampusSwap: a...").
    Read it; never invent one.

    The answer itself is left as the model wrote it, minus markdown asterisks and
    a leading "Idea:" style label.
    """
    text = re.sub(r"\s+", " ", text.strip())
    for _ in range(2):  # a label can sit in front of the real name
        m = re.match(r"^\*\*(.{2,300}?)\*\*", text) or re.match(r"^([A-Z][^:.!?]{1,31}?)(?=\s?[:\u2013\u2014]\s)", text)
        if not m:
            break
        name = re.split(r"\s?[:\u2013\u2014]\s", m.group(1).strip().rstrip(":"))[0].strip()
        if name.lower() in GENERIC:
            text = text[m.end():].lstrip(" :-\u2013\u2014*")
            continue
        if len(name.split()) <= 4 and len(name) <= 32:
            return name, re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        break
    return "", re.sub(r"\*\*(.+?)\*\*", r"\1", text)


def name_key(name: str) -> str:
    """CampusSwap, Campus-Swap and Campus Swap are one name."""
    return re.sub(r"[\s\-\u2010\u2011]", "", name).lower()


def pack_idea(idea: dict, models: list[str]) -> dict:
    name, text = split_name(idea["text"])
    out = {"m": models.index(idea["model"]), "t": text, "k": idea["tags"]["mechanism"]}
    if name:
        out["n"] = name
    if idea.get("hit"):
        out["hit"] = idea["hit"]
    return out


def layer_stats(ideas: list[dict], ban_share: float) -> dict:
    primary = Counter(i["tags"]["mechanism"][0] for i in ideas)
    used = Counter(m for i in ideas for m in i["tags"]["mechanism"])
    spelled = Counter(n for n in (split_name(i["text"])[0] for i in ideas) if n)
    names: Counter = Counter()
    for spelling, c in spelled.most_common():  # commonest spelling first, so it names the group
        key = next((k for k in names if name_key(k) == name_key(spelling)), spelling)
        names[key] += c
    n = len(ideas)
    top3 = sum(c for _, c in primary.most_common(3))
    out = {
        "n": n,
        "distinct": len(primary),
        "effective": round(effective_number(primary), 2) if n else 0,
        "top3": top3,
        "primary": primary.most_common(),
        "used": used.most_common(),
        "banShare": ban_share,
    }
    if names and names.most_common(1)[0][1] > 1:
        top, count = names.most_common(1)[0]
        out["topName"] = {"name": top, "count": count,
                          "variants": sum(1 for sp in spelled if name_key(sp) == name_key(top)) > 1}
    return out


def export_topic(folder: Path) -> dict | None:
    base_path, peel_path = folder / "baseline.json", folder / "peel.json"
    if not (base_path.exists() and peel_path.exists()):
        return None
    base = json.loads(base_path.read_text())
    peel = json.loads(peel_path.read_text())
    models = base["models"]
    surface_ideas = sorted(base["ideas"], key=lambda i: i["id"])
    surface = layer_stats(surface_ideas, BASE_BAN_SHARE)
    revenue = Counter(i["tags"]["revenue"] for i in surface_ideas).most_common(1)[0]
    form = Counter(i["tags"]["form"] for i in surface_ideas).most_common(1)[0]
    used = {m for i in surface_ideas for m in i["tags"]["mechanism"]}
    layers = [{
        "depth": 0,
        "ruledOut": [],
        "common": peel["layers"][0]["new_bans"],
        "asked": len(surface_ideas) + len(base.get("untagged", [])),
        "kept": len(surface_ideas), "dropped": 0, "untagged": len(base.get("untagged", [])),
        "stats": surface,
        "ideas": [pack_idea(i, models) for i in surface_ideas],
        "droppedIdeas": [],
    }]
    for layer in peel["layers"][1:]:
        layers.append({
            "depth": layer["layer"],
            "ruledOut": layer["banned_going_in"],
            "common": layer["new_bans"],
            "asked": layer["generated"],
            "kept": layer["verified"], "dropped": layer["leaked"], "untagged": layer["untagged"],
            "stats": layer_stats(layer["ideas"], BAN_SHARE),
            "ideas": [pack_idea(i, models) for i in layer["ideas"]],
            "droppedIdeas": [pack_idea(i, models) for i in layer.get("dropped", [])],
        })
    for layer in layers:
        st = layer["stats"]
        over = {t for t, c in st["used"] if st["n"] and c / st["n"] >= st["banShare"] and t != "other"}
        assert over - set(layer["ruledOut"]) == set(layer["common"]), (folder.name, layer["depth"])
    return {
        "slug": folder.name,
        "topic": base["topic"],
        "prompt": f"Give me one startup idea for {base['topic']}.",
        "models": [model_label(m) for m in models],
        "vocabulary": len([m for m in MECHANISMS if m != "other"]),
        "neverUsedAtSurface": len([m for m in MECHANISMS if m != "other" and m not in used]),
        "topRevenue": {"tag": REVENUE_PHRASES.get(revenue[0], ""), "count": revenue[1]},
        "topForm": {"tag": form[0].replace("_", " "), "count": form[1]},
        "layers": layers,
    }


def main() -> None:
    (OUT / "topics").mkdir(parents=True, exist_ok=True)
    index = []
    for folder in sorted(p for p in DATA.iterdir() if p.is_dir()):
        topic = export_topic(folder)
        if not topic:
            continue
        (OUT / "topics" / f"{folder.name}.json").write_text(json.dumps(topic, ensure_ascii=False, separators=(",", ":")))
        s = topic["layers"][0]["stats"]
        index.append({"slug": topic["slug"], "topic": topic["topic"], "n": s["n"], "top3": s["top3"]})
        print(folder.name, "surface", s["n"], "ideas, top three approaches cover", s["top3"])
    # the first topic measured stays first; the rest follow alphabetically
    index.sort(key=lambda t: (t["slug"] != "university-students", t["slug"]))
    (OUT / "index.json").write_text(json.dumps(index, indent=1))
    (OUT / "labels.json").write_text(json.dumps(MECHANISM_LABELS, indent=1))
    # the head-to-head against the published baseline, where it was run
    cmp_path = DATA / "university-students" / "compare.json"
    if cmp_path.exists():
        c = json.loads(cmp_path.read_text())
        rows = [{"id": k, "n": c["summary"][k]["n_ideas"],
                 "distinct": c["summary"][k]["distinct_primary_mechanisms"],
                 "overused": round(c["summary"][k]["share_using_overused_mechanism"] * c["summary"][k]["n_ideas"])}
                for k in ("default", "diverse", "avoid_list")]
        (OUT / "compare.json").write_text(json.dumps(
            {"topic": c["topic"], "model": model_label(c["generator"]), "rows": rows}, indent=1))
    # the live "place your idea" call uses the pipeline's own tagging prompt, word for word
    api = OUT.parent.parent / "api"
    api.mkdir(exist_ok=True)
    (api / "_tagging.js").write_text(
        "// Generated by pipeline/export_web.py. Do not edit by hand.\n"
        "export const MECHANISMS = " + json.dumps(MECHANISMS) + ";\n"
        "export const PROMPT = " + json.dumps(prompts.tag_prompt("{{IDEA}}")) + ";\n")
    missing = [m for m in MECHANISMS if m not in MECHANISM_LABELS]
    if missing:
        raise SystemExit(f"labels missing for: {missing}")


if __name__ == "__main__":
    main()
