"""MongoDB-backed session store — replaces the in-memory session_store.py dict.

Each session is a single document in the `sessions` collection, keyed by
session_id. TTL index on created_at auto-prunes after 30 days.
"""

from datetime import datetime, timezone
from typing import Optional

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from db.client import get_db


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


async def get_or_create(session_id: str) -> dict:
    """Upsert and return the session document."""
    db = await get_db()
    now = _now()
    result = await db.sessions.find_one_and_update(
        {"session_id": session_id},
        {
            "$setOnInsert": {
                "session_id": session_id,
                "user_id": session_id,
                "utterances": [],
                "onboarding_messages": [],
                "plan": None,
                "summary": None,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return result


async def get(session_id: str) -> Optional[dict]:
    """Fetch session document or None."""
    db = await get_db()
    return await db.sessions.find_one({"session_id": session_id})


async def append_utterance(session_id: str, speaker: str, text: str) -> None:
    """Push an utterance onto the session's utterances array."""
    db = await get_db()
    await db.sessions.update_one(
        {"session_id": session_id},
        {
            "$push": {
                "utterances": {
                    "speaker": speaker,
                    "text": text,
                    "timestamp": _now().isoformat(),
                }
            },
            "$setOnInsert": {
                "session_id": session_id,
                "user_id": session_id,
                "onboarding_messages": [],
                "plan": None,
                "summary": None,
                "created_at": _now(),
            },
        },
        upsert=True,
    )


async def set_plan(session_id: str, plan: dict) -> None:
    """Set or update the plan on the session document."""
    db = await get_db()
    await db.sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {"plan": plan},
            "$setOnInsert": {
                "session_id": session_id,
                "user_id": session_id,
                "utterances": [],
                "onboarding_messages": [],
                "summary": None,
                "created_at": _now(),
            },
        },
        upsert=True,
    )


async def set_summary(session_id: str, summary: dict) -> None:
    """Set or update the summary on the session document."""
    db = await get_db()
    await db.sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {"summary": summary},
            "$setOnInsert": {
                "session_id": session_id,
                "user_id": session_id,
                "utterances": [],
                "onboarding_messages": [],
                "plan": None,
                "created_at": _now(),
            },
        },
        upsert=True,
    )


async def append_onboarding_message(session_id: str, role: str, content: str) -> None:
    """Push a message onto the onboarding_messages array."""
    db = await get_db()
    await db.sessions.update_one(
        {"session_id": session_id},
        {
            "$push": {
                "onboarding_messages": {"role": role, "content": content}
            },
            "$setOnInsert": {
                "session_id": session_id,
                "user_id": session_id,
                "utterances": [],
                "plan": None,
                "summary": None,
                "created_at": _now(),
            },
        },
        upsert=True,
    )


async def list_by_user(user_id: str, limit: int = 50) -> list[dict]:
    """Return sessions for a user, most recent first."""
    db = await get_db()
    cursor = db.sessions.find(
        {"user_id": user_id, "utterances.0": {"$exists": True}},
        {
            "session_id": 1,
            "created_at": 1,
            "summary": 1,
            "utterances": {"$slice": -1},
            "_id": 0,
        },
    ).sort("created_at", -1).limit(limit)
    return await cursor.to_list()


async def get_onboarding_messages(session_id: str) -> list[dict]:
    """Return the onboarding_messages array for a session."""
    doc = await get(session_id)
    if not doc:
        return []
    return doc.get("onboarding_messages", [])
