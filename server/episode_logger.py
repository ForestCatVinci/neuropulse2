from datetime import datetime
from typing import Optional

import aiosqlite

DB_PATH = "episodes.db"


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS episodes (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                start_time       TEXT    NOT NULL,
                end_time         TEXT    NOT NULL,
                peak_stress      REAL    NOT NULL,
                avg_bpm          REAL    NOT NULL,
                duration_seconds REAL    NOT NULL,
                analysis_json    TEXT
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS telegram_subscribers (
                chat_id INTEGER PRIMARY KEY
            )
            """
        )
        await db.commit()


async def add_subscriber(chat_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO telegram_subscribers (chat_id) VALUES (?)",
            (chat_id,),
        )
        await db.commit()


async def get_subscribers() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT chat_id FROM telegram_subscribers") as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


async def log_episode(
    start_time: datetime,
    end_time: datetime,
    peak_stress: float,
    avg_bpm: float,
) -> int:
    duration = (end_time - start_time).total_seconds()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO episodes
               (start_time, end_time, peak_stress, avg_bpm, duration_seconds, analysis_json)
               VALUES (?, ?, ?, ?, ?, NULL)""",
            (start_time.isoformat(), end_time.isoformat(), peak_stress, avg_bpm, duration),
        )
        await db.commit()
        return cursor.lastrowid  # type: ignore[return-value]


async def update_episode_analysis(episode_id: int, analysis_json: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE episodes SET analysis_json = ? WHERE id = ?",
            (analysis_json, episode_id),
        )
        await db.commit()


async def get_episodes() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM episodes ORDER BY start_time DESC LIMIT 20"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
