# Reference: mongodb-hacker-starter (agent-py)

This document summarises what to reuse from `agent-py/` in a new Python project,
focusing on two concerns: **MongoDB memory management** and **ElevenLabs TTS customisation**.

---

## 1. MongoDB Memory Management

### What it does

The `memories` collection stores per-user facts as key-value slots keyed by
`(user_id, tenant_id, memory_type)`. Writing the same label twice replaces the
previous value (upsert). Retrieval uses **hybrid search** — vector similarity
(Voyage AI embeddings) plus lexical fuzzy matching — merged via MongoDB 8.0's
`$rankFusion`.

### Files to copy

| File | What to take |
|------|-------------|
| `src/db/client.py` | Async MongoDB client singleton (`get_db`, `aclose`) |
| `src/tools/embeddings.py` | `embed_text` / `embed_texts` via Voyage AI |
| `src/tools/memory.py` | `remember`, `recall`, `forget`, `search_memory`, `list_memories` |
| `db/indexes.ts` (repo root) | Collection + index definitions (run once against your cluster) |

### Connection setup

Only one env var is needed:

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=your_db_name          # optional, defaults to livekit_mongo_starter
VOYAGE_API_KEY=your_voyage_key   # required for embeddings (free tier available)
```

Run once from repo root to create collections and vector/text indexes:

```bash
pnpm db:init   # creates collections + indexes
pnpm db:seed   # optional sample data
```

> **Requires MongoDB Atlas 8.0+** for `$rankFusion`. M10+ dedicated clusters
> run 8.0 by default. Check your cluster version before running `db:init` on
> shared tiers (M0/M2/M5).

### Memory API (from `src/tools/memory.py`)

```python
from db.client import get_db
from tools.memory import remember, recall, forget, search_memory, list_memories

db = await get_db()

# Store or replace a fact
await remember(db, user_id, tenant_id, "favorite_color", "blue")

# Exact label lookup
value = await recall(db, user_id, tenant_id, "favorite_color")

# Delete a slot
await forget(db, user_id, tenant_id, "favorite_color")

# Hybrid semantic + lexical search (returns [{memory_type, content}, ...])
results = await search_memory(db, user_id, tenant_id, "what colour does the user like?", limit=3)

# List all stored facts for a user, newest first
all_facts = await list_memories(db, user_id, tenant_id)
```

### How embeddings work

`src/tools/embeddings.py` calls Voyage AI (`voyage-3.5-lite`, 1024 dimensions).
The `remember` function embeds `"<memory_type>: <content>"` so short slots
(e.g. `name: Pavel`) remain semantically findable from natural-language queries.

### `$rankFusion` pipeline (inside `search_memory`)

Combines two branches with weighted Reciprocal Rank Fusion:

```
vectorSearch  (weight 0.7)  — cosine similarity on 1024-dim embedding
textSearch    (weight 0.3)  — fuzzy match on memory_type + content fields
```

Both branches are pre-filtered by `(user_id, tenant_id)` to scope results per user.

### Pre-loading context at session start

`preload_user()` in `agent.py` (line 272) upserts the user document and injects
their stored memories into the chat context before the agent's first reply.
Copy this pattern if your agent needs to "know" past facts from turn one.

---

## 2. ElevenLabs TTS — Customised Features

### Why `inference.TTS` is not enough

`livekit.agents.inference.TTS(model="elevenlabs/...")` routes through LiveKit's
cloud proxy. It uses a normalised interface that **does not expose** ElevenLabs-
specific parameters (stability, similarity_boost, style, emotion, etc.).

### Use the native plugin instead

**`pyproject.toml`:**
```toml
dependencies = [
    ...
    "livekit-plugins-elevenlabs>=0.1",
]
```

**`.env.local`:**
```bash
ELEVENLABS_API_KEY=sk_...
```

**`agent.py` — replace the `tts=` line:**
```python
from livekit.plugins import elevenlabs

tts=elevenlabs.TTS(
    voice_id="YOUR_VOICE_ID",       # from ElevenLabs dashboard
    model="eleven_turbo_v2_5",
    voice_settings=elevenlabs.VoiceSettings(
        stability=0.5,              # 0–1: lower = more expressive
        similarity_boost=0.8,       # 0–1: adherence to original voice
        style=0.3,                  # 0–1: style exaggeration
        use_speaker_boost=True,
    ),
)
```

### If you need features the plugin doesn't expose yet

The plugin wraps the ElevenLabs SDK but may lag behind new API features
(e.g. per-sentence emotion tags, voice design). To get 100% API access,
write a **custom TTS plugin** — LiveKit's plugin interface is a small
abstract class (`TTS` + `ChunkedStream`). Wrap the ElevenLabs Python SDK
directly inside it and you control every parameter.

Check what the installed plugin version exposes:
```bash
uv run python -c "from livekit.plugins import elevenlabs; help(elevenlabs.TTS)"
```

---

## 3. Minimal Integration Checklist

To pull only the MongoDB memory layer into a new Python project:

- [ ] Copy `src/db/client.py`, `src/tools/embeddings.py`, `src/tools/memory.py`
- [ ] Add `pymongo>=4.13` and `voyageai>=0.3.7` to your dependencies
- [ ] Set `MONGODB_URI` and `VOYAGE_API_KEY` in your env
- [ ] Run `pnpm db:init` from repo root once to provision indexes on your Atlas cluster
- [ ] Call `await get_db()` anywhere you need a database handle

To use ElevenLabs with full voice control:

- [ ] Add `livekit-plugins-elevenlabs` to dependencies
- [ ] Set `ELEVENLABS_API_KEY` in your env
- [ ] Replace `inference.TTS(...)` with `elevenlabs.TTS(voice_id=..., voice_settings=...)`
- [ ] Fall back to a custom plugin wrapper if you need features not yet in the plugin

---

## 4. Key File Locations in This Repo

```
mongodb-hacker-starter/
├── agent-py/
│   ├── src/
│   │   ├── agent.py              # Full agent — MongoAgent class, session config
│   │   ├── db/client.py          # MongoDB client singleton
│   │   └── tools/
│   │       ├── embeddings.py     # Voyage AI embed_text helper
│   │       └── memory.py         # remember/recall/forget/search/list
│   └── .env.example              # All required env vars
└── db/
    ├── indexes.ts                 # Collection + index creation (run once)
    └── seed.ts                    # Sample data loader
```
