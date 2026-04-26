import {
  safeParseFloat,
  createChartContext,
  rafThrottle,
  showFieldError,
  bindFormEnter,
} from "./chart-utils.js";

// ===================================================================
// STATE
// ===================================================================

let baseEquilibrium = null;

// ===================================================================
// TAB SWITCHING
// ===================================================================

const tabs = {
  equilibrium: {
    tab: document.getElementById("tab-equilibrium"),
    panel: document.getElementById("equilibrium-tab"),
  },
  shifters: {
    tab: document.getElementById("tab-shifters"),
    panel: document.getElementById("shifters-tab"),
  },
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
// INPUT MODE TOGGLE
// ===================================================================

let inputMode = "equation";

document.getElementById("mode-equation").addEventListener("click", () => {
  inputMode = "equation";
  document.getElementById("mode-equation").classList.add("active");
  document.getElementById("mode-points").classList.remove("active");
  document.getElementById("equation-inputs").classList.remove("hidden");
  document.getElementById("points-inputs").classList.add("hidden");
});

document.getElementById("mode-points").addEventListener("click", () => {
  inputMode = "points";
  document.getElementById("mode-points").classList.add("active");
  document.getElementById("mode-equation").classList.remove("active");
  document.getElementById("points-inputs").classList.remove("hidden");
  document.getElementById("equation-inputs").classList.add("hidden");
});

// ===================================================================
// EXTRA VARIABLE ROWS
// ===================================================================

function createExtraVarRow(side) {
  const row = document.createElement("div");
  row.className = "micro-var-row micro-extra-var";
  row.innerHTML = `
    <input type="text" class="micro-var-name" placeholder="e.g. p_rbs" />
    <input type="number" class="micro-var-coef" placeholder="e.g. 0.22" step="any" />
    <input type="number" class="micro-var-value" placeholder="current value" step="any" />
    <button class="micro-var-remove" aria-label="Remove variable">✕</button>
  `;
  row.querySelector(".micro-var-remove").addEventListener("click", () => {
    row.remove();
    updateEquationPreview(side);
  });
  row.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => updateEquationPreview(side));
  });
  return row;
}

document.getElementById("demand-add-var").addEventListener("click", () => {
  document
    .getElementById("demand-extra-vars")
    .appendChild(createExtraVarRow("demand"));
  updateEquationPreview("demand");
});

document.getElementById("supply-add-var").addEventListener("click", () => {
  document
    .getElementById("supply-extra-vars")
    .appendChild(createExtraVarRow("supply"));
  updateEquationPreview("supply");
});

// ===================================================================
// LIVE EQUATION PREVIEW
// ===================================================================

function updateEquationPreview(side) {
  const prefix = side === "demand" ? "demand" : "supply";
  const previewEl = document.getElementById(prefix + "-eq-preview");

  const constVal = safeParseFloat(
    document.getElementById("eq-" + prefix + "-const").value,
    null,
  );
  const pName =
    document.getElementById("eq-" + prefix + "-p-name").value.trim() || "p";
  const pCoef = safeParseFloat(
    document.getElementById("eq-" + prefix + "-p-coef").value,
    null,
  );

  const extraRows = document.querySelectorAll(
    "#" + prefix + "-extra-vars .micro-extra-var",
  );
  const extras = Array.from(extraRows).map((row) => ({
    name: row.querySelector(".micro-var-name").value.trim() || "?",
    coef: safeParseFloat(row.querySelector(".micro-var-coef").value, null),
    value: safeParseFloat(row.querySelector(".micro-var-value").value, null),
  }));

  let parts = [];
  if (constVal !== null) parts.push(constVal.toString());
  if (pCoef !== null) {
    const sign = pCoef >= 0 ? (parts.length ? " + " : "") : " \u2212 ";
    parts.push(
      (parts.length && pCoef >= 0 ? " + " : pCoef < 0 ? " \u2212 " : "") +
        Math.abs(pCoef) +
        pName,
    );
  }
  extras.forEach((e) => {
    if (e.coef !== null) {
      const sign = e.coef >= 0 ? " + " : " \u2212 ";
      parts.push(sign + Math.abs(e.coef) + e.name);
    }
  });

  if (parts.length === 0) {
    previewEl.textContent = "q = const + coef\u00b7P +...";
  } else {
    previewEl.innerHTML =
      "q = " +
      parts
        .join("")
        .replace(/^ \+ /, "")
        .replace(/^ \u2212 /, "\u2212");
  }
}

["eq-demand-const", "eq-demand-p-name", "eq-demand-p-coef"].forEach((id) => {
  document
    .getElementById(id)
    .addEventListener("input", () => updateEquationPreview("demand"));
});
["eq-supply-const", "eq-supply-p-name", "eq-supply-p-coef"].forEach((id) => {
  document
    .getElementById(id)
    .addEventListener("input", () => updateEquationPreview("supply"));
});

// ===================================================================
// PARSE CURVE FROM INPUTS
// ===================================================================

function parseCurve(side) {
  const prefix = side === "demand" ? "demand" : "supply";
  const constVal = safeParseFloat(
    document.getElementById("eq-" + prefix + "-const").value,
    null,
  );
  const pName =
    document.getElementById("eq-" + prefix + "-p-name").value.trim() || "p";
  const pCoef = safeParseFloat(
    document.getElementById("eq-" + prefix + "-p-coef").value,
    null,
  );

  if (constVal === null || pCoef === null) return null;

  const extraRows = document.querySelectorAll(
    "#" + prefix + "-extra-vars .micro-extra-var",
  );
  const extras = Array.from(extraRows)
    .map((row) => ({
      name: row.querySelector(".micro-var-name").value.trim() || "?",
      coef: safeParseFloat(row.querySelector(".micro-var-coef").value, null),
      value: safeParseFloat(row.querySelector(".micro-var-value").value, null),
    }))
    .filter((e) => e.coef !== null);

  // Compute effective intercept
  let effectiveIntercept = constVal;
  extras.forEach((e) => {
    if (e.value !== null) effectiveIntercept += e.coef * e.value;
  });

  return { constVal, pName, pCoef, extras, effectiveIntercept };
}

