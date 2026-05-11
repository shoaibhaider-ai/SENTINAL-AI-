/**
 * dashboard.js
 * Handles: live clock, stat cards, live feed, traffic chart,
 *          donut chart, ML insights, confusion matrix, accuracy curve.
 */

const S_fetchJSON = window.SENTINEL.fetchJSON;
const S_SentinelWS = window.SENTINEL.SentinelWS;
const S_COLORS = window.SENTINEL.COLORS;

/* ─── State ───────────────────────────────────────────────────────────── */
const state = {
  events:      [],
  attackCounts: { normal:0, dos:0, probe:0, r2l:0, u2r:0 },
  timeline:    new Array(30).fill(0),
  valCurve:    [],
};

/* ─── Clock ───────────────────────────────────────────────────────────── */
function tickClock() {
  document.getElementById("live-clock").textContent =
    new Date().toLocaleTimeString("en-GB", { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

/* ─── Traffic line chart ──────────────────────────────────────────────── */
const trafficCtx = document.getElementById("traffic-chart").getContext("2d");
const trafficChart = new Chart(trafficCtx, {
  type: "line",
  data: {
    labels: Array.from({length:30}, (_,i) => `-${(29-i)*10}s`),
    datasets: [{
      label: "Events",
      data: state.timeline,
      borderColor: "#00d4ff",
      backgroundColor: "rgba(0,212,255,.08)",
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      tension: 0.4,
    }],
  },
  options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color:"#64748b", font:{size:9} }, grid: { color:"rgba(255,255,255,.03)" } },
      y: { ticks: { color:"#64748b", font:{size:9} }, grid: { color:"rgba(255,255,255,.04)" }, min:0 },
    },
  },
});

