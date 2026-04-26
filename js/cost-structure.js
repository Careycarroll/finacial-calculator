import {
  safeParseFloat,
  safeParseInt,
  formatCurrency,
  createChartContext,
  rafThrottle,
  validateInputs,
  showFieldError,
  drawLabelWithBackground,
} from "./chart-utils.js";
import { formatPct } from "./formatting.js";

// ===================================================================
// TAB SWITCHING
// ===================================================================

const tabs = {
  compare: { tab: document.getElementById("tab-cs-compare"), panel: document.getElementById("cs-compare-tab") },
  allocate: { tab: document.getElementById("tab-cs-allocate"), panel: document.getElementById("cs-allocate-tab") },
  classifier: { tab: document.getElementById("tab-cs-classifier"), panel: document.getElementById("cs-classifier-tab") },
  unitTrap: { tab: document.getElementById("tab-cs-unit-trap"), panel: document.getElementById("cs-unit-trap-tab") },
};

Object.keys(tabs).forEach((key) => {
  tabs[key].tab.addEventListener("click", () => {
    Object.keys(tabs).forEach((k) => {
      tabs[k].tab.classList.remove("active");
      tabs[k].panel.classList.add("hidden");
    });
    tabs[key].tab.classList.add("active");
    tabs[key].panel.classList.remove("hidden");
  });
});

// ===================================================================
// EXPLAINER TOGGLES
// ===================================================================

function initExplainer(toggleId, bodyId) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!toggle || !body) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    body.classList.toggle("hidden", expanded);
  });
}

initExplainer("cs-compare-explainer-toggle", "cs-compare-explainer-body");
initExplainer("cs-alloc-explainer-toggle", "cs-alloc-explainer-body");
initExplainer("cs-class-explainer-toggle", "cs-class-explainer-body");
initExplainer("cs-unit-explainer-toggle", "cs-unit-explainer-body");

// ===================================================================
// SHARED MATH
// ===================================================================

function computeDOL(cm, opIncome) {
  const eps = 1e-9;
  if (Math.abs(opIncome) < eps) return null;
  return cm / opIncome;
}

function formatDOL(dol) {
  if (dol === null || !Number.isFinite(dol)) return "N/A";
  const abs = Math.abs(dol);
  if (abs >= 1000) return dol > 0 ? "> 1000" : "< -1000";
  return dol.toFixed(2);
}

function breakevenUnits(price, vcPerUnit, fc) {
  const cmPerUnit = price - vcPerUnit;
  if (cmPerUnit <= 0) return null;
  return fc / cmPerUnit;
}

// ===================================================================
// TAB 1 — COST STRUCTURE COMPARISON
// ===================================================================

let csScenarioCount = 0;

function createScenarioCard(name = "", price = "", vc = "", fc = "") {
  csScenarioCount += 1;
  const id = csScenarioCount;

  const card = document.createElement("div");
  card.className = "cs-card";
  card.dataset.sid = String(id);

  card.innerHTML = `
    <div class="cs-card-header">
      <div class="cs-card-title">Scenario ${id}</div>
      <button class="cs-remove" aria-label="Remove scenario">✕ Remove</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Scenario Name</label>
        <input type="text" class="cs-s-name" value="${name}" placeholder="e.g. High FC / Low VC" />
      </div>
      <div class="form-group">
        <label>Price ($)</label>
        <input type="number" class="cs-s-price" value="${price}" min="0" step="any" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>VC per Unit ($)</label>
        <input type="number" class="cs-s-vc" value="${vc}" min="0" step="any" />
      </div>
      <div class="form-group">
        <label>Fixed Costs ($)</label>
        <input type="number" class="cs-s-fc" value="${fc}" min="0" step="any" />
      </div>
    </div>
  `;

  card.querySelector(".cs-remove").addEventListener("click", () => card.remove());
  return card;
}

