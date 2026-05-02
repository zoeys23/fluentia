"""End-to-end test for the MongoDB memory layer.

Run: cd backend && source .venv/bin/activate && python test_memory.py

Requires MONGODB_URI and VOYAGE_API_KEY in .env.
Tests: connection → indexes → sessions CRUD → memory remember/recall/search →
       reflection → build_memory_context.
"""

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()


async def main():
    # Validate env
    uri = os.getenv("MONGODB_URI")
    voyage = os.getenv("VOYAGE_API_KEY")
    if not uri:
        print("SKIP: MONGODB_URI not set in .env")
        sys.exit(0)
    if not voyage:
        print("SKIP: VOYAGE_API_KEY not set in .env")
        sys.exit(0)

    from db.client import get_db, aclose
    from db.memory import remember, recall, forget, search_memory, list_memories
    from db.sessions import (
        get_or_create, get, append_utterance, set_plan, set_summary,
    )
    from services.memory import build_memory_context
    from services.reflection import reflect

    test_user_id = "test-user-memory-e2e"
    test_session_id = "test-session-memory-e2e"

    try:
        # 1. Test connection
        db = await get_db()
        result = await db.command("ping")
        assert result.get("ok") == 1.0, f"Ping failed: {result}"
        print("✓ MongoDB connection successful")

        # 2. Test session CRUD
        session = await get_or_create(test_session_id)
        assert session["session_id"] == test_session_id
        print("✓ Session get_or_create")

        await append_utterance(test_session_id, "user", "Hola, ¿cómo estás?")
        await append_utterance(test_session_id, "tutor", "¡Muy bien! ¿Y tú?")
        session = await get(test_session_id)
        assert len(session["utterances"]) == 2
        print("✓ Session append_utterance (2 utterances)")

        await set_plan(test_session_id, {"language": "Spanish", "weeks": []})
        session = await get(test_session_id)
        assert session["plan"]["language"] == "Spanish"
        print("✓ Session set_plan")

        # 3. Test memory remember/recall
        await remember(db, test_user_id, "goal", "Trip to Madrid in 3 months")
        value = await recall(db, test_user_id, "goal")
        assert value == "Trip to Madrid in 3 months"
        print("✓ Memory remember + recall")

        await remember(db, test_user_id, "level", "intermediate")
        memories = await list_memories(db, test_user_id)
        assert len(memories) >= 2
        print(f"✓ Memory list_memories ({len(memories)} slots)")

        # 4. Test hybrid search
        results = await search_memory(db, test_user_id, "what is the user's goal?", limit=3)
        print(f"✓ Memory search_memory returned {len(results)} results")
        if results:
            print(f"  Top result: {results[0]}")

        # 5. Test reflection
        mock_summary = {
            "session_meta": {"week": 1, "day": 1, "day_title": "Greetings"},
            "key_phrases": [
                {"target": "¿Cómo estás?", "native": "How are you?", "tag": "first_use"}
            ],
            "performance": {
                "strengths": ["Good pronunciation"],
                "struggles": ["Irregular verb conjugation"],
            },
            "plan_recommendation": {
                "new_topics_discovered": [
                    {"name": "Informal greetings", "reason": "User showed interest"}
                ]
            },
        }
        await reflect(test_session_id, test_user_id, mock_summary)
        memories_after = await list_memories(db, test_user_id)
        print(f"✓ Reflection complete ({len(memories_after)} total memory slots)")

        # 6. Test build_memory_context
        context = await build_memory_context(test_user_id)
        assert "## What I know about you" in context
        print("✓ build_memory_context produces system prompt block")
        print(f"  Preview:\n{context[:200]}")

        # 7. Test forget (cleanup)
        await forget(db, test_user_id, "goal")
        value = await recall(db, test_user_id, "goal")
        assert value == "No memory found."
        print("✓ Memory forget")

        print("\n═══ ALL TESTS PASSED ═══")

    finally:
        # Cleanup test data
        db = await get_db()
        await db.sessions.delete_one({"session_id": test_session_id})
        await db.memories.delete_many({"user_id": test_user_id})
        print("(test data cleaned up)")
        await aclose()


if __name__ == "__main__":
    asyncio.run(main())
