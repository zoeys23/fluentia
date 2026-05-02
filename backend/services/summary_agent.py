import asyncio
import json
import logging

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from settings import PLAN_MODEL
from db import sessions

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """You are a language tutor analysing a practice session transcript.

Produce a JSON summary with this exact shape — two sections:
(A) user-facing review for export, (B) internal coaching analysis for plan improvement.

{
  "session_meta": {
    "week": <int>,
    "day": <int>,
    "day_title": "<title of today's planned session>",
    "planned_topics": ["<topic 1>", "<topic 2>"]
  },

  "tutor_note": "<Warm, specific, personal note for the user (max 150 words). Reference one exact moment from the conversation by name or phrase. End with a concrete teaser for tomorrow.>",

  "key_phrases": [
    {
      "target": "<phrase in the target language>",
      "native": "<translation in English>",
      "tag": "<first_use | dialect_specific | improving>",
      "context": "<one sentence: when/how it came up in the session>"
    }
  ],

  "performance": {
    "strengths": ["<specific thing the user did well — be concrete, not generic>"],
    "struggles": ["<specific thing the user found hard — describe the pattern, not just 'vocabulary'>"],
    "fluency_rating": <1-5 integer, 1=halting/lots of gaps, 5=near-native flow>,
    "confidence_rating": <1-5 integer, based on hesitation patterns and self-correction>
  },

  "plan_recommendation": {
    "ready_for_next": <true if user grasped today's topics well enough to advance, false if they need reinforcement>,
    "reinforce": ["<topic or phrase that needs another session before moving on>"],
    "accelerate": ["<topic the user handled so well it can be skipped or compressed in future days>"],
    "adjust_days": [
      {
        "week": <int>,
        "day": <int>,
        "action": "reinforce | replace | add_drill",
        "reason": "<one sentence explaining why based on today's performance>"
      }
    ],
    "new_topics_discovered": [
      {
        "name": "<topic that came up naturally and isn't in the plan>",
        "reason": "<why it's worth adding — user curiosity, recurring mistake, etc.>"
      }
    ]
  }
}

Rules:
- key_phrases: 3-8 items. Only include phrases that actually appeared in the transcript.
- performance.strengths and struggles: 1-3 items each. Be specific — "correctly used subjunctive in a subordinate clause" not "good grammar".
- plan_recommendation.adjust_days: only include days that genuinely need changing based on evidence from this session. Empty array if no changes needed.
- Pure JSON, no markdown fences."""


def _get_day_context(plan: dict, week: int, day: int) -> dict:
    """Extract the planned day's context from the 2-week plan."""
    for w in plan.get("weeks", []):
        if w.get("week") == week:
            for d in w.get("days", []):
                if d.get("day") == day:
                    return {
                        "title": d.get("title", ""),
                        "topics": d.get("topics", []),
                        "session_brief": d.get("session_brief", ""),
                    }
    return {}


async def generate_summary(session_id: str, api_key: str, week: int = 1, day: int = 1) -> dict:
    """Generate post-session summary. Stores result and returns it."""
    session = await sessions.get(session_id)
    if not session:
        return {"error": "Session not found"}

    utterances = session.get("utterances", [])
    if not utterances:
        return {"error": "No utterances to summarise"}

    transcript_lines = [
        f"{u['speaker'].capitalize()}: {u['text']}"
        for u in utterances
    ]
    transcript = "\n".join(transcript_lines)

    plan = session.get("plan")
    plan_context = ""
    day_info = {}
    if plan:
        day_info = _get_day_context(plan, week, day)
        all_titles = [
            f"W{w['week']}D{d['day']}: {d['title']}"
            for w in plan.get("weeks", [])
            for d in w.get("days", [])
        ]
        plan_context = (
            f"\nLearner goal: {plan.get('goal', '')}"
            f"\nLevel: {plan.get('level', '')}"
            f"\nFull plan overview: {', '.join(all_titles)}"
        )
        if day_info:
            plan_context += (
                f"\n\nToday's session (Week {week}, Day {day}): {day_info.get('title', '')}"
                f"\nPlanned topics: {', '.join(day_info.get('topics', []))}"
                f"\nSession brief (what the tutor was instructed to do):\n{day_info.get('session_brief', '')}"
            )

    prompt = f"""Analyse this language practice session and generate the summary JSON.
{plan_context}

Transcript:
{transcript}

The session_meta in your JSON should use week={week}, day={day}, day_title="{day_info.get('title', '')}", planned_topics={json.dumps(day_info.get('topics', []))}.
Generate the summary JSON."""

    client = genai.Client(api_key=api_key)

    fallback_summary = {
        "session_meta": {"week": week, "day": day, "day_title": day_info.get("title", ""), "planned_topics": day_info.get("topics", [])},
        "tutor_note": "Great session! I'll have a more detailed note for you next time.",
        "key_phrases": [],
        "performance": {"strengths": [], "struggles": [], "fluency_rating": 3, "confidence_rating": 3},
        "plan_recommendation": {"ready_for_next": True, "reinforce": [], "accelerate": [], "adjust_days": [], "new_topics_discovered": []},
    }

    summary = fallback_summary
    for attempt in range(3):
        try:
            response = await client.aio.models.generate_content(
                model=PLAN_MODEL,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=SUMMARY_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text.strip()
            try:
                summary = json.loads(raw)
            except json.JSONDecodeError:
                logger.error(f"summary JSON parse error: {raw}")
            break
        except ClientError as e:
            if e.code == 429 and attempt < 2:
                wait = 5 * (attempt + 1)
                logger.warning(f"summary 429 on attempt {attempt + 1}, retrying in {wait}s")
                await asyncio.sleep(wait)
            else:
                logger.error(f"summary generation failed: {e}")
                break
        except Exception as e:
            logger.error(f"summary generation failed: {e}")
            break

    await sessions.set_summary(session_id, summary)
    return summary