function getScenarioData() {
  const wrap = document.getElementById("cs-scenarios");
  const cards = Array.from(wrap.querySelectorAll(".cs-card"));
  return cards.map((card, idx) => {
    const name = card.querySelector(".cs-s-name")?.value.trim() || `Scenario ${idx + 1}`;
    const price = safeParseFloat(card.querySelector(".cs-s-price")?.value, 0);
    const vc = safeParseFloat(card.querySelector(".cs-s-vc")?.value, 0);
    const fc = safeParseFloat(card.querySelector(".cs-s-fc")?.value, 0);
    return { name, price, vc, fc };
  });
}

function renderCompareTable(rows, q) {
  const tbody = document.getElementById("cs-compare-tbody");
  tbody.innerHTML = "";

  rows.forEach((r) => {
    const cmPerUnit = r.price - r.vc;
    const be = breakevenUnits(r.price, r.vc, r.fc);
    const revenue = r.price * q;
    const totalVC = r.vc * q;
    const cm = revenue - totalVC;
    const opIncome = cm - r.fc;
    const dol = computeDOL(cm, opIncome);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.name}</strong></td>
      <td>${formatCurrency(r.price)}</td>
      <td>${formatCurrency(r.vc)}</td>
      <td>${formatCurrency(r.fc)}</td>
      <td style="color:${cmPerUnit >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(cmPerUnit)}</td>
      <td>${be === null ? "N/A" : Math.ceil(be).toLocaleString()}</td>
      <td style="color:${opIncome >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(opIncome)}</td>
      <td>${formatDOL(dol)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function drawCompareChart(rows, q) {
  const canvas = document.getElementById("cs-compare-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const maxUnits = Math.max(q * 2, 100);
  const steps = 120;

  const colors = ["#2dd4bf", "#60a5fa", "#f59e0b", "#a855f7", "#f472b6", "#4ade80"];

  const series = rows.map((r, i) => {
    const ptsCost = [];
    const ptsRev = [];
    for (let j = 0; j <= steps; j++) {
      const u = (maxUnits / steps) * j;
      ptsCost.push({ u, v: r.fc + r.vc * u });
      ptsRev.push({ u, v: r.price * u });
    }
    return {
      name: r.name,
      color: colors[i % colors.length],
      cost: ptsCost,
      rev: ptsRev,
    };
  });

  const allVals = [];
  series.forEach((s) => {
    s.cost.forEach((p) => allVals.push(p.v));
    s.rev.forEach((p) => allVals.push(p.v));
  });

  const minVal = 0;
  const maxVal = Math.max(...allVals) * 1.1 || 1;
  const range = maxVal - minVal || 1;

  function toX(u) {
    return padding.left + (u / maxUnits) * chartWidth;
  }
  function toY(v) {
    return padding.top + chartHeight - ((v - minVal) / range) * chartHeight;
  }

  function drawStatic(offCtx) {
    offCtx.clearRect(0, 0, chart.width, chart.height);

    const ySteps = 6;
    for (let i = 0; i <= ySteps; i++) {
      const val = minVal + (range / ySteps) * i;
      const y = toY(val);
      offCtx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(padding.left, y);
      offCtx.lineTo(chart.width - padding.right, y);
      offCtx.stroke();

      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.sm;
      offCtx.textAlign = "right";
      offCtx.fillText(formatCurrency(val), padding.left - 8, y + 4);
    }

    offCtx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const u = (maxUnits / 6) * i;
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.xs;
      offCtx.fillText(Math.round(u).toLocaleString(), toX(u), chart.height - padding.bottom + 16);
    }
    offCtx.fillStyle = "#94a3b8";
    offCtx.font = window.CHART_FONTS.md;
    offCtx.fillText("Units", chart.width / 2, chart.height - 5);

    // Revenue line (shared style)
    offCtx.strokeStyle = "rgba(226, 232, 240, 0.35)";
    offCtx.lineWidth = 2;
    offCtx.setLineDash([6, 4]);
    offCtx.beginPath();
    offCtx.moveTo(toX(0), toY(0));
    offCtx.lineTo(toX(maxUnits), toY(maxVal * (maxUnits / maxUnits))); // placeholder; we draw per-series below
    offCtx.stroke();
    offCtx.setLineDash([]);

    // Draw each scenario: cost solid, revenue dashed
    series.forEach((s) => {
      // Cost
      offCtx.strokeStyle = s.color;
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      s.cost.forEach((pt, i) => {
        const x = toX(pt.u);
        const y = toY(pt.v);
        if (i === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      });
      offCtx.stroke();

      // Revenue
      offCtx.strokeStyle = s.color;
      offCtx.lineWidth = 2;
      offCtx.setLineDash([5, 4]);
      offCtx.beginPath();
      s.rev.forEach((pt, i) => {
        const x = toX(pt.u);
        const y = toY(pt.v);
        if (i === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      });
      offCtx.stroke();
      offCtx.setLineDash([]);

      drawLabelWithBackground(
        offCtx,
        s.name,
        chart.width - padding.right - 8,
        toY(s.cost[s.cost.length - 1].v) - 8,
        { color: s.color, font: window.CHART_FONTS.xs, align: "right" },
      );
    });

    offCtx.fillStyle = "#e2e8f0";
    offCtx.font = window.CHART_FONTS.boldMd;
    offCtx.textAlign = "left";
    offCtx.fillText("Solid = Total Cost, Dashed = Revenue", padding.left, padding.top - 10);
  }

  function ensureCache() {
    const key = JSON.stringify({ w: chart.width, h: chart.height, rows, q });
    if (canvas._csCacheKey === key && canvas._csStaticCanvas) return;

    const off = document.createElement("canvas");
    off.width = chart.width;
    off.height = chart.height;
    const offCtx = off.getContext("2d");
    drawStatic(offCtx);

    canvas._csCacheKey = key;
    canvas._csStaticCanvas = off;
  }

  function blitStatic() {
    ensureCache();
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(canvas._csStaticCanvas, 0, 0);
  }

  function drawOverlay(hoverUnits) {
    blitStatic();
    if (hoverUnits === null || hoverUnits < 0 || hoverUnits > maxUnits) return;

    const hx = toX(hoverUnits);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const lines = [{ text: `Units: ${Math.round(hoverUnits).toLocaleString()}`, color: "#e2e8f0", bold: true }];

    series.forEach((s) => {
      const cost = rows.find((r) => r.name === s.name);
      if (!cost) return;
      const totalCost = cost.fc + cost.vc * hoverUnits;
      const revenue = cost.price * hoverUnits;
      const opIncome = revenue - totalCost;

      lines.push({ text: `${s.name} — Cost: ${formatCurrency(totalCost)}`, color: s.color });
      lines.push({ text: `${s.name} — Rev: ${formatCurrency(revenue)}`, color: s.color });
      lines.push({ text: `${s.name} — OI: ${formatCurrency(opIncome)}`, color: opIncome >= 0 ? "#4ade80" : "#f472b6", bold: true });
    });

    ctx.font = window.CHART_FONTS.md;
    const tooltipWidth = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 24;
    const tooltipHeight = lines.length * 20 + 12;

    let tx = hx + 15;
    let ty = padding.top + 10;
    if (tx + tooltipWidth > chart.width - padding.right) tx = hx - tooltipWidth - 15;
    if (ty + tooltipHeight > padding.top + chartHeight) ty = padding.top + chartHeight - tooltipHeight;

    const rad = 6;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + rad, ty);
    ctx.lineTo(tx + tooltipWidth - rad, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + rad, rad);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - rad);
    ctx.arcTo(tx + tooltipWidth, ty + tooltipHeight, tx + tooltipWidth - rad, ty + tooltipHeight, rad);
    ctx.lineTo(tx + rad, ty + tooltipHeight);
    ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - rad, rad);
    ctx.lineTo(tx, ty + rad);
    ctx.arcTo(tx, ty, tx + rad, ty, rad);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color || "#e2e8f0";
      ctx.font = line.bold ? window.CHART_FONTS.boldMd : window.CHART_FONTS.md;
      ctx.fillText(line.text, tx + 12, ty + 18 + i * 20);
    });
  }

  blitStatic();

  if (canvas._csController) canvas._csController.abort();
  canvas._csController = new AbortController();
  const { signal } = canvas._csController;

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = chart.width / r.width;
      const hoverUnits = (((e.clientX - r.left) * scaleX - padding.left) / chartWidth) * maxUnits;
      if (hoverUnits >= 0 && hoverUnits <= maxUnits) {
        canvas.style.cursor = "crosshair";
        drawOverlay(hoverUnits);
      } else {
        canvas.style.cursor = "default";
        drawOverlay(null);
      }
    }),
    { signal },
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      canvas.style.cursor = "default";
      drawOverlay(null);
    },
    { signal },
  );
}

