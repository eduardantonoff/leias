from __future__ import annotations

from google.adk.agents.context import Context
from google.adk.tools.function_tool import FunctionTool

from ..graph.space import (
    build_active_topic,
    dump_json,
    get_knowledge_space,
    list_topics_from_space,
)


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split()
        if token
    }


def search_knowledge_space(
    context: Context,
    query: str,
    limit: int = 5,
) -> list[dict[str, str]]:
    """Search available graph topics by id, title, summary, context, and concepts."""
    query_tokens = _tokens(query)
    if not query_tokens:
        return list_topics_from_space(get_knowledge_space(context.state))[:limit]

    scored: list[tuple[int, dict[str, str]]] = []
    space = get_knowledge_space(context.state)
    concepts_by_topic = _concepts_by_topic(space)

    for topic in space.get("topics", []):
        if not isinstance(topic, dict):
            continue

        topic_id = str(topic.get("id") or "")
        if not topic_id:
            continue

        concept_text = " ".join(concepts_by_topic.get(topic_id, []))
        haystack = " ".join(
            [
                topic_id,
                str(topic.get("title") or ""),
                str(topic.get("summary") or ""),
                str(topic.get("context") or ""),
                concept_text,
            ]
        )
        score = len(query_tokens & _tokens(haystack))
        if score:
            scored.append(
                (
                    score,
                    {
                        "id": topic_id,
                        "title": str(topic.get("title") or topic_id),
                        "summary": str(topic.get("summary") or ""),
                    },
                )
            )

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [topic for _, topic in scored[:limit]]


def retrieve_topic_by_id(context: Context, topic_id: str) -> dict[str, object]:
    """Load one graph topic and its concepts into shared session state."""
    space = get_knowledge_space(context.state)
    for topic in space.get("topics", []):
        if isinstance(topic, dict) and topic.get("id") == topic_id:
            active_topic = build_active_topic(space, topic)
            context.state["active_topic_id"] = topic_id
            context.state["active_topic_title"] = str(topic.get("title") or topic_id)
            context.state["active_topic_json"] = dump_json(active_topic)
            return {
                "topic_id": topic_id,
                "title": context.state["active_topic_title"],
                "status": "stored",
            }

    return {
        "error": f"Unknown topic_id: {topic_id}",
        "available_topics": list_topics_from_space(space),
    }


def _concepts_by_topic(space: dict) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for concept in space.get("concepts", []):
        if not isinstance(concept, dict):
            continue

        topic_id = concept.get("topic_id")
        if not topic_id:
            continue

        grouped.setdefault(str(topic_id), []).append(
            " ".join(
                [
                    str(concept.get("title") or ""),
                    str(concept.get("summary") or ""),
                    str(concept.get("context") or ""),
                ]
            )
        )
    return grouped


search_knowledge_space_tool = FunctionTool(search_knowledge_space)
retrieve_topic_by_id_tool = FunctionTool(retrieve_topic_by_id)
