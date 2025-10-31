# core/urls.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.views import router as views_router
from core.middleware.metrics import MetricsMiddleware  # middleware

app = FastAPI()

# CORS (local uchun ochiq)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://sinoanalytic.netlify.app", "http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics middleware
app.add_middleware(MetricsMiddleware)

# Routerlarni ulash (healthz, metrics_json shu routerda!)
app.include_router(views_router)

@app.get("/")
def root():
    return {"status": "ok"}