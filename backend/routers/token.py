import datetime
import logging

from fastapi import APIRouter, Query
from google import genai
from google.genai import types

from services.memory import build_memory_context
from settings import GEMINI_API_KEY, VOICE_MODEL
from db import sessions

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_system_prompt(session: dict | None, week: int, day: int, memory: str = "") -> str:
    """Build the live tutor system prompt from the plan's session_brief for the given day."""
    base = (
        "You are a patient, encouraging language tutor. "
        "Never interrupt the user mid-thought — wait for a natural pause before responding. "
        "Keep your sentences short and clear. "
        "Gently correct mistakes by naturally modelling the correct form, not by lecturing. "
    )

    if not session or not session.get("plan"):
        return (
            base +
            "The user will speak in English only. "
            "Transcribe and respond in English. "
            "Focus on helping the user practice speaking naturally."
        )

    plan = session["plan"]
    tutor_name = plan.get("tutor_name", "your tutor")
    language = plan.get("language", "the target language")
    dialect = plan.get("dialect", "")
    level = plan.get("level", "")
    goal = plan.get("goal", "")

    identity = (
        f"You are {tutor_name}, a {dialect} language tutor. "
        f"The user is at {level} level. Their goal: {goal}. "
        f"The user will speak in English or {language} only. "
        f"Always transcribe their voice as English or {language} — never interpret it as any other language. "
        f"If their pronunciation is unclear, assume they are attempting {language} or English words. "
    )

    brief = None
    title = ""
    topics = ""
    for w in plan.get("weeks", []):
        if w.get("week") == week:
            for d in w.get("days", []):
                if d.get("day") == day:
                    brief = d.get("session_brief")
                    title = d.get("title", "")
                    topics = ", ".join(d.get("topics", []))
                    break

    if brief:
        day_context = (
            f"\n\nToday's session (Week {week}, Day {day}): {title}\n"
            f"Topics to cover: {topics}\n\n"
            f"Session guidance:\n{brief}"
        )
    else:
        day_context = f"\n\nFocus on {language} practice appropriate for {level} level."

    prompt = base + identity + day_context
    if memory:
        prompt += f"\n\n{memory}"
    return prompt


@router.get("/api/token")
async def get_token(
    session_id: str = Query(...),
    user_id: str = Query(default=""),
    week: int = Query(default=1, ge=1, le=2),
    day: int = Query(default=1, ge=1, le=7),
):
    """Return API key + session config for a direct browser → Gemini Live connection."""
    uid = user_id or session_id
    await sessions.get_or_create(session_id, user_id=uid)

    memory = await build_memory_context(uid)
    # Plan lives on the user's primary document (session_id == user_id)
    user_doc = await sessions.get(uid)
    session = await sessions.get(session_id)
    plan_source = session if session and session.get("plan") else user_doc
    system_prompt = _build_system_prompt(plan_source, week, day, memory)
    logger.debug(f"Token system prompt for {session_id} w{week}d{day}:\n{system_prompt}")

    return {
        "token": GEMINI_API_KEY,
        "auth_type": "key",
        "system_prompt": system_prompt,
        "model": f"models/{VOICE_MODEL}",
    }
