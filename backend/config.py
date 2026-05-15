import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent


def _load_local_env() -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_local_env()


APP_NAME = "ASSISTANT"
USER_ID = "USER"

MODEL_PROVIDER = "gemini"
MODEL_LABEL = "google-gemini-api"
MODEL_PATH = os.getenv("GEMINI_MODEL", "gemini/gemma-4-31b-it")
MODEL_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_KEY = MODEL_API_KEY
API_BASE = os.getenv("GEMINI_API_BASE") or None
MODEL_KWARGS = {
    "model": MODEL_PATH,
    "api_key": MODEL_API_KEY,
}
if API_BASE:
    MODEL_KWARGS["api_base"] = API_BASE

EMPTY_KNOWLEDGE_SPACE = {
    "document": None,
    "topics": [],
    "topic_edges": [],
    "concepts": [],
}
