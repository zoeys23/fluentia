"""Memory context injection for live tutor sessions.

Queries MongoDB for the user's long-term memories and formats them into a
system-prompt block that the tutor sees at session start.

Uses tiered priority to keep the prompt concise:
  Tier 1 (always included): practice_focus — what to drill vs. what to skip
  Tier 2 (high priority):   new vocabulary (seen 1-2x) — actively being learnt
  Tier 3 (medium priority): recurring struggles + topic interests
  Tier 4 (low priority):    weekly digests — compressed history
  Tier 5 (omitted):         grasped vocabulary (3x+) lives in archive only
"""

import logging

from db.client import get_db
from db.memory import list_memories, search_memory, TENANT_ID

logger = logging.getLogger(__name__)

# Max memory lines in the system prompt
MAX_MEMORY_LINES = 12

# Priority order for memory types (lower = higher priority)
_TIER_ORDER = {
    "practice_focus": 0,
    "vocabulary_mastered": 1,
    "recurring_struggle": 2,
    "topic_interest": 3,
    "weekly_digest": 4,
    "session_note": 5,
}


def _tier_key(memory: dict) -> tuple[int, str]:
    mtype = memory["memory_type"]
    prefix = mtype.split(":", 1)[0] if ":" in mtype else mtype
    return (_TIER_ORDER.get(prefix, 99), mtype)


async def build_memory_context(user_id: str) -> str:
    """Return a prioritised memory block for the tutor system prompt.

    Fetches all active memory slots, sorts by tier priority, and caps
    output to MAX_MEMORY_LINES to prevent prompt bloat.
    """
    try:
        db = await get_db()
        memories = await list_memories(db, user_id)
    except Exception as e:
        logger.warning(f"Memory retrieval failed for {user_id}: {e}")
        return ""

    if not memories:
        return ""

    # Sort by priority tier, then recency (list_memories returns newest-first)
    memories.sort(key=_tier_key)

    lines = []
    for m in memories[:MAX_MEMORY_LINES]:
        mtype = m["memory_type"]
        content = m["content"]
        prefix = mtype.split(":", 1)[0] if ":" in mtype else mtype
        lines.append(f"- [{prefix}] {content}")

    return "## What I know about you\n" + "\n".join(lines)
