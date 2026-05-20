import asyncio
import math
import random
import time
from typing import Optional

from .base import DataSource


class SimulatorDataSource(DataSource):
    def __init__(self) -> None:
        self.stress_level: float = 0.0
        self._start_time: float = time.time()
        self._rising_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    def set_stress(self, level: float) -> None:
        self.stress_level = max(0.0, min(1.0, level))
        self._cancel_rising()

    def reset(self) -> None:
        self.stress_level = 0.0
        self._cancel_rising()

    async def start_rising(self) -> None:
        self._cancel_rising()
        self.stress_level = 0.0
        self._rising_task = asyncio.create_task(self._rise())

    def _cancel_rising(self) -> None:
        if self._rising_task and not self._rising_task.done():
            self._rising_task.cancel()

    async def _rise(self) -> None:
        steps = 300  # 30 s at 10 steps/s
        for i in range(steps):
            self.stress_level = i / steps
            await asyncio.sleep(0.1)
        self.stress_level = 1.0

    def read(self) -> dict:
        t = time.time() - self._start_time
        breathing = math.sin(2 * math.pi * t / 4.0)

        bpm_base = 68.0 + 28.0 * self.stress_level
        bpm = bpm_base + 2.0 * breathing + random.gauss(0, 1.5)
        bpm = max(50.0, min(120.0, bpm))

        rmssd_base = 45.0 - 30.0 * self.stress_level
        rmssd = rmssd_base + 1.0 * breathing + random.gauss(0, 0.5)
        rmssd = max(10.0, min(60.0, rmssd))

        avg_rr = 60000.0 / bpm
        rr_intervals = [round(avg_rr + random.gauss(0, rmssd * 0.5), 1) for _ in range(5)]

        return {
            "bpm": round(bpm, 1),
            "rmssd": round(rmssd, 1),
            "rr_intervals": rr_intervals,
            "source": "simulator",
        }
