from enum import StrEnum

from pydantic import BaseModel, Field


class ResourceType(StrEnum):
    IMAGE = "IMAGE"
    IFRAME = "IFRAME"


class CheckpointType(StrEnum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    SCENARIO = "SCENARIO"


class TeachingStrategy(BaseModel):
    intent: str = Field(
        min_length=16,
        max_length=512,
        description="Topic-level outcome the plan is intended to achieve.",
    )
    emphasis: str = Field(
        min_length=16,
        max_length=512,
        description="Main pedagogical focus, including what to prioritize and what to keep light.",
    )
    out_of_scope: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Topics, details, or adjacent material that should be excluded or deferred.",
    )


class Resource(BaseModel):
    type: ResourceType = Field(
        description="Resource type to embed in the plan."
    )
    url: str = Field(
        description="Resource link from the knowledge graph."
    )
    caption: str = Field(
        min_length=16,
        max_length=256,
        description="Description of what the resource shows and how it supports the lesson.",
    )
    placement: str = Field(
        min_length=16,
        max_length=256,
        description="Description of where, when, or why the resource should be embedded.",
    )


class KeyPoint(BaseModel):
    idea: str = Field(
        min_length=16,
        max_length=256,
        description="Single teachable fact, concept, rule, or distinction to explain.",
    )
    approach: str = Field(
        min_length=16,
        max_length=512,
        description="Explanation approach to use, such as an example, contrast, analogy, or visualization.",
    )
    prior_knowledge: str | None = Field(
        default=None,
        max_length=512,
        description="Concept or term to briefly probe before teaching this point.",
    )


class Checkpoint(BaseModel):
    type: CheckpointType = Field(
        description="Verification format to use for this checkpoint."
    )
    target_skill: str = Field(
        min_length=16,
        max_length=256,
        description="Observable capability the learner must demonstrate.",
    )
    key_point_indices: list[int] = Field(
        min_length=1,
        max_length=3,
        description="Indices of the key points this checkpoint verifies.",
    )
    pass_criteria: str = Field(
        min_length=16,
        max_length=256,
        description="Concise rubric describing what a passing response must include.",
    )


class Plan(BaseModel):
    topic: str = Field(
        description="Topic name exactly as it appears in the knowledge graph."
    )
    topic_id: str = Field(
        description="Knowledge graph topic ID for this plan."
    )
    title: str = Field(
        min_length=16,
        max_length=128,
        description="Short plain-language title for the lesson.",
    )
    strategy: TeachingStrategy = Field(
        description="High-level teaching approach and scope for the topic."
    )
    description: str = Field(
        min_length=16,
        max_length=512,
        description="Description of what the lesson covers, why it matters, and how it connects to adjacent topics.",
    )
    learning_objective: str = Field(
        min_length=16,
        max_length=512,
        description="Observable learning outcome stated in impersonal form with no subject.",
    )
    item_ids: list[str] = Field(
        min_length=1,
        max_length=10,
        description="Knowledge graph item IDs covered by this lesson; values must match the graph exactly.",
    )
    key_points: list[KeyPoint] = Field(
        min_length=3,
        max_length=5,
        description="Ordered atomic concepts to teach in this lesson.",
    )
    checkpoints: list[Checkpoint] = Field(
        min_length=1,
        max_length=3,
        description="Verification checkpoints required before the lesson is considered complete.",
    )
    completion_criteria: str = Field(
        min_length=12,
        max_length=300,
        description="Description of what successful lesson completion looks like.",
    )
    resources: list[Resource] = Field(
        default_factory=list,
        max_length=5,
        description="Optional supporting resources for the lesson.",
    )
    next_topic_ids: list[str] = Field(
        default_factory=list,
        max_length=3,
        description="Suggested follow-up topic IDs from the knowledge graph.",
    )