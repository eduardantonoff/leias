from __future__ import annotations

from core.config import KNOWLEDGE_SPACE


def _normalize(text: str) -> set[str]:
    return {
        token
        for token in "".join(
            ch.lower() if ch.isalnum() else " "
            for ch in text
        ).split()
        if token
    }


def search_knowledge_space(query: str, limit: int = 5) -> list[dict[str, str]]:
    query_tokens = _normalize(query)
    if not query_tokens:
        return []

    scored: list[tuple[int, dict[str, str]]] = []
    for topic in KNOWLEDGE_SPACE.get("topics", []):
        haystack = " ".join(
            [
                str(topic.get("id", "")),
                str(topic.get("title", "")),
                str(topic.get("summary", "")),
                " ".join(topic.get("objectives", [])),
                " ".join(
                    material.get("excerpt", "")
                    for material in topic.get("materials", [])
                    if isinstance(material, dict)
                ),
            ]
        )
        score = len(query_tokens & _normalize(haystack))
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "id": str(topic.get("id", "")),
                    "title": str(topic.get("title", "")),
                    "summary": str(topic.get("summary", "")),
                },
            )
        )

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [payload for _, payload in scored[:limit]]
