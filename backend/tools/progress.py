from __future__ import annotations

from google.adk.agents.context import Context
from google.adk.tools.function_tool import FunctionTool

from ..graph.space import dump_json, get_active_plan, get_active_plan_progress


def _complete_plan(
    context: Context, plan: dict, checkpoint_count: int
) -> dict[str, object]:
    progress = {
        "completed": True,
        "completed_checkpoints": list(range(checkpoint_count)),
    }
    context.state["completed_plan_json"] = dump_json(plan)
    context.state["active_plan_json"] = ""
    context.state["active_plan_progress_json"] = ""
    return {"plan": plan, "progress": progress}


def mark_checkpoint_passed(
    context: Context, checkpoint_index: int
) -> dict[str, object]:
    """Mark one active-plan checkpoint as passed."""
    plan = get_active_plan(context.state)
    if not plan:
        return {"error": "No active plan."}

    checkpoint_count = len(plan.get("checkpoints") or [])
    if checkpoint_index < 0 or checkpoint_index >= checkpoint_count:
        return {
            "error": f"Invalid checkpoint_index: {checkpoint_index}",
            "checkpoint_count": checkpoint_count,
        }

    progress = get_active_plan_progress(context.state)
    passed = set(progress.get("completed_checkpoints", []))
    passed.add(checkpoint_index)
    if len(passed) == checkpoint_count:
        return _complete_plan(context, plan, checkpoint_count)

    next_progress = {
        "completed": False,
        "completed_checkpoints": sorted(passed),
    }
    context.state["active_plan_progress_json"] = dump_json(next_progress)
    return {"progress": next_progress}


mark_checkpoint_passed_tool = FunctionTool(mark_checkpoint_passed)
