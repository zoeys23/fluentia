from fastapi import APIRouter

from schemas import SuggestTopic
from services import plan_agent
from settings import GEMINI_API_KEY
from db import sessions

router = APIRouter()


@router.get("/api/plan/{session_id}")
async def get_plan(session_id: str):
    session = await sessions.get(session_id)
    if not session or not session.get("plan"):
        return {"plan": None}
    return {"plan": session["plan"]}


@router.post("/api/plan/{session_id}/suggest")
async def suggest_topic(session_id: str, body: SuggestTopic):
    return await plan_agent.suggest_topic(
        session_id=session_id,
        suggestion=body.suggestion,
        api_key=GEMINI_API_KEY,
    )
