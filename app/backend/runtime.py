from __future__ import annotations

import json

from collections.abc import AsyncGenerator
from functools import lru_cache
from uuid import uuid4

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.context import Context
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.models import LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

from core.config import APP_NAME, KNOWLEDGE_SPACE, MODEL_KWARGS, USER_ID
from core.instructions.blocks.base import BASE_BLOCK
from core.instructions.planner import PLANNER_PROMPT
from core.plan_schema import Plan


def log_before_agent(callback_context: CallbackContext):
    print("Agent start:", callback_context.agent_name)
    return None


def log_after_tool(tool, args, tool_context, tool_response):
    print("Tool finished:", tool.name, tool_response)
    return None


def log_before_model(callback_context: CallbackContext, llm_request: LlmRequest):
    print("Before model:", callback_context.agent_name)
    return None


def retrieve_topic_by_id(context: Context, topic_id: str) -> str:
    """Retrieve one topic by exact topic id and store it in shared state."""
    for topic in KNOWLEDGE_SPACE.get("topics", []):
        if topic.get("id") == topic_id:
            topic_json = json.dumps(
                topic,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            context.state["active_topic_id"] = topic["id"]
            context.state["active_topic_title"] = topic.get("title", topic["id"])
            context.state["active_topic_json"] = topic_json
            return f"Stored topic '{topic['id']}' in shared state for planning."

    return (
        f"Unknown topic_id: {topic_id}. "
        "Valid topic ids: supervised-learning, data-splits, overfitting"
    )


retrieve_topic_by_id_tool = FunctionTool(retrieve_topic_by_id)


def planner_instruction(context: ReadonlyContext) -> str:
    active_topic_json = context.state.get("active_topic_json")
    if active_topic_json:
        return PLANNER_PROMPT + "# Retrieved Topic Context: " + str(active_topic_json)
    
    return PLANNER_PROMPT


@lru_cache(maxsize=1)
def get_session_service() -> InMemorySessionService:
    return InMemorySessionService()


@lru_cache(maxsize=1)
def get_runner() -> Runner:
    model = LiteLlm(**MODEL_KWARGS)

    planner_agent = Agent(
        model=model,
        name="Planner",
        description="Planner agent.",
        instruction=planner_instruction,
        output_schema=Plan,
        generate_content_config=types.GenerateContentConfig(temperature=0),
        before_agent_callback=log_before_agent,
        before_model_callback=log_before_model,
        after_tool_callback=log_after_tool,
    )

    retriever_agent = Agent(
        model=model,
        name="Retriever",
        description="Retriever agent.",
        instruction=(
            "You are a topic retriever.\n"
            "Use `retrieve_topic_by_id` to load exactly one topic into shared session state.\n"
            "Valid topic ids: supervised-learning, data-splits, overfitting.\n"
            "If the learner asks where to start, use `supervised-learning`.\n"
            "After the tool call, return one short sentence naming the stored topic id.\n"
            "Do not return the topic JSON."
        ),
        tools=[retrieve_topic_by_id_tool],
        before_agent_callback=log_before_agent,
        before_model_callback=log_before_model,
        after_tool_callback=log_after_tool,
    )

    assistant_agent = Agent(
        model=model,
        name="Assistant",
        description="Assistant agent.",
        instruction=(
            BASE_BLOCK
            + "\n\n# Testing Mode\n"
            + "- Use `Retriever` to store the selected topic in shared session state.\n"
            + "- Valid topic ids are: `supervised-learning`, `data-splits`, `overfitting`.\n"
            + "- If the learner asks where to start, call `Retriever` for `supervised-learning` first.\n"
            + "- Call `Planner` only after a topic is stored in shared session state.\n"
            + "- Do not paste the full retrieved topic into your reply.\n"
            + "- Keep replies concise and useful."
        ),
        tools=[
            AgentTool(agent=planner_agent),
            AgentTool(agent=retriever_agent),
        ],
        before_agent_callback=log_before_agent,
        before_model_callback=log_before_model,
        after_tool_callback=log_after_tool,
    )

    return Runner(
        agent=assistant_agent,
        app_name=APP_NAME,
        session_service=get_session_service(),
    )


async def create_session(session_id: str | None = None) -> str:
    service = get_session_service()
    session = await service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id or str(uuid4()),
    )
    return session.id


async def get_session(session_id: str):
    return await get_session_service().get_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
    )