function handleCompareCalc() {
  const rows = getScenarioData();
  if (rows.length < 2) {
    showFieldError("cs-compare-q", "Add at least 2 scenarios to compare.");
    return;
  }

  const q = safeParseInt(document.getElementById("cs-compare-q").value, 1000);

  // Basic validation: price > 0, vc >= 0, fc >= 0
  for (const r of rows) {
    if (r.price <= 0) {
      showFieldError("cs-compare-q", "Each scenario must have a positive price.");
      return;
    }
    if (r.vc < 0 || r.fc < 0) {
      showFieldError("cs-compare-q", "Costs cannot be negative.");
      return;
    }
  }

  document.getElementById("cs-compare-results").classList.remove("hidden");
  document.getElementById("cs-compare-chart-section").classList.remove("hidden");

  renderCompareTable(rows, q);
  requestAnimationFrame(() => drawCompareChart(rows, q));
}

document.getElementById("cs-add-scenario").addEventListener("click", () => {
  document.getElementById("cs-scenarios").appendChild(createScenarioCard());
});

document.getElementById("cs-compare-calc").addEventListener("click", handleCompareCalc);

document.getElementById("cs-compare-q").addEventListener(
  "input",
  rafThrottle(() => {
    if (!document.getElementById("cs-compare-results").classList.contains("hidden")) {
      handleCompareCalc();
    }
  }),
);

