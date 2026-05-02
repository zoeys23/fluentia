from fastapi import APIRouter

from schemas import OnboardingMessage
from services import plan_agent
from settings import GEMINI_API_KEY

router = APIRouter()


@router.post("/api/onboarding/{session_id}/message")
async def onboarding_message(session_id: str, body: OnboardingMessage):
    """One turn of the onboarding conversation."""
    return await plan_agent.onboarding_turn(
        session_id=session_id,
        user_message=body.message,
        api_key=GEMINI_API_KEY,
    )
