import json
import random
from datetime import datetime, timedelta

import aiosqlite

from episode_logger import DB_PATH

SCENARIOS = [
    {
        "trigger": "Sensory overload — cafeteria noise",
        "recommendation": "Use noise-canceling headphones during lunch. Request a quieter eating spot from the school.",
        "risk_level": "high",
        "parent_note": "School lunch in the cafeteria — very crowded and loud today",
    },
    {
        "trigger": "Transition stress — unexpected schedule change",
        "recommendation": "Provide advance warning of schedule changes. Use visual timers and predictable routines.",
        "risk_level": "high",
        "parent_note": "Teacher was absent, substitute changed the whole routine without warning",
    },
    {
        "trigger": "Social conflict — playground disagreement",
        "recommendation": "Social skills coaching sessions. Structured supervised play periods.",
        "risk_level": "medium",
        "parent_note": "Argument with a classmate during recess, teacher had to intervene",
    },
    {
        "trigger": "Sensory overload — assembly hall lighting and crowd",
        "recommendation": "Request aisle seating during assemblies. Sunglasses and ear defenders permitted.",
        "risk_level": "high",
        "parent_note": "School assembly in the gym — bright fluorescent lights and over 200 kids, very overwhelming",
    },
    {
        "trigger": "Fatigue dysregulation — end-of-day exhaustion",
        "recommendation": "Schedule a quiet decompression period immediately after school. No demands for 30 minutes.",
        "risk_level": "medium",
        "parent_note": "After school pickup — seemed completely drained, started crying in the car for no clear reason",
    },
    {
        "trigger": "Academic frustration — homework avoidance",
        "recommendation": "Break homework into 10-minute segments with movement breaks. Use a visual timer.",
        "risk_level": "medium",
        "parent_note": "Math homework — got stuck on one problem and couldn't move past it, escalated quickly",
    },
    {
        "trigger": "Sensory overload — crowded public space",
        "recommendation": "Avoid busy public spaces during peak hours. Use noise-canceling headphones outdoors.",
        "risk_level": "high",
        "parent_note": "Brought to the grocery store after school on a Saturday — too many people, too much noise",
    },
    {
        "trigger": "Sleep deprivation — dysregulated morning",
        "recommendation": "Enforce consistent sleep schedule. Start bedtime wind-down 45 minutes earlier.",
        "risk_level": "high",
        "parent_note": "Only slept about 5 hours, woke up agitated and wouldn't eat breakfast",
    },
    {
        "trigger": "Food sensory issue — unexpected texture",
        "recommendation": "Gradual food exposure therapy. Keep foods separated on the plate; no mixing.",
        "risk_level": "low",
        "parent_note": "I added a new vegetable mixed into dinner — he refused and got very upset about the texture",
    },
    {
        "trigger": "Screen-time transition — device removal",
        "recommendation": "Use 10-minute countdown warnings. Establish a consistent predictable device schedule.",
        "risk_level": "medium",
        "parent_note": "Had to take the tablet away at bedtime — meltdown lasted about 20 minutes",
    },
    {
        "trigger": "Clothing sensory sensitivity — new uniform",
        "recommendation": "Prioritize seamless tagless clothing. Let child approve clothing choice each morning.",
        "risk_level": "low",
        "parent_note": "New school uniform collar felt scratchy — kept pulling at it all morning, couldn't focus",
    },
    {
        "trigger": "Sensory overload — gymnasium echo and noise",
        "recommendation": "Request PE accommodations. Ear defenders available during loud group activities.",
        "risk_level": "medium",
        "parent_note": "PE class today — teacher reported he covered his ears and refused to join the group",
    },
    {
        "trigger": "Separation anxiety — unexpected caregiver change",
        "recommendation": "Gradual introduction to new caregivers. Maintain familiar routines during handoffs.",
        "risk_level": "high",
        "parent_note": "Grandma picked him up from school instead of me — he wasn't prepared for the change",
    },
    {
        "trigger": "Sensory overload — birthday party environment",
        "recommendation": "Limit party duration to 1 hour. Identify a quiet retreat space before arrival.",
        "risk_level": "high",
        "parent_note": "Classmate's birthday party — balloons popping, loud music, lots of children running",
    },
    {
        "trigger": "Routine disruption — medical appointment",
        "recommendation": "Use social stories to prepare for appointments. Request the first slot to minimise waiting.",
        "risk_level": "medium",
        "parent_note": "Dentist appointment today — waiting room was loud and the procedure took longer than expected",
    },
    {
        "trigger": "Sensory overload — supermarket self-checkout beeping",
        "recommendation": "Use staffed checkout lanes. Bring a comfort item to public errands.",
        "risk_level": "medium",
        "parent_note": "Self-checkout machines beeping constantly, he put his hands over his ears and froze",
    },
    {
        "trigger": "Transition anxiety — holiday return to school",
        "recommendation": "Re-introduce school routine gradually. Visit the classroom the day before return.",
        "risk_level": "high",
        "parent_note": "First day back after a two-week holiday break — he begged not to go and cried all morning",
    },
]

