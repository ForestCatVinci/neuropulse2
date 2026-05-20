import json
import os
from datetime import datetime, timedelta

import aiosqlite
from openai import AsyncOpenAI

from episode_logger import DB_PATH

_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

_SYSTEM = (
    "You are a pediatric neurologist assistant generating medical reports for neurodiverse children. "
    "Each episode entry includes biometric data (stress, BPM, duration) and may also include "
    "parent-observed context — what the caregiver personally noticed around the time of the episode "
    "(environment, sounds, activity, food, sleep, mood, etc.). "
    "Parent observations are first-hand qualitative data and should be weighted heavily alongside "
    "the biometric measurements. When parent notes are present, explicitly reference them in your "
    "findings and tailor recommendations to the specific triggers the parent identified. "
    "Return ONLY valid JSON with exactly these fields: "
    "summary (string, 2-3 sentence overview that incorporates both biometric patterns and parent observations), "
    "findings (array of strings, key observations — cite parent notes when relevant), "
    "recommendations (array of strings, actionable advice tailored to observed triggers), "
    "risk_assessment (string, overall risk level and brief reasoning). "
    "No markdown. No explanation. Valid JSON only."
)

_FALLBACK = {
    "summary": "Unable to generate report at this time. Please try again later.",
    "findings": [],
    "recommendations": ["Consult with a healthcare provider for a manual review."],
    "risk_assessment": "Assessment unavailable.",
}


async def generate_report(period: str) -> dict:
    days = 7 if period == "weekly" else 30
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM episodes WHERE start_time >= ? ORDER BY start_time",
            (since,),
        ) as cursor:
            episodes = [dict(r) for r in await cursor.fetchall()]

    if not episodes:
        return {
            "period": period,
            "generated_at": datetime.utcnow().isoformat(),
            "summary": f"No episodes recorded in the past {'7 days' if period == 'weekly' else '30 days'}.",
            "findings": [],
            "recommendations": ["Continue monitoring. No episodes to analyze."],
            "risk_assessment": "Low — no episodes in the selected period.",
        }

    lines = []
    for e in episodes:
        a: dict = {}
        if e["analysis_json"]:
            try:
                a = json.loads(e["analysis_json"])
            except Exception:
                pass
        parent_notes = e.get("parent_notes") or ""
        notes_part = f" | parent observed: {parent_notes}" if parent_notes else ""
        lines.append(
            f"- {e['start_time'][:16]}: peak {e['peak_stress']:.0f}%, "
            f"duration {e['duration_seconds']:.0f}s, avg BPM {e['avg_bpm']:.0f}, "
            f"AI trigger: {a.get('trigger', 'unknown')}, risk: {a.get('risk_level', 'unknown')}"
            f"{notes_part}"
        )

    user_msg = (
        f"Period: last {'7 days' if period == 'weekly' else '30 days'}\n"
        f"Total episodes: {len(episodes)}\n\n"
        + "\n".join(lines)
    )

    try:
        response = await _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        result = json.loads(response.choices[0].message.content)  # type: ignore[arg-type]
    except Exception:
        result = dict(_FALLBACK)

    return {
        "period": period,
        "generated_at": datetime.utcnow().isoformat(),
        **result,
    }
