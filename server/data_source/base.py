from abc import ABC, abstractmethod


class DataSource(ABC):
    @abstractmethod
    def read(self) -> dict:
        """Return dict with bpm, rmssd, rr_intervals, source."""
        ...

    @abstractmethod
    def set_stress(self, level: float) -> None: ...

    @abstractmethod
    def reset(self) -> None: ...

    @abstractmethod
    async def start_rising(self) -> None: ...
