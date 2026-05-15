from functools import lru_cache

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

from .config import APP_NAME, MODEL_KWARGS
from .instructions.assistant import assistant_instruction
from .instructions.planner import PLANNER_PROMPT
from .instructions.retriever import RETRIEVER_PROMPT
from .schemas.plan import Plan
from .session import get_session_service
from .tools.knowledge import (
    retrieve_topic_by_id_tool,
    search_knowledge_space_tool,
)
from .tools.progress import mark_checkpoint_passed_tool
from .tools.quiz import generate_multiple_choice_quiz_tool


def planner_instruction(context: ReadonlyContext) -> str:
    active_topic_json = context.state.get("active_topic_json")
    if active_topic_json:
        return PLANNER_PROMPT + "# Retrieved Topic Context: " + str(active_topic_json)
    return PLANNER_PROMPT


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
    )

    retriever_agent = Agent(
        model=model,
        name="Retriever",
        description="Retriever agent.",
        instruction=RETRIEVER_PROMPT,
        tools=[search_knowledge_space_tool, retrieve_topic_by_id_tool],
    )

    assistant_agent = Agent(
        model=model,
        name="Assistant",
        description="Assistant agent.",
        instruction=assistant_instruction,
        tools=[
            AgentTool(agent=planner_agent),
            AgentTool(agent=retriever_agent),
            generate_multiple_choice_quiz_tool,
            mark_checkpoint_passed_tool,
        ],
    )

    return Runner(
        agent=assistant_agent,
        app_name=APP_NAME,
        session_service=get_session_service(),
    )
