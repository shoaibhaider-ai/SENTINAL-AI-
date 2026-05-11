"""
Prediction Service — Loads the trained NIDS model (sklearn MLP) and runs inference.
"""

import json
import numpy as np
import joblib
from pathlib import Path
from typing import Dict, Any, List

MODEL_DIR    = Path(__file__).parent.parent / "model"
MODEL_PATH   = MODEL_DIR / "nids_model.pkl"
SCALER_PATH  = MODEL_DIR / "scaler.pkl"
ENCODER_PATH = MODEL_DIR / "label_encoder.pkl"
METRICS_PATH = MODEL_DIR / "metrics.json"

SEVERITY_MAP = {
    "normal": ("info",     5),
    "probe":  ("low",     35),
    "r2l":    ("medium",  60),
    "dos":    ("high",    85),
    "u2r":    ("critical", 98),
}


class PredictionService:
    def __init__(self):
        self._model   = None
        self._scaler  = None
        self._classes: List[str] = []
        self._metrics: Dict[str, Any] = {}
        self._ready   = False

    def load(self) -> bool:
        if self._ready:
            return True
        if not MODEL_PATH.exists():
            print(f"[MODEL] Not found at {MODEL_PATH}. Run train_model.py first.")
            return False
        try:
            self._model   = joblib.load(MODEL_PATH)
            self._scaler  = joblib.load(SCALER_PATH)
            self._classes = joblib.load(ENCODER_PATH).classes_.tolist()
            if METRICS_PATH.exists():
                with open(METRICS_PATH) as fh:
                    self._metrics = json.load(fh)
            self._ready = True
            print("[MODEL] NIDS model loaded OK")
            return True
        except Exception as exc:
            print(f"[MODEL] Load error: {exc}")
            return False

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def metrics(self) -> Dict[str, Any]:
        return self._metrics

    def predict(self, features: np.ndarray) -> Dict[str, Any]:
        if not self._ready:
            raise RuntimeError("Model not loaded.")

        single = features.ndim == 1
        if single:
            features = features.reshape(1, -1)

        scaled = self._scaler.transform(features)
        proba  = self._model.predict_proba(scaled)   # (N, 5)
        idxs   = np.argmax(proba, axis=1)

        results = []
        for i, idx in enumerate(idxs):
            cls               = self._classes[idx]
            conf              = float(proba[i, idx])
            sev_label, sev_score = SEVERITY_MAP.get(cls, ("low", 20))
            sev_score         = min(int(sev_score * conf + sev_score * 0.15), 100)
            results.append({
                "attack_type":    cls,
                "confidence":     round(conf, 4),
                "severity":       sev_label,
                "severity_score": sev_score,
                "probabilities":  {
                    self._classes[j]: round(float(proba[i, j]), 4)
                    for j in range(len(self._classes))
                },
            })
        return results[0] if single else results


prediction_service = PredictionService()
