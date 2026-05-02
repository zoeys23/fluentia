"""Create MongoDB Atlas collections, indexes, and search indexes.

Run once after configuring MONGODB_URI:

    cd backend && python -m db.indexes

Search indexes take ~1-2 minutes to become queryable on Atlas after creation.
Requires MongoDB 8.0+ for $rankFusion.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from db.client import get_db, aclose
from db.embeddings import EMBEDDING_DIMENSIONS


async def create_indexes():
    db = await get_db()

    existing = set(await db.list_collection_names())
    for name in ["users", "sessions", "memories", "memories_archive"]:
        if name not in existing:
            await db.create_collection(name)
            print(f"{name}: collection created")

    # --- users ---
    await db.users.create_index("user_id", unique=True)
    print("users: user_id unique index ready")

    # --- sessions ---
    await db.sessions.create_index("session_id", unique=True)
    await db.sessions.create_index("user_id")
    await db.sessions.create_index(
        "created_at", expireAfterSeconds=2592000  # 30 days TTL
    )
    print("sessions: session_id unique + user_id + TTL indexes ready")

    # --- memories ---
    await db.memories.create_index(
        [("user_id", 1), ("tenant_id", 1), ("memory_type", 1)],
        unique=True,
        name="memories_slot_unique",
    )
    print("memories: (user_id, tenant_id, memory_type) unique index ready")

    # --- memories_archive ---
    await db.memories_archive.create_index(
        [("user_id", 1), ("tenant_id", 1), ("memory_type", 1)],
        name="archive_user_type",
    )
    await db.memories_archive.create_index("archived_at")
    print("memories_archive: user+type and archived_at indexes ready")

    # --- Search indexes (vector + text) ---
    vector_index_def = {
        "name": "memories_embedding_index",
        "type": "vectorSearch",
        "definition": {
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": EMBEDDING_DIMENSIONS,
                    "similarity": "cosine",
                },
                {"type": "filter", "path": "user_id"},
                {"type": "filter", "path": "tenant_id"},
            ],
        },
    }

    text_index_def = {
        "name": "memories_text_index",
        "type": "search",
        "definition": {
            "mappings": {
                "dynamic": False,
                "fields": {
                    "memory_type": {"type": "string", "analyzer": "lucene.standard"},
                    "content": {"type": "string", "analyzer": "lucene.standard"},
                    "user_id": {"type": "token"},
                    "tenant_id": {"type": "token"},
                },
            },
        },
    }

    for index_def in [vector_index_def, text_index_def]:
        try:
            await db.memories.create_search_index(index_def)
            print(f"memories: {index_def['name']} search index created")
        except Exception as e:
            msg = str(e).lower()
            if "already exists" in msg or "duplicate" in msg:
                print(f"memories: {index_def['name']} already exists")
            else:
                raise

    print("\nDone. Search indexes need ~1-2 minutes to sync on Atlas.")


async def main():
    try:
        await create_indexes()
    finally:
        await aclose()


if __name__ == "__main__":
    asyncio.run(main())
