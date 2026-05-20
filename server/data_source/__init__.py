from .simulator import SimulatorDataSource

_instance: SimulatorDataSource | None = None


def get_data_source() -> SimulatorDataSource:
    global _instance
    if _instance is None:
        _instance = SimulatorDataSource()
    return _instance
