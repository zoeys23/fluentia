import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from repo root (one level up from backend/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
PLAN_MODEL: str = os.getenv("PLAN_MODEL", "gemini-3.1-flash-lite-preview")
VOICE_MODEL: str = os.getenv("VOICE_MODEL", "gemini-3.1-flash-live-preview")

MONGODB_URI: str = os.getenv("MONGODB_URI", "")
MONGODB_DB: str = os.getenv("MONGODB_DB", "fluencia")
VOYAGE_API_KEY: str = os.getenv("VOYAGE_API_KEY", "")
