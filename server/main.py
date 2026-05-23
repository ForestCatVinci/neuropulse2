import asyncio
import json
import math
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from data_source import get_data_source
from stress_engine import calculate_stress
from episode_logger import (
    init_db,
    log_episode,
    log_datapoints,
    update_episode_analysis,
    get_episodes,
    get_episode_datapoints,
    save_parent_notes,
)
from ai_client import analyze_episode
from telegram_notifier import TelegramNotifier, telegram_poll_loop
from pattern_analyzer import get_summary, get_heatmap
from report_generator import generate_report
from demo_seeder import seed_demo_data, clear_all_data

connected_clients: list[WebSocket] = []
device_clients: list[WebSocket] = []

# Rolling buffer of RR intervals from ESP32 for RMSSD calculation
_device_rr_buffer: list[float] = []
_DEVICE_RR_BUFFER_SIZE = 10


def _compute_rmssd(rr_buf: list[float]) -> float:
    """Compute RMSSD (ms) from a list of successive RR intervals."""
    if len(rr_buf) < 2:
        return 45.0  # default: resting baseline
    diffs = [rr_buf[i + 1] - rr_buf[i] for i in range(len(rr_buf) - 1)]
    return round(math.sqrt(sum(d * d for d in diffs) / len(diffs)), 1)

# DB episode tracking (stress >= 90%)
_episode_active = False
_episode_start: Optional[datetime] = None
_episode_peak_stress = 0.0
_episode_bpm_readings: list[float] = []
_episode_datapoints: list[dict] = []

# Telegram episode tracking (stress >= 70%)
_tg_episode_active = False
_tg_episode_start: Optional[datetime] = None
_tg_peak_stress = 0.0
_tg_bpm_readings: list[float] = []

# Last known readings (for /nonverbal endpoint)
_last_stress = 0.0
_last_bpm = 0.0

notifier = TelegramNotifier()


async def _finish_episode(
    start_time: datetime,
    end_time: datetime,
    peak_stress: float,
    avg_bpm: float,
    datapoints: list,
) -> None:
    episode_id = await log_episode(start_time, end_time, peak_stress, avg_bpm)
    analysis = await analyze_episode(
        peak_stress=peak_stress,
        avg_bpm=avg_bpm,
        duration_seconds=(end_time - start_time).total_seconds(),
        time_of_day=start_time.strftime("%H:%M"),
        day_of_week=start_time.strftime("%A"),
    )
    await update_episode_analysis(episode_id, json.dumps(analysis))
    if datapoints:
        await log_datapoints(episode_id, datapoints)


async def _notify_resolved(peak_stress: float, avg_bpm: float, duration_min: int) -> None:
    analysis = await analyze_episode(
        peak_stress=peak_stress,
        avg_bpm=avg_bpm,
        duration_seconds=duration_min * 60,
        time_of_day=datetime.now().strftime("%H:%M"),
        day_of_week=datetime.now().strftime("%A"),
    )
    await notifier.send_alert(
        "resolved",
        {
            "duration": duration_min,
            "peak_stress": peak_stress,
            "ai_analysis": analysis.get("recommendation", "Monitor closely"),
        },
    )


