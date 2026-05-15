from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..schemas.graph import DocumentNode, DocumentPayload, Topic

SCAFFOLD_PROMPT = """
Return a compact learning scaffold for this document.

- Write a short domain label.
- Write a short overview of what the learner should understand and why it matters.
- Extract the major teachable topics in document order.
- Each topic should be broader than a detail and narrower than the whole document.
- Do not force multiple topics. Prefer one strong topic when the source is a single page.
- Only create multiple topics when the source contains genuinely distinct sections, ideas, or a clear progression.
- Do not return overlapping, duplicate, or paraphrased topics.
- Avoid splitting one explanation into several near-duplicate topics.
- Set page_start and page_end to the main page span when clear. Use null when unclear.
- If learner intent is provided, prioritize the parts most relevant to that intent while staying grounded in the source.
"""


TOPIC_CONCEPT_PROMPT = """
Return a small set of teachable concepts for the current topic.

- Work only inside the current topic and provided source.
- Return 1-5 concepts.
- Prefer concrete methods, definitions, mechanisms, or named ideas from the document.
- Keep concepts more specific than the topic itself.
- Do not repeat the topic title as a concept.
- Do not repeat concepts that belong to another topic; if the topic is narrow, return fewer concepts.
- Order concepts from prerequisite to more advanced when possible.
- Include short evidence excerpts and page numbers when the source makes that clear.
- Do not invent unsupported concepts.
- If learner intent is provided, prefer concepts most relevant to that intent.
"""


def build_scaffold_prompt(
    *,
    payload: DocumentPayload,
    user_intent: str | None,
    max_topics: int,
    retry_instruction: str | None,
) -> str:
    return f"""
Document:
- Title: {payload.title}
- Source type: {payload.source_type}
- Pages: {payload.page_count or "unknown"}

Learner intent:
{user_intent or "Not provided"}

Task:
Return the overview and up to {max_topics} major teachable topics.
If this is a single page or narrow passage, usually return 1 topic and only return 2 when there are clearly separate ideas.

Source:
Use the attached images as the source of truth.

Correction:
{retry_instruction or "None"}
""".strip()


def build_topic_concept_prompt(
    *,
    document: DocumentNode,
    topics: list[Topic],
    topic: Topic,
    user_intent: str | None,
    retry_instruction: str | None,
) -> str:
    return f"""
Document:
- Domain: {document.domain}
- Overview: {document.overview}

Current topic:
- ID: {topic.id}
- Title: {topic.title}
- Summary: {topic.summary}
- Context: {topic.context}
- Pages: {_format_page_span(topic)}

All topics:
{_format_topics(topics)}

Learner intent:
{user_intent or "Not provided"}

Task:
Extract concepts that belong specifically to the current topic.
Use the full topic list only to avoid overlap: if a concept belongs more naturally to another topic, do not include it here.

Source:
Use the attached images as the source of truth.

Correction:
{retry_instruction or "None"}
""".strip()


def _format_page_span(topic: Topic) -> str:
    if topic.page_start is None and topic.page_end is None:
        return "unknown"
    if topic.page_start == topic.page_end:
        return str(topic.page_start)
    return f"{topic.page_start} to {topic.page_end}"


def _format_topics(topics: list[Topic]) -> str:
    return "\n".join(f"- {topic.id}: {topic.title}" for topic in topics) or "None"
