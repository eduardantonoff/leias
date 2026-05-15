from pydantic import BaseModel, Field


class Evidence(BaseModel):
    page: int | None = None
    section: str | None = None
    excerpt: str = Field(
        description="Short supporting quote or snippet from the source."
    )


class DocumentPageImage(BaseModel):
    page: int
    data_url: str


class DocumentPayload(BaseModel):
    title: str
    source_type: str
    page_count: int | None = None
    page_images: list[DocumentPageImage] = Field(default_factory=list)


class DocumentNode(BaseModel):
    id: str = "document"
    title: str
    source_type: str
    domain: str
    overview: str


class Topic(BaseModel):
    id: str
    title: str
    summary: str
    context: str
    page_start: int | None = None
    page_end: int | None = None


class Concept(BaseModel):
    id: str
    topic_id: str
    title: str
    summary: str
    context: str
    prerequisite_ids: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)


class TopicDraft(BaseModel):
    title: str = Field(description="Short topic title grounded in the document.")
    summary: str = Field(description="What this topic is about.")
    context: str = Field(description="How this topic functions in the document.")
    page_start: int | None = Field(
        default=None,
        description="First page where this topic is mainly discussed.",
    )
    page_end: int | None = Field(
        default=None,
        description="Last page where this topic is mainly discussed.",
    )


class DocumentScaffold(BaseModel):
    domain: str = Field(description="Short domain label for the document.")
    overview: str = Field(
        description="Overview of the document and why it matters."
    )
    topics: list[TopicDraft] = Field(
        default_factory=list,
        description="Major topics in document order.",
    )


class ConceptDraft(BaseModel):
    title: str = Field(
        description="Short concept title grounded in the current topic."
    )
    summary: str = Field(description="What this concept means.")
    context: str = Field(
        description="How this concept functions within the current topic."
    )
    evidence: list[Evidence] = Field(
        default_factory=list,
        description="Supporting evidence from the source.",
    )


class TopicConceptBatch(BaseModel):
    concepts: list[ConceptDraft] = Field(
        default_factory=list,
        description="Grounded concepts for the current topic.",
    )
