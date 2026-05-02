import logging

from fastapi import APIRouter, HTTPException, Query

from schemas import UtteranceIn
from services import plan_agent, summary_agent
from services.reflection import reflect
from settings import GEMINI_API_KEY
from db import sessions

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/api/session/{session_id}/utterances")
async def append_utterance(session_id: str, body: UtteranceIn):
    """Ingest a single transcription event from the frontend."""
    await sessions.append_utterance(session_id, body.speaker, body.text)
    return {"ok": True}


@router.post("/api/session/{session_id}/end")
async def end_session(
    session_id: str,
    week: int = Query(default=1, ge=1, le=2),
    day: int = Query(default=1, ge=1, le=7),
):
    """Trigger summary generation, run reflection, and return the summary."""
    result = await summary_agent.generate_summary(
        session_id=session_id,
        api_key=GEMINI_API_KEY,
        week=week,
        day=day,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # Reflection: distill summary into long-term memory slots
    try:
        await reflect(session_id=session_id, user_id=session_id, summary=result)
    except Exception as e:
        logger.error(f"Reflection failed for {session_id}: {e}")

    return result


@router.post("/api/session/{session_id}/apply-recommendations")
async def apply_recommendations(session_id: str):
    """Apply the session summary's plan_recommendation to update the plan in-place."""
    return await plan_agent.apply_recommendations(
        session_id=session_id,
        api_key=GEMINI_API_KEY,
    )


@router.get("/api/session/{session_id}/export")
async def export_session(session_id: str):
    """Return full transcript + summary as JSON for export."""
    session = await sessions.get(session_id)
    if not session:
        return {"error": "Session not found"}
    return {
        "session_id": session_id,
        "created_at": session.get("created_at", ""),
        "utterances": session.get("utterances", []),
        "plan": session.get("plan"),
        "summary": session.get("summary"),
    }
