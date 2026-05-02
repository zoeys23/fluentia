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

- **`user_id` (persistent) vs `session_id` (per-practice)** — localStorage stores a permanent UUID as user identity; each voice session creates a new unique session_id. The `sessions` collection stores both, enabling multi-session history per user
- **`tenant_id` = "fluencia"** hard-coded — simplifies all memory calls (no caller needs to pass it)
- **Reflection uses typed memory_type prefixes** (e.g., `vocabulary_mastered:hola`) — allows upsert-on-exact-match while keeping `search_memory` semantic
- **TTL 30 days on sessions** — auto-prunes old session documents; long-term memories persist indefinitely
- **`find_one_and_update` with `return_document=True`** for session get_or_create — atomic, idempotent

---

## Phase 2b — Learnings Deduplication & Practice Feedback Loop

**Date:** 2026-05-02

### Problem

The summary page blindly appended every session's `key_phrases` into `localStorage["learned_phrases"]`. Result: duplicate entries (same phrase from multiple sessions) caused React key collisions and a cluttered learnings page. No signal was fed back to the tutor about what the user already knew well.

### What changed

#### Frontend — Deduplication & "Enhanced" indicator

| File | Change |
|------|--------|
| `frontend/src/app/summary/page.tsx` | Replaced naive array concat with a `Map`-based merge. Same phrase → increment `times_seen` counter instead of adding a duplicate |
| `frontend/src/app/(tabs)/learnings/page.tsx` | Sort by `times_seen` desc. Phrases seen 2+ times show a green "Enhanced" badge. Markdown export annotates enhanced items |

**localStorage shape after change:**
```json
[
  { "phrase": "No te preocupes", "translation": "Don't worry", "topic": "Travel Basics", "times_seen": 3 },
  { "phrase": "improvisar", "translation": "to improvise", "topic": "Conversations", "times_seen": 1 }
]
```

#### Backend — Practice focus memories

| File | Change |
|------|--------|
| `backend/services/reflection.py` | Added `_get_vocab_count()` helper to parse existing seen-count from MongoDB. After categorising phrases as new vs enhanced, writes two guidance memory slots |

**New memory types written by reflection:**

| memory_type | When | Content tells tutor to... |
|---|---|---|
| `practice_focus:new_phrases` | Phrase seen for the first time | Create opportunities for the user to use these in conversation |
| `practice_focus:enhanced_phrases` | Phrase seen 2+ times | Stop drilling these; propose synonyms, alternative expressions, or more advanced variations instead |

### Updated data flow

```
Session end:
  → reflect()
    → for each key_phrase:
        _get_vocab_count() → recall existing memory → parse "(seen Nx)"
        remember(vocabulary_mastered:{phrase}, "phrase = translation (seen {N+1}x)")
    → categorise: new (count=1) vs enhanced (count≥2)
    → remember(practice_focus:new_phrases, "...")
    → remember(practice_focus:enhanced_phrases, "...")

Next session start:
  GET /api/token → build_memory_context()
    → tutor sees:
      "- practice_focus: Recently learnt phrases to practice more: hacer transbordo..."
      "- practice_focus: Already well-practiced (enhanced) phrases: No te preocupes. Do NOT drill these again..."
```

### Design decisions

- **Dedup in localStorage, not backend** — the learnings page is a client-side view; backend memories serve the tutor, not the UI
- **Two memory slots, not per-phrase** — keeps the tutor prompt concise; `practice_focus:new_phrases` is overwritten each session with the latest set
- **"Enhanced" not "Mastered"** — phrase appeared multiple times but we can't confirm true mastery; the label signals progress without overstating it
- **Tutor proposes alternatives** — prevents stale repetition while building related vocabulary around concepts the user already grasps

---

## Phase 2c — Memory Compaction & Tiered Prompt Budget

**Date:** 2026-05-02

### Problem

After many sessions, the `memories` collection accumulates dozens of slots per user: individual `vocabulary_mastered:*` entries, session notes, struggles, practice focus directives. All of these are dumped into the tutor system prompt via `build_memory_context()`, leading to prompt bloat that wastes tokens and dilutes the tutor's focus.