// Default scenarios
document.getElementById("cs-scenarios").appendChild(
  createScenarioCard("Low FC / High VC", "17", "7.5", "11200"),
);
document.getElementById("cs-scenarios").appendChild(
  createScenarioCard("High FC / Low VC", "17", "6.5", "12800"),
);

// ===================================================================
// TAB 2 — COST ALLOCATION
// ===================================================================

let csObjectCount = 0;
let csLastOhRate = null;

function allocBaseLabel(base) {
  const custom = document.getElementById("cs-alloc-custom-name")?.value?.trim();
  if (base === "dlh") return "DLH";
  if (base === "dlc") return "DLC $";
  if (base === "mh") return "Machine Hours";
  if (base === "revenue") return "Revenue $";
  if (base === "units") return "Units";
  return custom || "Custom";
}

function createObjectCard(name = "", revenue = "", direct = "", baseQty = "") {
  csObjectCount += 1;
  const id = csObjectCount;

  const card = document.createElement("div");
  card.className = "cs-card";
  card.dataset.oid = String(id);

  card.innerHTML = `
    <div class="cs-card-header">
      <div class="cs-card-title">Object ${id}</div>
      <button class="cs-remove" aria-label="Remove cost object">✕ Remove</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Object Name</label>
        <input type="text" class="cs-o-name" value="${name}" placeholder="e.g. Route 1" />
      </div>
      <div class="form-group">
        <label>Revenue ($)</label>
        <input type="number" class="cs-o-rev" value="${revenue}" min="0" step="any" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Direct Costs ($)</label>
        <input type="number" class="cs-o-direct" value="${direct}" min="0" step="any" />
      </div>
      <div class="form-group">
        <label>Allocation Base Qty</label>
        <input type="number" class="cs-o-base" value="${baseQty}" min="0" step="any" />
      </div>
    </div>
  `;

  card.querySelector(".cs-remove").addEventListener("click", () => card.remove());
  return card;
}

