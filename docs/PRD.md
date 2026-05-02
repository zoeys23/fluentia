# PRD: Fluencia — AI Language Tutor with Speaking Practice

## Problem Statement

Existing language learning tools fail at speaking practice:
- **Duolingo**: gamified, inauthentic language, no real conversation, no regional dialects
- **iTalki/Preply**: human tutors are expensive and hard to schedule
- **ChatGPT voice**: interrupts you while thinking, speaks too fast, no captions, blank slate every session

The gap: a patient, language-and-dialect-aware AI tutor that remembers you across sessions, adapts in real-time, and makes speaking practice feel like a real conversation — not a drill.

---

## What Makes This Different

- **Authentic regional language** — the tutor *is* the dialect: Castilian Spanish, Brazilian Portuguese, Parisian French, Tokyo Japanese
- **Pause-aware** — never interrupts; detects thinking silences vs. end-of-turn silences
- **Persistent memory** — knows what you've learned, where you froze, and what to push next
- **Speed control** — live slider (0.5×–1.5×); default 0.8× for learners
- **Live captions** — streaming transcript + translation beneath every utterance
- **Self-evolving plan** — starts from onboarding goals, updates based on what surfaces in sessions
- **Notion export** — key phrases and learnings leave the app and live in your notes

---

## Core Premises

1. **Onboarding IS the differentiation** — the tutor discovers language, dialect, goals, level, and motivation via freeform chat. No forms, no dropdowns. The plan preview appears inline before the user commits.

2. **Patience + visibility are first-class features** — VAD handles "don't interrupt me", speed control handles "don't speak too fast", live captions handle "I need to read while I listen."

3. **Memory across sessions = the moat** — session history, vocabulary used, mistakes made, and plan progress are all injected into context on every session start.

4. **Language + dialect authenticity is the wedge** — Fluencia tutors are native to a specific variety (Castilian Spanish, Carioca Portuguese, Parisian French), not a generic "default" accent.

---

## User Journey

### First visit
```
Onboarding chat → Plan page (inline plan preview) → Session → Summary → Plan page
```

### Return visit
```
Plan page → Session → Summary → Plan page
```

Onboarding never shows again after completion. The Plan page is the home screen for returning users.

---

## UI Screens

### 1. Onboarding (first-time only)

The tutor opens with a freeform question — no UI chrome. Warm, not a generic AI chat look.

- ~4–6 turns to discover: target language, dialect, why learning, current level, deadline/goal
- Carlos frames the plan verbally before it appears: "Here's what I've got for you" → plan preview card animates in inline (not a modal)
- Plan preview: tutor name/persona → 3–5 topic pills with session counts → "Tweak it in chat" / "Looks good →" CTAs
- Magic link auth fires on "Looks good →" (not before). Writes plan, marks onboarding complete.
- Notion setup is deferred to Plan page settings — not in onboarding

![Onboarding screen: warm chat interface, no chrome, plan preview card inline at bottom](screens/onboarding.png)

---

### 2. Plan Page (home screen)

Mobile-first layout:

1. Carlos's message for today (optional; hidden if empty)
2. **Session CTA — primary, above fold** ("Start today's session → Today: Subjunctive mood")
3. Streak header (dialect, tutor name, week X of Y, 7-day dot row)
4. Progress ring (single ring, sessions-complete %; phrases learned as number below)
5. Learning path (topics with status: ✓ done / ▶ active / ○ upcoming + "discovered by Carlos" label)
6. "Suggest a topic..." structured input at bottom

![Plan page: session CTA dominant above fold, streak header, progress ring, topic list](screens/plan.png)

---

### 3. Session (15 min)

Fixed layout — no scroll. Mic is always visible at the bottom.

```
┌────────────────────────────────────────┐
│  [Carlos · Castilian · ↑ 0:43]        │  ← Persona pill + count-up timer
│                                        │
│  ┄ conversation feed (scrolls) ┄       │
│  Carlos: "¿Qué hiciste ayer?"          │
│  "What did you do yesterday?"          │
│                                        │
│  You: "Fui al mercado"                 │
│  "I went to the market"                │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│                                        │
│  🐢 ─────────────●──────── 🐇  0.8×  │  ← Speed slider
├────────────────────────────────────────┤
│  "Carlos will wait"                    │
│       ┌──────────────────┐             │
│       │  🎙 ~~~~~~~~~~~~ │  STICKY MIC │
│       └──────────────────┘             │
└────────────────────────────────────────┘
```

- VAD indicator model (not hold-to-speak): Idle → static icon; Listening → pulsing waveform
- Captions + translations always visible below each bubble, no toggle
- Timer counts up from 0:00; turns green at 15:00 (session continues, no auto-end)
- Spacebar: force-commit current utterance

![Session screen: fixed layout, conversation feed, speed slider, sticky mic](screens/session.png)

---

### 4. Summary

- Full-screen loading: "Carlos is writing your summary..." (up to 10s)
- Carlos's post-session note (personal, specific, seeds next session)
- Key phrases: left-aligned list with inline tags (✨ First used naturally / 🇪🇸 Dialect-specific / 📈 Improving)
- Export to Notion (first-class button) + Copy to clipboard
- "Back to plan →" CTA
- Plan auto-updates asynchronously on session end

![Summary screen: tutor note, key phrases list, export buttons](screens/summary.png)

---

## Success Criteria

- Complete a full 15-min session in any configured language
- Captions appear within 500ms of speech
- Tutor audio begins within 2s of end-of-user-speech
- Carlos never interrupts a thinking pause (>800ms silence tolerance)
- Session summary appears within 10s of session end
- Return user lands on Plan page, not Onboarding
- Speed slider persists across sessions
- **Onboarding completion rate ≥ 70%**
- **Carlos references a specific past moment in ≥ 1 of every 3 sessions**
