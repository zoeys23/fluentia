# Design Specifications: Fluencia

## 1. Visual Tone

"Notebook, not dashboard." Warm but minimal — a relationship, not a productivity app.

- **Background:** Off-white or warm gray (e.g., `#F7F6F3` or `#FAF9F6`). Not pure `#ffffff`.
- **Text:** High contrast near-black (e.g., `#2C2C2C`) on warm backgrounds. WCAG 2.1 AA (4.5:1 min).
- **Accent color:** One. Warm, confident — terracotta, warm amber, or deep green. Not blue, not purple. Language-agnostic; don't tie to a flag color.
- **Typography:** Two typefaces max. Display/heading (expressive, for tutor name + session CTA). Body (readable at 14–16px, for bubbles). No Inter, Roboto, or system-ui.

**Anti-patterns:** no card grids, no decorative shadows, no colored icon circles, no emoji in headings, no gray-on-gray.

---

## 2. Component Specs

### Microphone Button
- Size: `72×72pt` minimum, always visible, sticky at bottom
- Model: VAD indicator (not hold-to-speak)
- States: Idle = static icon; Listening = pulsing waveform animation
- Tap: force-commits current utterance (escape hatch for VAD misfires)

### Conversation Bubbles
- Tutor: left-aligned; User: right-aligned
- Subtle background tint difference between speakers
- Rounded corners, `16px` radius max; no heavy borders
- Caption below each bubble (smaller text); translation in muted color below caption
- Always visible — no toggle

### Layout & Touch
- Mobile-first
- All interactive elements: `44×44pt` minimum touch target
- Status indicators: color + icon/shape combo (never color alone)


---

## 3. Screen Detail

### Onboarding States
- Plan generation loading: "Fluencia is making your plan..." typing indicator while LLM call runs
- Blank user input: Fluencia gently reprompts, no error state
- Plan generation failure: "Let me try again..." with retry, no user-visible error
- Abandoned mid-chat: on next visit, resume conversation from last message (do not restart)

### Plan Page States
- Loading: skeleton screen (tutor name + streak placeholder)
- Empty (0 topics): "Fluencia is still learning about you — start your first session!"
- Fetch error: "Couldn't load your plan. Retry?"
- Async update in progress post-session: show last-known values, re-fetch on mount
- All topics done: "You've completed your plan — Fluencia will discover what's next in your next session"

**Topic suggest input states:**
- Idle: placeholder "Suggest a topic to Fluencia..."
- Pending: Fluencia typing indicator
- Success: plan topics update in place
- Error: "Fluencia couldn't update the plan. Try again?"

### Session States
- VAD loading: "Getting Fluencia ready..." — blocks session start until ONNX model loaded
- Reconnecting: conversation feed dimmed, mic input blocked, spinner on persona pill
- ElevenLabs fallback to `speechSynthesis`: toast "Using basic voice — dialect may differ"; speed slider stays functional (maps to `speechSynthesis.rate`)
- Session < 2 min at end: "Too short — try for at least 2 minutes" — no summary shown
- Encouragement toast: bottom of screen above mic, auto-dismiss 4s, fade in/out only

### Summary States
- Extraction failure: show transcript + "Fluencia will review this session later"
- 0 phrases extracted: "No phrases captured this session" + full transcript below
- MongoDB write failed: "Summary saved locally — will sync when you're back online"

---

## UI Screens

### 1. Onboarding (first-time only)
- The tutor opens with a freeform question, no UI chrome (warm, not generic AI chat look — see visual tone below)
- ~4–6 turns to discover: **target language first** ("What language are you trying to learn?"), then dialect within that language, then why learning, current level, deadline/goal
- Language + dialect determine: which voice from `voice_config.ts` is used, which tutor name/persona is generated, and which STT language hint is passed to Whisper
- Fluencia verbally frames the plan before it appears: "Here's what I've got for you — take a look" → plan preview card animates in inline (not a new screen, not a modal)
- Plan preview card structure: tutor name/persona summary at top → 3–5 topic pills with rough session counts → "Tweak it in chat" / "Looks good →" CTAs
- On "Looks good →": magic link auth fires here (not before). Writes to `plans` and `users`, marks `onboarding_complete = true`. Transitions directly to Plan page.
- Notion setup is deferred to Plan page settings (not in onboarding). Remove post-commit Notion prompt.

**Onboarding states:**
- Plan generation loading: Fluencia typing indicator ("Fluencia is making your plan...") while LLM call runs
- Blank user input: Fluencia gently reprompts, no error
- Plan generation failure: "Let me try again..." with retry, no user-visible error
- Abandoned mid-chat: on next visit, resume conversation from last message (do not restart onboarding)

