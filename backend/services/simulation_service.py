"""
Simulation Service — Generates realistic NSL-KDD-like traffic records
and runs them through the prediction pipeline every N seconds.
"""

import asyncio
import uuid
import time
import random
import numpy as np
from datetime import datetime, timezone
from typing import Callable, Awaitable

from services.prediction_service import prediction_service
from services.event_store import event_store

# Attack class weights (simulates a realistic network environment)
ATTACK_WEIGHTS = {
    "normal": 0.55,
    "dos":    0.18,
    "probe":  0.12,
    "r2l":    0.09,
    "u2r":    0.06,
}

PROTOCOL_MAP  = {0: "ICMP", 1: "TCP",  2: "UDP"}
SERVICE_POOL  = ["http", "ftp", "smtp", "ssh", "telnet", "dns", "https",
                 "pop3", "imap", "rdp", "snmp", "ntp", "ldap", "other"]
FLAG_MAP      = {0: "SF", 1: "S0", 2: "REJ", 3: "RSTO", 4: "SH"}

ATTACKER_IPS  = [
    "45.33.32.156", "192.241.202.194", "89.248.167.131", "185.220.101.1",
    "62.210.149.198", "141.98.9.29",   "193.148.18.9",   "213.227.154.92",
    "103.99.0.122",  "51.77.135.89",
]
INTERNAL_IPS  = [f"192.168.{r}.{h}" for r in range(1, 5) for h in range(10, 50)]


def _gen_features(attack_type: str) -> np.ndarray:
    """Generate a single 41-feature vector for the given class."""
    rng = np.random
    f = np.zeros(41, dtype=np.float32)

    if attack_type == "normal":
        f[0]  = rng.exponential(10)
        f[1]  = rng.choice([0, 1, 2], p=[0.08, 0.82, 0.10])
        f[2]  = rng.randint(0, 10)
        f[3]  = rng.choice([0, 1, 2], p=[0.85, 0.10, 0.05])
        f[4]  = max(0, rng.lognormal(6, 2))
        f[5]  = max(0, rng.lognormal(7, 2))
        f[11] = rng.binomial(1, 0.80)
        f[22] = rng.randint(1, 80)
        f[23] = rng.randint(1, 80)
        f[24] = np.clip(rng.beta(0.3, 10), 0, 1)
        f[28] = np.clip(rng.beta(9, 1.5), 0, 1)
        f[29] = np.clip(rng.beta(1, 9), 0, 1)
        f[31] = rng.randint(100, 255)
        f[37] = np.clip(rng.beta(0.3, 10), 0, 1)

    elif attack_type == "dos":
        f[0]  = 0
        f[1]  = rng.choice([0, 1, 2], p=[0.35, 0.55, 0.10])
        f[3]  = rng.choice([1, 2, 3], p=[0.5, 0.3, 0.2])
        f[4]  = max(0, rng.lognormal(3, 1))
        f[11] = 0
        f[22] = rng.randint(400, 511)
        f[23] = rng.randint(400, 511)
        f[24] = np.clip(rng.beta(9, 0.5), 0, 1)
        f[25] = np.clip(rng.beta(9, 0.5), 0, 1)
        f[28] = np.clip(rng.beta(9, 0.5), 0, 1)
        f[31] = rng.randint(200, 255)
        f[37] = np.clip(rng.beta(9, 0.5), 0, 1)

    elif attack_type == "probe":
        f[0]  = max(0, rng.exponential(5))
        f[1]  = rng.choice([0, 1, 2], p=[0.2, 0.6, 0.2])
        f[2]  = rng.randint(0, 70)
        f[4]  = max(0, rng.lognormal(3.5, 1.5))
        f[11] = rng.binomial(1, 0.2)
        f[22] = rng.randint(50, 250)
        f[24] = np.clip(rng.beta(3, 5), 0, 1)
        f[28] = np.clip(rng.beta(1, 5), 0, 1)
        f[29] = np.clip(rng.beta(8, 2), 0, 1)
        f[30] = np.clip(rng.beta(7, 2), 0, 1)
        f[31] = rng.randint(1, 100)
        f[34] = np.clip(rng.beta(7, 2), 0, 1)

    elif attack_type == "r2l":
        f[0]  = max(0, rng.lognormal(3, 2))
        f[1]  = rng.choice([0, 1, 2], p=[0.05, 0.90, 0.05])
        f[4]  = max(0, rng.lognormal(8, 2.5))
        f[5]  = max(0, rng.lognormal(4, 2))
        f[11] = rng.binomial(1, 0.3)
        f[22] = rng.randint(1, 20)
        f[28] = np.clip(rng.beta(5, 3), 0, 1)
        f[31] = rng.randint(1, 50)

    elif attack_type == "u2r":
        f[0]  = max(0, rng.exponential(30))
        f[1]  = 1
        f[4]  = max(0, rng.lognormal(5, 2))
        f[11] = 1
        f[13] = rng.binomial(1, 0.75)
        f[14] = rng.binomial(1, 0.50)
        f[15] = max(0, rng.lognormal(1, 2))
        f[16] = max(0, rng.lognormal(1, 1.5))
        f[22] = rng.randint(1, 10)
        f[31] = rng.randint(1, 30)

    # Small noise on zero fields
    zero_mask = f == 0
    f[zero_mask] += rng.normal(0, 0.01, zero_mask.sum()).astype(np.float32)
    return f


