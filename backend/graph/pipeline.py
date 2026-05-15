import asyncio
from typing import AsyncIterator

from .document import read_document, slice_document_pages
from .extractors import GraphExtractor
from ..schemas.graph import (
    DocumentNode,
    DocumentPayload,
    Topic,
)

DEFAULT_MAX_CONCURRENT_CONCEPTS = 3


class IncrementalGraphPipeline:
    def __init__(self, extractor: GraphExtractor | None = None) -> None:
        self.extractor = extractor or GraphExtractor()

    async def build_stream(
        self,
        path: str,
        *,
        title_override: str | None = None,
        user_intent: str | None = None,
        max_pages: int = 10,
        max_topics: int = 6,
        max_retries_per_step: int = 2,
        max_concurrent_concepts: int = DEFAULT_MAX_CONCURRENT_CONCEPTS,
    ) -> AsyncIterator[dict]:
        event_queue: asyncio.Queue[dict | None] = asyncio.Queue()
        producer = asyncio.create_task(
            self._run(
                path=path,
                title_override=title_override,
                user_intent=user_intent,
                max_pages=max_pages,
                max_topics=max_topics,
                max_retries_per_step=max_retries_per_step,
                max_concurrent_concepts=max_concurrent_concepts,
                event_queue=event_queue,
            )
        )

        try:
            while True:
                event = await event_queue.get()
                if event is None:
                    break
                yield event
            await producer
        finally:
            if not producer.done():
                producer.cancel()
            await asyncio.gather(producer, return_exceptions=True)

    async def _run(
        self,
        *,
        path: str,
        title_override: str | None,
        user_intent: str | None,
        max_pages: int,
        max_topics: int,
        max_retries_per_step: int,
        max_concurrent_concepts: int,
        event_queue: asyncio.Queue[dict | None],
    ) -> None:
        try:
            payload = read_document(
                path,
                max_pages=max_pages,
                title_override=title_override,
            )

            async def log(message: str) -> None:
                await self._emit_log(event_queue, message)

            await self._emit_log(
                event_queue,
                f"Loaded document '{payload.title}' ({payload.source_type})",
            )
            document, topics = await self.extractor.extract_scaffold(
                payload=payload,
                user_intent=user_intent,
                max_topics=max_topics,
                max_retries=max_retries_per_step,
                log=log,
            )
            await self._emit_event(
                event_queue,
                {"type": "overview.created", "payload": document.model_dump()},
            )

            concept_counts: dict[str, int] = {}
            concept_tasks: list[asyncio.Task[None]] = []
            semaphore = asyncio.Semaphore(max(1, max_concurrent_concepts))
            for step, topic in enumerate(topics, start=1):
                await self._emit_event(
                    event_queue,
                    {
                        "type": "topic.created",
                        "step": step,
                        "payload": topic.model_dump(),
                    },
                )
                concept_tasks.append(
                    asyncio.create_task(
                        self._extract_topic_concepts(
                            payload=slice_document_pages(
                                payload, topic.page_start, topic.page_end
                            ),
                            document=document,
                            topics=topics,
                            topic=topic,
                            user_intent=user_intent,
                            concept_counts=concept_counts,
                            max_retries=max_retries_per_step,
                            semaphore=semaphore,
                            event_queue=event_queue,
                        )
                    )
                )

            try:
                if concept_tasks:
                    await asyncio.gather(*concept_tasks)
            finally:
                for task in concept_tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*concept_tasks, return_exceptions=True)

            concept_count = sum(concept_counts.values())
            await self._emit_event(
                event_queue,
                {
                    "type": "graph.completed",
                    "topic_count": len(topics),
                    "concept_count": concept_count,
                    "stop_reason": "scaffold_completed",
                },
            )
        finally:
            await event_queue.put(None)

    async def _extract_topic_concepts(
        self,
        *,
        payload: DocumentPayload,
        document: DocumentNode,
        topics: list[Topic],
        topic: Topic,
        user_intent: str | None,
        concept_counts: dict[str, int],
        max_retries: int,
        semaphore: asyncio.Semaphore,
        event_queue: asyncio.Queue[dict | None],
    ) -> None:
        async with semaphore:
            await self._emit_log(event_queue, f"Concept extraction: '{topic.title}'")
            try:
                topic_concepts = await self.extractor.extract_topic_concepts(
                    payload=payload,
                    document=document,
                    topics=topics,
                    topic=topic,
                    user_intent=user_intent,
                    max_retries=max_retries,
                    log=lambda message: self._emit_log(event_queue, message),
                )
                concept_counts[topic.id] = len(topic_concepts)

                for concept in topic_concepts:
                    await self._emit_event(
                        event_queue,
                        {
                            "type": "concept.created",
                            "topic_id": topic.id,
                            "payload": concept.model_dump(),
                        },
                    )
            except Exception as exc:
                concept_counts[topic.id] = 0
                await self._emit_log(
                    event_queue, f"Concept extraction failed for '{topic.title}': {exc}"
                )

    async def _emit_event(
        self, event_queue: asyncio.Queue[dict | None], event: dict
    ) -> None:
        await event_queue.put(event)

    async def _emit_log(
        self, event_queue: asyncio.Queue[dict | None], message: str
    ) -> None:
        await self._emit_event(event_queue, {"type": "log", "message": message})
