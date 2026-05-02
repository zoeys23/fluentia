import json
import logging

from google import genai
from google.genai import types

from settings import PLAN_MODEL
from db import sessions

logger = logging.getLogger(__name__)

ONBOARDING_SYSTEM_PROMPT = """You are a warm, patient language tutor.
Your job is to discover the user's learning goals through natural conversation — not a form.

Discover in roughly this order (but naturally, not rigidly):
1. What language they want to learn
2. Which dialect/variety (e.g. Castilian Spanish vs Latin American)
3. Why they want to learn it (travel, work, family, etc.)
4. Their current level (beginner / intermediate / advanced)
5. Their goal or deadline (e.g. "trip in 3 months", "job interview")

After ~4-6 turns you have enough to build a plan. At that point generate the full 2-week plan and signal ready.

IMPORTANT: Always respond with pure JSON — no markdown fences, no extra keys.

Shape while still gathering info:
{"ready": false, "reply": "<your conversational message>"}

Shape when ready (fill every field):
{
  "ready": true,
  "reply": "<brief warm verbal framing, e.g. 'Here's your 2-week plan — take a look'>",
  "plan": {
    "language": "<full language name, e.g. Spanish>",
    "dialect": "<dialect label, e.g. Castilian Spanish>",
    "dialect_code": "<BCP 47 with region, e.g. es-ES>",
    "tutor_name": "<persona name native to the dialect, e.g. Fluencia>",
    "level": "<beginner|intermediate|advanced>",
    "goal": "<user's stated goal in one sentence>",
    "summary": "<2-3 sentences describing the overall 2-week learning arc and approach>",
    "weeks": [
      {
        "week": 1,
        "theme": "<overarching theme for this week, e.g. 'Survival Phrases & First Conversations'>",
        "days": [
          {
            "day": 1,
            "title": "<short session title, e.g. 'Greetings & Introductions'>",
            "topics": ["<topic 1>", "<topic 2>", "<topic 3>"],
            "session_brief": "<150-200 word brief for the live tutor agent. Include: the specific focus, 3-5 target phrases or vocabulary items in both languages, suggested conversation starters or questions the tutor should ask, what to do if the user struggles, and how to gently push if they're doing well. This is injected verbatim into the live agent's system prompt.>"
          }
        ]
      },
      {
        "week": 2,
        "theme": "<theme for week 2>",
        "days": [ ... 7 days ... ]
      }
    ]
  }
}

Rules for the plan:
- Exactly 2 weeks, 7 days each (days 1-7 in week 1, days 1-7 in week 2)
- Days progress logically: week 1 builds foundations, week 2 applies them in context
- session_brief must be specific, actionable, and tailored to the user's goal and level
- Topics and vocabulary must match the stated dialect (Castilian Spanish ≠ Latin American Spanish, etc.)
- Never use generic filler — every day should feel purposefully designed for this specific user"""


async def onboarding_turn(session_id: str, user_message: str, api_key: str) -> dict:
    """Process one onboarding chat turn. Returns {reply, plan_ready, plan?}."""
    await sessions.get_or_create(session_id)
    await sessions.append_onboarding_message(session_id, "user", user_message)

    onboarding_messages = await sessions.get_onboarding_messages(session_id)

    client = genai.Client(api_key=api_key)

    contents = [
        types.Content(
            role=msg["role"],
            parts=[types.Part(text=msg["content"])],
        )
        for msg in onboarding_messages
    ]

    response = await client.aio.models.generate_content(
        model=PLAN_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=ONBOARDING_SYSTEM_PROMPT,
            response_mime_type="application/json",
        ),
    )

    raw = response.text.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"Onboarding JSON parse error: {raw}")
        parsed = {"ready": False, "reply": "Sorry, let me think about that again..."}

    await sessions.append_onboarding_message(session_id, "model", parsed.get("reply", ""))

    if parsed.get("ready") and parsed.get("plan"):
        await sessions.set_plan(session_id, parsed["plan"])

    return {
        "reply": parsed.get("reply", ""),
        "plan_ready": bool(parsed.get("ready")),
        "plan": parsed.get("plan"),
    }


