# Fluencia Backend API

**Base URL:** `http://localhost:8000`  
**Frontend env var:** `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`  
**Interactive docs:** `http://localhost:8000/docs` (FastAPI auto-generated)

All REST endpoints return JSON. The WebSocket carries binary audio + JSON events.

---

## session_id

Every user gets a `session_id` — a UUID generated client-side on first load and persisted in `localStorage`. It is the single key that ties onboarding, plan, voice sessions, and summaries together.

```ts
const sessionId = localStorage.getItem("session_id") ?? crypto.randomUUID();
localStorage.setItem("session_id", sessionId);
```

Pass it to every API call and WebSocket connection.

---

## REST Endpoints

### 1. Onboarding chat

**`POST /api/onboarding/{session_id}/message`**

One conversational turn. Call this repeatedly until `plan_ready` is `true` (~4–6 turns). The backend holds the full conversation history server-side — you only send the latest user message each time.

**Request body:**
```json
{
  "message": "I want to learn Spanish for a trip to Madrid"
}
```

**Response while gathering info (`plan_ready: false`):**
```json
{
  "reply": "That's exciting! What level would you say you're at right now?",
  "plan_ready": false,
  "plan": null
}
```

**Response when plan is ready (`plan_ready: true`):**
```json
{
  "reply": "Here's your 2-week plan — take a look!",
  "plan_ready": true,
  "plan": { ... }  // full LearningPlan object — see schema below
}
```

**UI behaviour:**
- Display `reply` as a chat bubble from the tutor
- When `plan_ready` is `true`: stop the chat loop, save the plan, navigate to the Plan page

---

### 2. Get plan

**`GET /api/plan/{session_id}`**

Fetch the current learning plan for a session. Use on Plan page load.

**Response:**
```json
{
  "plan": { ... }  // LearningPlan or null if onboarding not complete
}
```

---

### 3. Suggest topic

**`POST /api/plan/{session_id}/suggest`**

User asks to add or adjust a topic. Returns the full updated plan.

**Request body:**
```json
{ "suggestion": "I want to practise ordering food at a restaurant" }
```

**Response:** Full `LearningPlan` object (updated in-place).

---

### 4. End session & generate summary

**`POST /api/session/{session_id}/end?week=1&day=3`**

Call this when the user ends a voice session. Reads the transcript captured during the WebSocket session, runs Gemini analysis, and returns a structured summary.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `week` | int | 1 | Which week of the plan (1 or 2) |
| `day`  | int | 1 | Which day of the week (1–7) |

Pass the same `week` and `day` values used to open the WebSocket.

**Response:** `SessionSummary` object — see schema below.

---

### 5. Apply recommendations to plan

**`POST /api/session/{session_id}/apply-recommendations`**

Call after the user reviews their summary and taps "Update my plan". Reads the `plan_recommendation` from the last summary and rewrites the plan: inserts reinforcement days, compresses mastered topics, adds newly discovered topics.

**Response:** Updated `LearningPlan` object.

**UI behaviour:** Show a "Updating your plan..." loading state, then refresh the Plan page with the returned plan.

---

### 6. Export session

**`GET /api/session/{session_id}/export`**

Returns the full session data for export (Notion, clipboard, etc.).

**Response:**
```json
{
  "session_id": "abc-123",
  "created_at": "2026-04-11T10:00:00",
  "utterances": [
    { "speaker": "user", "text": "Fui al mercado", "timestamp": "..." },
    { "speaker": "tutor", "text": "¡Muy bien! ¿Y qué compraste?", "timestamp": "..." }
  ],
  "plan": { ... },
  "summary": { ... }
}
```

---

## WebSocket — Voice Session

**`WS /ws/{session_id}?week=1&day=3`**

Opens a real-time bidirectional voice session with the Gemini Live API. The backend proxies all audio through Gemini and injects the day's `session_brief` as the tutor's system prompt.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `week` | int | 1 | Week of the plan being practised |
| `day`  | int | 1 | Day of the week being practised |

### Sending to backend

| Data type | Format | Purpose |
|-----------|--------|---------|
| `ArrayBuffer` | Raw PCM Int16, 16kHz | Microphone audio chunks |
| `JSON string` | `{"type":"image","mime_type":"image/jpeg","data":"<base64>"}` | Camera/screen frame (optional) |
| `JSON string` | `{"text":"..."}` | Text message (optional fallback) |

### Receiving from backend

| Data type | Format | Purpose |
|-----------|--------|---------|
| `ArrayBuffer` | Raw PCM Int16, 24kHz | Tutor audio to play back |
| `JSON` | `{"type":"user","text":"..."}` | User speech transcription |
| `JSON` | `{"type":"gemini","text":"..."}` | Tutor speech transcription |
| `JSON` | `{"type":"turn_complete"}` | Tutor finished speaking |
| `JSON` | `{"type":"interrupted"}` | User interrupted the tutor |
| `JSON` | `{"type":"error","error":"..."}` | Session-level error |

### Transcript capture

Every `type: "user"` and `type: "gemini"` event is automatically saved to the session store. When you call `/end` after closing the WebSocket, those utterances are what gets summarised.

---

## Data Schemas

### LearningPlan

```ts
interface LearningPlan {
  language: string;        // "Spanish"
  dialect: string;         // "Castilian Spanish"
  dialect_code: string;    // BCP 47: "es-ES"
  tutor_name: string;      // "Fluencia"
  level: "beginner" | "intermediate" | "advanced";
  goal: string;            // "Survive a 2-week trip to Madrid"
  summary: string;         // 2–3 sentence overview of the plan arc
  weeks: PlanWeek[];       // always 2 weeks
}

interface PlanWeek {
  week: number;            // 1 or 2
  theme: string;           // "Survival Phrases & First Conversations"
  days: PlanDay[];         // always 7 days
}

interface PlanDay {
  day: number;             // 1–7
  title: string;           // "Greetings & Introductions"
  topics: string[];        // ["Hola / Buenos días", "¿Cómo te llamas?", "Numbers 1–10"]
  session_brief: string;   // ~150 word brief injected into the live tutor's system prompt
}
```

