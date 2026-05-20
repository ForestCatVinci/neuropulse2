from .base import DataSource


class DeviceDataSource(DataSource):
    """Stub — replace body with real ESP32 BLE/serial read when hardware is ready."""

    def read(self) -> dict:
        raise NotImplementedError("Real device not connected")

    def set_stress(self, level: float) -> None:
        pass

    def reset(self) -> None:
        pass

    async def start_rising(self) -> None:
        pass