### Strategy (3 MongoDB patterns combined)

| Pattern | Application |
|---------|-------------|
| **Archive** | Phrases practiced 3+ times ("grasped") are moved from `memories` → `memories_archive` via batch insert + delete. Tutor never sees them again — they've served their purpose |
| **Computed** | End-of-week (day 7): all individual `session_note:w{N}d{D}` entries are consolidated into a single `weekly_digest:w{N}` memory. Granular notes are archived |
| **Tiered retrieval** | `build_memory_context` sorts by priority tier and caps at 12 lines. New material always beats old history |

### Priority tiers (prompt inclusion order)

| Tier | memory_type prefix | Rationale |
|------|-------------------|-----------|
| 0 (always) | `practice_focus` | Direct tutor behaviour instructions: what to drill, what to skip |
| 1 (high) | `vocabulary_mastered` (1-2x) | Actively being learnt — tutor should weave these into conversation |
| 2 (medium) | `recurring_struggle` | Patterns to watch for and gently correct |
| 3 (medium) | `topic_interest` | Organic interests to incorporate when natural |
| 4 (low) | `weekly_digest` | Compressed history for continuity — only included if budget allows |
| 5 (omitted by cap) | `session_note` | Replaced by digest; only exists between sessions within a week |
| — (archived) | `vocabulary_mastered` (3x+) | Graduated out; lives in `memories_archive` only |

### What was built

| File | Purpose |
|------|---------|
| `backend/services/compaction.py` | New. `graduate_grasped_phrases()` — archives 3x+ vocab. `compact_weekly_digest()` — merges session notes into one digest. `run_compaction()` — orchestrator called after reflection |
| `backend/services/memory.py` | Rewritten. Tiered sort with `_TIER_ORDER` map, capped at `MAX_MEMORY_LINES = 12` |
| `backend/routers/session.py` | Added `run_compaction()` call after `reflect()` in `/api/session/{id}/end` |
| `backend/db/indexes.py` | Added `memories_archive` collection creation + indexes (`user_id+tenant_id+memory_type`, `archived_at`) |

### Data flow

```
Session end (POST /api/session/{id}/end):
  → generate_summary()
  → reflect()              # writes vocabulary_mastered, practice_focus, etc.
  → run_compaction()
      → graduate_grasped_phrases()
          if vocabulary_mastered:{phrase} has (seen 3x+):
            insert into memories_archive (with archived_at timestamp)
            delete from memories
            delete needs_reinforcement:{phrase}
      → compact_weekly_digest() [only on day == 7]
          gather all session_note:w{N}d* entries
          build digest string: "Week N completed: D1 title; D2 title; ... Grasped: phrase1, phrase2"
          remember(weekly_digest:w{N}, digest)
          archive individual session_note entries

Next session start (GET /api/token):
  → build_memory_context()
      list_memories() → sort by tier → cap at 12 lines
      Tutor sees (example with 6 active memories):
        - [practice_focus] Recently learnt phrases to practice more: hacer transbordo...
        - [practice_focus] Already well-practiced phrases: No te preocupes. Propose alternatives...
        - [vocabulary_mastered] Me gusta = I like (seen 2x)
        - [recurring_struggle] Confuses ser/estar in location contexts
        - [topic_interest] Slang — user keeps asking about informal register
        - [weekly_digest] Week 1 completed: Greetings; Travel; Food. Grasped: hola, gracias, por favor
```

### MongoDB collections after compaction

```
memories (active — what the tutor sees):
  { user_id, memory_type: "practice_focus:new_phrases", content: "...", embedding, updated_at }
  { user_id, memory_type: "vocabulary_mastered:hacer transbordo", content: "... (seen 1x)", ... }
  { user_id, memory_type: "weekly_digest:w1", content: "Week 1 completed: ...", ... }

memories_archive (cold storage — queryable but never in prompt):
  { user_id, memory_type: "vocabulary_mastered:hola", content: "... (seen 5x)", archived_at }
  { user_id, memory_type: "session_note:w1d3", content: "Week 1 Day 3 — ...", archived_at }
```

### Key decisions

