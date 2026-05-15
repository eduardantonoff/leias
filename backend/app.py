from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import API_BASE, MODEL_LABEL, MODEL_PATH, MODEL_PROVIDER, USER_ID
from .graph.pipeline import IncrementalGraphPipeline
from .graph.space import get_active_topic, get_visible_plan, get_visible_plan_progress
from .chat import stream_message
from .session import create_session, get_session, list_messages
from .schemas.api import (
    ChatRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    SessionResponse,
)
from .tools.quiz import get_quiz


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend" / "dist"
FRONTEND_AVAILABLE = FRONTEND_DIR.exists()
STATIC_DIR = BASE_DIR / "backend" / "static"

app = FastAPI(title="leias")
SUPPORTED_GRAPH_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg"}
SUPPORTED_GRAPH_TYPES_MESSAGE = "Supported file types: .pdf, .png, .jpg, .jpeg"
NDJSON_MEDIA_TYPE = "application/x-ndjson"
UPLOAD_CHUNK_BYTES = 1024 * 1024
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_GRAPH_PAGES = 10
MAX_GRAPH_TOPICS = 8
MAX_GRAPH_RETRIES = 3
MAX_CONCURRENT_CONCEPTS = 4


def optional_str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def to_ndjson_line(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def format_chat_error(error: Exception) -> str:
    message = str(error)
    if (
        "RateLimitError" in message
        or '"code": 429' in message
        or "RESOURCE_EXHAUSTED" in message
        or "retryDelay" in message
    ):
        return "Rate limit reached. Please retry in 40 seconds."
    return f"Chat request failed: {message}"


async def require_session(session_id: str):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


async def save_upload_to_temp_file(file: UploadFile, suffix: str) -> str:
    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    size = 0

    try:
        with os.fdopen(fd, "wb") as output:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Uploaded file is too large. Limit is 25 MB.",
                    )
                output.write(chunk)

        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
    except Exception:
        Path(temp_path).unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return temp_path


def bounded_int(value: int, *, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_AVAILABLE:
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse, response_model=None)
async def index():
    if not FRONTEND_AVAILABLE:
        return HTMLResponse(
            """
            <html>
              <body style="font-family: sans-serif; padding: 2rem; line-height: 1.5;">
                <h1>leias API</h1>
                <p>The backend is running, but the frontend has not been built yet.</p>
                <p>Build it from <code>frontend</code> with <code>npm install</code> and <code>npm run build</code>.</p>
              </body>
            </html>
            """.strip()
        )
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict[str, str | None]:
    return {
        "status": "ok",
        "provider": MODEL_PROVIDER,
        "label": MODEL_LABEL,
        "model": MODEL_PATH,
        "api_base": API_BASE,
    }


@app.get("/api/quizzes/{quiz_id}")
async def read_quiz(quiz_id: str) -> dict[str, object]:
    quiz = get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@app.post("/api/session", response_model=CreateSessionResponse)
async def create_chat_session(
    request: CreateSessionRequest | None = None,
) -> CreateSessionResponse:
    knowledge_space = request.knowledge_space if request else None
    session_id = await create_session(knowledge_space=knowledge_space)
    return CreateSessionResponse(session_id=session_id, user_id=USER_ID)


@app.get("/api/session/{session_id}", response_model=SessionResponse)
async def read_chat_session(session_id: str) -> SessionResponse:
    session = await require_session(session_id)

    return SessionResponse(
        session_id=session.id,
        user_id=session.user_id,
        active_topic_id=optional_str(session.state.get("active_topic_id")),
        active_topic_title=optional_str(session.state.get("active_topic_title")),
        active_topic=get_active_topic(session.state),
        active_plan=get_visible_plan(session.state),
        active_plan_progress=get_visible_plan_progress(session.state),
        messages=await list_messages(session_id),
    )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    await require_session(request.session_id)

    async def event_stream():
        try:
            async for payload in stream_message(request.session_id, request.message):
                yield to_ndjson_line(payload)
        except Exception as exc:
            yield to_ndjson_line({"type": "error", "message": format_chat_error(exc)})

    return StreamingResponse(event_stream(), media_type=NDJSON_MEDIA_TYPE)


@app.post("/api/graph/build")
async def graph_build(
    file: UploadFile = File(...),
    user_intent: str | None = Form(None),
    max_pages: int = Form(10),
    max_topics: int = Form(6),
    max_retries: int = Form(2),
    max_concurrent_concepts: int = Form(2),
) -> StreamingResponse:
    original_name = Path(file.filename or "")
    suffix = original_name.suffix.lower()
    if suffix not in SUPPORTED_GRAPH_SUFFIXES:
        raise HTTPException(status_code=400, detail=SUPPORTED_GRAPH_TYPES_MESSAGE)

    title_override = original_name.stem or None
    temp_path = await save_upload_to_temp_file(file, suffix)

    pipeline = IncrementalGraphPipeline()
    max_pages = bounded_int(max_pages, minimum=1, maximum=MAX_GRAPH_PAGES)
    max_topics = bounded_int(max_topics, minimum=1, maximum=MAX_GRAPH_TOPICS)
    max_retries = bounded_int(max_retries, minimum=1, maximum=MAX_GRAPH_RETRIES)
    max_concurrent_concepts = bounded_int(
        max_concurrent_concepts,
        minimum=1,
        maximum=MAX_CONCURRENT_CONCEPTS,
    )

    async def event_stream():
        try:
            async for event in pipeline.build_stream(
                temp_path,
                title_override=title_override,
                user_intent=user_intent.strip() if user_intent else None,
                max_pages=max_pages,
                max_topics=max_topics,
                max_retries_per_step=max_retries,
                max_concurrent_concepts=max_concurrent_concepts,
            ):
                yield to_ndjson_line(event)
        except Exception as exc:
            yield to_ndjson_line(
                {"type": "error", "message": f"Graph build failed: {exc}"}
            )
        finally:
            Path(temp_path).unlink(missing_ok=True)

    return StreamingResponse(event_stream(), media_type=NDJSON_MEDIA_TYPE)
