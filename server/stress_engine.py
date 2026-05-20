_BPM_REST = 68.0
_BPM_MAX = 96.0
_RMSSD_REST = 45.0
_RMSSD_MIN = 15.0


def calculate_stress(bpm: float, rmssd: float) -> float:
    rmssd_score = (_RMSSD_REST - rmssd) / (_RMSSD_REST - _RMSSD_MIN)
    rmssd_score = max(0.0, min(1.0, rmssd_score))

    bpm_score = (bpm - _BPM_REST) / (_BPM_MAX - _BPM_REST)
    bpm_score = max(0.0, min(1.0, bpm_score))

    stress = (0.7 * rmssd_score + 0.3 * bpm_score) * 100.0
    return round(max(0.0, min(100.0, stress)), 1)
