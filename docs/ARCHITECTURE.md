# Fluencia — Technical Architecture

## Overview

Fluencia is a real-time AI language tutor with persistent memory, built for the **MongoDB Agentic Evolution Hackathon**. The system connects a Next.js frontend to a Python backend that bridges the Gemini Live API for streaming voice, while MongoDB Atlas provides the evolutionary memory layer.

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                        │
│                                                                  │
│  /onboarding → /plan → /session → /summary → /plan              │
│                                                                  │
│  GeminiWsClient ──────── ephemeral token ──────▶ Gemini Live WS │
│  MediaHandler  (PCM 16kHz ↑ / PCM 24kHz ↓)                     │
│  api.ts        ──── REST ──────────────────────▶ FastAPI         │
│  localStorage  (session_id UUID = user_id stub)                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   FastAPI Backend  │
                    │   (Python / uv)    │
                    │                   │
                    │  /api/onboarding  │
                    │  /api/plan        │
                    │  /api/session     │
                    │  /api/token       │
                    └────────┬──────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
        Gemini API                    MongoDB Atlas
        (text tasks)                  (memory layer)
```

---

## Component Map

### Frontend — `frontend/`

| Layer | Tech | Purpose |
|-------|------|---------|
| Framework | Next.js 16 + React 19 | App router, tab layout, server components |
| Voice I/O | `MediaHandler` (`lib/media-handler.ts`) | PCM 16kHz mic capture via AudioWorklet; PCM 24kHz playback |
| VAD | Silero VAD WASM (COOP/COEP headers required) | Pause detection — distinguishes thinking silence from end-of-turn |
| Live voice link | `GeminiWsClient` (`lib/gemini-ws.ts`) | Direct browser → Gemini Live WebSocket using an ephemeral token minted by the backend |
| REST client | `lib/api.ts` | Typed wrappers for all 7 backend endpoints |
| UI components | shadcn/ui + Tailwind v4 | Chat bubbles, speed slider, VAD mic button, plan cards |
| State | React local state + `localStorage` | `session_id` (UUID) persisted in localStorage and doubled as `user_id`; plan + summary in component state |

**Key data flow — voice session:**

```
Mic → AudioWorklet (PCM 16kHz) → GeminiWsClient.sendAudio()
                                        │
                               WebSocket to Gemini Live
                                        │
                               Gemini returns PCM 24kHz audio
                               + inputTranscription (user text)
                               + outputTranscription (tutor text)
                                        │
                    ┌───────────────────┼──────────────────────┐
                    ▼                   ▼                       ▼
            MediaHandler.playAudio  Append to UI         POST /utterances
                                    (captions)           (background fire-and-forget)
