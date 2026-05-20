import json
import os

from openai import AsyncOpenAI

_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

_SYSTEM = (
    "You analyze sensory overload episodes for neurodiverse children. "
    "Return ONLY valid JSON with exactly these three fields: "
    "trigger (string — likely cause), "
    "recommendation (string — what the caregiver should do next), "
    "risk_level (exactly one of: low, medium, high). "
    "No markdown. No explanation. Nothing else."
)

_FALLBACK = {
    "trigger": "Unknown",
    "recommendation": "Monitor closely and remove the child from overstimulating environments.",
    "risk_level": "medium",
}


async def analyze_episode(
    peak_stress: float,
    avg_bpm: float,
    duration_seconds: float,
    time_of_day: str,
    day_of_week: str,
) -> dict:
    try:
        user_msg = (
            f"Peak stress: {peak_stress:.0f}%. "
            f"Average BPM: {avg_bpm:.0f}. "
            f"Duration: {duration_seconds:.0f} seconds. "
            f"Time of day: {time_of_day}. "
            f"Day of week: {day_of_week}."
        )
        response = await _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_msg},
            ],
        )
        return json.loads(response.choices[0].message.content)  # type: ignore[arg-type]
    except Exception:
        return dict(_FALLBACK)