function getObjects() {
  const wrap = document.getElementById("cs-objects");
  const cards = Array.from(wrap.querySelectorAll(".cs-card"));
  return cards.map((card, idx) => {
    const name = card.querySelector(".cs-o-name")?.value.trim() || `Object ${idx + 1}`;
    const revenue = safeParseFloat(card.querySelector(".cs-o-rev")?.value, 0);
    const direct = safeParseFloat(card.querySelector(".cs-o-direct")?.value, 0);
    const baseQty = safeParseFloat(card.querySelector(".cs-o-base")?.value, 0);
    return { name, revenue, direct, baseQty };
  });
}

function handleAllocCalc() {
  const oh = safeParseFloat(document.getElementById("cs-oh-pool").value, 0);
  const baseType = document.getElementById("cs-alloc-base").value;

  const objects = getObjects().filter((o) => o.name && (o.revenue > 0 || o.direct > 0 || o.baseQty > 0));
  if (objects.length === 0) {
    showFieldError("cs-oh-pool", "Add at least one cost object.");
    return;
  }

  const totalBase = objects.reduce((s, o) => s + o.baseQty, 0);
  const ohRate = totalBase > 0 ? oh / totalBase : null;

  document.getElementById("cs-alloc-results").classList.remove("hidden");
  document.getElementById("cs-oh-total").textContent = formatCurrency(oh);
  document.getElementById("cs-base-total").textContent = totalBase.toLocaleString();
  document.getElementById("cs-oh-rate").textContent = ohRate === null ? "N/A" : `${formatCurrency(ohRate)} / ${allocBaseLabel(baseType)}`;

  const tbody = document.getElementById("cs-alloc-tbody");
  tbody.innerHTML = "";

  objects.forEach((o) => {
    const allocOH = ohRate === null ? 0 : ohRate * o.baseQty;
    const profit = o.revenue - o.direct - allocOH;
    const margin = o.revenue > 0 ? profit / o.revenue : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${o.name}</strong></td>
      <td>${formatCurrency(o.revenue)}</td>
      <td>${formatCurrency(o.direct)}</td>
      <td>${o.baseQty.toLocaleString()}</td>
      <td>${formatCurrency(allocOH)}</td>
      <td style="color:${profit >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(profit)}</td>
      <td>${formatPct(margin)}</td>
      <td><button class="cs-remove" data-drop="${o.name}">Drop</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Death spiral flag: if OH rate increased vs last calc
  const flag = document.getElementById("cs-death-spiral-flag");
  if (csLastOhRate !== null && ohRate !== null && ohRate > csLastOhRate * 1.001) {
    flag.textContent = `⚠️ Overhead rate increased from ${formatCurrency(csLastOhRate)} to ${formatCurrency(ohRate)}. This is the “death spiral” effect: fewer objects are absorbing the same overhead pool.`;
    flag.className = "cm-flag negative";
    flag.classList.remove("hidden");
  } else {
    flag.classList.add("hidden");
  }
  csLastOhRate = ohRate;

  // Bind drop buttons (remove card with matching name)
  tbody.querySelectorAll("button[data-drop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-drop");
      const wrap = document.getElementById("cs-objects");
      const cards = Array.from(wrap.querySelectorAll(".cs-card"));
      const target = cards.find((c) => (c.querySelector(".cs-o-name")?.value.trim() || "") === name);
      if (target) target.remove();
      handleAllocCalc();
    });
  });
}

document.getElementById("cs-add-object").addEventListener("click", () => {
  document.getElementById("cs-objects").appendChild(createObjectCard());
});
document.getElementById("cs-alloc-calc").addEventListener("click", handleAllocCalc);

document.getElementById("cs-alloc-base").addEventListener("change", () => {
  const v = document.getElementById("cs-alloc-base").value;
  document.getElementById("cs-alloc-custom-row").classList.toggle("hidden", v !== "custom");
});

document.getElementById("cs-alloc-custom-name").addEventListener(
  "input",
  rafThrottle(() => {
    if (!document.getElementById("cs-alloc-results").classList.contains("hidden")) handleAllocCalc();
  }),
);