async def ensure_session(session_id: str) -> str:
    if await get_session(session_id):
        return session_id
    return await create_session(session_id)


def _extract_text(
    content: types.Content | None,
    *,
    strip: bool = True,
    include_thoughts: bool = False,
) -> str:
    if not content or not content.parts:
        return ""
    texts = [
        part.text
        for part in content.parts
        if getattr(part, "text", None)
        and (include_thoughts or not getattr(part, "thought", False))
        and (include_thoughts or getattr(part, "thought", False) is not True)
    ]
    joined = "\n".join(texts)
    return joined.strip() if strip else joined


def _extract_thought_text(content: types.Content | None, *, strip: bool = True) -> str:
    if not content or not content.parts:
        return ""
    texts = [
        part.text
        for part in content.parts
        if getattr(part, "text", None) and getattr(part, "thought", False)
    ]
    joined = "\n".join(texts)
    return joined.strip() if strip else joined


def _summarize_tool_response(response: object) -> str:
    if isinstance(response, dict):
        if "title" in response:
            return str(response["title"])
        if "topic_id" in response:
            return str(response["topic_id"])
        if "topic" in response:
            return str(response["topic"])
        if "error" in response:
            return str(response["error"])
        return "Completed"
    if isinstance(response, str):
        return response
    return type(response).__name__