```

---

### Backend — `backend/`

**Runtime:** Python 3.13 + FastAPI + uvicorn + `google-genai` SDK

#### Routers

| Router | Endpoint | Role |
|--------|----------|------|
| `onboarding.py` | `POST /api/onboarding/{id}/message` | Multi-turn freeform onboarding chat; returns `{reply, plan_ready, plan}` |
| `plan.py` | `GET/POST /api/plan/{id}` | Fetch and suggest-topic updates to the 2-week plan |
| `session.py` | `POST /api/session/{id}/utterances` | Ingest transcription events from the frontend |
| | `POST /api/session/{id}/end` | Trigger post-session summary generation |
| | `POST /api/session/{id}/apply-recommendations` | Rewrite the plan from the summary's `plan_recommendation` |
| | `GET /api/session/{id}/export` | Return full transcript + summary as JSON |
| `token.py` | `GET /api/token` | Mint a short-lived (30 min, 1-use) Gemini ephemeral token; build and attach the day's system prompt |

#### Services

| Service | File | Purpose |
|---------|------|---------|
| Plan agent | `services/plan_agent.py` | Onboarding turns, topic suggestions, recommendation application — all via `gemini-3.1-flash-lite-preview` (JSON-mode) |
| Summary agent | `services/summary_agent.py` | Post-session analysis → structured JSON (tutor note, key phrases, performance, plan recommendations) |
| Memory | `services/memory.py` | Builds the memory context block injected into the live tutor system prompt (**stub — MongoDB implementation target**) |

#### Session Store — `session_store.py`

**Current:** In-memory Python dict (`_store: dict[str, SessionData]`). Holds utterances, onboarding messages, plan, and summary per `session_id`.

**Hackathon target:** Replace with MongoDB `sessions` collection + TTL index for auto-pruning.

---

### AI Models

| Task | Model | Why |
|------|-------|-----|
| Onboarding chat, plan generation, summary | `gemini-3.1-flash-lite-preview` | JSON-mode, low latency, structured output |
| Live voice session | `gemini-3.1-flash-live-preview` | Real-time bidirectional audio streaming via Gemini Live WS API |

---

## Memory Architecture — Hackathon Focus

This is the core differentiator for the hackathon: an **evolutionary memory layer** that makes Fluencia remember users across sessions.

### Three-tier memory model

```
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas 8.0+                        │
│                                                              │
│  sessions          (short-term episodic — TTL 30 days)      │
│  ┌────────────────────────────────────────────────────┐     │
│  │ session_id, user_id, utterances[], summary, plan   │     │
│  │ created_at  ← TTL index auto-prunes stale data     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  memories          (long-term semantic — persistent)        │
│  ┌────────────────────────────────────────────────────┐     │
│  │ user_id, tenant_id, memory_type, content           │     │
│  │ embedding[]  ← 1024-dim Voyage AI vectors          │     │
│  │ updated_at                                         │     │
│  └────────────────────────────────────────────────────┘     │
│                    ↑ $vectorSearch + $rankFusion             │
└─────────────────────────────────────────────────────────────┘
```

### Short-term: `sessions` collection

- Stores raw session data (utterances, plan snapshot, summary) during and immediately after each session
- TTL index on `created_at` (`expireAfterSeconds: 2592000` = 30 days) auto-prunes stale records
- Replaces the current in-memory `session_store.py` dict
- `session_id` maps 1:1 to a document

### Long-term: `memories` collection

- Stores distilled facts as key-value slots keyed by `(user_id, memory_type)`
- Memory types: `vocabulary_mastered`, `recurring_struggle`, `goal`, `session_note`, `level`, `dialect_preference`, `topic_completed`
- Embeddings: Voyage AI `voyage-3.5-lite` (1024 dims) on `"<memory_type>: <content>"` for semantic findability
- Written by the **Reflection Node** after each session end (see below)

### Hybrid retrieval: `$rankFusion`

```
$vectorSearch  (weight 0.7)  cosine similarity on 1024-dim embedding
$textSearch    (weight 0.3)  fuzzy match on memory_type + content
```

Both branches pre-filtered by `user_id`. Results are merged via MongoDB 8.0 Reciprocal Rank Fusion and injected into the live tutor's system prompt via `services/memory.py`.

### Reflection Node (post-session)

Triggered after `POST /api/session/{id}/end` generates the summary. Runs a distillation pass that:

1. Reads `summary.key_phrases` → upserts into `memories` as `vocabulary_mastered` / `dialect_specific` slots
2. Reads `summary.performance.struggles` → upserts as `recurring_struggle` slots
3. Reads `summary.plan_recommendation.new_topics_discovered` → upserts as `topic_interest` slots
4. Writes a `session_note` slot: "Week 1 Day 3 — subjunctive in context" (used by the tutor's "remember a specific past moment" requirement)

### Memory injection at session start

`token.py` calls `services/memory.build_memory_context(user_id)` before minting the ephemeral token. The returned block is appended to the system prompt:

```
## What I know about you
- You've been working on subjunctive mood (Week 1, Day 3 - 2 days ago)
- You tend to hesitate on irregular past tense verbs
- You nailed ordering food vocabulary last session
```

This satisfies the PRD requirement: *"Fluencia references a specific past moment in ≥ 1 of every 3 sessions."*

---

## Data Schemas

### MongoDB Collections

**`sessions`** (short-term, TTL 30 days)
```json
{
  "_id": "ObjectId",
  "session_id": "uuid-string",
  "user_id": "string",
  "utterances": [
    { "speaker": "user|tutor", "text": "string", "timestamp": "ISO8601" }
  ],
  "plan": { "...LearningPlan..." },
  "summary": { "...SessionSummary..." },
  "created_at": "ISODate",
  "week": 1,
  "day": 3
}
```

**`memories`** (long-term, persistent)
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "tenant_id": "fluencia",
  "memory_type": "vocabulary_mastered | recurring_struggle | session_note | goal | level",
  "content": "string",
  "embedding": [1024 floats],
  "updated_at": "ISODate"
}
```

**`users`** (MongoDB-managed; `user_id` = `session_id` UUID from localStorage)
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "onboarding_complete": true,
  "current_week": 1,
  "current_day": 3,
  "streak_days": 5,
  "plan": { "...LearningPlan..." }
}
```

---

## API Surface

### REST (FastAPI backend)

```
POST  /api/onboarding/{session_id}/message      Onboarding chat turn
GET   /api/plan/{session_id}                    Fetch current plan
POST  /api/plan/{session_id}/suggest            Add/adjust topic
GET   /api/token?session_id=&week=&day=         Mint ephemeral Gemini token
POST  /api/session/{session_id}/utterances      Ingest transcription event
POST  /api/session/{session_id}/end             Generate session summary
POST  /api/session/{session_id}/apply-recommendations  Rewrite plan from summary
GET   /api/session/{session_id}/export          Full transcript + summary export
```

### Real-time (Gemini Live WebSocket)

**Connection path:** Browser → Gemini Live WS directly (not proxied through backend)

```
Browser                           Gemini Live WS
   │  ── ephemeral token ───────▶  │
   │  ── setup message ──────────▶  │  (model, system_prompt, VAD config)
   │  ── PCM 16kHz audio chunks ──▶  │
   │  ◀─ PCM 24kHz audio ──────────  │
   │  ◀─ inputTranscription ────────  │  (user speech → text)
   │  ◀─ outputTranscription ───────  │  (tutor speech → text)
   │  ◀─ turnComplete / interrupted ─  │