### 2. Plan Page (home screen for returning users)

**Visual hierarchy (mobile-first):**
1. Fluencia's message for today — one sentence from tutor persona above CTA (optional; if no message, show nothing)
2. **Session CTA — primary, above fold** ("Start today's session → Today: Subjunctive mood")
3. Streak header (dialect, tutor name, week X of Y, 7-day dot row)
4. Progress ring (single ring, sessions-complete %; phrases learned as number below ring)
5. Learning path (topics with status: ✓ done / ▶ active / ○ upcoming + "discovered by Fluencia" label — color + icon, not color alone)
6. "Suggest a topic..." structured input at bottom (replaces iterate bar — see scope decisions)

**Plan page states:**
- Loading: skeleton screen (tutor name + streak placeholder)
- Empty (0 topics, e.g. onboarding produced generic answers): "Fluencia is still learning about you — start your first session!"
- Fetch error: "Couldn't load your plan. Retry?"
- Async plan update in progress post-session: show last-known values, re-fetch on mount (no loading indicator needed)
- All topics done: "You've completed your plan — Fluencia will discover what's next in your next session"

**Topic suggest input states:**
- Idle: placeholder "Suggest a topic to Fluencia..."
- Pending: Fluencia typing indicator
- Error: "Fluencia couldn't update the plan. Try again?"
- Success: plan topics update in place

### 3. Session (15 min)

**Fixed layout — no scroll. Mic is always visible.**

```
┌────────────────────────────────────────┐
│  [Fluencia · Castilian · ↑ 0:43]        │  ← Persona pill + count-up timer
│                                        │
│  ┄ conversation feed (scrolls) ┄       │
│  Fluencia: "¿Qué hiciste ayer?"          │
│  "What did you do yesterday?"  ← caption│
│                                        │
│  You: "Fui al mercado"                 │
│  "I went to the market" ← caption      │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│                                        │
│  🐢 ─────────────●──────── 🐇  0.8×  │  ← Speed slider (stepped, 0.1 increments)
├────────────────────────────────────────┤
│  "Fluencia will wait" ← on 1st session, │
│   contextual after                     │
│       ┌──────────────────┐             │
│       │  🎙 ~~~~~~~~~~~~ │  STICKY MIC │  ← Always visible; min 72×72pt
│       └──────────────────┘             │
└────────────────────────────────────────┘
```

**Mic button — VAD indicator model (not hold-to-speak):**
- Idle: static microphone icon
- Listening: pulsing waveform animation
- Tap: force-commits current utterance (escape hatch for VAD misfires)
- Minimum touch target: 72×72pt

**Conversation feed:**
- Fluencia utterances: left-aligned
- User utterances: right-aligned
- Captions: smaller text below each bubble, always visible (no toggle)
- Translation: muted color below caption, always visible
- `aria-live="polite"` — announces complete utterances, not streaming characters

**Timer:** Count up from 0:00. At 15:00, timer turns green (session continues; no auto-end).

**Session states:**
- VAD model loading: "Getting Fluencia ready..." (blocks session start until ONNX model loaded)
- Reconnecting: conversation feed dimmed, mic input blocked, spinner on persona pill
- ElevenLabs fallback to `speechSynthesis`: "Using basic voice — dialect may differ" toast; speed slider stays visible and functional (maps to `speechSynthesis.rate`)
- Session < 2 min at end: "Too short — try for at least 2 minutes" (no summary shown)
- Encouragement toast: bottom of screen above mic, auto-dismiss 4s, fade in/out only (`prefers-reduced-motion` respects this)

**Accessibility:**
- Space bar: force-commit current utterance (same as VAD silence trigger)
- Color contrast: all text on backgrounds meets WCAG 2.1 AA (4.5:1 minimum)
- Status indicators use color + icon/shape (not color alone)
- `prefers-reduced-motion`: streaming captions show full text at once (no character animation); toasts fade only (no bounce)

### 4. Summary
- Full-screen loading state: "Fluencia is writing your summary..." (up to 10s)
- Fluencia's post-session note (personal, specific, seeds next session)
- Key phrases: left-aligned list, not a card grid. Tags inline: ✨ First used naturally / 🇪🇸 Dialect-specific / 📈 Improving
- 0 phrases extracted: "No phrases captured this session" with full transcript below
- Extraction failure: show transcript + "Fluencia will review this session later"
- Export to Notion (first-class button)
- Copy to clipboard
- "Back to plan →" CTA
- MongoDB write failed: "Summary saved locally — will sync when you're back online"
- Plan auto-updates asynchronously on session end (non-blocking). Plan page re-fetches on mount.

