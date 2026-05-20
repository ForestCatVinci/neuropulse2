import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from data_source import get_data_source
from stress_engine import calculate_stress
from episode_logger import init_db, log_episode, update_episode_analysis, get_episodes
from ai_client import analyze_episode

connected_clients: list[WebSocket] = []

# Episode tracking
_episode_active = False
_episode_start: Optional[datetime] = None
_episode_peak_stress = 0.0
_episode_bpm_readings: list[float] = []


async def _finish_episode(
    start_time: datetime,
    end_time: datetime,
    peak_stress: float,
    avg_bpm: float,
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


async def broadcast_loop() -> None:
    global _episode_active, _episode_start, _episode_peak_stress, _episode_bpm_readings
    ds = get_data_source()

    while True:
        try:
            raw = ds.read()
            stress = calculate_stress(raw["bpm"], raw["rmssd"])
            alert = stress >= 90.0

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

            # Episode detection
            if alert:
                if not _episode_active:
                    _episode_active = True
                    _episode_start = datetime.utcnow()
                    _episode_peak_stress = stress
                    _episode_bpm_readings = [raw["bpm"]]
                else:
                    _episode_peak_stress = max(_episode_peak_stress, stress)
                    _episode_bpm_readings.append(raw["bpm"])
            elif _episode_active:
                _episode_active = False
                end_time = datetime.utcnow()
                asyncio.create_task(
                    _finish_episode(
                        _episode_start,  # type: ignore[arg-type]
                        end_time,
                        _episode_peak_stress,
                        sum(_episode_bpm_readings) / len(_episode_bpm_readings),
                    )
                )

            # Broadcast
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
    task = asyncio.create_task(broadcast_loop())
    yield
    task.cancel()


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


@app.get("/episodes")
async def episodes():
    return await get_episodes()


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


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