```

**Transcriptions** are forwarded to `POST /api/session/{id}/utterances` (fire-and-forget) for persistence.

---

## Deployment

### Local development

```
frontend/   → next dev         → http://localhost:3000
backend/    → uv run main.py   → http://localhost:8000
```

### Production (Hackathon)

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | Vercel | Next.js deployment; `NEXT_PUBLIC_BACKEND_URL` → EC2 |
| Backend | AWS EC2 | FastAPI behind nginx; Elastic IP for stable address |
| Database | MongoDB Atlas M10+ | 8.0+ required for `$rankFusion`; EC2 Elastic IP whitelisted in Network Access |
| CI/CD | GitHub Actions | Push to `main` → deploy to EC2 |

### Environment variables

**Backend `.env`**
```bash
GEMINI_API_KEY=...
PLAN_MODEL=gemini-3.1-flash-lite-preview
VOICE_MODEL=gemini-3.1-flash-live-preview
MONGODB_URI=mongodb+srv://...
MONGODB_DB=fluencia
VOYAGE_API_KEY=...
```

**Frontend `.env.local`**
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  # or https://your-ec2-domain
```

---

## Implementation Roadmap

### Phase 1 — Working (current state)

- [x] Onboarding multi-turn chat → 2-week plan generation
- [x] Ephemeral token minting with day-specific system prompt
- [x] Direct browser → Gemini Live WebSocket voice session
- [x] Real-time captions (inputTranscription / outputTranscription)
- [x] Utterance persistence to in-memory session store
- [x] Post-session summary generation (Gemini JSON mode)
- [x] Plan adaptation via `apply-recommendations`
- [x] Plan page, session screen, summary screen

### Phase 2 — MongoDB memory layer (hackathon target)

- [ ] Provision MongoDB Atlas 8.0+ cluster; run `db/indexes.ts` to create collections and vector/search indexes
- [ ] Replace `session_store.py` dict with MongoDB `sessions` collection + TTL index
- [ ] Implement Reflection Node in `services/memory.py`: post-session distillation → upsert into `memories`
- [ ] Implement `build_memory_context()`: hybrid `$rankFusion` search → formatted system prompt block
- [ ] Use `session_id` UUID (from `localStorage`) as `user_id` stub — no auth wall needed for the demo
- [ ] Add `VOYAGE_API_KEY` and `MONGODB_URI` to backend env; install `pymongo` + `voyageai`

### Phase 3 — Polish

- [ ] Notion export integration
- [ ] Streak and progress tracking persistence (MongoDB `users` collection)
- [ ] Speed slider preference persistence across sessions
- [ ] ElevenLabs TTS option for dialect-authentic voice (see `docs/REFERENCE.md`)

---

## Key Design Decisions

**Why direct browser → Gemini Live (not proxied)?**
Proxying audio through the backend adds ~100ms round-trip latency. The ephemeral token pattern (1-use, 30-min TTL, minted server-side) preserves API key security while keeping the hot audio path zero-hop.

**Why in-memory session store for now?**
The voice session is stateless from MongoDB's perspective — all audio processing happens in Gemini. Only the transcript (text) needs persistence, and it's small. The in-memory store is adequate for single-instance development; MongoDB replaces it in Phase 2 for multi-instance production and TTL-based pruning.

**Why `$rankFusion` over pure vector search?**
Short memory slots like `"name: Pavel"` or `"goal: trip to Madrid in 3 months"` are too short for embeddings alone to be reliable. The lexical branch catches exact memory_type matches that the vector branch would rank lower. Weighted fusion (0.7/0.3) keeps semantic recall dominant.

**Why Gemini for both planning and voice?**
Single provider simplifies auth (one API key, one ephemeral token flow). `gemini-3.1-flash-lite-preview` handles structured JSON tasks cheaply; `gemini-3.1-flash-live-preview` handles real-time audio. The system prompt injection pattern (`session_brief`) is the same for both.

**Why no Supabase auth for the hackathon?**
Supabase auth is invisible to judges and adds ~1 day of frontend/backend plumbing plus demo-day friction (magic link email delays). The frontend already persists a `session_id` UUID in `localStorage`; this doubles as a stable `user_id` for all MongoDB memory operations. Real auth can be layered on post-hackathon without touching the memory layer — `user_id` is just a string key.
