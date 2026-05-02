# Build Log: MongoDB Memory Layer

**Date:** 2026-05-02
**Scope:** Phase 2 — Replace in-memory session store with MongoDB Atlas; implement long-term memory with hybrid retrieval.

---

## What was built

### 1. DB Layer (`backend/db/`)

| File | Source | Purpose |
|------|--------|---------|
| `client.py` | Adapted from `mongodb-hacker-starter` | Async MongoDB client singleton (`get_db`, `aclose`) |
| `embeddings.py` | Adapted from `mongodb-hacker-starter` | Voyage AI `voyage-3.5-lite` (1024-dim) embedding helper |
| `memory.py` | Adapted from `mongodb-hacker-starter` | `remember`, `recall`, `forget`, `search_memory`, `list_memories` — hard-coded `tenant_id = "fluencia"` |
| `sessions.py` | New | MongoDB-backed session store replacing the in-memory dict. Upsert-based CRUD with `$push` for utterances |
| `indexes.py` | New (Python port of starter's `db/indexes.ts`) | Creates collections + TTL index (30-day) + vector/text search indexes. Run: `python -m db.indexes` |

### 2. Services (`backend/services/`)

| File | What changed |
|------|-------------|
| `memory.py` | Rewrote stub → queries `list_memories()` and formats "## What I know about you" system prompt block |
| `reflection.py` | **New.** Post-session Reflection Node: distills `key_phrases` → `vocabulary_mastered`, `struggles` → `recurring_struggle`, `new_topics_discovered` → `topic_interest`, plus a `session_note` per session |
| `plan_agent.py` | Migrated from `session_store` → `db.sessions` (async MongoDB calls) |
| `summary_agent.py` | Migrated from `session_store` → `db.sessions` |

### 3. Routers (`backend/routers/`)

All four routers (`onboarding.py`, `plan.py`, `session.py`, `token.py`) updated to use `db.sessions` instead of the deleted `session_store.py`. `session.py` now calls `reflect()` after summary generation.

### 4. Infrastructure

| File | Change |
|------|--------|
| `requirements.txt` | Added `pymongo>=4.13`, `voyageai>=0.3.7`; removed `supabase` |
| `settings.py` | Added `MONGODB_URI`, `MONGODB_DB`, `VOYAGE_API_KEY`; removed Supabase vars |
| `.env.example` | Updated with MongoDB + Voyage keys |
| `main.py` | Added `lifespan` context manager calling `aclose()` on shutdown |

### 5. Deleted

- `backend/session_store.py` (in-memory dict — replaced by `db/sessions.py`)
- `backend/db/supabase.py` (stub — Supabase dropped for hackathon)

---

## How it works (data flow)

```
Session start:
  GET /api/token → build_memory_context(user_id) → list_memories() → format → system_prompt

During session:
  POST /api/session/{id}/utterances → db.sessions.append_utterance()

Session end:
  POST /api/session/{id}/end
    → summary_agent.generate_summary() → db.sessions.set_summary()
    → reflect(session_id, user_id, summary)
        → remember(vocabulary_mastered:phrase, ...)
        → remember(recurring_struggle, ...)
        → remember(topic_interest:name, ...)
        → remember(session_note:w1d3, ...)

Next session start:
  GET /api/token → build_memory_context(user_id)
    → "## What I know about you\n- vocabulary_mastered: ¿Cómo estás? = How are you?\n- ..."
```

---

## How to test

```bash
cd backend
source .venv/bin/activate

# 1. Set env vars in .env (MONGODB_URI, VOYAGE_API_KEY)

# 2. Create indexes (run once)
python -m db.indexes

# 3. Run e2e memory test
python test_memory.py

# 4. Start server
python main.py
```

---

## Key decisions

- **`session_id` = `user_id`** — no auth layer; localStorage UUID doubles as identity key
- **`tenant_id` = "fluencia"** hard-coded — simplifies all memory calls (no caller needs to pass it)
- **Reflection uses typed memory_type prefixes** (e.g., `vocabulary_mastered:hola`) — allows upsert-on-exact-match while keeping `search_memory` semantic
- **TTL 30 days on sessions** — auto-prunes old session documents; long-term memories persist indefinitely
- **`find_one_and_update` with `return_document=True`** for session get_or_create — atomic, idempotent
