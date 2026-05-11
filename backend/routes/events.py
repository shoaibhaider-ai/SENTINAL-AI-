"""
WebSocket + Events Routes
GET  /api/events          — recent events (paginated)
WS   /ws/events           — real-time event stream
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.event_store import event_store
from services.simulation_service import simulation_service

router = APIRouter()


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        print(f"[WS] Client connected ({len(self.active)} total)")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        print(f"[WS] Client disconnected ({len(self.active)} remaining)")

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()

# Register broadcast callback with simulation service
simulation_service.register_broadcast(
    lambda event: manager.broadcast({"type": "threat_event", "data": event})
)


# ── REST endpoint ─────────────────────────────────────────────────────────────

@router.get("/api/events")
async def get_events(limit: int = Query(100, ge=1, le=500)):
    events = event_store.get_recent(limit)
    stats  = event_store.get_stats()
    return {"events": events, "stats": stats}


@router.get("/api/events/timeline")
async def get_timeline():
    timeline = event_store.get_timeline(bucket_seconds=10, n_buckets=30)
    return {"timeline": timeline, "bucket_seconds": 10}


# ── WebSocket endpoint (hardened lifecycle handler) ───────────────────────────

@router.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    await ws.accept()
    manager.active.append(ws)
    print(f"[WS] Client connected ({len(manager.active)} total)")
    # Push last 20 events immediately so UI has data on load
    recent = event_store.get_recent(20)
    for ev in reversed(recent):
        try:
            await ws.send_text(json.dumps({"type": "threat_event", "data": ev}))
        except Exception:
            break
    try:
        while True:
            # Keep alive — receive pings from client
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in manager.active:
            manager.active.remove(ws)
        print(f"[WS] Client disconnected ({len(manager.active)} remaining)")
    except Exception:
        if ws in manager.active:
            manager.active.remove(ws)
        try:
            await ws.close()
        except Exception:
            pass