- **3x threshold for graduation** — conservative enough that the phrase was truly practiced across multiple sessions, not just mentioned once in three summaries
- **Cap at 12 lines, not token-count** — simpler to implement; each line averages ~30 tokens → ~360 tokens total, well within budget for a system prompt section
- **Archive, don't delete** — graduated vocabulary can still be queried for progress tracking, export, or "what did I learn?" features without polluting the active prompt
- **Weekly digest only on day 7** — avoids partial-week summaries; if user skips days, notes accumulate until the week actually ends
- **Compaction is non-blocking** — failures are logged but don't break the session end response

---

## Phase 2d — Multi-Session Identity & Learnings Dedup Fix

**Date:** 2026-05-02

### Problem

1. **Sessions page only showed the latest session.** The app used a single persistent UUID as both `user_id` and `session_id`. Every practice session wrote to the same MongoDB document — utterances accumulated, summaries were overwritten. The `list_by_user()` query correctly filtered by `user_id`, but only one document ever matched.

2. **Duplicate phrases in Learnings.** The `learned_phrases` localStorage array contained visually identical entries (e.g. "¿Qué tal?" appearing twice), likely due to Unicode normalization mismatches (composed vs decomposed accented characters).

### What changed

#### Identity split: `user_id` (persistent) vs `session_id` (per-practice)

| File | Change |
|------|--------|
| `frontend/src/lib/session.ts` | Added `getUserId()` (persistent localStorage UUID, with migration from legacy `session_id` key) and `createSessionId()` (new UUID per session). Kept `getSessionId()` as deprecated shim → `getUserId()` |
| `frontend/src/app/(tabs)/sessions/[id]/page.tsx` | Generates a new `sessionId` via `createSessionId()` on mount. Passes both `userId` and `sessionId` to the WS client. Stores `last_session_id` in localStorage for the summary page |
| `frontend/src/app/(tabs)/sessions/page.tsx` | Uses `getUserId()` for listing sessions |
| `frontend/src/app/summary/page.tsx` | Uses `getUserId()` for user identity; reads `last_session_id` for `applyRecommendations()` |
| `frontend/src/lib/gemini-ws.ts` | Added `userId` to config; passes `user_id` query param to `/api/token` |
| `backend/routers/token.py` | Accepts `user_id` query param; passes it to `get_or_create()`. Looks up plan from user's primary doc (where `session_id == user_id`) |
| `backend/routers/session.py` | `end_session` reads `user_id` from session document for reflection/compaction instead of assuming `session_id == user_id` |
| `backend/db/sessions.py` | `get_or_create()` and `append_utterance()` accept optional `user_id` param (defaults to `session_id` for backward compat) |
| `backend/services/plan_agent.py` | `apply_recommendations()` reads plan from user's primary doc, summary from practice session doc; writes updated plan back to user's primary doc |

#### Learnings deduplication fix

| File | Change |
|------|--------|
| `frontend/src/app/(tabs)/learnings/page.tsx` | Deduplicates on read using NFC normalization + trim. Self-heals localStorage if duplicates found |
| `frontend/src/app/summary/page.tsx` | Normalizes dedup key with `.normalize("NFC").trim()` before Map lookup |

### Data model (after change)

```
MongoDB sessions collection:
  doc1: { session_id: "abc-user-uuid", user_id: "abc-user-uuid", plan: {...}, utterances: [] }  ← user's primary doc (onboarding/plan)
  doc2: { session_id: "def-practice-1", user_id: "abc-user-uuid", utterances: [...], summary: {...} }  ← practice session 1
  doc3: { session_id: "ghi-practice-2", user_id: "abc-user-uuid", utterances: [...], summary: {...} }  ← practice session 2

list_by_user("abc-user-uuid") → returns doc2, doc3 (doc1 excluded by utterances.0 filter since it has no utterances)
```

### Key decisions

- **Backward compatible** — `getSessionId()` still works (delegates to `getUserId()`); old localStorage keys are migrated on first call
- **Plan stays on user's primary doc** — only one plan per user; practice sessions reference it but don't duplicate it
- **NFC normalization for dedup** — handles accented characters that may arrive in different Unicode forms from Gemini transcription
