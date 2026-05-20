import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional

import httpx


class TelegramNotifier:
    def __init__(self) -> None:
        self._warning_last: Optional[datetime] = None
        self._crisis_sent = False

    def reset_episode(self) -> None:
        self._crisis_sent = False

    async def send_alert(self, event: str, data: dict) -> None:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        if not token:
            print("[TELEGRAM] No BOT_TOKEN — skipping")
            return

        if event == "warning":
            now = datetime.now()
            if self._warning_last and (now - self._warning_last) < timedelta(minutes=5):
                return
            self._warning_last = now
        elif event == "crisis":
            if self._crisis_sent:
                return
            self._crisis_sent = True

        text = _format_message(event, data)
        if not text:
            return

        print(f"[TELEGRAM] {event} sent at {datetime.now().strftime('%H:%M')}")
        from episode_logger import get_subscribers
        chat_ids = await get_subscribers()
        for cid in chat_ids:
            asyncio.create_task(_send(token, cid, text))


def _format_message(event: str, data: dict) -> str:
    t = datetime.now().strftime("%H:%M")
    user = data.get("user", os.getenv("TELEGRAM_USER_NAME", "User"))
    bpm = data.get("bpm", 0)
    stress = data.get("stress", 0)

    if event == "warning":
        return (
            f"⚠️ *Stress Rising — Warning*\n\n"
            f"👤 User: {user}\n"
            f"💓 Heart Rate: {bpm:.0f} BPM\n"
            f"📊 Stress Level: {stress:.0f}%\n"
            f"🕐 Time: {t}\n\n"
            f"Please check on them."
        )
    if event == "crisis":
        return (
            f"🚨 *CRISIS — Immediate Attention Needed*\n\n"
            f"👤 User: {user}\n"
            f"💓 Heart Rate: {bpm:.0f} BPM\n"
            f"📊 Stress Level: {stress:.0f}%\n"
            f"🕐 Time: {t}\n\n"
            f"Your child needs help right now."
        )
    if event == "nonverbal":
        mapping = {
            "quiet": "🔇 Needs quiet",
            "home": "🏠 Wants to go home",
            "help": "🆘 Needs help",
        }
        label = mapping.get(data.get("button", ""), data.get("button", ""))
        return (
            f"📢 *Non-verbal Signal*\n\n"
            f"👤 {user} sent: {label}\n"
            f"📊 Stress at signal: {stress:.0f}%\n"
            f"🕐 Time: {t}"
        )
    if event == "resolved":
        return (
            f"✅ *Episode Resolved*\n\n"
            f"⏱ Duration: {data.get('duration', 0)} min\n"
            f"📈 Peak stress: {data.get('peak_stress', 0):.0f}%\n"
            f"🧠 AI insight: {data.get('ai_analysis', 'No analysis available')}"
        )
    return ""


async def _send(token: str, chat_id: int, text: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
    except Exception as exc:
        print(f"[TELEGRAM] send failed: {exc}")


async def telegram_poll_loop() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        print("[TELEGRAM] No BOT_TOKEN — polling disabled")
        return

    from episode_logger import add_subscriber
    offset = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                r = await client.get(
                    f"https://api.telegram.org/bot{token}/getUpdates",
                    params={"timeout": 30, "offset": offset, "allowed_updates": ["message"]},
                )
            for upd in r.json().get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message", {})
                if msg.get("text") == "/start":
                    chat_id = msg["chat"]["id"]
                    await add_subscriber(chat_id)
                    asyncio.create_task(
                        _send(token, chat_id, "✅ You are now subscribed to NeuroPulse alerts!")
                    )
                    print(f"[TELEGRAM] New subscriber: {chat_id}")
        except Exception as exc:
            print(f"[TELEGRAM] poll error: {exc}")
            await asyncio.sleep(5)