// ===================================================================
// SOLVE FOR EQUILIBRIUM
// ===================================================================

function solveEquilibrium(
  demandIntercept,
  demandPCoef,
  supplyIntercept,
  supplyPCoef,
) {
  // Qd = demandIntercept + demandPCoef * P
  // Qs = supplyIntercept + supplyPCoef * P
  // At eq: demandIntercept + demandPCoef*P = supplyIntercept + supplyPCoef*P
  // (demandPCoef - supplyPCoef)*P = supplyIntercept - demandIntercept
  const denom = demandPCoef - supplyPCoef;
  if (Math.abs(denom) < 1e-10) return null;
  const pStar = (supplyIntercept - demandIntercept) / denom;
  const qStar = demandIntercept + demandPCoef * pStar;
  return { pStar, qStar };
}

function getCoefsFromPoints() {
  const p1d = safeParseFloat(
    document.getElementById("pt-demand-p1").value,
    null,
  );
  const q1d = safeParseFloat(
    document.getElementById("pt-demand-q1").value,
    null,
  );
  const p2d = safeParseFloat(
    document.getElementById("pt-demand-p2").value,
    null,
  );
  const q2d = safeParseFloat(
    document.getElementById("pt-demand-q2").value,
    null,
  );
  const p1s = safeParseFloat(
    document.getElementById("pt-supply-p1").value,
    null,
  );
  const q1s = safeParseFloat(
    document.getElementById("pt-supply-q1").value,
    null,
  );
  const p2s = safeParseFloat(
    document.getElementById("pt-supply-p2").value,
    null,
  );
  const q2s = safeParseFloat(
    document.getElementById("pt-supply-q2").value,
    null,
  );

  if ([p1d, q1d, p2d, q2d, p1s, q1s, p2s, q2s].some((v) => v === null))
    return null;
  if (p2d === p1d || p2s === p1s) return null;

  const dSlope = (q2d - q1d) / (p2d - p1d);
  const dIntercept = q1d - dSlope * p1d;

  const sSlope = (q2s - q1s) / (p2s - p1s);
  const sIntercept = q1s - sSlope * p1s;

  return {
    fromPoints: true,
    demand: {
      constVal: dIntercept,
      pCoef: dSlope,
      extras: [],
      effectiveIntercept: dIntercept,
      pName: "p",
    },
    supply: {
      constVal: sIntercept,
      pCoef: sSlope,
      extras: [],
      effectiveIntercept: sIntercept,
      pName: "p",
    },
    p1d,
    q1d,
    p2d,
    q2d,
    p1s,
    q1s,
    p2s,
    q2s,
    dSlope,
    sSlope,
  };
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

document
  .getElementById("eq-calculate")
  .addEventListener("click", handleCalculate);
bindFormEnter(() => handleCalculate(), "#equilibrium-tab");

function handleCalculate() {
  let demand,
    supply,
    fromPoints = false,
    pointsData = null;

  if (inputMode === "points") {
    const pts = getCoefsFromPoints();
    if (!pts) {
      showFieldError("eq-demand-a", "Please fill in all point fields.");
      return;
    }
    demand = pts.demand;
    supply = pts.supply;
    fromPoints = true;
    pointsData = pts;
  } else {
    demand = parseCurve("demand");
    supply = parseCurve("supply");
    if (!demand) {
      showFieldError(
        "eq-demand-const",
        "Please fill in demand constant and price coefficient.",
      );
      return;
    }
    if (!supply) {
      showFieldError(
        "eq-supply-const",
        "Please fill in supply constant and price coefficient.",
      );
      return;
    }
  }

  const eq = solveEquilibrium(
    demand.effectiveIntercept,
    demand.pCoef,
    supply.effectiveIntercept,
    supply.pCoef,
  );

  if (!eq) {
    showFieldError(
      "eq-demand-const",
      "No equilibrium exists — curves are parallel.",
    );
    return;
  }

  const { pStar, qStar } = eq;

  baseEquilibrium = {
    demand,
    supply,
    pStar,
    qStar,
    fromPoints,
    pointsData,
  };

  document.getElementById("eq-price").textContent = pStar.toFixed(4);
  document.getElementById("eq-quantity").textContent = qStar.toFixed(4);

  const statusEl = document.getElementById("eq-status");
  if (pStar > 0 && qStar > 0) {
    statusEl.textContent = "\u2705 Market Clears";
    statusEl.className = "result-value positive";
  } else {
    statusEl.textContent = "\u26a0\ufe0f Check Inputs";
    statusEl.className = "result-value negative";
  }

  renderSteps(demand, supply, pStar, qStar, fromPoints, pointsData);

  document.getElementById("eq-results").classList.remove("hidden");
  document.getElementById("eq-steps-section").classList.remove("hidden");
  document.getElementById("eq-chart-section").classList.remove("hidden");

  drawEquilibriumChart(demand, supply, pStar, qStar, null);

  document.getElementById("shifters-no-data").style.display = "none";
  document.getElementById("shifters-controls").classList.remove("hidden");
  initSliders(demand, supply);

  document.getElementById("eq-results").scrollIntoView({ behavior: "smooth" });
}

// ===================================================================
// STEP-BY-STEP
// ===================================================================

function renderSteps(demand, supply, pStar, qStar, fromPoints, pointsData) {
  const container = document.getElementById("eq-steps-content");
  const section = document.getElementById("eq-steps-section");
  const toggle = document.getElementById("eq-steps-toggle");
  const body = document.getElementById("eq-steps-body");

  const steps = [];

  function sec(title, ...items) {
    return `<div class="micro-step-section">
      <div class="micro-step-section-title">${title}</div>
      ${items.join("")}
    </div>`;
  }

  function step(text) {
    return `<div class="micro-step">${text}</div>`;
  }

  // Step 0 — from points
  if (fromPoints && pointsData) {
    const { p1d, q1d, p2d, q2d, p1s, q1s, p2s, q2s, dSlope, sSlope } =
      pointsData;
    steps.push(
      sec(
        "Step 0 \u2014 Derive Equations from Points",
        step(
          `<span class="demand-color">Demand points: (P=${p1d}, Q=${q1d}) and (P=${p2d}, Q=${q2d})</span>`,
        ),
        step(
          `slope = (${q2d} \u2212 ${q1d}) / (${p2d} \u2212 ${p1d}) = <strong>${dSlope.toFixed(4)}</strong>`,
        ),
        step(
          `intercept = ${q1d} \u2212 (${dSlope.toFixed(4)})(${p1d}) = <strong>${demand.constVal.toFixed(4)}</strong>`,
        ),
        step(
          `<span class="demand-color">\u2192 Q<sub>d</sub> = ${demand.constVal.toFixed(4)} + ${dSlope.toFixed(4)}P</span>`,
        ),
        step(` `),
        step(
          `<span class="supply-color">Supply points: (P=${p1s}, Q=${q1s}) and (P=${p2s}, Q=${q2s})</span>`,
        ),
        step(
          `slope = (${q2s} \u2212 ${q1s}) / (${p2s} \u2212 ${p1s}) = <strong>${sSlope.toFixed(4)}</strong>`,
        ),
        step(
          `intercept = ${q1s} \u2212 (${sSlope.toFixed(4)})(${p1s}) = <strong>${supply.constVal.toFixed(4)}</strong>`,
        ),
        step(
          `<span class="supply-color">\u2192 Q<sub>s</sub> = ${supply.constVal.toFixed(4)} + ${sSlope.toFixed(4)}P</span>`,
        ),
      ),
    );
  }

  // Step 1 — full equations
  function formatEq(curve, color) {
    let eq = `${curve.constVal}`;
    eq += ` ${curve.pCoef >= 0 ? "+" : "\u2212"} ${Math.abs(curve.pCoef)}${curve.pName}`;
    curve.extras.forEach((e) => {
      eq += ` ${e.coef >= 0 ? "+" : "\u2212"} ${Math.abs(e.coef)}${e.name}`;
    });
    return `<span class="${color}">${eq}</span>`;
  }

  steps.push(
    sec(
      "Step 1 \u2014 Full Equations",
      step(
        `<span class="demand-color">Demand: q = ${formatEq(demand, "demand-color")}</span>`,
      ),
      step(
        `<span class="supply-color">Supply: q = ${formatEq(supply, "supply-color")}</span>`,
      ),
    ),
  );

  // Step 2 — substitute known values
  if (demand.extras.length > 0 || supply.extras.length > 0) {
    const dLines = [];
    dLines.push(step(`<span class="demand-color">Demand substitution:</span>`));
    dLines.push(step(`  Base constant: ${demand.constVal}`));
    demand.extras.forEach((e) => {
      const contrib = e.value !== null ? e.coef * e.value : "?";
      dLines.push(
        step(
          `  + ${e.name}: ${e.coef} \u00d7 ${e.value !== null ? e.value : "?"} = <strong>${typeof contrib === "number" ? contrib.toFixed(4) : "?"}</strong>`,
        ),
      );
    });
    dLines.push(
      step(
        `  <strong class="demand-color">Effective intercept = ${demand.effectiveIntercept.toFixed(4)}</strong>`,
      ),
    );
    dLines.push(
      step(
        `  <strong class="demand-color">\u2192 q \u2248 ${demand.effectiveIntercept.toFixed(4)} + ${demand.pCoef}${demand.pName}</strong>`,
      ),
    );

    const sLines = [];
    sLines.push(step(`<span class="supply-color">Supply substitution:</span>`));
    sLines.push(step(`  Base constant: ${supply.constVal}`));
    supply.extras.forEach((e) => {
      const contrib = e.value !== null ? e.coef * e.value : "?";
      sLines.push(
        step(
          `  + ${e.name}: ${e.coef} \u00d7 ${e.value !== null ? e.value : "?"} = <strong>${typeof contrib === "number" ? contrib.toFixed(4) : "?"}</strong>`,
        ),
      );
    });
    sLines.push(
      step(
        `  <strong class="supply-color">Effective intercept = ${supply.effectiveIntercept.toFixed(4)}</strong>`,
      ),
    );
    sLines.push(
      step(
        `  <strong class="supply-color">\u2192 q \u2248 ${supply.effectiveIntercept.toFixed(4)} + ${supply.pCoef}${supply.pName}</strong>`,
      ),
    );

    steps.push(
      sec(
        "Step 2 \u2014 Substitute Known Values",
        ...dLines,
        step(" "),
        ...sLines,
      ),
    );
  }

  // Step 3 — set equal
  const dI = demand.effectiveIntercept;
  const dP = demand.pCoef;
  const sI = supply.effectiveIntercept;
  const sP = supply.pCoef;
  const denom = dP - sP;

  steps.push(
    sec(
      "Step 3 \u2014 Set Q<sub>d</sub> = Q<sub>s</sub>",
      step(`${dI.toFixed(4)} + ${dP}P = ${sI.toFixed(4)} + ${sP}P`),
      step(`${dI.toFixed(4)} \u2212 ${sI.toFixed(4)} = ${sP}P \u2212 ${dP}P`),
      step(`${(dI - sI).toFixed(4)} = ${(sP - dP).toFixed(4)}P`),
      step(`P* = ${(dI - sI).toFixed(4)} \u00f7 ${(sP - dP).toFixed(4)}`),
      step(`<strong class="eq-color">P* = ${pStar.toFixed(4)}</strong>`),
    ),
  );

  // Step 4 — find Q*
  const qFromDemand = (dI + dP * pStar).toFixed(4);
  const qFromSupply = (sI + sP * pStar).toFixed(4);

  steps.push(
    sec(
      "Step 4 \u2014 Find Q*",
      step(`Using demand: Q* = ${dI.toFixed(4)} + ${dP}(${pStar.toFixed(4)})`),
      step(`Q* = ${dI.toFixed(4)} + ${(dP * pStar).toFixed(4)}`),
      step(`<strong class="eq-color">Q* = ${qFromDemand}</strong>`),
      step(` `),
      step(
        `Verify using supply: Q* = ${sI.toFixed(4)} + ${sP}(${pStar.toFixed(4)})`,
      ),
      step(`Q* = ${sI.toFixed(4)} + ${(sP * pStar).toFixed(4)}`),
      step(`<strong class="eq-color">Q* = ${qFromSupply} \u2705</strong>`),
    ),
  );

  steps.push(
    sec(
      "Step 5 \u2014 Market Equilibrium",
      step(`<span class="eq-color">P* = ${pStar.toFixed(4)}</span>`),
      step(`<span class="eq-color">Q* = ${qStar.toFixed(4)}</span>`),
      step(
        `At this price, quantity demanded equals quantity supplied \u2014 the market clears.`,
      ),
    ),
  );

  container.innerHTML = steps.join("");
  section.classList.remove("hidden");
  toggle.setAttribute("aria-expanded", "true");
  body.classList.remove("hidden");
}

// ===================================================================
// CHART HELPERS
// ===================================================================

function getChartBounds(demand, supply, pStar, qStar) {
  const dI = demand.effectiveIntercept;
  const dP = demand.pCoef;
  const sI = supply.effectiveIntercept;
  const sP = supply.pCoef;

  // Q when P=0 for demand: q = dI
  // P when Q=0 for demand: P = -dI/dP
  // Q when P=0 for supply: q = sI
  const qMax = Math.max(Math.abs(dI), Math.abs(qStar) * 1.6, 1);
  const pMax = Math.max(Math.abs(dI / dP), Math.abs(pStar) * 1.8, 1);
  return { qMax, pMax };
}

function drawCurveOnChart(
  ctx,
  toX,
  toY,
  intercept,
  pCoef,
  qMax,
  pMax,
  color,
  alpha,
  lineWidth,
) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;
  for (let q = 0; q <= qMax * 1.05; q += qMax / 300) {
    if (Math.abs(pCoef) < 1e-10) continue;
    const p = (q - intercept) / pCoef;
    if (p < 0 || p > pMax * 1.05) continue;
    if (!started) {
      ctx.moveTo(toX(q), toY(p));
      started = true;
    } else ctx.lineTo(toX(q), toY(p));
  }
  if (started) ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGrid(
  ctx,
  chart,
  padding,
  chartWidth,
  chartHeight,
  qMax,
  pMax,
  toX,
  toY,
) {
  for (let i = 0; i <= 6; i++) {
    const p = (pMax / 6) * i;
    const y = toY(p);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(p.toFixed(2), padding.left - 8, y + 4);
  }
  for (let i = 0; i <= 6; i++) {
    const q = (qMax / 6) * i;
    const x = toX(q);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "center";
    ctx.fillText(q.toFixed(2), x, chart.height - padding.bottom + 18);
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = window.CHART_FONTS.md;
  ctx.textAlign = "center";
  ctx.fillText("Quantity (Q)", chart.width / 2, chart.height - 8);
  ctx.save();
  ctx.translate(14, chart.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Price (P)", 0, 0);
  ctx.restore();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();
}

function drawTooltipBox(
  ctx,
  tooltipLines,
  hx,
  padding,
  chartWidth,
  chartHeight,
  chartTotalWidth,
  chartRight,
) {
  ctx.font = window.CHART_FONTS.md;
  const tooltipWidth =
    Math.max(...tooltipLines.map((l) => ctx.measureText(l.text).width)) + 24;
  const tooltipHeight = tooltipLines.length * 20 + 12;
  let tx = hx + 15;
  let ty = padding.top + 10;
  if (tx + tooltipWidth > chartTotalWidth - chartRight)
    tx = hx - tooltipWidth - 15;

  const rad = 6;
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx + rad, ty);
  ctx.lineTo(tx + tooltipWidth - rad, ty);
  ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + rad, rad);
  ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - rad);
  ctx.arcTo(
    tx + tooltipWidth,
    ty + tooltipHeight,
    tx + tooltipWidth - rad,
    ty + tooltipHeight,
    rad,
  );
  ctx.lineTo(tx + rad, ty + tooltipHeight);
  ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - rad, rad);
  ctx.lineTo(tx, ty + rad);
  ctx.arcTo(tx, ty, tx + rad, ty, rad);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  tooltipLines.forEach((line, i) => {
    ctx.fillStyle = line.color || "#e2e8f0";
    ctx.font = line.bold ? window.CHART_FONTS.boldMd : window.CHART_FONTS.md;
    ctx.fillText(line.text, tx + 12, ty + 18 + i * 20);
  });
}

