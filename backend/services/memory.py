"""Memory context injection for live tutor sessions.

Queries MongoDB for the user's long-term memories and formats them into a
system-prompt block that the tutor sees at session start.
"""

import logging

from db.client import get_db
from db.memory import list_memories, search_memory, TENANT_ID

logger = logging.getLogger(__name__)


async def build_memory_context(user_id: str) -> str:
    """Return a memory block to inject into the tutor system prompt.

    Fetches all stored memory slots for the user (capped at 15) and formats
    them as a readable block the LLM can reference during conversation.
    """
    try:
        db = await get_db()
        memories = await list_memories(db, user_id)
    except Exception as e:
        logger.warning(f"Memory retrieval failed for {user_id}: {e}")
        return ""

    if not memories:
        return ""

    lines = []
    for m in memories[:15]:
        mtype = m["memory_type"]
        content = m["content"]
        # Clean up prefixed types for readability
        if ":" in mtype:
            mtype = mtype.split(":", 1)[0]
        lines.append(f"- {mtype}: {content}")

    return "## What I know about you\n" + "\n".join(lines)