// Default objects (RegionFly-ish)
document.getElementById("cs-objects").appendChild(createObjectCard("Route 1", "1273941", "205474", "205474"));
document.getElementById("cs-objects").appendChild(createObjectCard("Route 3", "901845", "154203", "154203"));
document.getElementById("cs-objects").appendChild(createObjectCard("Route 5", "608818", "98196", "98196"));
document.getElementById("cs-objects").appendChild(createObjectCard("Route 6", "539726", "84332", "84332"));
document.getElementById("cs-objects").appendChild(createObjectCard("Route 7", "840010", "180000", "180000"));

// Set default allocation base to variable direct cost dollars (closest: DLC)
document.getElementById("cs-alloc-base").value = "dlc";

// ===================================================================
// TAB 3 — COST CLASSIFIER (High-Low + Regression)
// ===================================================================

function buildGrid() {
  const periods = safeParseInt(document.getElementById("cs-periods").value, 6);
  const lines = safeParseInt(document.getElementById("cs-lines").value, 3);
  const activityName = document.getElementById("cs-activity-name").value.trim() || "Units";

  const wrap = document.getElementById("cs-grid-wrap");
  wrap.innerHTML = "";

  const table = document.createElement("table");
  table.className = "cs-grid";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  hr.innerHTML = `<th>Period</th><th>${activityName}</th>` + Array.from({ length: lines }).map((_, i) => `<th>Cost Line ${i + 1}</th>`).join("");
  thead.appendChild(hr);

  const tbody = document.createElement("tbody");
  for (let p = 1; p <= periods; p++) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td><strong>${p}</strong></td>` +
      `<td><input type="number" class="cs-act" min="0" step="any" value="${100 * p}" /></td>` +
      Array.from({ length: lines }).map((_, i) => `<td><input type="number" class="cs-cost" data-line="${i}" min="0" step="any" value="${(500 + i * 200) + 30 * p}" /></td>`).join("");
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function getGridData() {
  const wrap = document.getElementById("cs-grid-wrap");
  const table = wrap.querySelector("table");
  if (!table) return null;

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const activity = rows.map((r) => safeParseFloat(r.querySelector(".cs-act")?.value, 0));

  const lineCount = safeParseInt(document.getElementById("cs-lines").value, 3);
  const costsByLine = Array.from({ length: lineCount }).map(() => []);

  rows.forEach((r) => {
    const costs = Array.from(r.querySelectorAll(".cs-cost"));
    costs.forEach((c) => {
      const li = safeParseInt(c.getAttribute("data-line"), 0);
      costsByLine[li].push(safeParseFloat(c.value, 0));
    });
  });

  return { activity, costsByLine };
}

function highLow(activity, cost) {
  // Find high and low activity indices
  let hi = 0, lo = 0;
  for (let i = 1; i < activity.length; i++) {
    if (activity[i] > activity[hi]) hi = i;
    if (activity[i] < activity[lo]) lo = i;
  }
  const dx = activity[hi] - activity[lo];
  const dy = cost[hi] - cost[lo];
  if (dx === 0) return null;

  const vc = dy / dx;
  const fc = cost[hi] - vc * activity[hi];
  return { hi, lo, vc, fc };
}

function regression(activity, cost) {
  const n = activity.length;
  if (n < 2) return null;

  const xbar = activity.reduce((s, x) => s + x, 0) / n;
  const ybar = cost.reduce((s, y) => s + y, 0) / n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = activity[i] - xbar;
    const dy = cost[i] - ybar;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const vc = sxy / sxx;
  const fc = ybar - vc * xbar;

  // R^2
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yhat = fc + vc * activity[i];
    ssRes += (cost[i] - yhat) ** 2;
  }
  const r2 = syy > 0 ? 1 - ssRes / syy : null;
  return { vc, fc, r2 };
}

function classifyLine(hl, reg) {
  // Simple heuristic: if vc ~ 0 => fixed; if fc ~ 0 => variable; else mixed
  const vc = reg?.vc ?? hl?.vc ?? 0;
  const fc = reg?.fc ?? hl?.fc ?? 0;

  const vcSmall = Math.abs(vc) < 1e-6;
  const fcSmall = Math.abs(fc) < 1e-6;

  if (vcSmall && !fcSmall) return "Fixed";
  if (!vcSmall && fcSmall) return "Variable";
  return "Mixed";
}

function handleClassifier() {
  const data = getGridData();
  if (!data) {
    showFieldError("cs-periods", "Build the grid first.");
    return;
  }

  const { activity, costsByLine } = data;
  const tbody = document.getElementById("cs-class-tbody");
  tbody.innerHTML = "";

  const hlSteps = [];
  const regSteps = [];

  costsByLine.forEach((cost, idx) => {
    const hl = highLow(activity, cost);
    const reg = regression(activity, cost);
    const cls = classifyLine(hl, reg);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>Cost Line ${idx + 1}</strong></td>
      <td>${cls}</td>
      <td>${hl ? formatCurrency(hl.vc) : "N/A"}</td>
      <td>${hl ? formatCurrency(hl.fc) : "N/A"}</td>
      <td>${reg ? formatCurrency(reg.vc) : "N/A"}</td>
      <td>${reg ? formatCurrency(reg.fc) : "N/A"}</td>
      <td>${reg && reg.r2 !== null ? reg.r2.toFixed(3) : "N/A"}</td>
    `;
    tbody.appendChild(tr);

    if (hl) {
      hlSteps.push(
        `Line ${idx + 1} (High-Low)\n` +
        `High activity: x=${activity[hl.hi]}, y=${cost[hl.hi]}\n` +
        `Low activity:  x=${activity[hl.lo]}, y=${cost[hl.lo]}\n` +
        `VC/unit = Δy/Δx = (${cost[hl.hi]} - ${cost[hl.lo]}) / (${activity[hl.hi]} - ${activity[hl.lo]}) = ${hl.vc}\n` +
        `FC = y - VC*x (using high) = ${cost[hl.hi]} - ${hl.vc}*${activity[hl.hi]} = ${hl.fc}\n`
      );
    } else {
      hlSteps.push(`Line ${idx + 1} (High-Low)\nNot enough variation in activity to compute.\n`);
    }

    if (reg) {
      regSteps.push(
        `Line ${idx + 1} (Regression)\n` +
        `Model: Cost = FC + VC*x\n` +
        `VC/unit = ${reg.vc}\n` +
        `FC = ${reg.fc}\n` +
        `R² = ${reg.r2}\n`
      );
    } else {
      regSteps.push(`Line ${idx + 1} (Regression)\nNot enough variation in activity to compute.\n`);
    }
  });

  document.getElementById("cs-highlow-steps").textContent = hlSteps.join("\n");
  document.getElementById("cs-reg-steps").textContent = regSteps.join("\n");

  document.getElementById("cs-class-results").classList.remove("hidden");
}