// ===================================================================
// EQUILIBRIUM CHART
// ===================================================================

let eqChartController = null;

function drawEquilibriumChart(demand, supply, pStar, qStar, highlightQ) {
  const canvas = document.getElementById("eq-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      drawEquilibriumChart(demand, supply, pStar, qStar, highlightQ),
    );
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 60, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const { qMax, pMax } = getChartBounds(demand, supply, pStar, qStar);

  function toX(q) {
    return padding.left + (q / qMax) * chartWidth;
  }
  function toY(p) {
    return padding.top + chartHeight - (p / pMax) * chartHeight;
  }
  function fromX(x) {
    return ((x - padding.left) / chartWidth) * qMax;
  }

  chart.clear();
  drawGrid(ctx, chart, padding, chartWidth, chartHeight, qMax, pMax, toX, toY);

  // Demand curve
  drawCurveOnChart(
    ctx,
    toX,
    toY,
    demand.effectiveIntercept,
    demand.pCoef,
    qMax,
    pMax,
    "#f472b6",
    1,
    2.5,
  );
  const dLabelQ = qMax * 0.05;
  const dLabelP = (dLabelQ - demand.effectiveIntercept) / demand.pCoef;
  if (dLabelP > 0 && dLabelP <= pMax) {
    ctx.fillStyle = "#f472b6";
    ctx.font = window.CHART_FONTS.boldMd;
    ctx.textAlign = "left";
    ctx.fillText("Demand", toX(dLabelQ) + 5, toY(dLabelP) - 8);
  }

  // Supply curve
  drawCurveOnChart(
    ctx,
    toX,
    toY,
    supply.effectiveIntercept,
    supply.pCoef,
    qMax,
    pMax,
    "#2dd4bf",
    1,
    2.5,
  );
  const sLabelQ = qMax * 0.75;
  const sLabelP = (sLabelQ - supply.effectiveIntercept) / supply.pCoef;
  if (sLabelP > 0 && sLabelP <= pMax) {
    ctx.fillStyle = "#2dd4bf";
    ctx.font = window.CHART_FONTS.boldMd;
    ctx.textAlign = "left";
    ctx.fillText("Supply", toX(sLabelQ) + 5, toY(sLabelP) - 8);
  }

  // Equilibrium
  if (pStar > 0 && qStar > 0 && pStar <= pMax && qStar <= qMax) {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toX(qStar), padding.top + chartHeight);
    ctx.lineTo(toX(qStar), toY(pStar));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(pStar));
    ctx.lineTo(toX(qStar), toY(pStar));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f59e0b";
    ctx.font = window.CHART_FONTS.boldSm;
    ctx.textAlign = "right";
    ctx.fillText("P*=" + pStar.toFixed(3), padding.left - 4, toY(pStar) + 4);
    ctx.textAlign = "center";
    ctx.fillText(
      "Q*=" + qStar.toFixed(3),
      toX(qStar),
      padding.top + chartHeight + 32,
    );

    ctx.beginPath();
    ctx.arc(toX(qStar), toY(pStar), 7, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Smart label positioning — avoid overlapping curves
    ctx.font = window.CHART_FONTS.boldSm;
    const eLabel = "E(" + qStar.toFixed(3) + ", " + pStar.toFixed(3) + ")";
    const eLabelW = ctx.measureText(eLabel).width;
    const eLabelH = 14;
    const ePad = 4;
    // Place left of dot if in right 40% of chart, else right
    const eInRightHalf = toX(qStar) > padding.left + chartWidth * 0.6;
    const eLabelX = eInRightHalf ? toX(qStar) - eLabelW - 14 : toX(qStar) + 12;
    // Place below dot if near top, else above
    const eNearTop = toY(pStar) < padding.top + chartHeight * 0.25;
    const eLabelY = eNearTop ? toY(pStar) + 20 : toY(pStar) - 10;
    // Background box
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(eLabelX - ePad, eLabelY - eLabelH, eLabelW + ePad * 2, eLabelH + ePad, 4);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.textAlign = "left";
    ctx.fillText(eLabel, eLabelX, eLabelY - 2);
  }

  // Hover
  if (highlightQ !== null && highlightQ >= 0 && highlightQ <= qMax) {
    const hx = toX(highlightQ);
    const pDemand =
      Math.abs(demand.pCoef) > 1e-10
        ? (highlightQ - demand.effectiveIntercept) / demand.pCoef
        : null;
    const pSupply =
      Math.abs(supply.pCoef) > 1e-10
        ? (highlightQ - supply.effectiveIntercept) / supply.pCoef
        : null;

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipLines = [
      { text: "Q = " + highlightQ.toFixed(3), color: "#e2e8f0", bold: true },
    ];

    if (pDemand !== null && pDemand >= 0 && pDemand <= pMax) {
      ctx.beginPath();
      ctx.arc(hx, toY(pDemand), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#f472b6";
      ctx.fill();
      tooltipLines.push({
        text: "Demand P = " + pDemand.toFixed(4),
        color: "#f472b6",
      });
    }
    if (pSupply !== null && pSupply >= 0 && pSupply <= pMax) {
      ctx.beginPath();
      ctx.arc(hx, toY(pSupply), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#2dd4bf";
      ctx.fill();
      tooltipLines.push({
        text: "Supply P = " + pSupply.toFixed(4),
        color: "#2dd4bf",
      });
    }
    if (pDemand !== null && pSupply !== null && pDemand >= 0 && pSupply >= 0) {
      const diff = pDemand - pSupply;
      if (Math.abs(diff) > 1e-6) {
        tooltipLines.push({
          text:
            diff > 0
              ? "Shortage: " + diff.toFixed(4)
              : "Surplus: " + Math.abs(diff).toFixed(4),
          color: diff > 0 ? "#4ade80" : "#f472b6",
        });
      } else {
        tooltipLines.push({
          text: "\u2248 Equilibrium",
          color: "#f59e0b",
          bold: true,
        });
      }
    }

    drawTooltipBox(
      ctx,
      tooltipLines,
      hx,
      padding,
      chartWidth,
      chartHeight,
      chart.width,
      padding.right,
    );
  }

  if (eqChartController) eqChartController.abort();
  eqChartController = new AbortController();
  const { signal } = eqChartController;

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = chart.width / r.width;
      const q = fromX((e.clientX - r.left) * scaleX);
      if (q >= 0 && q <= qMax) {
        canvas.style.cursor = "crosshair";
        drawEquilibriumChart(demand, supply, pStar, qStar, q);
      } else {
        canvas.style.cursor = "default";
        drawEquilibriumChart(demand, supply, pStar, qStar, null);
      }
    }),
    { signal },
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      canvas.style.cursor = "default";
      drawEquilibriumChart(demand, supply, pStar, qStar, null);
    },
    { signal },
  );
}

