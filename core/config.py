import json
import os

from pathlib import Path


CORE_DIR = Path(__file__).resolve().parent
ROOT_DIR = CORE_DIR.parent
DATA_DIR = ROOT_DIR / "data"
KNOWLEDGE_DIR = DATA_DIR / "knowledge"
SAMPLE_DOCS_DIR = DATA_DIR / "sample_docs"


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
SESSION_ID = "SESSION"

MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "local").strip().lower()

LOCAL_API_BASE = os.getenv("API_BASE", "http://127.0.0.1:18001/v1")
LOCAL_MODEL_PATH = os.getenv("MODEL_PATH", "openai//models/gemma-4-26b-a4b-it")
LOCAL_MODEL_API_KEY = os.getenv("MODEL_API_KEY", "null")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini/gemini-2.5-flash")
GEMINI_API_KEY = (
    os.getenv("GOOGLE_GEMINI_API_KEY")
    or os.getenv("GOOGLE_GEMINI")
    or os.getenv("GEMINI_API_KEY")
)

if MODEL_PROVIDER == "gemini":
    API_BASE = None
    MODEL_PATH = GEMINI_MODEL
    MODEL_API_KEY = GEMINI_API_KEY or ""
    MODEL_LABEL = "google-gemini-api"
    MODEL_KWARGS = {
        "model": MODEL_PATH,
        "api_key": MODEL_API_KEY,
    }
else:
    API_BASE = LOCAL_API_BASE
    MODEL_PATH = LOCAL_MODEL_PATH
    MODEL_API_KEY = LOCAL_MODEL_API_KEY
    MODEL_LABEL = "local-openai-compatible"
    MODEL_KWARGS = {
        "model": MODEL_PATH,
        "api_base": API_BASE,
        "api_key": MODEL_API_KEY,
    }

KNOWLEDGE_SPACE = json.loads(
    (KNOWLEDGE_DIR / "knowledge_space.json").read_text(encoding="utf-8")
)
