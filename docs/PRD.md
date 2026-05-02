# Design: Fluencia — AI Language Tutor with Speaking Practice (Multi-Language)

## Problem Statement

Existing language learning tools fail at speaking practice:
- **Duolingo**: gamified, inauthentic language, no real conversation, no regional dialects
- **iTalki/Preply**: human tutors are expensive and hard to schedule
- **ChatGPT voice**: interrupts you while thinking, speaks too fast, no captions, blank slate every session

The gap: a patient, language-and-dialect-aware AI tutor that remembers you across sessions, adapts in real-time, and makes speaking practice feel like a real conversation — not a drill. Supports any language; the tutor persona is native to the specific language and dialect you're learning.

---

## What Makes This Cool

- **Authentic regional language** — not Duolingo's neutral "default" accent. The tutor *is* the dialect: Castilian Spanish, Brazilian Portuguese, Parisian French, Tokyo Japanese. Every language gets a persona native to a specific variety, not a generic one.
- **Pause-aware** — never interrupts. Detects thinking silences vs. end-of-turn silences. "Fluencia will wait for you."
- **Persistent memory** — knows what you've learned, where you froze, and what to push next. References last week's win.
- **Speed control** — ElevenLabs TTS with a live slider. Range 0.5×–1.5×. Default 0.8× for learners, 1.0× as you improve.
- **Live captions** — streaming transcript + translation beneath every utterance
- **Plan that self-evolves** — starts from onboarding goals, updates based on what emerges in sessions
- **Notes export** — key phrases and learnings leave the app and live in your notes

---

## User Journey

The app is a tab-based web app with 4 persistent tabs: **Chat**, **Plan**, **Sessions**, **Learnings**.

### First visit
```
Chat tab (goal input) → Fluencia builds plan inline → "Looks good" → Plan tab → Start Session → Voice Session → Summary → Plan tab
```

### Return visit
```
Plan tab → Start Session → Voice Session → Summary → Plan tab
```

The Chat tab persists for plan tweaking after onboarding. The Plan tab is the home screen for returning users. Session history is accessible at any time via the Sessions tab. Accumulated vocabulary lives in the Learnings tab.

---

## Constraints

- Side project — builder mode, ship fast and iterate
- Solo developer, CC+gstack for implementation
- Must support multiple languages from day one — Castilian Spanish is the first persona, but the architecture is language-agnostic
- Should be a web app, shareable via URL

---

## Premises

1. **Onboarding IS the differentiation** — the tutor discovers target language, dialect, goals, level, and motivation via freeform chat. No forms, no dropdowns. Language selection emerges naturally from conversation: "What are you trying to learn?" The plan preview is shown inline before the user commits.

2. **Patience + visibility are first-class features** — VAD (silence detection) handles "don't interrupt me", speed control via ElevenLabs handles "don't speak too fast", live captions handle "I need to read while I listen." These apply identically across all languages.

3. **Memory across sessions** = the moat — session history, vocabulary used, mistakes made, plan progress all injected into context on every session start. Key phrases exported to Notion.

4. **Feature set is not pre-defined** — emerges from the onboarding conversation and the feedback loop. Plan topics marked "discovered by tutor" when they surface in sessions.

5. **Language + dialect authenticity is the wedge** — Duolingo teaches generic "default" accents. Amigos tutors are native to a specific variety (Castilian Spanish, Carioca Portuguese, Parisian French). The persona IS the dialect.