// ===================================================================
// SHIFTERS TAB
// ===================================================================

function initSliders(demand, supply) {
  const dI = demand.effectiveIntercept;
  const dP = demand.pCoef;
  const sI = supply.effectiveIntercept;
  const sP = supply.pCoef;

  const sliderA = document.getElementById("slider-a");
  const sliderB = document.getElementById("slider-b");
  const sliderC = document.getElementById("slider-c");
  const sliderD = document.getElementById("slider-d");

  const aRange = Math.max(Math.abs(dI) * 1.5, 1);
  sliderA.min = (dI - aRange).toFixed(4);
  sliderA.max = (dI + aRange).toFixed(4);
  sliderA.value = dI;
  sliderA.step = (aRange / 100).toFixed(4);

  const bRange = Math.max(Math.abs(dP) * 2, 0.001);
  sliderB.min = (dP - bRange).toFixed(4);
  sliderB.max = (dP + bRange).toFixed(4);
  sliderB.value = dP;
  sliderB.step = (bRange / 100).toFixed(4);

  const cRange = Math.max(Math.abs(sI) * 1.5, 1);
  sliderC.min = (sI - cRange).toFixed(4);
  sliderC.max = (sI + cRange).toFixed(4);
  sliderC.value = sI;
  sliderC.step = (cRange / 100).toFixed(4);

  const dRange = Math.max(Math.abs(sP) * 2, 0.001);
  sliderD.min = (sP - dRange).toFixed(4);
  sliderD.max = (sP + dRange).toFixed(4);
  sliderD.value = sP;
  sliderD.step = (dRange / 100).toFixed(4);

  updateSliderLabels(dI, dP, sI, sP);
  updateShiftersChart(dI, dP, sI, sP);

  document.getElementById("shifters-results").classList.remove("hidden");
  document.getElementById("shifters-chart-section").classList.remove("hidden");
}

