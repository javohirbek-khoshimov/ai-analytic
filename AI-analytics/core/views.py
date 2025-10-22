# core/views.py
from fastapi import APIRouter
from datetime import datetime
import psutil
from pydantic import BaseModel
from datetime import datetime, timedelta


# BIR XIL relative import:
from .middleware.metrics_runtime import RUNTIME, record_request

router = APIRouter()

@router.get("/healthz")
def healthz():
    return {"ok": True, "time": datetime.utcnow().isoformat()}

@router.get("/metrics_json")
def metrics_json():
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory().percent
    
    req = max(RUNTIME["req_count"], 1)
    errors = RUNTIME["error_count"]

    local_time = datetime.utcnow() + timedelta(hours=5)
    return {
        "time": local_time.isoformat(),
        "latency_ms_p50": round(RUNTIME["lat_p50_ms"], 2),
        "latency_ms_p95": round(RUNTIME["lat_p95_ms"], 2),
        "error_rate": round(errors / req, 4),
        "ai_tokens_avg": round(RUNTIME["ai_tokens_avg"], 2),
        "ai_cost_usd": round(RUNTIME["ai_cost_usd_min"], 4),
        "cpu_percent": round(cpu, 1),
        "ram_percent": round(mem, 1),
        "req_per_min": round(RUNTIME["req_per_min"], 2),
    }

class MetricIn(BaseModel):
    latency_ms: float
    ok: bool = True
    tokens: int | None = None
    cost: float | None = None

@router.post("/metrics_ingest")
def metrics_ingest(m: MetricIn):
    record_request(
        latency_ms=m.latency_ms,
        ok=m.ok,
        tokens=m.tokens,
        cost=m.cost
    )
    return {"ok": True}