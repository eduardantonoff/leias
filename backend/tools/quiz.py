from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from google.adk.agents.context import Context
from google.adk.tools.function_tool import FunctionTool
from pydantic import Field

QuizDefinition = dict[str, object]

_QUIZZES: dict[str, QuizDefinition] = {}


def get_quiz(quiz_id: str) -> QuizDefinition | None:
    return _QUIZZES.get(quiz_id)


def generate_multiple_choice_quiz(
    context: Context,
    question: Annotated[
        str,
        Field(description="Concise single-answer multiple-choice question."),
    ],
    options: Annotated[
        list[str],
        Field(description="Two to five short, parallel answer options."),
    ],
    correct_index: Annotated[
        int,
        Field(description="Zero-based index of the correct option."),
    ],
    explanation: Annotated[
        str,
        Field(description="Brief feedback shown after the learner answers."),
    ],
) -> str:
    """Create a single-answer multiple-choice quiz iframe for the learner."""
    del context

    if len(options) < 2 or len(options) > 5:
        return "Could not create quiz: provide 2 to 5 options."
    if correct_index < 0 or correct_index >= len(options):
        return (
            "Could not create quiz: correct_index must be a valid 0-based option index."
        )

    quiz_id = str(uuid4())
    _QUIZZES[quiz_id] = {
        "quiz_id": quiz_id,
        "question": question,
        "options": options,
        "correct_index": correct_index,
        "explanation": explanation,
    }

    iframe = (
        f'<iframe src="/static/quizzes/multiple-choice.html?id={quiz_id}" '
        'width="100%" style="border:none;"></iframe>'
    )
    return f"Quiz created. Include this exact iframe in your response:\n{iframe}"


generate_multiple_choice_quiz_tool = FunctionTool(generate_multiple_choice_quiz)