function updateSliderLabels(a, b, c, d) {
  document.getElementById("slider-a-label").textContent =
    parseFloat(a).toFixed(4);
  document.getElementById("slider-b-label").textContent =
    parseFloat(b).toFixed(4);
  document.getElementById("slider-c-label").textContent =
    parseFloat(c).toFixed(4);
  document.getElementById("slider-d-label").textContent =
    parseFloat(d).toFixed(4);
}

["slider-a", "slider-b", "slider-c", "slider-d"].forEach((id) => {
  document.getElementById(id).addEventListener(
    "input",
    rafThrottle(() => {
      if (!baseEquilibrium) return;
      const a = safeParseFloat(document.getElementById("slider-a").value);
      const b = safeParseFloat(document.getElementById("slider-b").value);
      const c = safeParseFloat(document.getElementById("slider-c").value);
      const d = safeParseFloat(document.getElementById("slider-d").value);
      updateSliderLabels(a, b, c, d);
      updateShiftersChart(a, b, c, d);
    }),
  );
});

document.getElementById("shifters-reset").addEventListener("click", () => {
  if (!baseEquilibrium) return;
  const { demand, supply } = baseEquilibrium;
  document.getElementById("slider-a").value = demand.effectiveIntercept;
  document.getElementById("slider-b").value = demand.pCoef;
  document.getElementById("slider-c").value = supply.effectiveIntercept;
  document.getElementById("slider-d").value = supply.pCoef;
  updateSliderLabels(
    demand.effectiveIntercept,
    demand.pCoef,
    supply.effectiveIntercept,
    supply.pCoef,
  );
  updateShiftersChart(
    demand.effectiveIntercept,
    demand.pCoef,
    supply.effectiveIntercept,
    supply.pCoef,
  );
});

