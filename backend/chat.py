from collections.abc import AsyncGenerator
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai import types
from pydantic import ValidationError

from .agents import get_runner
from .config import USER_ID
from .graph.space import (
    dump_json,
    get_active_topic,
    get_visible_plan,
    get_visible_plan_progress,
)
from .schemas.plan import Plan
from .session import ensure_session, extract_text, get_session, update_session_state


def _normalize_plan(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        return Plan.model_validate(value).model_dump(mode="json")
    except ValidationError:
        return None


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


def _plan_key(plan: dict | None) -> str:
    if not plan:
        return ""
    return f"{plan.get('topic_id') or ''}:{plan.get('title') or ''}"


def _progress_key(progress: dict | None) -> str:
    if not progress:
        return ""
    checkpoints = progress.get("completed_checkpoints") or []
    return f"{progress.get('completed')}:{','.join(str(item) for item in checkpoints)}"


def _status_event(author: str | None) -> dict[str, object] | None:
    if not author or author == "user":
        return None
    return {
        "type": "status",
        "author": author,
        "message": f"{author} is working",
    }


def _tool_call_event(author: str | None, call) -> dict[str, object]:
    return {
        "type": "tool_call",
        "agent": author,
        "name": call.name,
        "args": call.args or {},
    }


async def _tool_result_event(
    session_id: str,
    author: str | None,
    response,
) -> tuple[dict[str, object], dict | None]:
    session = await get_session(session_id)
    state = session.state if session else {}
    planner_result = None

    if response.name == "Planner":
        planner_result = _normalize_plan(response.response)
        if planner_result:
            state = await update_session_state(
                session_id,
                {
                    "active_plan_json": dump_json(planner_result),
                    "active_plan_progress_json": dump_json(
                        {"completed": False, "completed_checkpoints": []}
                    ),
                    "completed_plan_json": "",
                },
            )

    active_topic = get_active_topic(state)
    if response.name == "Planner":
        payload = planner_result
    elif response.name == "mark_checkpoint_passed":
        payload = response.response
    else:
        payload = active_topic

    return (
        {
            "type": "tool_result",
            "agent": author,
            "name": response.name,
            "summary": _summarize_tool_response(response.response),
            "payload": payload,
        },
        planner_result,
    )


def _assistant_text_event(
    event,
    *,
    has_tool_activity: bool,
) -> dict[str, object] | None:
    event_text = extract_text(event.content)
    if event.author != "Assistant" or not event_text or has_tool_activity:
        return None

    return {
        "type": "assistant_text",
        "text": event_text,
        "final": event.is_final_response(),
    }


async def stream_message(
    session_id: str,
    text: str,
) -> AsyncGenerator[dict[str, object], None]:
    runner = get_runner()
    await ensure_session(session_id)
    run_config = RunConfig(streaming_mode=StreamingMode.NONE)

    message = types.Content(role="user", parts=[types.Part(text=text)])
    assistant_reply = ""
    planner_result = None
    last_status_author = None
    start_session = await get_session(session_id)
    start_state = start_session.state if start_session else {}
    start_topic_id = start_state.get("active_topic_id")
    start_plan_key = _plan_key(get_visible_plan(start_state))
    start_progress_key = _progress_key(get_visible_plan_progress(start_state))
    actions: set[str] = set()

    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=message,
        run_config=run_config,
    ):
        if event.author != last_status_author:
            last_status_author = event.author
            if event.author == "Retriever":
                actions.add("retrieved")
            elif event.author == "Planner":
                actions.add("planned")
            if status_event := _status_event(event.author):
                yield status_event

        function_calls = event.get_function_calls()
        function_responses = event.get_function_responses()
        has_tool_activity = bool(function_calls or function_responses)

        for call in function_calls:
            yield _tool_call_event(event.author, call)

        for response in function_responses:
            tool_event, next_planner_result = await _tool_result_event(
                session_id,
                event.author,
                response,
            )
            if next_planner_result:
                planner_result = next_planner_result
                actions.add("planned")
            if response.name == "mark_checkpoint_passed":
                payload = response.response if isinstance(response.response, dict) else {}
                progress = payload.get("progress") if isinstance(payload, dict) else None
                if isinstance(progress, dict) and progress.get("completed"):
                    actions.add("plan_completed")
                else:
                    actions.add("plan_updated")
            yield tool_event

        if assistant_text_event := _assistant_text_event(
            event,
            has_tool_activity=has_tool_activity,
        ):
            assistant_reply = str(assistant_text_event["text"])
            yield assistant_text_event

    final_text = assistant_reply
    if not final_text and planner_result:
        title = planner_result.get("title") or planner_result.get("topic")
        final_text = f"I created a plan for {title}."

    session = await get_session(session_id)
    state = session.state if session else {}

    active_topic = get_active_topic(state)
    active_plan = planner_result or get_visible_plan(state)
    active_plan_progress = get_visible_plan_progress(state)
    if state.get("active_topic_id") and state.get("active_topic_id") != start_topic_id:
        actions.add("retrieved")
    if active_plan and _plan_key(active_plan) != start_plan_key:
        actions.add("planned")
    if _progress_key(active_plan_progress) != start_progress_key:
        if active_plan_progress.get("completed"):
            actions.add("plan_completed")
        else:
            actions.add("plan_updated")

    yield {
        "type": "done",
        "reply": final_text or "",
        "actions": sorted(actions),
        "active_topic_id": state.get("active_topic_id"),
        "active_topic_title": state.get("active_topic_title"),
        "active_topic": active_topic,
        "active_plan": active_plan,
        "active_plan_progress": active_plan_progress,
        "session_id": session_id,
    }
