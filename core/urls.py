# core/urls.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.views import router as views_router
from core.middleware.metrics import MetricsMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sinoanaliz.netlify.app",  # <-- to‘g‘ri domen (analiz)
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(MetricsMiddleware)
app.include_router(views_router)

@app.get("/")
def root():
    return {"status": "ok"}
