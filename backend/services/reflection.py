"""Reflection Node — post-session memory distillation.

Triggered after summary generation. Reads structured fields from the summary
and upserts them as long-term memory slots in the memories collection.
"""

import logging
import re

from db.client import get_db
from db.memory import remember, recall

logger = logging.getLogger(__name__)


async def _get_vocab_count(db, user_id: str, phrase: str) -> int:
    """Extract the current seen-count from an existing vocabulary memory."""
    content = await recall(db, user_id, f"vocabulary_mastered:{phrase}")
    if content == "No memory found.":
        return 0
    match = re.search(r"\(seen (\d+)x\)", content)
    return int(match.group(1)) if match else 1


async def reflect(session_id: str, user_id: str, summary: dict) -> None:
    """Distill session summary into long-term memory slots."""
    db = await get_db()

    # 1. Key phrases → vocabulary tracking with practice guidance
    new_phrases = []
    enhanced_phrases = []
    for phrase in summary.get("key_phrases", []):
        target = phrase.get("target", "")
        native = phrase.get("native", "")
        if target:
            existing = await _get_vocab_count(db, user_id, target)
            count = existing + 1
            content = f"{target} = {native} (seen {count}x)" if native else f"{target} (seen {count}x)"
            await remember(
                db, user_id,
                memory_type=f"vocabulary_mastered:{target}",
                content=content,
            )
            if count >= 2:
                enhanced_phrases.append(target)
            else:
                new_phrases.append(target)

    # Store practice guidance for next session
    if new_phrases:
        await remember(
            db, user_id,
            memory_type="practice_focus:new_phrases",
            content=(
                f"Recently learnt phrases to practice more: {', '.join(new_phrases)}. "
                "Create opportunities for the user to use these in conversation."
            ),
        )
    if enhanced_phrases:
        await remember(
            db, user_id,
            memory_type="practice_focus:enhanced_phrases",
            content=(
                f"Already well-practiced (enhanced) phrases: {', '.join(enhanced_phrases)}. "
                "Do NOT drill these again. Instead, propose synonyms, alternative expressions, "
                "or more advanced variations that convey similar meaning."
            ),
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