async def suggest_topic(session_id: str, suggestion: str, api_key: str) -> dict:
    """User suggests a new topic — Gemini updates the plan. Returns updated plan."""
    session = await sessions.get(session_id)
    if not session or not session.get("plan"):
        return {"error": "No plan found for this session"}

    plan = session["plan"]
    client = genai.Client(api_key=api_key)

    prompt = f"""Current 2-week learning plan:
{json.dumps(plan, indent=2)}

The user wants to add or adjust a topic: "{suggestion}"

Update the plan to reflect this. You may:
- Add a new day or replace an existing day's content
- Adjust a week's theme if appropriate

Return the FULL updated plan JSON in the same shape (language, dialect, dialect_code, tutor_name, level, goal, summary, weeks[]).
Each day must still have: day, title, topics[], session_brief.
Pure JSON, no markdown fences."""

    response = await client.aio.models.generate_content(
        model=PLAN_MODEL,
        contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    raw = response.text.strip()
    try:
        updated_plan = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"suggest_topic JSON parse error: {raw}")
        return {"error": "Could not update plan"}

    await sessions.set_plan(session_id, updated_plan)
    return updated_plan


async def apply_recommendations(session_id: str, api_key: str) -> dict:
    """Apply the session summary's plan_recommendation to update the plan."""
    session = await sessions.get(session_id)
    if not session or not session.get("plan"):
        return {"error": "No plan found for this session"}
    if not session.get("summary"):
        return {"error": "No summary found — call /end first"}

    plan = session["plan"]
    summary = session["summary"]
    rec = summary.get("plan_recommendation", {})
    performance = summary.get("performance", {})
    meta = summary.get("session_meta", {})

    prompt = f"""You are updating a 2-week language learning plan based on the learner's session performance.

Current plan:
{json.dumps(plan, indent=2)}

Session just completed: Week {meta.get('week')}, Day {meta.get('day')} — "{meta.get('day_title')}"

Performance analysis:
- Fluency rating: {performance.get('fluency_rating')}/5
- Confidence rating: {performance.get('confidence_rating')}/5
- Strengths: {json.dumps(performance.get('strengths', []))}
- Struggles: {json.dumps(performance.get('struggles', []))}

Recommendations from the tutor:
- Ready to advance to next day: {rec.get('ready_for_next')}
- Topics needing reinforcement: {json.dumps(rec.get('reinforce', []))}
- Topics to accelerate/compress: {json.dumps(rec.get('accelerate', []))}
- Suggested day adjustments: {json.dumps(rec.get('adjust_days', []))}
- New topics discovered: {json.dumps(rec.get('new_topics_discovered', []))}

Apply these changes to the plan. Rules:
- If ready_for_next is false: insert a reinforcement day after today's day (shift subsequent days, keeping total ≤ 14)
- If reinforce topics are listed: update the next 1-2 days' session_briefs to revisit those topics
- If accelerate topics are listed: compress or merge those future days
- If new_topics_discovered: add them to the most relevant future day or append a new day
- If adjust_days lists specific changes: apply them
- Preserve all fields: language, dialect, dialect_code, tutor_name, level, goal, summary, weeks[]
- Every day must still have: day, title, topics[], session_brief
- Keep total days ≤ 14 (drop the least critical day if needed to make room)

Return the FULL updated plan JSON. Pure JSON, no markdown fences."""

    client = genai.Client(api_key=api_key)

    response = await client.aio.models.generate_content(
        model=PLAN_MODEL,
        contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    raw = response.text.strip()
    try:
        updated_plan = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"apply_recommendations JSON parse error: {raw}")
        return {"error": "Could not apply recommendations"}

    await sessions.set_plan(session_id, updated_plan)
    return updated_plan
