from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from google.adk.sessions.state import State

from ..config import EMPTY_KNOWLEDGE_SPACE


def dump_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def parse_state_json(raw: object) -> dict | None:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


StateMapping = State | Mapping[str, Any]


def get_knowledge_space(state: StateMapping) -> dict:
    space = parse_state_json(state.get("knowledge_space_json"))
    if isinstance(space, dict) and isinstance(space.get("topics"), list):
        return space
    return EMPTY_KNOWLEDGE_SPACE


def get_active_topic(state: StateMapping) -> dict | None:
    return parse_state_json(state.get("active_topic_json"))


def get_active_plan(state: StateMapping) -> dict | None:
    return parse_state_json(state.get("active_plan_json"))


def get_completed_plan(state: StateMapping) -> dict | None:
    return parse_state_json(state.get("completed_plan_json"))


def get_active_plan_progress(state: StateMapping) -> dict:
    progress = parse_state_json(state.get("active_plan_progress_json"))
    return progress or {"completed": False, "completed_checkpoints": []}


def get_visible_plan(state: StateMapping) -> dict | None:
    return get_active_plan(state) or get_completed_plan(state)


def get_visible_plan_progress(state: StateMapping) -> dict:
    active_plan = get_active_plan(state)
    if active_plan:
        return get_active_plan_progress(state)

    completed_plan = get_completed_plan(state)
    if completed_plan:
        checkpoints = completed_plan.get("checkpoints") or []
        return {
            "completed": True,
            "completed_checkpoints": list(range(len(checkpoints))),
        }

    return {"completed": False, "completed_checkpoints": []}


def list_topics_from_space(space: dict) -> list[dict[str, str]]:
    topics: list[dict[str, str]] = []
    for topic in space.get("topics", []):
        if not isinstance(topic, dict):
            continue

        topic_id = topic.get("id")
        if not topic_id:
            continue

        topics.append(
            {
                "id": str(topic_id),
                "title": str(topic.get("title") or topic_id),
            }
        )
    return topics


def build_active_topic(space: dict, topic: dict) -> dict:
    active_topic = dict(topic)
    topic_id = topic.get("id")
    concepts = [
        concept
        for concept in space.get("concepts", [])
        if isinstance(concept, dict) and concept.get("topic_id") == topic_id
    ]
    if concepts:
        active_topic["concepts"] = concepts

    next_topics = []
    for edge in space.get("topic_edges", []):
        if not isinstance(edge, dict) or edge.get("source_topic_id") != topic_id:
            continue

        target_id = edge.get("target_topic_id")
        target = _find_topic(space, target_id)
        if target:
            next_topics.append(
                {
                    "id": str(target.get("id") or target_id),
                    "title": str(target.get("title") or target_id),
                    "edge_type": str(edge.get("type") or "related"),
                }
            )

    if next_topics:
        active_topic["next_topics"] = next_topics

    document = space.get("document")
    if isinstance(document, dict):
        active_topic["document"] = document

    return active_topic


def _find_topic(space: dict, topic_id: object) -> dict | None:
    if not topic_id:
        return None

    for topic in space.get("topics", []):
        if isinstance(topic, dict) and topic.get("id") == topic_id:
            return topic
    return None