def _parse_state_json(raw: object) -> dict | None:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def stream_message(
    session_id: str,
    text: str,
) -> AsyncGenerator[dict[str, object], None]:
    runner = get_runner()
    await ensure_session(session_id)
    run_config = RunConfig(streaming_mode=StreamingMode.SSE)

    message = types.Content(role="user", parts=[types.Part(text=text)])
    final_text = ""
    final_thought_text = ""
    last_assistant_text = ""
    last_assistant_thought_text = ""
    last_emitted_assistant_text = ""
    last_emitted_assistant_thought_text = ""
    streamed_assistant_text = ""
    streamed_assistant_thought_text = ""
    planner_result = None
    last_status_author = None

    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=message,
        run_config=run_config,
    ):
        if event.author and event.author != "user" and event.author != last_status_author:
            last_status_author = event.author
            yield {
                "type": "status",
                "author": event.author,
                "message": f"{event.author} is working",
            }

        for call in event.get_function_calls():
            yield {
                "type": "tool_call",
                "agent": event.author,
                "name": call.name,
                "args": call.args or {},
            }

        for response in event.get_function_responses():
            if response.name == "Planner" and isinstance(response.response, dict):
                planner_result = response.response
            session = await get_session(session_id)
            state = session.state if session else {}
            active_topic = _parse_state_json(state.get("active_topic_json"))
            yield {
                "type": "tool_result",
                "agent": event.author,
                "name": response.name,
                "summary": _summarize_tool_response(response.response),
                "payload": planner_result if response.name == "Planner" else active_topic,
            }

        event_text = _extract_text(event.content, strip=False)
        event_thought_text = _extract_thought_text(event.content, strip=False)
        is_partial_text = (
            event.author == "Assistant"
            and event.partial is True
            and bool(event_text)
            and not event.get_function_calls()
            and not event.get_function_responses()
        )
        is_partial_thought = (
            event.author == "Assistant"
            and event.partial is True
            and bool(event_thought_text)
            and not event.get_function_calls()
            and not event.get_function_responses()
        )
        is_complete_text = (
            event.author == "Assistant"
            and event.partial is not True
            and bool(event_text)
            and not event.get_function_calls()
            and not event.get_function_responses()
        )
        is_complete_thought = (
            event.author == "Assistant"
            and event.partial is not True
            and bool(event_thought_text)
            and not event.get_function_calls()
            and not event.get_function_responses()
        )

        if is_partial_thought:
            streamed_assistant_thought_text += event_thought_text
            last_assistant_thought_text = streamed_assistant_thought_text
            if streamed_assistant_thought_text != last_emitted_assistant_thought_text:
                last_emitted_assistant_thought_text = streamed_assistant_thought_text
                yield {
                    "type": "assistant_thought",
                    "text": streamed_assistant_thought_text,
                    "final": False,
                }

        if is_partial_text:
            streamed_assistant_text += event_text
            last_assistant_text = streamed_assistant_text
            if streamed_assistant_text != last_emitted_assistant_text:
                last_emitted_assistant_text = streamed_assistant_text
                yield {
                    "type": "assistant_text",
                    "text": streamed_assistant_text,
                    "final": False,
                }
            continue

        if is_complete_thought:
            normalized_complete_thought_text = event_thought_text.strip()
            normalized_streamed_thought_text = streamed_assistant_thought_text.strip()
            if streamed_assistant_thought_text:
                canonical_thought_text = (
                    normalized_complete_thought_text or normalized_streamed_thought_text
                )
                last_assistant_thought_text = canonical_thought_text
                final_thought_text = canonical_thought_text
                if canonical_thought_text != last_emitted_assistant_thought_text.strip():
                    last_emitted_assistant_thought_text = canonical_thought_text
                    yield {
                        "type": "assistant_thought",
                        "text": canonical_thought_text,
                        "final": True,
                    }
            else:
                last_assistant_thought_text = normalized_complete_thought_text
                final_thought_text = normalized_complete_thought_text
                if normalized_complete_thought_text != last_emitted_assistant_thought_text.strip():
                    last_emitted_assistant_thought_text = normalized_complete_thought_text
                    yield {
                        "type": "assistant_thought",
                        "text": normalized_complete_thought_text,
                        "final": event.is_final_response(),
                    }

        if is_complete_text:
            normalized_complete_text = event_text.strip()
            normalized_streamed_text = streamed_assistant_text.strip()
            if streamed_assistant_text:
                # In ADK SSE mode, the final non-partial event is the aggregated
                # content for the same response. Prefer it as the canonical final
                # text instead of appending it to the streamed chunks.
                canonical_text = normalized_complete_text or normalized_streamed_text
                last_assistant_text = canonical_text
                final_text = canonical_text
                if canonical_text != last_emitted_assistant_text.strip():
                    last_emitted_assistant_text = canonical_text
                    yield {
                        "type": "assistant_text",
                        "text": canonical_text,
                        "final": True,
                    }
            else:
                last_assistant_text = normalized_complete_text
                final_text = normalized_complete_text
                if normalized_complete_text != last_emitted_assistant_text.strip():
                    last_emitted_assistant_text = normalized_complete_text
                    yield {
                        "type": "assistant_text",
                        "text": normalized_complete_text,
                        "final": event.is_final_response(),
                    }

    if not final_text:
        final_text = streamed_assistant_text.strip() or last_assistant_text
    if not final_thought_text:
        final_thought_text = (
            streamed_assistant_thought_text.strip() or last_assistant_thought_text
        )

    if not final_text and planner_result:
        title = planner_result.get("title") or planner_result.get("topic")
        final_text = f"I created a plan for {title}."

    session = await get_session(session_id)
    state = session.state if session else {}
    if planner_result and session:
        state["active_plan_json"] = json.dumps(
            planner_result,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    active_topic = _parse_state_json(state.get("active_topic_json"))
    active_plan = planner_result or _parse_state_json(state.get("active_plan_json"))
    yield {
        "type": "done",
        "reply": final_text or "",
        "active_topic_id": state.get("active_topic_id"),
        "active_topic_title": state.get("active_topic_title"),
        "active_topic": active_topic,
        "active_plan": active_plan,
        "thought": final_thought_text or "",
        "session_id": session_id,
    }


async def send_message(session_id: str, text: str) -> dict[str, str | None]:
    final_payload: dict[str, str | None] = {
        "reply": "",
        "active_topic_id": None,
        "active_topic_title": None,
        "active_topic": None,
        "active_plan": None,
    }
    async for payload in stream_message(session_id, text):
        if payload.get("type") == "done":
            final_payload = {
                "reply": str(payload.get("reply") or ""),
                "active_topic_id": payload.get("active_topic_id"),
                "active_topic_title": payload.get("active_topic_title"),
                "active_topic": payload.get("active_topic"),
                "active_plan": payload.get("active_plan"),
            }
    return final_payload


async def list_messages(session_id: str) -> list[dict[str, str]]:
    session = await get_session(session_id)
    if not session:
        return []

    messages: list[dict[str, str]] = []
    for event in session.events:
        if event.author not in {"user", "Assistant"}:
            continue
        text = _extract_text(event.content)
        if not text:
            continue
        role = "assistant" if event.author == "Assistant" else "user"
        if (
            role == "assistant"
            and messages
            and messages[-1]["role"] == "assistant"
            and text.startswith(messages[-1]["text"])
        ):
            messages[-1] = {"role": role, "text": text}
            continue
        messages.append({"role": role, "text": text})
    return messages
