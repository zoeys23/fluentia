"""Reflection Node — post-session memory distillation.

Triggered after summary generation. Reads structured fields from the summary
and upserts them as long-term memory slots in the memories collection.
"""

import logging

from db.client import get_db
from db.memory import remember

logger = logging.getLogger(__name__)


async def reflect(session_id: str, user_id: str, summary: dict) -> None:
    """Distill session summary into long-term memory slots."""
    db = await get_db()

    # 1. Key phrases → vocabulary_mastered
    for phrase in summary.get("key_phrases", []):
        target = phrase.get("target", "")
        native = phrase.get("native", "")
        if target:
            await remember(
                db, user_id,
                memory_type=f"vocabulary_mastered:{target}",
                content=f"{target} = {native}" if native else target,
            )

    # 2. Performance struggles → recurring_struggle
    for struggle in summary.get("performance", {}).get("struggles", []):
        await remember(
            db, user_id,
            memory_type="recurring_struggle",
            content=struggle,
        )

    # 3. New topics discovered → topic_interest
    for topic in summary.get("plan_recommendation", {}).get("new_topics_discovered", []):
        name = topic.get("name", "")
        reason = topic.get("reason", "")
        if name:
            await remember(
                db, user_id,
                memory_type=f"topic_interest:{name}",
                content=f"{name} — {reason}" if reason else name,
            )

    # 4. Session note for "remember a specific past moment"
    meta = summary.get("session_meta", {})
    week = meta.get("week", "?")
    day = meta.get("day", "?")
    title = meta.get("day_title", "practice session")
    await remember(
        db, user_id,
        memory_type=f"session_note:w{week}d{day}",
        content=f"Week {week} Day {day} — {title}",
    )

    logger.info(f"Reflection complete for session {session_id}")
