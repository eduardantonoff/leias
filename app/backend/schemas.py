from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    text: str


class SessionResponse(BaseModel):
    session_id: str
    user_id: str
    active_topic_id: str | None = None
    active_topic_title: str | None = None
    active_topic: dict | None = None
    active_plan: dict | None = None
    messages: list[ChatMessage] = Field(default_factory=list)


class CreateSessionResponse(BaseModel):
    session_id: str
    user_id: str


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    active_topic_id: str | None = None
    active_topic_title: str | None = None
    active_topic: dict | None = None
    active_plan: dict | None = None