async def broadcast_loop() -> None:
    global _episode_active, _episode_start, _episode_peak_stress, _episode_bpm_readings, _episode_datapoints
    global _tg_episode_active, _tg_episode_start, _tg_peak_stress, _tg_bpm_readings
    global _last_stress, _last_bpm
    ds = get_data_source()

    while True:
        try:
            raw = ds.read()
            stress = calculate_stress(raw["bpm"], raw["rmssd"])
            alert = stress >= 90.0

            _last_stress = stress
            _last_bpm = raw["bpm"]

            payload = json.dumps(
                {
                    "bpm": raw["bpm"],
                    "stress": stress,
                    "rmssd": raw["rmssd"],
                    "rr_intervals": raw["rr_intervals"],
                    "source": raw["source"],
                    "alert": alert,
                }
            )

            # DB episode detection (>= 90%) — log every datapoint during episode
            if alert:
                if not _episode_active:
                    _episode_active = True
                    _episode_start = datetime.utcnow()
                    _episode_peak_stress = stress
                    _episode_bpm_readings = [raw["bpm"]]
                    _episode_datapoints = []
                else:
                    _episode_peak_stress = max(_episode_peak_stress, stress)
                    _episode_bpm_readings.append(raw["bpm"])
                _episode_datapoints.append(
                    {
                        "ts": datetime.utcnow().isoformat(),
                        "bpm": raw["bpm"],
                        "stress": stress,
                        "rmssd": raw["rmssd"],
                    }
                )
            elif _episode_active:
                _episode_active = False
                end_time = datetime.utcnow()
                captured = _episode_datapoints[:]
                _episode_datapoints = []
                asyncio.create_task(
                    _finish_episode(
                        _episode_start,  # type: ignore[arg-type]
                        end_time,
                        _episode_peak_stress,
                        sum(_episode_bpm_readings) / len(_episode_bpm_readings),
                        captured,
                    )
                )

            # Telegram episode detection (>= 70%)
            user = os.getenv("TELEGRAM_USER_NAME", "User")
            tg_data = {"bpm": raw["bpm"], "stress": stress, "user": user}

            if stress >= 70 and not _tg_episode_active:
                _tg_episode_active = True
                _tg_episode_start = datetime.now()
                _tg_peak_stress = stress
                _tg_bpm_readings = [raw["bpm"]]
            elif _tg_episode_active:
                _tg_peak_stress = max(_tg_peak_stress, stress)
                _tg_bpm_readings.append(raw["bpm"])

            if stress >= 70:
                asyncio.create_task(notifier.send_alert("warning", tg_data))

            if stress >= 90:
                asyncio.create_task(notifier.send_alert("crisis", tg_data))

            if stress < 40 and _tg_episode_active:
                duration_min = int((datetime.now() - _tg_episode_start).total_seconds()) // 60  # type: ignore[operator]
                peak = _tg_peak_stress
                avg_bpm = sum(_tg_bpm_readings) / len(_tg_bpm_readings) if _tg_bpm_readings else raw["bpm"]
                _tg_episode_active = False
                _tg_episode_start = None
                _tg_peak_stress = 0.0
                _tg_bpm_readings = []
                notifier.reset_episode()
                asyncio.create_task(_notify_resolved(peak, avg_bpm, duration_min))

            # Broadcast to WebSocket clients
            dead: list[WebSocket] = []
            for ws in list(connected_clients):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if ws in connected_clients:
                    connected_clients.remove(ws)

        except Exception:
            pass

        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    broadcast_task = asyncio.create_task(broadcast_loop())
    poll_task = asyncio.create_task(telegram_poll_loop())
    yield
    broadcast_task.cancel()
    poll_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in connected_clients:
            connected_clients.remove(ws)


