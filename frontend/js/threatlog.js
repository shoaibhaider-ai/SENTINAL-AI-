/**
 * threatlog.js — Filterable event log table at the bottom of the dashboard.
 */

const MAX_ROWS   = 200;
let   allEvents  = [];
let   activeFilter = "all";

const BADGE_HTML = {
  normal: `<span class="threat-badge badge-normal">NORMAL</span>`,
  dos:    `<span class="threat-badge badge-dos">DoS</span>`,
  probe:  `<span class="threat-badge badge-probe">PROBE</span>`,
  r2l:    `<span class="threat-badge badge-r2l">R2L</span>`,
  u2r:    `<span class="threat-badge badge-u2r">U2R</span>`,
};

const SEV_COLORS = {
  critical: "var(--accent-p)",
  high:     "var(--accent-r)",
  medium:   "var(--accent-o)",
  low:      "var(--accent-c)",
  info:     "var(--accent-g)",
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
  } catch (_) { return "—"; }
}

function buildRow(ev, isNew = false) {
  const conf    = ev.confidence || 0;
  const sev     = ev.severity   || "info";
  const sevCol  = SEV_COLORS[sev] || "var(--text-dim)";
  return `<tr class="${isNew ? "new-row" : ""}">
    <td style="color:var(--text-muted)">${formatTime(ev.timestamp)}</td>
    <td>${ev.source_ip || "—"}</td>
    <td style="color:var(--text-muted)">${ev.dest_ip || "—"}</td>
    <td>${ev.protocol || "—"}</td>
    <td>${ev.service  || "—"}</td>
    <td>${BADGE_HTML[ev.attack_type] || ev.attack_type}</td>
    <td style="color:${conf>=.85?"var(--accent-r)":conf>=.65?"var(--accent-o)":"var(--accent-g)"}">${(conf*100).toFixed(1)}%</td>
    <td style="color:${sevCol};font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px">${sev}</td>
  </tr>`;
}

function renderTable(newEvId = null) {
  const filtered = activeFilter === "all"
    ? allEvents
    : allEvents.filter(e => e.attack_type === activeFilter);

  document.getElementById("log-count").textContent =
    `${filtered.length} records`;

  const tbody = document.getElementById("log-tbody");
  tbody.innerHTML = filtered.slice(0, MAX_ROWS).map((ev, i) =>
    buildRow(ev, i === 0 && ev.id === newEvId)
  ).join("");
}

/* ─── Filter buttons ────────────────────────────────────────────────── */
document.getElementById("filter-row").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;

  activeFilter = btn.dataset.filter;
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.remove("active","active-dos","active-probe","active-r2l","active-u2r","active-normal");
  });
  const cls = activeFilter === "all" ? "active" : `active-${activeFilter}`;
  btn.classList.add(cls);
  renderTable();
});

/* ─── Listen for new events from dashboard.js ─────────────────────── */
window.addEventListener("sentinel:event", (e) => {
  const ev = e.detail;
  allEvents.unshift(ev);
  if (allEvents.length > MAX_ROWS) allEvents.pop();
  renderTable(ev.id);
});

/* ─── Seed from initial fetch ─────────────────────────────────────── */
(async () => {
  const data = await window.SENTINEL.fetchJSON("/api/events?limit=100");
  if (data?.events) {
    allEvents = data.events;
    renderTable();
  }
})();
