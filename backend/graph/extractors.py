from collections.abc import Awaitable, Callable

from litellm import acompletion
from pydantic import BaseModel, ValidationError

from ..config import MODEL_KWARGS
from ..schemas.graph import (
    Concept,
    DocumentScaffold,
    DocumentNode,
    DocumentPayload,
    Topic,
    TopicDraft,
    TopicConceptBatch,
)
from ..instructions.graph import (
    SCAFFOLD_PROMPT,
    TOPIC_CONCEPT_PROMPT,
    build_scaffold_prompt,
    build_topic_concept_prompt,
)

Log = Callable[[str], Awaitable[None]]


def _messages(instruction: str, payload: DocumentPayload, prompt: str) -> list[dict]:
    parts: list[dict] = [{"type": "text", "text": prompt}]
    for page_image in payload.page_images:
        parts.append({"type": "text", "text": f"Page {page_image.page}"})
        parts.append({"type": "image_url", "image_url": {"url": page_image.data_url}})

    return [
        {"role": "system", "content": instruction},
        {"role": "user", "content": parts},
    ]


def _page_span(
    page_start: int | None, page_end: int | None, max_page: int
) -> tuple[int | None, int | None]:
    if not max_page:
        return None, None

    start = max(1, min(page_start, max_page)) if page_start is not None else None
    end = max(1, min(page_end, max_page)) if page_end is not None else None
    start = start or end
    end = end or start
    if start is not None and end is not None:
        end = max(start, end)
    return start, end


def _topics_from_drafts(
    topic_drafts: list[TopicDraft], payload: DocumentPayload
) -> list[Topic]:
    topics: list[Topic] = []
    max_page = len(payload.page_images)

    for draft in topic_drafts:
        title = draft.title.strip()
        summary = draft.summary.strip()
        context = draft.context.strip()
        if not title or not summary or not context:
            continue

        page_start, page_end = _page_span(draft.page_start, draft.page_end, max_page)
        topics.append(
            Topic(
                id=f"A.{len(topics) + 1}",
                title=title,
                summary=summary,
                context=context,
                page_start=page_start,
                page_end=page_end,
            )
        )

    return topics


def _concepts_from_batch(batch: TopicConceptBatch, topic: Topic) -> list[Concept]:
    concepts: list[Concept] = []
    for draft in batch.concepts:
        title = draft.title.strip()
        summary = draft.summary.strip()
        context = draft.context.strip()
        if not title or not summary or not context:
            continue

        concepts.append(
            Concept(
                id=f"{topic.id}.C{len(concepts) + 1}",
                topic_id=topic.id,
                title=title,
                summary=summary,
                context=context,
                evidence=draft.evidence[:2],
            )
        )

    return concepts


class GraphExtractor:
    async def _run_structured(
        self,
        instruction: str,
        schema: type[BaseModel],
        payload: DocumentPayload,
        prompt: str,
    ) -> str:
        # Local servers often reject json_schema response_format; use json_object
        # mode for them and let Pydantic validation + the retry loop handle structure.
        # Gemini (api_base is None) supports full schema enforcement.
        api_base = MODEL_KWARGS.get("api_base")
        response_format: type[BaseModel] | dict = (
            schema if api_base is None else {"type": "json_object"}
        )
        response = await acompletion(
            **MODEL_KWARGS,
            messages=_messages(instruction, payload, prompt),
            response_format=response_format,
            temperature=0,
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("No output received.")
        return content

    async def extract_scaffold(
        self,
        *,
        payload: DocumentPayload,
        user_intent: str | None,
        max_topics: int,
        max_retries: int,
        log: Log,
    ) -> tuple[DocumentNode, list[Topic]]:
        retry_instruction: str | None = None

        for attempt in range(1, max_retries + 1):
            try:
                prompt = build_scaffold_prompt(
                    payload=payload,
                    user_intent=user_intent,
                    max_topics=max_topics,
                    retry_instruction=retry_instruction,
                )
                raw = await self._run_structured(
                    SCAFFOLD_PROMPT, DocumentScaffold, payload, prompt
                )
                scaffold = DocumentScaffold.model_validate_json(raw)
            except ValidationError as exc:
                retry_instruction = "Return valid JSON for DocumentScaffold."
                await log(f"Scaffold attempt {attempt}: validation failed: {exc}")
                continue
            except Exception as exc:
                retry_instruction = "Retry carefully. Return a valid scaffold."
                await log(f"Scaffold attempt {attempt}: model call failed: {exc}")
                continue

            document = DocumentNode(
                title=payload.title,
                source_type=payload.source_type,
                domain=scaffold.domain.strip(),
                overview=scaffold.overview.strip(),
            )
            topics = _topics_from_drafts(scaffold.topics[:max_topics], payload)
            if not topics:
                retry_instruction = (
                    "The previous scaffold did not produce usable topics. "
                    "Return a non-empty list of major topics."
                )
                await log(f"Scaffold attempt {attempt}: no usable topics returned")
                continue
            return document, topics

        raise RuntimeError("Failed to extract document scaffold.")

    async def extract_topic_concepts(
        self,
        *,
        payload: DocumentPayload,
        document: DocumentNode,
        topics: list[Topic],
        topic: Topic,
        user_intent: str | None,
        max_retries: int,
        log: Log,
    ) -> list[Concept]:
        retry_instruction: str | None = None

        for attempt in range(1, max_retries + 1):
            prompt = build_topic_concept_prompt(
                document=document,
                topics=topics,
                topic=topic,
                user_intent=user_intent,
                retry_instruction=retry_instruction,
            )

            try:
                raw = await self._run_structured(
                    TOPIC_CONCEPT_PROMPT, TopicConceptBatch, payload, prompt
                )
                batch = TopicConceptBatch.model_validate_json(raw)
            except ValidationError as exc:
                retry_instruction = "Return valid JSON for TopicConceptBatch."
                await log(
                    f"Concept attempt {attempt} for '{topic.title}': validation failed: {exc}"
                )
                continue
            except Exception as exc:
                retry_instruction = "Retry carefully. Return 1-5 grounded concepts."
                await log(
                    f"Concept attempt {attempt} for '{topic.title}': model call failed: {exc}"
                )
                continue

            concepts = _concepts_from_batch(batch, topic)

            if concepts:
                return concepts

            retry_instruction = (
                "The previous concept set was empty or too weak. "
                "Return a smaller set of grounded topic-specific concepts."
            )

        return []
