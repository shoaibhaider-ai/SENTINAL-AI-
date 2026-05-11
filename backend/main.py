"""
SENTINEL AI — FastAPI Backend Entry Point
Serves frontend static files and runs the NIDS simulation.
Compatible with FastAPI 0.104+ and Python 3.14.
"""

import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from services.prediction_service import prediction_service
from services.simulation_service import simulation_service
from routes.events  import router as events_router
from routes.metrics import router as metrics_router
from routes.predict import router as predict_router

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(
    title="SENTINEL AI — NIDS Backend",
    description="AI-Powered Network Intrusion Detection System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events_router)
app.include_router(metrics_router)
app.include_router(predict_router)

# Serve frontend
if FRONTEND_DIR.exists():
    @app.get("/")
    async def serve_dashboard():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/css/{path:path}")
    async def serve_css(path: str):
        return FileResponse(str(FRONTEND_DIR / "css" / path))

    @app.get("/js/{path:path}")
    async def serve_js(path: str):
        return FileResponse(str(FRONTEND_DIR / "js" / path))


@app.on_event("startup")
async def startup():
    print("[BOOT] Loading NIDS model ...")
    loaded = prediction_service.load()
    if not loaded:
        print("[WARN] Model not found. Run: python model/train_model.py")
    else:
        asyncio.create_task(simulation_service.start())
        print("[BOOT] Simulation engine started")


@app.on_event("shutdown")
async def shutdown():
    simulation_service.stop()
    print("[BOOT] Shutdown complete")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, ws="websockets", reload=True)
