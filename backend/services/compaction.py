"""Memory compaction service.

Applies three strategies to keep the tutor system prompt concise:

1. GRADUATION: Phrases practiced 3+ times are "grasped" — archived out of
   the active memory set so the tutor focuses on newer material.

2. PRIORITY TIERS: When building context, new phrases rank above old ones.
   Only the most relevant memories make it into the prompt (token budget).

3. WEEKLY DIGEST: At the end of each week, all granular session_note and
   vocabulary_mastered entries for that week are consolidated into a single
   compact summary. Individual slot memories are archived.

Uses MongoDB's Archive pattern ($merge → archive collection, then delete)
and Computed pattern (pre-aggregated weekly digest).
"""

import logging
import re
from datetime import datetime, timezone

from pymongo.asynchronous.database import AsyncDatabase

from db.client import get_db
from db.memory import remember, _scope, TENANT_ID
from db.embeddings import embed_text

logger = logging.getLogger(__name__)


def _parse_seen_count(content: str) -> int:
    match = re.search(r"\(seen (\d+)x\)", content)
    return int(match.group(1)) if match else 1


async def graduate_grasped_phrases(db: AsyncDatabase, user_id: str) -> list[str]:
    """Move vocabulary practiced 3+ times to archive. Returns graduated phrases."""
    scope = _scope(user_id)
    cursor = db.memories.find(
        {**scope, "memory_type": {"$regex": "^vocabulary_mastered:"}},
        projection={"_id": 1, "memory_type": 1, "content": 1, "updated_at": 1, "embedding": 1},
    )
    memories = await cursor.to_list(length=None)

    graduated = []
    ids_to_archive = []

    for mem in memories:
        count = _parse_seen_count(mem.get("content", ""))
        if count >= 3:
            graduated.append(mem["memory_type"].split(":", 1)[1])
            ids_to_archive.append(mem["_id"])

    if not ids_to_archive:
        return []

    # Archive: copy to memories_archive then delete from active
    to_archive = [m for m in memories if m["_id"] in set(ids_to_archive)]
    for doc in to_archive:
        doc["archived_at"] = datetime.now(tz=timezone.utc)
        doc.pop("_id")

    await db.memories_archive.insert_many(to_archive)
    await db.memories.delete_many({"_id": {"$in": ids_to_archive}})

    # Also remove any needs_reinforcement entries for graduated phrases
    for phrase in graduated:
        await db.memories.delete_one(
            {**scope, "memory_type": f"needs_reinforcement:{phrase}"}
        )

    logger.info(f"Graduated {len(graduated)} phrases for {user_id}: {graduated}")
    return graduated


async def compact_weekly_digest(
    db: AsyncDatabase, user_id: str, week: int
) -> None:
    """Consolidate a week's session notes into a single digest memory."""
    scope = _scope(user_id)

    # Gather all session_note entries for this week
    cursor = db.memories.find(
        {**scope, "memory_type": {"$regex": f"^session_note:w{week}d"}},
        projection={"_id": 1, "memory_type": 1, "content": 1},
    )
    notes = await cursor.to_list(length=None)

    if len(notes) < 2:
        return

    # Gather archived vocabulary for this week's digest context
    archive_cursor = db.memories_archive.find(
        {**scope, "memory_type": {"$regex": "^vocabulary_mastered:"}},
        projection={"content": 1},
        sort=[("archived_at", -1)],
        limit=20,
    )
    archived_vocab = await archive_cursor.to_list(length=None)

    # Build the digest
    note_lines = [n["content"] for n in notes]
    vocab_summary = ""
    if archived_vocab:
        phrases = [v["content"].split(" = ")[0] for v in archived_vocab[:10]]
        vocab_summary = f" Grasped vocabulary: {', '.join(phrases)}."

    digest_content = (
        f"Week {week} completed: {'; '.join(note_lines)}.{vocab_summary}"
    )

    # Write the digest as a single memory slot
    await remember(
        db, user_id,
        memory_type=f"weekly_digest:w{week}",
        content=digest_content,
    )

    # Archive individual session_note entries
    ids = [n["_id"] for n in notes]
    to_archive_docs = []
    for n in notes:
        doc = {k: v for k, v in n.items() if k != "_id"}
        doc["user_id"] = user_id
        doc["tenant_id"] = TENANT_ID
        doc["archived_at"] = datetime.now(tz=timezone.utc)
        to_archive_docs.append(doc)

    await db.memories_archive.insert_many(to_archive_docs)
    await db.memories.delete_many({"_id": {"$in": ids}})

    logger.info(f"Compacted week {week} digest for {user_id}: {len(notes)} notes → 1 digest")


async def run_compaction(user_id: str, week: int, day: int) -> dict:
    """Run all compaction steps. Called after reflection at session end."""
    db = await get_db()
    result = {"graduated": [], "weekly_digest": False}

    # Always graduate grasped phrases
    result["graduated"] = await graduate_grasped_phrases(db, user_id)

    # Compact weekly digest at end of week (day 7)
    if day == 7:
        await compact_weekly_digest(db, user_id, week)
        result["weekly_digest"] = True

    return result
