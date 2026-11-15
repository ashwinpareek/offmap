"""Controlled vocabulary for comparing startup ideas at the idea level, not the wording level.

Every idea is reduced to tags from these fixed lists. Counting and constraint
mining then run on exact tag matches, so two ideas that use different words for
the same mechanism are counted as the same mechanism.

"other" / "unspecified" are escape hatches. The share of ideas that fall into
them is reported by the miner, so a weak vocabulary is visible instead of hidden.
"""

MECHANISMS = [
    "chatbot_assistant", "ai_tutor_coach", "recommendation_matching",
    "marketplace_two_sided", "scheduling_planning", "analytics_dashboard",
    "automation_workflow", "content_generation", "summarization_notes",
    "search_knowledge_base", "community_social_network", "gamification",
    "subscription_box_physical", "hardware_device_iot", "wearable_sensor",
    "computer_vision_scan", "voice_interface", "ar_vr_immersive",
    "peer_to_peer_exchange", "rental_sharing", "on_demand_gig_service",
    "delivery_logistics", "booking_reservation", "payments_fintech_tool",
    "budgeting_finance_tracker", "lending_credit", "insurance_risk",
    "crowdfunding_pooling", "verification_trust_reputation", "compliance_audit",
    "monitoring_alerting", "prediction_forecasting", "optimization_routing",
    "simulation_digital_twin", "translation_localization",
    "accessibility_adaptation", "mentorship_expert_network",
    "hiring_talent_matching", "skills_assessment_credential",
    "micro_learning_course", "collaboration_workspace",
    "communication_async_video", "developer_tool_api", "no_code_builder",
    "data_pipeline_labeling", "security_privacy_tool", "health_tracking",
    "telehealth_remote_care", "mental_wellness", "nutrition_meal_planning",
    "fitness_training", "habit_tracking", "journaling_reflection",
    "carbon_tracking", "recycling_circular_reuse", "energy_management",
    "precision_agriculture", "supply_chain_traceability", "repair_maintenance",
    "group_buying_cooperative", "events_meetups", "travel_itinerary",
    "local_discovery", "browser_extension_overlay", "open_data_public_goods",
    "physical_space_venue", "human_concierge_service", "game_entertainment",
    "other",
]

CUSTOMERS = [
    "students", "teachers_schools", "parents_families", "children", "elderly",
    "remote_workers", "freelancers_creators", "small_businesses", "enterprises",
    "startups_founders", "developers", "healthcare_providers", "patients",
    "farmers", "drivers_gig_workers", "job_seekers", "hr_recruiters",
    "consumers_general", "travelers", "renters_homeowners", "nonprofits",
    "governments_cities", "researchers", "retailers_ecommerce",
    "restaurants_food", "manufacturers", "pet_owners", "athletes_fitness",
    "people_with_disabilities", "other",
]

REVENUE = [
    "subscription", "freemium", "transaction_fee_commission",
    "one_time_purchase", "advertising", "b2b_license_saas", "usage_based",
    "hardware_sale", "service_fee", "grants_donations", "data_licensing",
    "unspecified",
]

FORM = [
    "mobile_app", "web_platform", "browser_extension", "hardware_product",
    "api_sdk", "messaging_bot", "physical_service", "desktop_software",
    "unspecified",
]

FIELDS = {
    "mechanism": MECHANISMS,
    "customer": CUSTOMERS,
    "revenue": REVENUE,
    "form": FORM,
}

CATCH_ALL = {"other", "unspecified"}


def validate_tags(tags: dict) -> list[str]:
    """Return a list of problems with a tag record; empty list means valid.

    Expected shape:
      {"mechanism": [1-2 tags], "customer": tag, "revenue": tag, "form": tag}
    """
    problems = []
    mech = tags.get("mechanism")
    if not isinstance(mech, list) or not (1 <= len(mech) <= 2):
        problems.append("mechanism must be a list of 1 or 2 tags")
    else:
        for m in mech:
            if m not in MECHANISMS:
                problems.append(f"unknown mechanism tag: {m!r}")
        if len(mech) == 2 and mech[0] == mech[1]:
            problems.append("mechanism tags must be distinct")
    for field in ("customer", "revenue", "form"):
        value = tags.get(field)
        if value not in FIELDS[field]:
            problems.append(f"unknown {field} tag: {value!r}")
    return problems
