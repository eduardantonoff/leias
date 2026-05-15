from enum import StrEnum

from google.adk.agents.readonly_context import ReadonlyContext

from ..graph.space import (
    StateMapping,
    get_active_plan,
    get_active_plan_progress,
    get_active_topic,
    get_completed_plan,
    get_knowledge_space,
    list_topics_from_space,
)
from .blocks.base import BASE_BLOCK
from .blocks.onboarding import ONBOARDING_BLOCK
from .blocks.teaching import TEACHING_BLOCK
from .blocks.transition import TRANSITION_BLOCK
from .blocks.workflow import ACTIVE_GRAPH_WORKFLOW


class ConversationPhase(StrEnum):
    ONBOARDING = "onboarding"
    TRANSITION = "transition"
    TEACHING = "teaching"


def assistant_instruction(context: ReadonlyContext) -> str:
    state = context.state
    phase = _phase_from_state(state)
    blocks = [BASE_BLOCK, _phase_block(phase), ACTIVE_GRAPH_WORKFLOW]
    blocks.append(_format_document_context(state))

    active_topic = get_active_topic(state)
    if active_topic:
        blocks.append(
            "# Active Topic\n"
            f"- ID: {active_topic.get('id')}\n"
            f"- Title: {active_topic.get('title')}\n"
            f"- Summary: {active_topic.get('summary') or 'Not provided'}"
        )

    active_plan = get_active_plan(state)
    if active_plan:
        blocks.append(_format_active_plan(active_plan, get_active_plan_progress(state)))

    completed_plan = get_completed_plan(state)
    if phase == ConversationPhase.TRANSITION and completed_plan:
        blocks.append(_format_completed_plan(completed_plan))

    return "\n\n".join(block.strip() for block in blocks if block)


def _phase_from_state(state: StateMapping) -> ConversationPhase:
    if get_active_plan(state):
        return ConversationPhase.TEACHING
    if get_completed_plan(state):
        return ConversationPhase.TRANSITION
    return ConversationPhase.ONBOARDING


def _phase_block(phase: ConversationPhase) -> str:
    if phase == ConversationPhase.TEACHING:
        return TEACHING_BLOCK
    if phase == ConversationPhase.TRANSITION:
        return TRANSITION_BLOCK
    return ONBOARDING_BLOCK


def _format_active_plan(plan: dict, progress: dict) -> str:
    lines = [
        "# Active Plan",
        f"- Title: {plan.get('title')}",
        f"- Topic ID: {plan.get('topic_id')}",
        f"- Objective: {plan.get('learning_objective')}",
        f"- Completed: {progress['completed']}",
    ]

    completed_checkpoints = set(progress["completed_checkpoints"])
    key_points = plan.get("key_points")
    if isinstance(key_points, list) and key_points:
        lines.append("\n## Key Points")
        for index, point in enumerate(key_points):
            if not isinstance(point, dict):
                continue
            lines.append(f"{index}. {point.get('idea')} - {point.get('approach')}")

    checkpoints = plan.get("checkpoints")
    if isinstance(checkpoints, list) and checkpoints:
        lines.append("\n## Checkpoints")
        for index, checkpoint in enumerate(checkpoints):
            if not isinstance(checkpoint, dict):
                continue
            status = "passed" if index in completed_checkpoints else "pending"
            lines.append(
                f"{index}. [{status}] {checkpoint.get('type')}: {checkpoint.get('target_skill')} "
                f"(pass: {checkpoint.get('pass_criteria')})"
            )

    resources = plan.get("resources")
    if isinstance(resources, list) and resources:
        lines.append("\n## Resources")
        for resource in resources:
            if not isinstance(resource, dict):
                continue
            lines.append(
                f"- {resource.get('type')}: {resource.get('url')} "
                f"({resource.get('caption')}; placement: {resource.get('placement')})"
            )

    return "\n".join(lines)


def _format_completed_plan(plan: dict) -> str:
    next_topic_ids = plan.get("next_topic_ids") or []
    next_steps = ", ".join(str(topic_id) for topic_id in next_topic_ids) or "None"
    return "\n".join(
        [
            "# Completed Plan",
            f"- Title: {plan.get('title')}",
            f"- Topic ID: {plan.get('topic_id')}",
            f"- Next possible steps IDs: {next_steps}",
        ]
    )


def _format_document_context(state: StateMapping) -> str:
    space = get_knowledge_space(state)
    document = space.get("document")
    if not isinstance(document, dict):
        return ""

    lines = ["# Active Document"]
    title = document.get("title")
    overview = document.get("overview")
    if title:
        lines.append(f"- Title: {title}")
    if overview:
        lines.append(f"- Overview: {overview}")

    topics = list_topics_from_space(space)
    if topics:
        lines.append("\n## Available Topics")
        for topic in topics[:12]:
            lines.append(f"- {topic['id']}: {topic['title']}")

    return "\n".join(lines)