@app.websocket("/ws/device")
async def device_websocket_endpoint(ws: WebSocket) -> None:
    """
    Endpoint for ESP32 / hardware devices (ArduinoWebsockets).
    - Device SENDS plain JSON: {"bpm": 72, "rr_ms": 833, "spo2": 98, "finger": true}
    - Server processes the reading and broadcasts stress payload to all browser clients.
    - Device never receives any messages (avoids ArduinoWebsockets drop-on-incoming-data bug).
    - Accepts both text and binary WebSocket frames.
    """
    client_addr = getattr(ws.client, "host", "unknown")
    print(f"[device] ESP32 connected from {client_addr}", flush=True)
    await ws.accept()
    device_clients.append(ws)
    try:
        while True:
            # Use low-level receive() so we handle both text and binary frames
            # without crashing. receive_text() raises KeyError on binary frames.
            msg = await ws.receive()

            if msg["type"] == "websocket.disconnect":
                print(f"[device] ESP32 disconnected cleanly (code={msg.get('code')})", flush=True)
                break

            # Extract payload — ArduinoWebsockets may send text or binary
            raw: str | None = msg.get("text")
            if raw is None:
                raw_bytes: bytes | None = msg.get("bytes")
                if raw_bytes:
                    raw = raw_bytes.decode("utf-8", errors="ignore")

            if not raw:
                print("[device] empty frame received, skipping", flush=True)
                continue

            print(f"[device] raw frame: {raw!r}", flush=True)

            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"[device] JSON parse error: {exc}", flush=True)
                continue

            # Skip readings when sensor has no finger contact
            if not data.get("finger", True):
                continue

            bpm = float(data.get("bpm", 72))
            rr_ms = float(data.get("rr_ms", 833))

            # Accumulate RR intervals and compute RMSSD
            _device_rr_buffer.append(rr_ms)
            if len(_device_rr_buffer) > _DEVICE_RR_BUFFER_SIZE:
                _device_rr_buffer.pop(0)
            rmssd = _compute_rmssd(_device_rr_buffer)

            stress = calculate_stress(bpm, rmssd)
            alert = stress >= 90.0

            payload = json.dumps(
                {
                    "bpm": round(bpm, 1),
                    "stress": stress,
                    "rmssd": rmssd,
                    "rr_intervals": [round(rr_ms, 1)],
                    "source": "device",
                    "alert": alert,
                }
            )

            print(f"[device] broadcasting stress={stress}% bpm={bpm} to {len(connected_clients)} clients", flush=True)

            # Forward processed reading to all browser clients
            dead: list[WebSocket] = []
            for client in list(connected_clients):
                try:
                    await client.send_text(payload)
                except Exception:
                    dead.append(client)
            for client in dead:
                if client in connected_clients:
                    connected_clients.remove(client)

    except WebSocketDisconnect as exc:
        print(f"[device] WebSocketDisconnect: code={exc.code}", flush=True)
    except Exception as exc:
        print(f"[device] Unexpected error: {type(exc).__name__}: {exc}", flush=True)
    finally:
        if ws in device_clients:
            device_clients.remove(ws)
        print(f"[device] ESP32 connection closed. Active device connections: {len(device_clients)}", flush=True)


@app.get("/episodes")
async def episodes():
    return await get_episodes()


class NotesBody(BaseModel):
    notes: str


@app.patch("/episodes/{episode_id}/notes")
async def update_episode_notes(episode_id: int, body: NotesBody):
    await save_parent_notes(episode_id, body.notes)
    return {"ok": True}


@app.get("/episodes/{episode_id}/datapoints")
async def episode_datapoints_endpoint(episode_id: int):
    return await get_episode_datapoints(episode_id)


@app.get("/analytics/summary")
async def analytics_summary():
    return await get_summary()


@app.get("/analytics/heatmap")
async def analytics_heatmap():
    return await get_heatmap()


@app.get("/report/weekly")
async def report_weekly():
    return await generate_report("weekly")


@app.get("/report/monthly")
async def report_monthly():
    return await generate_report("monthly")


@app.post("/demo/stress/{level}")
async def set_stress(level: float):
    get_data_source().set_stress(level)
    return {"ok": True}


@app.post("/demo/scenario/rising")
async def scenario_rising():
    await get_data_source().start_rising()
    return {"ok": True}


@app.post("/demo/scenario/reset")
async def scenario_reset():
    get_data_source().reset()
    return {"ok": True}


@app.post("/demo/seed")
async def demo_seed():
    count = await seed_demo_data()
    return {"ok": True, "episodes_created": count}


@app.post("/demo/clear")
async def demo_clear():
    await clear_all_data()
    return {"ok": True}


@app.post("/nonverbal/{button}")
async def nonverbal(button: str):
    user = os.getenv("TELEGRAM_USER_NAME", "User")
    await notifier.send_alert(
        "nonverbal",
        {"button": button, "stress": _last_stress, "user": user},
    )
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