def _pick_ips(attack_type: str):
    if attack_type in ("dos", "probe", "r2l", "u2r"):
        src = random.choice(ATTACKER_IPS)
    else:
        src = random.choice(INTERNAL_IPS)
    dst = random.choice(INTERNAL_IPS)
    return src, dst


def _build_event(attack_type: str, features: np.ndarray, prediction: dict) -> dict:
    src, dst = _pick_ips(attack_type)
    protocol = PROTOCOL_MAP.get(int(features[1]), "TCP")
    service  = SERVICE_POOL[int(features[2]) % len(SERVICE_POOL)]
    flag     = FLAG_MAP.get(int(features[3]), "SF")
    return {
        "id":            str(uuid.uuid4()),
        "ts":            time.time(),
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "source_ip":     src,
        "dest_ip":       dst,
        "protocol":      protocol,
        "service":       service,
        "flag":          flag,
        "src_bytes":     int(features[4]),
        "dst_bytes":     int(features[5]),
        "attack_type":   prediction["attack_type"],
        "true_label":    attack_type,      # ground-truth (for demo only)
        "confidence":    prediction["confidence"],
        "severity":      prediction["severity"],
        "severity_score": prediction["severity_score"],
        "probabilities": prediction["probabilities"],
    }


class SimulationService:
    def __init__(self):
        self._running   = False
        self._interval  = 1.2           # seconds between events
        self._callbacks = []            # async broadcast callbacks

    def register_broadcast(self, cb: Callable[[dict], Awaitable[None]]):
        self._callbacks.append(cb)

    async def start(self):
        if self._running:
            return
        self._running = True
        print("[SIM] Traffic simulation started")
        while self._running:
            if prediction_service.ready:
                try:
                    await self._emit_event()
                except Exception as exc:
                    print(f"[SIM] Error: {exc}")
            await asyncio.sleep(self._interval)

    async def _emit_event(self):
        classes  = list(ATTACK_WEIGHTS.keys())
        weights  = list(ATTACK_WEIGHTS.values())
        cls      = random.choices(classes, weights=weights, k=1)[0]
        features = _gen_features(cls)
        pred     = prediction_service.predict(features)
        event    = _build_event(cls, features, pred)
        event_store.add_event(event)
        for cb in self._callbacks:
            try:
                await cb(event)
            except Exception:
                pass

    def stop(self):
        self._running = False


simulation_service = SimulationService()