document.getElementById("cs-build-grid").addEventListener("click", buildGrid);
document.getElementById("cs-classify").addEventListener("click", handleClassifier);

// Build default grid on load
buildGrid();

// ===================================================================
// TAB 4 — UNIT COST TRAP
// ===================================================================

function handleUnitTrap() {
  const fc = safeParseFloat(document.getElementById("cs-ut-fc").value, 0);
  const vc = safeParseFloat(document.getElementById("cs-ut-vc").value, 0);
  const q1 = safeParseInt(document.getElementById("cs-ut-q1").value, 1);
  const q2 = safeParseInt(document.getElementById("cs-ut-q2").value, 1);

  if (q1 <= 0 || q2 <= 0) {
    showFieldError("cs-ut-q1", "Volumes must be positive.");
    return;
  }

  const total1 = fc + vc * q1;
  const uc1 = total1 / q1;

  const wrong = uc1 * q2;
  const correct = fc + vc * q2;

  document.getElementById("cs-ut-uc1").textContent = formatCurrency(uc1);
  document.getElementById("cs-ut-wrong").textContent = formatCurrency(wrong);
  document.getElementById("cs-ut-correct").textContent = formatCurrency(correct);

  document.getElementById("cs-ut-results").classList.remove("hidden");
}

document.getElementById("cs-ut-calc").addEventListener("click", handleUnitTrap);