# Hour weights by school day and weekend
_SCHOOL_HOURS = [8, 9, 11, 12, 13, 15, 17, 18, 20]
_SCHOOL_W = [0.15, 0.07, 0.12, 0.18, 0.06, 0.12, 0.12, 0.08, 0.10]

_WEEKEND_HOURS = [10, 12, 14, 16, 17, 19, 20]
_WEEKEND_W = [0.10, 0.13, 0.16, 0.18, 0.15, 0.15, 0.13]


def _pick_hour(is_weekend: bool) -> int:
    if is_weekend:
        return random.choices(_WEEKEND_HOURS, weights=_WEEKEND_W)[0]
    return random.choices(_SCHOOL_HOURS, weights=_SCHOOL_W)[0]


async def seed_demo_data() -> int:
    now = datetime.utcnow()
    total = 0

    async with aiosqlite.connect(DB_PATH) as db:
        for day_offset in range(30, 0, -1):
            date = now - timedelta(days=day_offset)
            is_weekend = date.weekday() >= 5

            if is_weekend:
                n = random.choices([0, 1, 2], weights=[0.30, 0.50, 0.20])[0]
            else:
                n = random.choices([0, 1, 2, 3], weights=[0.05, 0.35, 0.40, 0.20])[0]

            used_hours: set[int] = set()
            for _ in range(n):
                for _ in range(10):
                    hour = _pick_hour(is_weekend)
                    if hour not in used_hours:
                        used_hours.add(hour)
                        break

                start = date.replace(
                    hour=hour,
                    minute=random.randint(0, 55),
                    second=random.randint(0, 59),
                    microsecond=0,
                )

                duration_s = random.choices(
                    [
                        random.randint(30, 90),
                        random.randint(90, 300),
                        random.randint(300, 900),
                        random.randint(900, 1500),
                    ],
                    weights=[0.20, 0.40, 0.30, 0.10],
                )[0]
                end = start + timedelta(seconds=duration_s)

                peak_stress = round(random.uniform(90.0, 99.0), 1)
                avg_bpm = round(random.uniform(95.0, 145.0), 1)

                scenario = random.choice(SCENARIOS)
                analysis = {
                    "trigger": scenario["trigger"],
                    "recommendation": scenario["recommendation"],
                    "risk_level": scenario["risk_level"],
                }
                parent_note = scenario["parent_note"] if random.random() > 0.28 else None

                cursor = await db.execute(
                    """INSERT INTO episodes
                       (start_time, end_time, peak_stress, avg_bpm, duration_seconds, analysis_json, parent_notes)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        start.isoformat(),
                        end.isoformat(),
                        peak_stress,
                        avg_bpm,
                        float(duration_s),
                        json.dumps(analysis),
                        parent_note,
                    ),
                )
                ep_id = cursor.lastrowid
                total += 1

                # Synthetic datapoints: stress arc rises → peaks → falls
                n_pts = max(4, duration_s // 5)
                datapoints = []
                for i in range(n_pts):
                    frac = i / max(n_pts - 1, 1)
                    t = start + timedelta(seconds=frac * duration_s)
                    if frac < 0.25:
                        s = 70 + (frac / 0.25) * (peak_stress - 70)
                    elif frac < 0.60:
                        s = peak_stress + random.uniform(-3, 3)
                    else:
                        s = peak_stress - ((frac - 0.60) / 0.40) * (peak_stress - 72)
                    s = round(max(70.0, min(100.0, s)), 1)
                    bpm = round(avg_bpm + random.uniform(-12, 12), 1)
                    rmssd = round(random.uniform(10.0, 28.0), 1)
                    datapoints.append((ep_id, t.isoformat(), bpm, s, rmssd))

                await db.executemany(
                    "INSERT INTO episode_datapoints (episode_id, timestamp, bpm, stress, rmssd) VALUES (?, ?, ?, ?, ?)",
                    datapoints,
                )

        await db.commit()

    return total


async def clear_all_data() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM episode_datapoints")
        await db.execute("DELETE FROM episodes")
        try:
            await db.execute(
                "DELETE FROM sqlite_sequence WHERE name IN ('episodes', 'episode_datapoints')"
            )
        except Exception:
            pass
        await db.commit()