---

## 4. Motion & Accessibility

- **Motion:** Fade in/out only for toasts (4s auto-dismiss, positioned above mic)
- **Streaming captions:** characters appear progressively during TTS; snap to complete text when done
- **`prefers-reduced-motion`:** all animations disabled; captions show full text immediately; toasts fade only, no bounce
- **Keyboard:** Spacebar force-commits utterance (same as VAD silence trigger)
- **Screen reader:** `aria-live="polite"` on conversation feed — announces completed utterances, not streaming characters
- **WCAG 2.1 AA:** all text on backgrounds meets 4.5:1 contrast minimum

---

## 5. Data Layer (MongoDB)

No Supabase auth for the hackathon. `user_id` = `session_id` UUID persisted in `localStorage`. All collections are keyed on this value.

**`users`** collection

```text
user_id, language, dialect, level, tutor_persona (object),
speed_preference, onboarding_complete,
timezone, vad_silence_ms (default 800),
notion_page_id, encouragement_triggers (array),
current_week, current_day, streak_days
```

**`sessions`** collection (TTL 30 days)

```text
session_id, user_id, language, dialect, started_at,
duration_seconds, topic, session_number,
utterances (array), plan (object), summary (object)
```

**`memories`** collection (long-term, persistent)

```text
user_id, tenant_id, memory_type, content,
embedding (1024 floats), updated_at
```

**`plans`** collection

```text
user_id, topics (array), created_at, updated_at
```

---

## 6. Voice Config (`lib/voice_config.ts`)

Single config file mapping `(language, dialect)` → ElevenLabs voice ID + model + STT language code. Adding a new language = one entry here.

```typescript
export const VOICE_CONFIG: Record<string, {
  voiceId: string;
  model: string;
  sttLanguage: string;
  displayName: string;
  tutorDefaultName: string;
}> = {
  "es-ES": { voiceId: "Antoni",   model: "eleven_flash_v2_5", sttLanguage: "es", displayName: "Castilian Spanish",    tutorDefaultName: "Fluencia" },
  "pt-BR": { voiceId: "TBD",      model: "eleven_flash_v2_5", sttLanguage: "pt", displayName: "Brazilian Portuguese",  tutorDefaultName: "Ana"    },
  "fr-FR": { voiceId: "TBD",      model: "eleven_flash_v2_5", sttLanguage: "fr", displayName: "Parisian French",       tutorDefaultName: "Léa"    },
  "ja-JP": { voiceId: "TBD",      model: "eleven_flash_v2_5", sttLanguage: "ja", displayName: "Japanese",              tutorDefaultName: "Yuki"   },
  "de-DE": { voiceId: "TBD",      model: "eleven_flash_v2_5", sttLanguage: "de", displayName: "German",                tutorDefaultName: "Max"    },
  "it-IT": { voiceId: "TBD",      model: "eleven_flash_v2_5", sttLanguage: "it", displayName: "Italian",               tutorDefaultName: "Marco"  },
};
```

`voiceId` values marked `TBD` are validated at language launch. `es-ES` ships in v1; others added as needed. `/api/tts` proxy reads from this config — no hardcoded voice IDs elsewhere.

**ElevenLabs settings:**
- Model: `eleven_flash_v2_5` (~75ms latency, 32 languages). Fall back to `eleven_multilingual_v2` if quality is noticeably worse for a specific language.
- Speed: stored per user, adjustable in-session (0.5×–1.5×)
- Stability: 0.7; Similarity boost: 0.8

> `eleven_v3`: more expressive, 70+ languages, higher latency. Evaluate for v2 only.

---

## 7. Memory Injection (per session)

System prompt includes:
- Tutor persona (name, dialect, personality — constructed from onboarding)
- User's goal and deadline
- Last 3 session summaries
- Current plan topic + focus
- Vocabulary: top-20 by `last_used_at` (`LIMIT 20` — prevents context overflow at 50+ sessions)
- Encouragement triggers: top-5 by recency, structured JSONB:
  ```json
  [
    {"text": "User first used subjunctive on 2026-03-20 — celebrate if they do it again",
     "created_at": "2026-03-20", "context": "subjunctive", "last_triggered": null},
    {"text": "User froze on 'sin embargo' twice — watch for natural use",
     "created_at": "2026-03-25", "context": "sin embargo", "last_triggered": "2026-03-28"}
  ]
  ```
  Stale = `created_at > 30 days` AND never triggered; pruned at session end. Cap at top-5 by recency. Always injected even if extraction call fails (use last-known set).
- Speed/patience instructions

Encouragement triggers are updated at session end by the key-phrase extraction call. New wins appended; stale ones removed.