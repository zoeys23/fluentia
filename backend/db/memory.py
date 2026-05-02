"""Long-term memory tools for Fluencia.

Adapted from mongodb-hacker-starter/agent-py/src/tools/memory.py.
Each function takes an AsyncDatabase plus user_id. Memories are stored as
slots keyed by (user_id, tenant_id, memory_type) so writing the same label
twice replaces the previous value. Retrieval combines $vectorSearch and
$search via $rankFusion (requires MongoDB 8.0+).
"""

from datetime import datetime, timezone

from pymongo.asynchronous.database import AsyncDatabase

from db.embeddings import embed_text

TENANT_ID = "fluencia"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _scope(user_id: str) -> dict:
    return {"user_id": user_id, "tenant_id": TENANT_ID}


async def remember(
    db: AsyncDatabase,
    user_id: str,
    memory_type: str,
    content: str,
) -> str:
    """Store or replace the value under (user_id, memory_type)."""
    embedding = await embed_text(
        f"{memory_type}: {content}", input_type="document"
    )
    now = _now()
    await db.memories.update_one(
        {**_scope(user_id), "memory_type": memory_type},
        {
            "$set": {
                "content": content,
                "embedding": embedding,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return f"Remembered ({memory_type}): {content}"


async def recall(
    db: AsyncDatabase, user_id: str, memory_type: str
) -> str:
    """Return the value stored under memory_type, or a 'no memory' message."""
    memory = await db.memories.find_one(
        {**_scope(user_id), "memory_type": memory_type},
    )
    return memory["content"] if memory else "No memory found."


async def forget(
    db: AsyncDatabase, user_id: str, memory_type: str
) -> str:
    """Delete the value stored under memory_type."""
    result = await db.memories.delete_one(
        {**_scope(user_id), "memory_type": memory_type},
    )
    if result.deleted_count == 0:
        return "No memory to forget."
    return "Memory forgotten."


async def search_memory(
    db: AsyncDatabase,
    user_id: str,
    query: str,
    limit: int = 5,
) -> list[dict]:
    """Hybrid vector + text search over the user's memories.

    Uses $rankFusion (MongoDB 8.0+) to combine cosine similarity with
    lexical fuzzy matching on memory_type and content.
    """
    query_embedding = await embed_text(query, input_type="query")
    scope = _scope(user_id)
    pipeline = [
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorSearch": [
                            {
                                "$vectorSearch": {
                                    "index": "memories_embedding_index",
                                    "path": "embedding",
                                    "queryVector": query_embedding,
                                    "numCandidates": 100,
                                    "limit": 30,
                                    "filter": scope,
                                }
                            }
                        ],
                        "textSearch": [
                            {
                                "$search": {
                                    "index": "memories_text_index",
                                    "compound": {
                                        "should": [
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": "memory_type",
                                                    "fuzzy": {},
                                                }
                                            },
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": "content",
                                                    "fuzzy": {},
                                                }
                                            },
                                        ]
                                    },
                                }
                            },
                            {"$match": scope},
                            {"$limit": 30},
                        ],
                    }
                },
                "combination": {
                    "weights": {"vectorSearch": 0.7, "textSearch": 0.3}
                },
            }
        },
        {"$limit": limit},
        {"$project": {"_id": 0, "memory_type": 1, "content": 1}},
    ]
    cursor = await db.memories.aggregate(pipeline)
    return await cursor.to_list(length=limit)


async def list_memories(
    db: AsyncDatabase, user_id: str
) -> list[dict]:
    """Return every memory slot for the user, newest first."""
    cursor = db.memories.find(
        _scope(user_id),
        projection={"_id": 0, "memory_type": 1, "content": 1, "updated_at": 1},
        sort=[("updated_at", -1)],
    )
    return await cursor.to_list(length=None)