function updateShiftersChart(dI, dP, sI, sP) {
  const eq = solveEquilibrium(dI, dP, sI, sP);
  const origEq = baseEquilibrium;

  if (eq) {
    document.getElementById("orig-price").textContent = origEq.pStar.toFixed(4);
    document.getElementById("orig-quantity").textContent =
      origEq.qStar.toFixed(4);
    document.getElementById("new-price").textContent = eq.pStar.toFixed(4);
    document.getElementById("new-quantity").textContent = eq.qStar.toFixed(4);

    const deltaP = eq.pStar - origEq.pStar;
    const deltaQ = eq.qStar - origEq.qStar;

    const deltaPEl = document.getElementById("delta-price");
    deltaPEl.textContent = (deltaP >= 0 ? "+" : "") + deltaP.toFixed(4);
    deltaPEl.className =
      "result-value " + (deltaP >= 0 ? "positive" : "negative");

    const deltaQEl = document.getElementById("delta-quantity");
    deltaQEl.textContent = (deltaQ >= 0 ? "+" : "") + deltaQ.toFixed(4);
    deltaQEl.className =
      "result-value " + (deltaQ >= 0 ? "positive" : "negative");
  }

  drawShiftersChart(dI, dP, sI, sP, eq, null);
}

// ===================================================================
// SHIFTERS CHART
// ===================================================================

