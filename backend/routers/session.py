import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from schemas import UtteranceIn
from services import plan_agent, summary_agent
from services.reflection import reflect
from services.compaction import run_compaction
from settings import GEMINI_API_KEY
from db import sessions

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/sessions/{user_id}")
async def list_sessions(user_id: str):
    """Return all sessions for a user (most recent first)."""
    docs = await sessions.list_by_user(user_id)
    result = []
    for doc in docs:
        summary = doc.get("summary")
        topic = "Practice Session"
        duration_min = 0
        status = "completed"
        if summary:
            meta = summary.get("session_meta", {})
            topic = meta.get("day_title", topic)
        created_at = doc.get("created_at")
        last_utterance = doc.get("utterances", [None])[-1] if doc.get("utterances") else None
        if created_at and last_utterance:
            try:
                end_ts = datetime.fromisoformat(last_utterance["timestamp"])
                start_ts = created_at if isinstance(created_at, datetime) else datetime.fromisoformat(str(created_at))
                duration_min = max(1, int((end_ts - start_ts).total_seconds() / 60))
            except (KeyError, ValueError, TypeError):
                pass
        if not summary:
            status = "in-progress"
        result.append({
            "id": doc["session_id"],
            "topic": topic,
            "created_at": str(created_at) if created_at else "",
            "duration_min": duration_min,
            "status": status,
        })
    return result


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

    # Compaction: graduate grasped phrases, build weekly digest on day 7
    try:
        await run_compaction(user_id=session_id, week=week, day=day)
    except Exception as e:
        logger.error(f"Compaction failed for {session_id}: {e}")

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