### SessionSummary

```ts
interface SessionSummary {
  // Metadata
  session_meta: {
    week: number;
    day: number;
    day_title: string;
    planned_topics: string[];
  };

  // Section A: user-facing (display on summary screen, include in export)
  tutor_note: string;        // personal note from the tutor, max 150 words
  key_phrases: KeyPhrase[];  // 3–8 phrases from the session

  // Section B: coaching analysis (use for plan adaptation)
  performance: SessionPerformance;
  plan_recommendation: PlanRecommendation;
}

interface KeyPhrase {
  target: string;    // phrase in target language: "sin embargo"
  native: string;    // English translation: "however / nevertheless"
  tag: "first_use" | "dialect_specific" | "improving";
  context: string;   // "Used naturally when disagreeing with Fluencia's suggestion"
}

interface SessionPerformance {
  strengths: string[];       // ["Correctly used subjunctive after 'quiero que'"]
  struggles: string[];       // ["Hesitated on past tense of irregular verbs"]
  fluency_rating: number;    // 1–5
  confidence_rating: number; // 1–5
}

interface PlanRecommendation {
  ready_for_next: boolean;   // false = repeat or reinforce today before advancing
  reinforce: string[];       // topics needing another session
  accelerate: string[];      // topics to compress in future days
  adjust_days: DayAdjustment[];
  new_topics_discovered: { name: string; reason: string }[];
}

interface DayAdjustment {
  week: number;
  day: number;
  action: "reinforce" | "replace" | "add_drill";
  reason: string;
}
```

---

## End-to-End Workflows

### First visit: Onboarding → Plan

```
1. Generate session_id = crypto.randomUUID(), store in localStorage

2. Loop: POST /api/onboarding/message
   { session_id, message: "<user input>" }
   → display reply as tutor chat bubble
   → repeat until plan_ready: true

3. When plan_ready:
   → save plan to local state
   → navigate to /plan

4. On /plan load: GET /api/plan/{session_id}
   → render weeks, days, themes
```

### Return visit: straight to plan

```
1. Read session_id from localStorage
2. GET /api/plan/{session_id}
   → if plan: render Plan page
   → if null: redirect to onboarding
```

### Starting a voice session

```
1. User taps a day on the Plan page (e.g. Week 1, Day 3)
   → store week=1, day=3 in component state

2. Open WebSocket:
   new WebSocket(`ws://localhost:8000/ws/${sessionId}?week=1&day=3`)
   ws.binaryType = "arraybuffer"

3. On ws.open:
   → start mic capture (MediaHandler.startAudio)
   → on each audio chunk: ws.send(pcmInt16ArrayBuffer)

4. On ws.message:
   → if ArrayBuffer: play audio (MediaHandler.playAudio)
   → if JSON type "user":   append user bubble to transcript UI
   → if JSON type "gemini": append tutor bubble to transcript UI
   → if JSON type "interrupted": stop audio playback, clear pending bubbles
   → if JSON type "turn_complete": no-op (UI already updated incrementally)

5. User ends session:
   → ws.close()
   → MediaHandler.stopAudio()
```

### Ending a session and showing summary

```
6. POST /api/session/{session_id}/end?week=1&day=3
   → show loading: "Fluencia is writing your summary..."
   → on response: navigate to /summary

7. On /summary:
   → display tutor_note
   → display key_phrases list
   → display performance ratings (optional — internal data, show tastefully)
   → show "Update my plan" button

8. User taps "Update my plan":
   POST /api/session/{session_id}/apply-recommendations
   → loading: "Updating your plan..."
   → on response (updated LearningPlan): update local plan state
   → navigate to /plan
```

### Export to Notion / clipboard

```
9. User taps "Export notes":
   GET /api/session/{session_id}/export
   → format utterances + key_phrases + tutor_note as markdown
   → copy to clipboard or POST to Notion API
```

---

## Frontend Files

The following files in `frontend/src/lib/` are ready to import:

| File | Purpose |
|------|---------|
| `lib/api.ts` | Typed `fetch` wrappers for all 7 REST endpoints |
| `lib/gemini-ws.ts` | `GeminiWsClient` class — WebSocket connection, `sendAudio()`, `sendText()`, `sendImage()` |
| `lib/media-handler.ts` | `MediaHandler` class — mic capture (PCM 16kHz), audio playback (PCM 24kHz) |
| `public/pcm-processor.js` | AudioWorklet (served as static file, loaded by MediaHandler) |

**Usage example:**

```ts
import { GeminiWsClient } from "@/lib/gemini-ws";
import { MediaHandler } from "@/lib/media-handler";
import { endSession, applyRecommendations } from "@/lib/api";

const media = new MediaHandler();
const ws = new GeminiWsClient({
  sessionId,
  week: 1,
  day: 3,
  onAudio: (buf) => media.playAudio(buf),
  onEvent: (event) => {
    if (event.type === "user")   appendBubble("user", event.text);
    if (event.type === "gemini") appendBubble("tutor", event.text);
    if (event.type === "interrupted") media.stopAudioPlayback();
  },
});

await media.initializeAudio();
ws.connect();
await media.startAudio((chunk) => ws.sendAudio(chunk));
```

---

## Running Locally

```bash
# Backend
cd backend
cp .env.example .env        # add GEMINI_API_KEY
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
uv run main.py               # → http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev                  # → http://localhost:3000
```

Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` in `frontend/.env.local`.
