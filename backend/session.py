from functools import lru_cache
from uuid import uuid4

from google.adk.sessions import InMemorySessionService
from google.adk.events import Event, EventActions
from google.genai import types

from .config import APP_NAME, EMPTY_KNOWLEDGE_SPACE, USER_ID
from .graph.space import dump_json
from .schemas.api import ChatMessage


@lru_cache(maxsize=1)
def get_session_service() -> InMemorySessionService:
    return InMemorySessionService()


async def create_session(
    session_id: str | None = None,
    *,
    knowledge_space: dict | None = None,
) -> str:
    session = await get_session_service().create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        state={
            "knowledge_space_json": dump_json(knowledge_space or EMPTY_KNOWLEDGE_SPACE)
        },
        session_id=session_id or str(uuid4()),
    )
    return session.id


async def get_session(session_id: str):
    return await get_session_service().get_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )


async def update_session_state(session_id: str, delta: dict[str, object]) -> dict:
    session = await get_session(session_id)
    if not session:
        return {}

    await get_session_service().append_event(
        session=session,
        event=Event(
            author="state",
            actions=EventActions(state_delta=delta),
        ),
    )

    updated = await get_session(session_id)
    return updated.state if updated else {}


async def ensure_session(session_id: str) -> str:
    if await get_session(session_id):
        return session_id
    return await create_session(session_id)


def extract_text(
    content: types.Content | None,
    *,
    strip: bool = True,
    include_thoughts: bool = False,
) -> str:
    if not content or not content.parts:
        return ""

    texts: list[str] = []
    for part in content.parts:
        text = getattr(part, "text", None)
        if text and (include_thoughts or getattr(part, "thought", False) is not True):
            texts.append(text)

    joined = "\n".join(texts)
    return joined.strip() if strip else joined


async def list_messages(session_id: str) -> list[ChatMessage]:
    session = await get_session(session_id)
    if not session:
        return []

    messages: list[ChatMessage] = []
    for event in session.events:
        if event.author not in {"user", "Assistant"}:
            continue

        text = extract_text(event.content)
        if not text:
            continue

        role = "assistant" if event.author == "Assistant" else "user"
        if (
            role == "assistant"
            and messages
            and messages[-1].role == "assistant"
            and text.startswith(messages[-1].text)
        ):
            messages[-1] = ChatMessage(role=role, text=text)
            continue

        messages.append(ChatMessage(role=role, text=text))

    return messages