/* ─── Donut chart ─────────────────────────────────────────────────────── */
const donutCtx = document.getElementById("donut-chart").getContext("2d");
const donutChart = new Chart(donutCtx, {
  type: "doughnut",
  data: {
    labels: ["Normal","DoS","Probe","R2L","U2R"],
    datasets: [{
      data: [1,0,0,0,0],
      backgroundColor: Object.values(S_COLORS).map(c => c.bg.replace(",.12",",.5")),
      borderColor:     Object.values(S_COLORS).map(c => c.hex),
      borderWidth: 2,
      hoverOffset: 8,
    }],
  },
  options: {
    responsive:true, maintainAspectRatio:false,
    plugins: {
      legend: { display:false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} events (${
            Math.round(ctx.parsed / (Object.values(state.attackCounts).reduce((a,b)=>a+b,0)||1)*100)
          }%)`,
        },
      },
    },
    cutout: "68%",
  },
});

/* ─── Donut legend ────────────────────────────────────────────────────── */
function updateDonutLegend() {
  const total = Object.values(state.attackCounts).reduce((a,b)=>a+b,0) || 1;
  const legend = document.getElementById("donut-legend");
  legend.innerHTML = Object.entries(S_COLORS).map(([cls, c]) => {
    const count = state.attackCounts[cls] || 0;
    const pct   = Math.round(count/total*100);
    return `<div style="display:flex;align-items:center;gap:8px;font-size:11px">
      <div style="width:8px;height:8px;border-radius:50%;background:${c.hex};flex-shrink:0"></div>
      <span style="color:var(--text-dim);flex:1;text-transform:uppercase;letter-spacing:.5px">${cls}</span>
      <span style="color:var(--text);font-family:'JetBrains Mono',monospace;font-weight:600">${pct}%</span>
    </div>`;
  }).join("");
}

/* ─── Accuracy curve (mini chart) ────────────────────────────────────── */
let accCurveChart = null;
function drawAccCurve(vals) {
  const ctx = document.getElementById("acc-curve").getContext("2d");
  if (accCurveChart) accCurveChart.destroy();
  accCurveChart = new Chart(ctx, {
    type:"line",
    data:{
      labels: vals.map((_,i)=>`E${i+1}`),
      datasets:[{
        data: vals.map(v => +(v*100).toFixed(2)),
        borderColor:"#00ff88",
        backgroundColor:"rgba(0,255,136,.08)",
        borderWidth:1.5, pointRadius:0, fill:true, tension:0.3,
      }],
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{display:false},
        y:{ticks:{color:"#64748b",font:{size:8}},grid:{color:"rgba(255,255,255,.03)"},
           min:80, max:100},
      },
    },
  });
}

/* ─── Confusion matrix ───────────────────────────────────────────────── */
function drawConfusionMatrix(cm, classes) {
  const grid = document.getElementById("cm-grid");
  const n    = classes.length;
  const short = {normal:"NRM",dos:"DoS",probe:"PRB",r2l:"R2L",u2r:"U2R"};

  // Find max for colour scaling
  let maxVal = 0;
  cm.forEach(row => row.forEach(v => { if(v > maxVal) maxVal = v; }));

  const size = Math.min(Math.floor(320/n)-6, 52);
  grid.style.gridTemplateColumns = `32px ${"1fr ".repeat(n)}`;

  let html = `<div class="cm-label"></div>`;
  classes.forEach(c => html += `<div class="cm-label" style="font-size:9px">${short[c]||c}</div>`);

  cm.forEach((row, ri) => {
    html += `<div class="cm-label" style="font-size:9px">${short[classes[ri]]||classes[ri]}</div>`;
    row.forEach((val, ci) => {
      const isDiag = ri === ci;
      const ratio  = maxVal ? val/maxVal : 0;
      const alpha  = isDiag ? 0.15 + ratio*0.7 : ratio*0.55;
      const col    = isDiag ? "#00ff88" : "#ff4d6d";
      const style  = `background:${col.replace("#","rgba(")
        .replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,
          (_,r,g,b)=>`${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}`)},${alpha.toFixed(2)});
        color:${isDiag?"var(--accent-g)":"var(--text-dim)"};
        width:${size}px;height:${size}px;font-size:${size>40?11:9}px;`;
      html += `<div class="cm-cell" style="${style}" title="${classes[ri]}→${classes[ci]}: ${val}">${val}</div>`;
    });
  });
  grid.innerHTML = html;
}

/* ─── ML metrics panel ───────────────────────────────────────────────── */
function renderMetrics(data) {
  const bars = [
    { label:"Accuracy",  val: data.accuracy },
    { label:"Precision", val: data.precision },
    { label:"Recall",    val: data.recall },
    { label:"F1-Score",  val: data.f1_score },
  ];
  document.getElementById("metric-bars").innerHTML = bars.map(b => `
    <div class="metric-bar-row">
      <div class="metric-bar-label">${b.label}</div>
      <div class="metric-bar-track">
        <div class="metric-bar-fill" style="width:${(b.val*100).toFixed(1)}%"></div>
      </div>
      <div class="metric-bar-val">${(b.val*100).toFixed(1)}%</div>
    </div>`).join("");

  document.getElementById("stat-acc").textContent =
    `${(data.accuracy*100).toFixed(1)}%`;

  document.getElementById("model-badge").textContent =
    `LSTM · ${(data.accuracy*100).toFixed(1)}% ACC`;

  // Architecture
  const arch = (data.architecture || "").replace(/→/g, " →\n");
  document.getElementById("arch-text").textContent =
    `Dense(128)→LSTM(64)\n→LSTM(32)→Dense(5)`;

  // Per-class table
  const tbody = document.getElementById("per-class-body");
  const classes = data.classes || [];
  const cls_map = { normal:"🟢",dos:"🔴",probe:"🔵",r2l:"🟠",u2r:"🟣" };
  tbody.innerHTML = classes.map(c => {
    const m = (data.per_class||{})[c] || {};
    return `<tr>
      <td>${cls_map[c]||""} ${c.toUpperCase()}</td>
      <td style="color:var(--accent-c)">${((m.precision||0)*100).toFixed(1)}%</td>
      <td style="color:var(--accent-g)">${((m.recall||0)*100).toFixed(1)}%</td>
      <td style="color:var(--accent-o)">${(((m["f1-score"]||0))*100).toFixed(1)}%</td>
    </tr>`;
  }).join("");

  // Confusion matrix
  if (data.confusion_matrix && data.classes) {
    drawConfusionMatrix(data.confusion_matrix, data.classes);
  }

  // Accuracy curve
  if (data.val_accuracy_curve?.length) {
    drawAccCurve(data.val_accuracy_curve);
  }
}

/* ─── Live feed ──────────────────────────────────────────────────────── */
const SEV_BARS = { critical:"sev-critical",high:"sev-high",medium:"sev-medium",low:"sev-low",info:"sev-info" };
const MAX_FEED = 80;

function addFeedItem(ev) {
  const feed = document.getElementById("threat-feed");
  const sev  = ev.severity || "info";
  const conf = ev.confidence || 0;
  const confCls = conf >= 0.85 ? "conf-high" : conf >= 0.65 ? "conf-med" : "conf-low";
  const time = new Date(ev.timestamp).toLocaleTimeString("en-GB",{hour12:false});

  const div = document.createElement("div");
  div.className = "threat-item";
  div.innerHTML = `
    <div class="sev-bar ${SEV_BARS[sev]||"sev-info"}"></div>
    <span class="threat-badge badge-${ev.attack_type||"normal"}">${(ev.attack_type||"normal").toUpperCase()}</span>
    <div class="threat-meta">
      <div class="threat-ips">${ev.source_ip} → ${ev.dest_ip}</div>
      <div class="threat-time">${ev.protocol} · ${ev.service} · ${time}</div>
    </div>
    <span class="threat-conf ${confCls}">${(conf*100).toFixed(0)}%</span>`;

  feed.insertBefore(div, feed.firstChild);
  while (feed.children.length > MAX_FEED) feed.removeChild(feed.lastChild);
  document.getElementById("feed-count").textContent = `${feed.children.length} events`;
}

/* ─── Stat updates ───────────────────────────────────────────────────── */
function updateStats(stats) {
  document.getElementById("stat-total").textContent =
    (stats.total_events||0).toLocaleString();
  document.getElementById("stat-tpm").textContent =
    (stats.events_per_minute||0).toFixed(1);
  const attacks = (stats.total_events||0) - (stats.attack_counts?.normal||0);
  document.getElementById("stat-attacks").textContent = attacks.toLocaleString();
}

/* ─── Timeline update ─────────────────────────────────────────────────── */
function pushTimeline() {
  state.timeline.push(1);
  if (state.timeline.length > 30) state.timeline.shift();
  else state.timeline[state.timeline.length-1]++;
}

function refreshCharts() {
  trafficChart.data.datasets[0].data = [...state.timeline];
  trafficChart.update("none");

  donutChart.data.datasets[0].data = [
    state.attackCounts.normal,
    state.attackCounts.dos,
    state.attackCounts.probe,
    state.attackCounts.r2l,
    state.attackCounts.u2r,
  ];
  donutChart.update("none");
  updateDonutLegend();
}

/* ─── Handle incoming WS event ───────────────────────────────────────── */
function handleEvent(ev) {
  state.events.unshift(ev);
  if (state.events.length > 500) state.events.pop();

  const cls = ev.attack_type || "normal";
  if (cls in state.attackCounts) state.attackCounts[cls]++;

  addFeedItem(ev);
  pushTimeline();

  // Refresh every 3 events to avoid thrashing
  if (state.events.length % 3 === 0) refreshCharts();

  // Fire event for threat log
  window.dispatchEvent(new CustomEvent("sentinel:event", { detail: ev }));
}

/* ─── Bootstrap ──────────────────────────────────────────────────────── */
async function init() {
  // Load metrics
  const mData = await S_fetchJSON("/api/metrics");
  if (mData?.model) renderMetrics(mData.model);

  // Load initial events
  const eData = await S_fetchJSON("/api/events?limit=50");
  if (eData) {
    updateStats(eData.stats || {});
    (eData.events || []).reverse().forEach(ev => {
      const cls = ev.attack_type || "normal";
      if (cls in state.attackCounts) state.attackCounts[cls]++;
      addFeedItem(ev);
    });
    pushTimeline();
    refreshCharts();
  }

  // Refresh stats periodically
  setInterval(async () => {
    const r = await S_fetchJSON("/api/events?limit=1");
    if (r?.stats) updateStats(r.stats);
    refreshCharts();
  }, 5000);

  // Connect WebSocket
  new S_SentinelWS(handleEvent);
}

document.addEventListener("DOMContentLoaded", init);
