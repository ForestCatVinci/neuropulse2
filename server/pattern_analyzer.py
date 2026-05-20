import json
from collections import Counter
from datetime import datetime, timedelta

import aiosqlite

from episode_logger import DB_PATH


async def get_summary() -> dict:
    now = datetime.utcnow()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    prev_week_ago = (now - timedelta(days=14)).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM episodes") as cursor:
            all_episodes = [dict(r) for r in await cursor.fetchall()]

    total = len(all_episodes)
    this_week = sum(1 for e in all_episodes if e["start_time"] >= week_ago)
    this_month = sum(1 for e in all_episodes if e["start_time"] >= month_ago)
    prev_week = sum(1 for e in all_episodes if prev_week_ago <= e["start_time"] < week_ago)

    avg_peak = sum(e["peak_stress"] for e in all_episodes) / total if total else 0
    avg_dur = sum(e["duration_seconds"] for e in all_episodes) / total if total else 0

    risk_counts: Counter = Counter()
    triggers: Counter = Counter()
    for e in all_episodes:
        if e["analysis_json"]:
            try:
                a = json.loads(e["analysis_json"])
                risk_counts[a.get("risk_level", "medium")] += 1
                t = a.get("trigger", "")
                if t and t != "Unknown":
                    triggers[t] += 1
            except Exception:
                pass

    if this_week > prev_week:
        trend = "worsening"
    elif this_week < prev_week:
        trend = "improving"
    else:
        trend = "stable"

    return {
        "total_episodes": total,
        "episodes_this_week": this_week,
        "episodes_this_month": this_month,
        "avg_peak_stress": round(avg_peak, 1),
        "avg_duration_seconds": round(avg_dur, 1),
        "risk_distribution": {
            "low": risk_counts["low"],
            "medium": risk_counts["medium"],
            "high": risk_counts["high"],
        },
        "trend": trend,
        "top_triggers": [{"trigger": t, "count": c} for t, c in triggers.most_common(5)],
    }


async def get_heatmap() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT start_time FROM episodes") as cursor:
            rows = await cursor.fetchall()

    counts: dict[tuple, int] = {}
    for (start_time,) in rows:
        try:
            dt = datetime.fromisoformat(start_time)
            key = (dt.weekday(), dt.hour)
            counts[key] = counts.get(key, 0) + 1
        except Exception:
            pass

    return [
        {"day": day, "hour": hour, "count": count}
        for (day, hour), count in counts.items()
    ]
