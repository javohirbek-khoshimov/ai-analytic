# core/urls.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.views import router as views_router
from core.middleware.metrics import MetricsMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    # 1) To'g'ri Netlify domenini qo'shamiz
    allow_origins=[
        "https://sinoanalize.netlify.app",   # <— sizning frontend
        "https://sinoanalytic.netlify.app",  # (ixtiyoriy, eski nom bo‘lsa ham)
        "http://localhost:5500",
    ],
    # yoki bitta regex bilan ham qo‘yish mumkin:
    # allow_origin_regex=r"https://.*\.netlify\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(MetricsMiddleware)
app.include_router(views_router)

@app.get("/")
def root():
    return {"status": "ok"}
