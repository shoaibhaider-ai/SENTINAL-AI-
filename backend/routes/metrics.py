"""
Metrics Route — GET /api/metrics
Returns model performance metrics and live event statistics.
"""

from fastapi import APIRouter, HTTPException
from services.prediction_service import prediction_service
from services.event_store import event_store

router = APIRouter()


@router.get("/api/metrics")
async def get_metrics():
    if not prediction_service.ready:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Run: python model/train_model.py"
        )
    return {
        "model": prediction_service.metrics,
        "live":  event_store.get_stats(),
    }


@router.get("/api/health")
async def health():
    return {
        "status":       "ok",
        "model_ready":  prediction_service.ready,
        "total_events": event_store.get_stats()["total_events"],
    }
