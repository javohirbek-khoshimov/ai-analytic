# core/middleware/metrics_runtime.py
from collections import deque
import time, statistics

# oxirgi ~5 daqiqadagi so'rovlar (har request uchun timestamp, latency_ms)
_window = deque(maxlen=300)

RUNTIME = {
    "req_count": 0,
    "error_count": 0,
    "lat_p50_ms": 0.0,
    "lat_p95_ms": 0.0,
    "ai_tokens_avg": 0.0,
    "ai_cost_usd_min": 0.0,
    "req_per_min": 0.0,
}

def record_request(latency_ms: float, ok: bool=True, tokens:int|None=None, cost:float|None=None):
    now = time.time()
    _window.append((now, latency_ms))
    RUNTIME["req_count"] += 1
    if not ok:
        RUNTIME["error_count"] += 1

    if tokens is not None:
        # soddalashtirilgan harakatli o'rtacha
        RUNTIME["ai_tokens_avg"] = (RUNTIME["ai_tokens_avg"] * 0.9) + (tokens * 0.1)

    if cost is not None:
        # bu metriksni siz o'zingizda periodik nollashni xohlasangiz, background task qo'shasiz
        RUNTIME["ai_cost_usd_min"] += float(cost)

    latencies = [x[1] for x in _window]
    if latencies:
        # p50 va p95 taxminiy kvantillar
        try:
            RUNTIME["lat_p50_ms"] = statistics.quantiles(latencies, n=2)[0]
            RUNTIME["lat_p95_ms"] = statistics.quantiles(latencies, n=20)[18]
        except Exception:
            RUNTIME["lat_p50_ms"] = sum(latencies)/len(latencies)
            RUNTIME["lat_p95_ms"] = max(latencies)

    cutoff = now - 60
    per_min = len([t for (t, _) in _window if t >= cutoff])
    RUNTIME["req_per_min"] = float(per_min)