/**
 * api.js — WebSocket + REST helpers
 * All communication with the FastAPI backend lives here.
 */

const API_BASE = `${window.location.protocol}//${window.location.host}`;
const WS_URL   = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`;

const COLORS = {
  normal: { hex: "#00ff88", bg: "rgba(0,255,136,.12)", border: "rgba(0,255,136,.3)" },
  dos:    { hex: "#ff4d6d", bg: "rgba(255,77,109,.12)", border: "rgba(255,77,109,.3)" },
  probe:  { hex: "#00d4ff", bg: "rgba(0,212,255,.12)", border: "rgba(0,212,255,.3)" },
  r2l:    { hex: "#ff9f43", bg: "rgba(255,159,67,.12)", border: "rgba(255,159,67,.3)" },
  u2r:    { hex: "#a855f7", bg: "rgba(168,85,247,.12)", border: "rgba(168,85,247,.3)" },
};

const SEVERITY_ORDER = ["critical","high","medium","low","info"];

/* ─── REST helpers ────────────────────────────────────────────────────── */
async function fetchJSON(path) {
  try {
    const r = await fetch(API_BASE + path);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  } catch (e) {
    console.warn("[API]", path, e.message);
    return null;
  }
}

/* ─── WebSocket manager ───────────────────────────────────────────────── */
class SentinelWS {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.ws      = null;
    this.retries = 0;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.retries = 0;
      document.getElementById("status-dot").style.background  = "var(--accent-g)";
      document.getElementById("status-text").textContent = "SYSTEM ACTIVE";
      console.info("[WS] Connected");
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "threat_event") this.onEvent(msg.data);
      } catch (_) {}
    };

    this.ws.onerror = () => {
      document.getElementById("status-dot").style.background  = "var(--accent-r)";
      document.getElementById("status-text").textContent = "CONNECTION ERROR";
    };

    this.ws.onclose = () => {
      document.getElementById("status-dot").style.background  = "var(--accent-o)";
      document.getElementById("status-text").textContent = "RECONNECTING …";
      const delay = Math.min(3000 * 2 ** this.retries, 30000);
      this.retries++;
      setTimeout(() => this.connect(), delay);
    };

    // Keepalive ping every 25 s
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send("ping");
    }, 25000);
  }
}

/* ─── Export globals ──────────────────────────────────────────────────── */
window.SENTINEL = { API_BASE, fetchJSON, SentinelWS, COLORS, SEVERITY_ORDER };