let shiftersChartController = null;

function drawShiftersChart(dI, dP, sI, sP, newEq, highlightQ) {
  const canvas = document.getElementById("shifters-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      drawShiftersChart(dI, dP, sI, sP, newEq, highlightQ),
    );
    return;
  }

  const orig = baseEquilibrium;
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 60, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const allPStar = [orig.pStar, newEq ? newEq.pStar : orig.pStar];
  const allQStar = [orig.qStar, newEq ? newEq.qStar : orig.qStar];
  const allIntercepts = [
    Math.abs(orig.demand.effectiveIntercept),
    Math.abs(orig.supply.effectiveIntercept),
    Math.abs(dI),
    Math.abs(sI),
  ];

  const qMax = Math.max(
    ...allIntercepts,
    ...allQStar.map((q) => Math.abs(q) * 1.6),
    1,
  );
  const pMax = Math.max(...allPStar.map((p) => Math.abs(p) * 1.8), 1);

  function toX(q) {
    return padding.left + (q / qMax) * chartWidth;
  }
  function toY(p) {
    return padding.top + chartHeight - (p / pMax) * chartHeight;
  }
  function fromX(x) {
    return ((x - padding.left) / chartWidth) * qMax;
  }

  chart.clear();
  drawGrid(ctx, chart, padding, chartWidth, chartHeight, qMax, pMax, toX, toY);

  // Original curves (ghost)
  ctx.setLineDash([6, 4]);
  drawCurveOnChart(
    ctx,
    toX,
    toY,
    orig.demand.effectiveIntercept,
    orig.demand.pCoef,
    qMax,
    pMax,
    "#f472b6",
    0.3,
    1.5,
  );
  drawCurveOnChart(
    ctx,
    toX,
    toY,
    orig.supply.effectiveIntercept,
    orig.supply.pCoef,
    qMax,
    pMax,
    "#2dd4bf",
    0.3,
    1.5,
  );
  ctx.setLineDash([]);

  // New curves (solid)
  drawCurveOnChart(ctx, toX, toY, dI, dP, qMax, pMax, "#f472b6", 1, 2.5);
  drawCurveOnChart(ctx, toX, toY, sI, sP, qMax, pMax, "#2dd4bf", 1, 2.5);

  // Original equilibrium ghost
  if (
    orig.pStar > 0 &&
    orig.qStar > 0 &&
    orig.pStar <= pMax &&
    orig.qStar <= qMax
  ) {
    ctx.beginPath();
    ctx.arc(toX(orig.qStar), toY(orig.pStar), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = window.CHART_FONTS.xs;
    const e0Label = "E₀(" + orig.qStar.toFixed(3) + ", " + orig.pStar.toFixed(3) + ")";
    const e0LabelW = ctx.measureText(e0Label).width;
    const e0LabelH = 12;
    const e0Pad = 3;
    const e0InRight = toX(orig.qStar) > padding.left + chartWidth * 0.6;
    const e0LabelX = e0InRight ? toX(orig.qStar) - e0LabelW - 12 : toX(orig.qStar) + 10;
    const e0NearTop = toY(orig.pStar) < padding.top + chartHeight * 0.25;
    const e0LabelY = e0NearTop ? toY(orig.pStar) + 18 : toY(orig.pStar) - 8;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(e0LabelX - e0Pad, e0LabelY - e0LabelH, e0LabelW + e0Pad * 2, e0LabelH + e0Pad, 4);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(e0Label, e0LabelX, e0LabelY - 1);
  }

  // New equilibrium
  if (
    newEq &&
    newEq.pStar > 0 &&
    newEq.qStar > 0 &&
    newEq.pStar <= pMax &&
    newEq.qStar <= qMax
  ) {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toX(newEq.qStar), padding.top + chartHeight);
    ctx.lineTo(toX(newEq.qStar), toY(newEq.pStar));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(newEq.pStar));
    ctx.lineTo(toX(newEq.qStar), toY(newEq.pStar));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(toX(newEq.qStar), toY(newEq.pStar), 7, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f59e0b";
    ctx.font = window.CHART_FONTS.boldSm;
    const e1Label = "E₁(" + newEq.qStar.toFixed(3) + ", " + newEq.pStar.toFixed(3) + ")";
    const e1LabelW = ctx.measureText(e1Label).width;
    const e1LabelH = 14;
    const e1Pad = 4;
    const e1InRight = toX(newEq.qStar) > padding.left + chartWidth * 0.6;
    const e1LabelX = e1InRight ? toX(newEq.qStar) - e1LabelW - 14 : toX(newEq.qStar) + 12;
    const e1NearTop = toY(newEq.pStar) < padding.top + chartHeight * 0.25;
    const e1LabelY = e1NearTop ? toY(newEq.pStar) + 20 : toY(newEq.pStar) - 10;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(e1LabelX - e1Pad, e1LabelY - e1LabelH, e1LabelW + e1Pad * 2, e1LabelH + e1Pad, 4);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.textAlign = "left";
    ctx.fillText(e1Label, e1LabelX, e1LabelY - 2);
  }

  // Hover
  if (highlightQ !== null && highlightQ >= 0 && highlightQ <= qMax) {
    const hx = toX(highlightQ);
    const pDemand = Math.abs(dP) > 1e-10 ? (highlightQ - dI) / dP : null;
    const pSupply = Math.abs(sP) > 1e-10 ? (highlightQ - sI) / sP : null;

    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipLines = [
      { text: "Q = " + highlightQ.toFixed(3), color: "#e2e8f0", bold: true },
    ];
    if (pDemand !== null && pDemand >= 0 && pDemand <= pMax) {
      ctx.beginPath();
      ctx.arc(hx, toY(pDemand), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#f472b6";
      ctx.fill();
      tooltipLines.push({
        text: "Demand P = " + pDemand.toFixed(4),
        color: "#f472b6",
      });
    }
    if (pSupply !== null && pSupply >= 0 && pSupply <= pMax) {
      ctx.beginPath();
      ctx.arc(hx, toY(pSupply), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#2dd4bf";
      ctx.fill();
      tooltipLines.push({
        text: "Supply P = " + pSupply.toFixed(4),
        color: "#2dd4bf",
      });
    }

    drawTooltipBox(
      ctx,
      tooltipLines,
      hx,
      padding,
      chartWidth,
      chartHeight,
      chart.width,
      padding.right,
    );
  }

  if (shiftersChartController) shiftersChartController.abort();
  shiftersChartController = new AbortController();
  const { signal } = shiftersChartController;

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = chart.width / r.width;
      const q = fromX((e.clientX - r.left) * scaleX);
      if (q >= 0 && q <= qMax) {
        canvas.style.cursor = "crosshair";
        drawShiftersChart(dI, dP, sI, sP, newEq, q);
      } else {
        canvas.style.cursor = "default";
        drawShiftersChart(dI, dP, sI, sP, newEq, null);
      }
    }),
    { signal },
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      canvas.style.cursor = "default";
      drawShiftersChart(dI, dP, sI, sP, newEq, null);
    },
    { signal },
  );
}

