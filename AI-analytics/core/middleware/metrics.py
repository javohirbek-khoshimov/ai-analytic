# core/middleware/metrics.py
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from .metrics_runtime import record_request

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        t0 = time.perf_counter()
        ok = True
        tokens = None
        cost = None
        try:
            response: Response = await call_next(request)

            # Agar endpoint javobida headerlar berilsa (ixtiyoriy):
            #   X-AI-Tokens: 123
            #   X-AI-Cost-USD: 0.0042
            tok = response.headers.get('X-AI-Tokens')
            cst = response.headers.get('X-AI-Cost-USD')
            if tok and tok.isdigit():
                tokens = int(tok)
            if cst is not None:
                try:
                    cost = float(cst)
                except ValueError:
                    cost = None

            # Error rate uchun status-code asosida baholaymiz:
            # 5xx → xato (klassik). Agar 4xx ham xato bo'lsin desangiz: < 400 deb o'zgartiring.
            ok = (response.status_code < 500)
            return response
        except Exception:
            ok = False
            raise
        finally:
            dt_ms = (time.perf_counter() - t0) * 1000.0
            record_request(latency_ms=dt_ms, ok=ok, tokens=tokens, cost=cost)