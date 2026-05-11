"""
Event Store — Thread-safe in-memory store for threat events.
Keeps the last MAX_EVENTS records using a ring-buffer approach.
"""
from collections import deque
from threading import Lock
from typing import List, Dict, Any
import time

MAX_EVENTS = 500


class EventStore:
    def __init__(self):
        self._events: deque = deque(maxlen=MAX_EVENTS)
        self._lock = Lock()
        self._stats = {
            "total_events": 0,
            "attack_counts": {"normal": 0, "dos": 0, "probe": 0, "r2l": 0, "u2r": 0},
            "severity_counts": {"info": 0, "low": 0, "medium": 0, "high": 0, "critical": 0},
            "start_time": time.time(),
        }

    def add_event(self, event: Dict[str, Any]) -> None:
        with self._lock:
            self._events.append(event)
            self._stats["total_events"] += 1
            attack = event.get("attack_type", "normal")
            if attack in self._stats["attack_counts"]:
                self._stats["attack_counts"][attack] += 1
            sev = event.get("severity", "info")
            if sev in self._stats["severity_counts"]:
                self._stats["severity_counts"][sev] += 1

    def get_recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            events = list(self._events)
        return list(reversed(events))[:limit]

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            elapsed = time.time() - self._stats["start_time"]
            total = self._stats["total_events"]
            rate = round(total / elapsed * 60, 2) if elapsed > 0 else 0
            return {
                **self._stats,
                "elapsed_seconds": round(elapsed, 1),
                "events_per_minute": rate,
            }

    def get_timeline(self, bucket_seconds: int = 10, n_buckets: int = 30):
        """Return event counts bucketed by time for the chart."""
        now = time.time()
        buckets = [0] * n_buckets
        with self._lock:
            for ev in self._events:
                age = now - ev.get("ts", now)
                idx = int(age / bucket_seconds)
                if 0 <= idx < n_buckets:
                    buckets[idx] += 1
        buckets.reverse()
        return buckets


# Singleton
event_store = EventStore()