// ===================================================================
// TWO POINTS PREVIEW
// ===================================================================

function updatePointsPreviews() {
  const p1d = safeParseFloat(
    document.getElementById("pt-demand-p1").value,
    null,
  );
  const q1d = safeParseFloat(
    document.getElementById("pt-demand-q1").value,
    null,
  );
  const p2d = safeParseFloat(
    document.getElementById("pt-demand-p2").value,
    null,
  );
  const q2d = safeParseFloat(
    document.getElementById("pt-demand-q2").value,
    null,
  );
  const p1s = safeParseFloat(
    document.getElementById("pt-supply-p1").value,
    null,
  );
  const q1s = safeParseFloat(
    document.getElementById("pt-supply-q1").value,
    null,
  );
  const p2s = safeParseFloat(
    document.getElementById("pt-supply-p2").value,
    null,
  );
  const q2s = safeParseFloat(
    document.getElementById("pt-supply-q2").value,
    null,
  );

  const demandEl = document.getElementById("demand-pts-preview");
  const supplyEl = document.getElementById("supply-pts-preview");

  if (
    p1d !== null &&
    q1d !== null &&
    p2d !== null &&
    q2d !== null &&
    p2d !== p1d
  ) {
    const b = (q2d - q1d) / (p2d - p1d);
    const a = q1d - b * p1d;
    demandEl.innerHTML =
      "Q<sub>d</sub> = " + a.toFixed(4) + " + " + b.toFixed(4) + "P";
  } else {
    demandEl.textContent = "Enter two points to derive equation";
  }

  if (
    p1s !== null &&
    q1s !== null &&
    p2s !== null &&
    q2s !== null &&
    p2s !== p1s
  ) {
    const d = (q2s - q1s) / (p2s - p1s);
    const c = q1s - d * p1s;
    supplyEl.innerHTML =
      "Q<sub>s</sub> = " + c.toFixed(4) + " + " + d.toFixed(4) + "P";
  } else {
    supplyEl.textContent = "Enter two points to derive equation";
  }
}

[
  "pt-demand-p1",
  "pt-demand-q1",
  "pt-demand-p2",
  "pt-demand-q2",
  "pt-supply-p1",
  "pt-supply-q1",
  "pt-supply-p2",
  "pt-supply-q2",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", updatePointsPreviews);
});

// ===================================================================
// RESIZE HANDLER
// ===================================================================

let microResizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(microResizeTimeout);
  microResizeTimeout = setTimeout(() => {
    if (baseEquilibrium) {
      const { demand, supply, pStar, qStar } = baseEquilibrium;
      drawEquilibriumChart(demand, supply, pStar, qStar, null);
      const sa = safeParseFloat(document.getElementById("slider-a").value);
      const sb = safeParseFloat(document.getElementById("slider-b").value);
      const sc = safeParseFloat(document.getElementById("slider-c").value);
      const sd = safeParseFloat(document.getElementById("slider-d").value);
      const newEq = solveEquilibrium(sa, sb, sc, sd);
      drawShiftersChart(sa, sb, sc, sd, newEq, null);
    }
  }, 250);
});
