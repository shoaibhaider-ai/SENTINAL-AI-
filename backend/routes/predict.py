"""
Predict Route — POST /api/predict
Accepts raw features and returns a prediction.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
import numpy as np
from services.prediction_service import prediction_service

router = APIRouter()


class PredictRequest(BaseModel):
    features: List[float] = Field(..., min_length=41, max_length=41,
                                  description="41 NSL-KDD feature values")


@router.post("/api/predict")
async def predict(req: PredictRequest):
    if not prediction_service.ready:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Run: python model/train_model.py"
        )
    features = np.array(req.features, dtype=np.float32)
    result   = prediction_service.predict(features)
    return result
