from __future__ import annotations

from pathlib import Path
import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from core.config import API_BASE, MODEL_LABEL, MODEL_PATH, MODEL_PROVIDER, USER_ID

from .runtime import create_session, get_session, list_messages, send_message, stream_message
from .schemas import ChatRequest, ChatResponse, CreateSessionResponse, SessionResponse


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "ui" / "dist"
FRONTEND_AVAILABLE = FRONTEND_DIR.exists()

app = FastAPI(title="Gemini Learning Graph")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_AVAILABLE:
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/", response_class=HTMLResponse)
async def index() -> FileResponse | HTMLResponse:
    if not FRONTEND_AVAILABLE:
        return HTMLResponse(
            """
            <html>
              <body style="font-family: sans-serif; padding: 2rem; line-height: 1.5;">
                <h1>Gemini Learning Graph API</h1>
                <p>The backend is running, but the frontend has not been built yet.</p>
                <p>Build it from <code>app/ui</code> with <code>npm install</code> and <code>npm run build</code>.</p>
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


@app.post("/api/session", response_model=CreateSessionResponse)
async def create_chat_session() -> CreateSessionResponse:
    session_id = await create_session()
    return CreateSessionResponse(session_id=session_id, user_id=USER_ID)


@app.get("/api/session/{session_id}", response_model=SessionResponse)
async def read_chat_session(session_id: str) -> SessionResponse:
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        session_id=session.id,
        user_id=session.user_id,
        active_topic_id=session.state.get("active_topic_id"),
        active_topic_title=session.state.get("active_topic_title"),
        active_topic=json.loads(session.state["active_topic_json"])
        if session.state.get("active_topic_json")
        else None,
        active_plan=json.loads(session.state["active_plan_json"])
        if session.state.get("active_plan_json")
        else None,
        messages=[
            {"role": message["role"], "text": message["text"]}
            for message in await list_messages(session_id)
        ],
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    session = await get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        result = await send_message(request.session_id, request.message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat request failed: {exc}") from exc

    return ChatResponse(
        session_id=request.session_id,
        reply=str(result["reply"]),
        active_topic_id=result.get("active_topic_id"),
        active_topic_title=result.get("active_topic_title"),
        active_topic=result.get("active_topic"),
        active_plan=result.get("active_plan"),
    )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    session = await get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_stream():
        try:
            async for payload in stream_message(request.session_id, request.message):
                yield json.dumps(payload, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps(
                {"type": "error", "message": f"Chat request failed: {exc}"},
                ensure_ascii=False,
            ) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
