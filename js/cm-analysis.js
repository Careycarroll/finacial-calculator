import {
  safeParseFloat,
  safeParseInt,
  formatCurrency,
  createChartContext,
  showChartLoading,
  hideChartLoading,
  rafThrottle,
  validateInputs,
  showFieldError,
  bindFormEnter,
  drawLabelWithBackground,
} from "./chart-utils.js";
import { formatPct } from "./formatting.js";

// ===================================================================
// STATE
// ===================================================================

let spBaseData = null; // stored single product data for sensitivity tab

// ===================================================================
// TAB SWITCHING
// ===================================================================

const tabs = {
  single: {
    tab: document.getElementById("tab-single"),
    panel: document.getElementById("single-tab"),
  },
  multi: {
    tab: document.getElementById("tab-multi"),
    panel: document.getElementById("multi-tab"),
  },
  sensitivity: {
    tab: document.getElementById("tab-sensitivity"),
    panel: document.getElementById("sensitivity-tab"),
  },
  ol: {
    tab: document.getElementById("tab-ol"),
    panel: document.getElementById("ol-tab"),
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

initExplainer("sp-explainer-toggle", "sp-explainer-body");
initExplainer("vc-explainer-toggle", "vc-explainer-body");
initExplainer("fc-explainer-toggle", "fc-explainer-body");
initExplainer("mp-explainer-toggle", "mp-explainer-body");
initExplainer("sens-explainer-toggle", "sens-explainer-body");
initExplainer("ol-explainer-toggle", "ol-explainer-body");
initExplainer("sp-dol-explainer-toggle", "sp-dol-explainer-body");

// ===================================================================
// MODE TOGGLE — SINGLE PRODUCT
// ===================================================================

let spMode = "volume"; // "volume" | "target"

document.getElementById("sp-mode-volume").addEventListener("click", () => {
  spMode = "volume";
  document.getElementById("sp-mode-volume").classList.add("active");
  document.getElementById("sp-mode-target").classList.remove("active");
  document.getElementById("sp-units-group").classList.remove("hidden");
  document.getElementById("sp-target-group").classList.add("hidden");
});

document.getElementById("sp-mode-target").addEventListener("click", () => {
  spMode = "target";
  document.getElementById("sp-mode-target").classList.add("active");
  document.getElementById("sp-mode-volume").classList.remove("active");
  document.getElementById("sp-target-group").classList.remove("hidden");
  document.getElementById("sp-units-group").classList.add("hidden");
});

// ===================================================================
// COST ROW HELPERS
// ===================================================================

function createVariableCostRow(label = "", amount = "", showCogs = true) {
  const row = document.createElement("div");
  row.className = "cost-row";
  row.innerHTML = `
    <input type="text" class="cost-label" placeholder="e.g. Direct Materials" value="${label}" />
    <input type="number" class="cost-amount" placeholder="$/unit" min="0" step="any" value="${amount}" />
    ${showCogs ? `<label class="cost-cogs-label"><input type="checkbox" class="cost-cogs" /> COGS</label>` : ""}
    <button class="cost-remove" aria-label="Remove cost">✕</button>
  `;
  row
    .querySelector(".cost-remove")
    .addEventListener("click", () => row.remove());
  return row;
}

function createFixedCostRow(label = "", amount = "") {
  const row = document.createElement("div");
  row.className = "cost-row";
  row.innerHTML = `
    <input type="text" class="cost-label" placeholder="e.g. Rent" value="${label}" />
    <input type="number" class="cost-amount" placeholder="Total $" min="0" step="any" value="${amount}" />
    <button class="cost-remove" aria-label="Remove cost">✕</button>
  `;
  row
    .querySelector(".cost-remove")
    .addEventListener("click", () => row.remove());
  return row;
}

function getCostRows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const rows = container.querySelectorAll(".cost-row");
  return Array.from(rows).map((row) => ({
    label: row.querySelector(".cost-label")?.value.trim() || "Unnamed",
    amount: safeParseFloat(row.querySelector(".cost-amount")?.value, 0),
    isCogs: row.querySelector(".cost-cogs")?.checked || false,
  }));
}

// ===================================================================
// SINGLE PRODUCT — SETUP
// ===================================================================

document.getElementById("sp-add-variable").addEventListener("click", () => {
  document
    .getElementById("sp-variable-costs")
    .appendChild(createVariableCostRow());
});

document.getElementById("sp-add-fixed").addEventListener("click", () => {
  document.getElementById("sp-fixed-costs").appendChild(createFixedCostRow());
});

// Add default rows
document
  .getElementById("sp-variable-costs")
  .appendChild(createVariableCostRow("Direct Materials", ""));
document
  .getElementById("sp-variable-costs")
  .appendChild(createVariableCostRow("Direct Labor", ""));
document
  .getElementById("sp-fixed-costs")
  .appendChild(createFixedCostRow("Fixed Overhead", ""));

document
  .getElementById("sp-calculate")
  .addEventListener("click", handleSingleCalculate);
bindFormEnter(() => handleSingleCalculate(), "#single-tab");

// ===================================================================
// SINGLE PRODUCT — CALCULATION
// ===================================================================

function handleSingleCalculate() {
  // Validate based on mode
  const schema = [
    { id: "sp-price", label: "Selling Price", required: true, min: 0.01 },
  ];
  if (spMode === "volume") {
    schema.push({
      id: "sp-units",
      label: "Units Sold",
      required: true,
      min: 1,
      integer: true,
    });
  } else {
    schema.push({
      id: "sp-target-profit",
      label: "Target Profit",
      required: true,
      min: 0,
    });
  }
  const valid = validateInputs(schema, "#single-tab");
  if (!valid) return;

  const price = safeParseFloat(document.getElementById("sp-price").value);
  const capacity =
    safeParseFloat(document.getElementById("sp-capacity").value, 0) || null;

  const variableCostsTemp = getCostRows("sp-variable-costs");
  const fixedCostsTemp = getCostRows("sp-fixed-costs");
  const vcPerUnitTemp = variableCostsTemp.reduce((sum, c) => sum + c.amount, 0);
  const totalFCTemp = fixedCostsTemp.reduce((sum, c) => sum + c.amount, 0);
  const cmPerUnitTemp = price - vcPerUnitTemp;

  let units;
  if (spMode === "target") {
    const targetProfit = safeParseFloat(
      document.getElementById("sp-target-profit").value,
      0,
    );
    if (cmPerUnitTemp <= 0) {
      showFieldError(
        "sp-price",
        "CM per unit must be positive to solve for target units. Check your variable costs.",
      );
      return;
    }
    units = Math.ceil((totalFCTemp + targetProfit) / cmPerUnitTemp);
  } else {
    units = safeParseInt(document.getElementById("sp-units").value);
  }

  const variableCosts = getCostRows("sp-variable-costs");
  const fixedCosts = getCostRows("sp-fixed-costs");

  const vcPerUnit = variableCosts.reduce((sum, c) => sum + c.amount, 0);
  const cogsPerUnit = variableCosts
    .filter((c) => c.isCogs)
    .reduce((sum, c) => sum + c.amount, 0);
  const totalFC = fixedCosts.reduce((sum, c) => sum + c.amount, 0);

  const revenue = price * units;
  const totalVC = vcPerUnit * units;
  const totalCogs = cogsPerUnit * units;
  const cm = revenue - totalVC;
  const cmPerUnit = price - vcPerUnit;
  const cmRatio = revenue > 0 ? cm / revenue : 0;
  const gp = revenue - totalCogs;
  const gpMargin = revenue > 0 ? gp / revenue : 0;
  const opIncome = cm - totalFC;
  const dol = computeDOL(cm, opIncome);
  const beUnits = cmPerUnit > 0 ? totalFC / cmPerUnit : Infinity;
  const beRevenue = cmRatio > 0 ? totalFC / cmRatio : Infinity;
  const mos = revenue > 0 ? (revenue - beRevenue) / revenue : 0;

  // Store for sensitivity tab
  spBaseData = { price, units, vcPerUnit, cogsPerUnit, totalFC, capacity };

  // Display results
  document.getElementById("sp-revenue").textContent = formatCurrency(revenue);
  document.getElementById("sp-revenue-2").textContent = formatCurrency(revenue);
  document.getElementById("sp-cogs").textContent = formatCurrency(totalCogs);
  document.getElementById("sp-vc-total").textContent = formatCurrency(totalVC);
  document.getElementById("sp-gp").textContent = formatCurrency(gp);
  document.getElementById("sp-gp-margin").textContent = formatPct(gpMargin);
  document.getElementById("sp-cm").textContent = formatCurrency(cm);
  document.getElementById("sp-cm-ratio").textContent = formatPct(cmRatio);
  document.getElementById("sp-cm-unit").textContent = formatCurrency(cmPerUnit);
  document.getElementById("sp-fc-total").textContent = formatCurrency(totalFC);

  const opEl = document.getElementById("sp-operating-income");
  opEl.textContent = formatCurrency(opIncome);
  opEl.className = `result-value ${opIncome >= 0 ? "positive" : "negative"}`;


  // DOL (Operating Leverage)
  const dolEl = document.getElementById("sp-dol");
  if (dolEl) dolEl.textContent = formatDOL(dol);

  const spDolSection = document.getElementById("sp-dol-section");
  if (spDolSection) spDolSection.classList.remove("hidden");

  const spDolSteps = document.getElementById("sp-dol-steps");
  if (spDolSteps) {
    const f = formatCurrency;
    spDolSteps.innerHTML = `
      <div class="cm-step-section">
        <div class="cm-step-section-title">DOL at current volume</div>
        <div class="cm-step">
          <div class="cm-step-formula">Contribution Margin (CM) = Revenue − Variable Costs</div>
          <div class="cm-step-substituted">= ${f(revenue)} − ${f(totalVC)}</div>
          <div class="cm-step-result">= ${f(cm)}</div>
        </div>
        <div class="cm-step">
          <div class="cm-step-formula">Operating Income = CM − Fixed Costs</div>
          <div class="cm-step-substituted">= ${f(cm)} − ${f(totalFC)}</div>
          <div class="cm-step-result ${opIncome < 0 ? "negative" : ""}">= ${f(opIncome)}</div>
        </div>
        <div class="cm-step">
          <div class="cm-step-formula">DOL = CM ÷ Operating Income</div>
          <div class="cm-step-substituted">= ${f(cm)} ÷ ${f(opIncome)}</div>
          <div class="cm-step-result">= ${formatDOL(dol)}</div>
        </div>
      </div>
    `;
  }

  document.getElementById("sp-be-units").textContent =
    beUnits === Infinity ? "N/A" : Math.ceil(beUnits).toLocaleString();
  document.getElementById("sp-be-revenue").textContent =
    beRevenue === Infinity ? "N/A" : formatCurrency(beRevenue);
  document.getElementById("sp-mos").textContent = formatPct(mos);

  // Capacity flag
  const flagEl = document.getElementById("sp-capacity-flag");
  if (capacity && beUnits !== Infinity && beUnits > capacity) {
    flagEl.textContent = `⚠️ Breakeven (${Math.ceil(beUnits).toLocaleString()} units) exceeds capacity (${capacity.toLocaleString()} units). This product cannot break even at current costs and pricing.`;
    flagEl.className = "cm-flag negative";
    flagEl.classList.remove("hidden");
  } else if (capacity && beUnits !== Infinity) {
    flagEl.textContent = `✅ Breakeven (${Math.ceil(beUnits).toLocaleString()} units) is within capacity (${capacity.toLocaleString()} units).`;
    flagEl.className = "cm-flag positive";
    flagEl.classList.remove("hidden");
  } else {
    flagEl.classList.add("hidden");
  }

  // Show sections
  document.getElementById("sp-results").classList.remove("hidden");
  document.getElementById("sp-waterfall-section").classList.remove("hidden");
  document.getElementById("sp-breakeven-section").classList.remove("hidden");

  // Charts
  showChartLoading("sp-waterfall-canvas");
  showChartLoading("sp-breakeven-canvas");
  requestAnimationFrame(() => {
    drawWaterfallChart(revenue, totalVC, cm, totalFC, opIncome);
    hideChartLoading("sp-waterfall-canvas");
    drawBreakevenChart(price, vcPerUnit, totalFC, beUnits, units, capacity);
    hideChartLoading("sp-breakeven-canvas");
  });

  // Render step-by-step calculations
  renderStepByStep({
    price, units, vcPerUnit, cogsPerUnit, totalFC,
    revenue, totalVC, totalCogs, cm, cmPerUnit, cmRatio,
    gp, gpMargin, opIncome, beUnits, beRevenue, mos,
    variableCosts, fixedCosts,
    targetProfit: spMode === 'target' ? safeParseFloat(document.getElementById('sp-target-profit').value, 0) : null,
    mode: spMode,
  });

  // Enable sensitivity tab
  document.getElementById("sensitivity-no-data").style.display = "none";
  document.getElementById("sensitivity-controls").classList.remove("hidden");
  updateSensitivity();

  // Enable operating leverage tab
  const olNoData = document.getElementById("ol-no-data");
  const olControls = document.getElementById("ol-controls");
  if (olNoData) olNoData.style.display = "none";
  if (olControls) olControls.classList.remove("hidden");
  updateOperatingLeverage();

  document.getElementById("sp-results").scrollIntoView({ behavior: "smooth" });
}

// ===================================================================
// ===================================================================
// STEP-BY-STEP CALCULATIONS
// ===================================================================

function buildStepByStep(data) {
  const {
    price, units, vcPerUnit, cogsPerUnit, totalFC,
    revenue, totalVC, totalCogs, cm, cmPerUnit, cmRatio,
    gp, gpMargin, opIncome, beUnits, beRevenue, mos,
    variableCosts, fixedCosts, targetProfit, mode
  } = data;

  const f = formatCurrency;
  const pct = formatPct;

  function step(formula, substituted, result, isNegative = false) {
    return `<div class="cm-step">
      <div class="cm-step-formula">${formula}</div>
      <div class="cm-step-substituted">= ${substituted}</div>
      <div class="cm-step-result ${isNegative ? 'negative' : ''}">= ${result}</div>
    </div>`;
  }

  function indent(text) {
    return `<div class="cm-step-indent">${text}</div>`;
  }

  function section(title,...items) {
    return `<div class="cm-step-section">
      <div class="cm-step-section-title">${title}</div>
      ${items.join('')}
    </div>`;
  }

  const sections = [];

  // Section 1 — Revenue & Costs
  const vcLines = variableCosts.map(c =>
    indent(`${c.label}: ${f(c.amount)} × ${units.toLocaleString()} = ${f(c.amount * units)}`)
  ).join('');
  const fcLines = fixedCosts.map(c =>
    indent(`${c.label}: ${f(c.amount)}`)
  ).join('');

  sections.push(section('1. Revenue & Costs',
    step('Revenue = Price × Units',
      `${f(price)} × ${units.toLocaleString()}`,
      f(revenue)),
    step('Variable Costs per Unit = Sum of all variable cost line items',
      variableCosts.map(c => f(c.amount)).join(' + '),
      f(vcPerUnit)),
    `<div class="cm-step">
      <div class="cm-step-formula">Total Variable Costs = VC per Unit × Units</div>
      <div class="cm-step-substituted">= ${f(vcPerUnit)} × ${units.toLocaleString()}</div>
      <div class="cm-step-result">= ${f(totalVC)}</div>
    </div>`,
    vcLines,
    `<div class="cm-step">
      <div class="cm-step-formula">Total Fixed Costs = Sum of all fixed cost line items</div>
      <div class="cm-step-result">= ${f(totalFC)}</div>
    </div>`,
    fcLines
  ));

  // Section 2 — Gross Profit
  const cogsItems = variableCosts.filter(c => c.isCogs);
  const cogsFormula = cogsItems.length > 0
    ? cogsItems.map(c => `${f(c.amount)}`).join(' + ') + ` = ${f(cogsPerUnit)} per unit`
    : 'No costs marked as COGS';

  sections.push(section('2. Gross Profit',
    `<div class="cm-step">
      <div class="cm-step-formula">COGS per Unit = Sum of variable costs marked as COGS</div>
      <div class="cm-step-substituted">= ${cogsFormula}</div>
      <div class="cm-step-result">= ${f(cogsPerUnit)} per unit</div>
    </div>`,
    step('Total COGS = COGS per Unit × Units',
      `${f(cogsPerUnit)} × ${units.toLocaleString()}`,
      f(totalCogs)),
    step('Gross Profit = Revenue − Total COGS',
      `${f(revenue)} − ${f(totalCogs)}`,
      f(gp), gp < 0),
    step('GP Margin = Gross Profit ÷ Revenue',
      `${f(gp)} ÷ ${f(revenue)}`,
      pct(gpMargin), gpMargin < 0)
  ));

  // Section 3 — Contribution Margin
  sections.push(section('3. Contribution Margin',
    step('CM per Unit = Price − Variable Costs per Unit',
      `${f(price)} − ${f(vcPerUnit)}`,
      f(cmPerUnit), cmPerUnit < 0),
    step('Total Contribution Margin = CM per Unit × Units',
      `${f(cmPerUnit)} × ${units.toLocaleString()}`,
      f(cm), cm < 0),
    step('CM Ratio = CM per Unit ÷ Price',
      `${f(cmPerUnit)} ÷ ${f(price)}`,
      pct(cmRatio), cmRatio < 0)
  ));

  // Section 4 — Operating Income
  sections.push(section('4. Operating Income',
    step('Operating Income = Total CM − Total Fixed Costs',
      `${f(cm)} − ${f(totalFC)}`,
      f(opIncome), opIncome < 0)
  ));

  // Section 5 — Breakeven Analysis
  const beSteps = [];
  if (cmPerUnit > 0) {
    beSteps.push(step('Breakeven Units = Fixed Costs ÷ CM per Unit',
      `${f(totalFC)} ÷ ${f(cmPerUnit)}`,
      `${Math.ceil(beUnits).toLocaleString()} units`));
    beSteps.push(step('Breakeven Revenue = Fixed Costs ÷ CM Ratio',
      `${f(totalFC)} ÷ ${pct(cmRatio)}`,
      f(beRevenue)));
    beSteps.push(step('Margin of Safety (%) = (Revenue − Breakeven Revenue) ÷ Revenue',
      `(${f(revenue)} − ${f(beRevenue)}) ÷ ${f(revenue)}`,
      pct(mos), mos < 0));
    beSteps.push(step('Margin of Safety ($) = Revenue − Breakeven Revenue',
      `${f(revenue)} − ${f(beRevenue)}`,
      f(revenue - beRevenue), (revenue - beRevenue) < 0));
  } else {
    beSteps.push(`<div class="cm-step"><div class="cm-step-result negative">⚠️ CM per unit is zero or negative — breakeven cannot be calculated.</div></div>`);
  }
  sections.push(section('5. Breakeven Analysis',...beSteps));

  // Section 6 — Target Profit (only in target mode)
  if (mode === 'target' && targetProfit !== null) {
    sections.push(section('6. Target Profit Calculation',
      step('Target Units = (Fixed Costs + Target Profit) ÷ CM per Unit',
        `(${f(totalFC)} + ${f(targetProfit)}) ÷ ${f(cmPerUnit)}`,
        `${Math.ceil((totalFC + targetProfit) / cmPerUnit).toLocaleString()} units (rounded up)`),
      step('Target Revenue = Target Units × Price',
        `${Math.ceil((totalFC + targetProfit) / cmPerUnit).toLocaleString()} × ${f(price)}`,
        f(Math.ceil((totalFC + targetProfit) / cmPerUnit) * price))
    ));
  }

  return sections.join('');
}

function renderStepByStep(data) {
  const container = document.getElementById('sp-steps-content');
  const section = document.getElementById('sp-steps-section');
  const toggle = document.getElementById('sp-steps-toggle');
  const body = document.getElementById('sp-steps-body');

  container.innerHTML = buildStepByStep(data);
  section.classList.remove('hidden');

  // Auto-expand
  toggle.setAttribute('aria-expanded', 'true');
  body.classList.remove('hidden');
}

// WATERFALL CHART
// ===================================================================

function drawWaterfallChart(revenue, totalVC, cm, totalFC, opIncome) {
  const canvas = document.getElementById("sp-waterfall-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      drawWaterfallChart(revenue, totalVC, cm, totalFC, opIncome),
    );
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 30, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const bars = [
    { label: "Revenue", value: revenue, color: "#2dd4bf", type: "absolute" },
    {
      label: "Variable\nCosts",
      value: -totalVC,
      color: "#f472b6",
      type: "delta",
    },
    {
      label: "Contribution\nMargin",
      value: cm,
      color: "#60a5fa",
      type: "subtotal",
    },
    { label: "Fixed\nCosts", value: -totalFC, color: "#f59e0b", type: "delta" },
    {
      label: "Operating\nIncome",
      value: opIncome,
      color: opIncome >= 0 ? "#4ade80" : "#f472b6",
      type: "subtotal",
    },
  ];

  const maxVal = revenue * 1.1;
  const barWidth = chartWidth / (bars.length * 2);

  function toY(val) {
    return (
      padding.top + chartHeight - (Math.max(0, val) / maxVal) * chartHeight
    );
  }

  function toH(val) {
    return (Math.abs(val) / maxVal) * chartHeight;
  }

  chart.clear();

  // Y-axis grid
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxVal / ySteps) * i;
    const y = toY(val);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(val), padding.left - 8, y + 4);
  }

  // Draw bars — true waterfall with floating delta bars
  let runningTop = revenue;

  bars.forEach((bar, i) => {
    const x = padding.left + i * (chartWidth / bars.length) + barWidth * 0.5;
    const w = barWidth;
    let barY, barH;

    if (bar.type === "absolute") {
      barY = toY(bar.value);
      barH = toH(bar.value);
      runningTop = bar.value;
    } else if (bar.type === "subtotal") {
      barY = toY(Math.abs(bar.value));
      barH = toH(Math.abs(bar.value));
    } else {
      const absVal = Math.abs(bar.value);
      if (bar.value < 0) {
        barY = toY(runningTop);
        barH = toH(absVal);
        runningTop -= absVal;
      } else {
        barY = toY(runningTop + bar.value);
        barH = toH(bar.value);
        runningTop += bar.value;
      }
    }

    // Bar fill
    if (bar.type === "subtotal") {
      ctx.fillStyle = bar.color + "33";
      ctx.strokeStyle = bar.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, barY, w, barH, [4, 4, 0, 0]);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = bar.color + "cc";
      ctx.beginPath();
      ctx.roundRect(x, barY, w, barH, [4, 4, 0, 0]);
      ctx.fill();
    }

    // Value label
    ctx.fillStyle = bar.color;
    ctx.font = window.CHART_FONTS.boldSm;
    ctx.textAlign = "center";
    const labelY = barY - 6;
    ctx.fillText(formatCurrency(Math.abs(bar.value)), x + w / 2, labelY);

    // X-axis label
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.xs;
    const lineLabels = bar.label.split("\n");
    lineLabels.forEach((line, li) => {
      ctx.fillText(line, x + w / 2, chart.height - padding.bottom + 16 + li * 14);
    });

    // Connector line to next bar
    if (i < bars.length - 1) {
      const nextX = padding.left + (i + 1) * (chartWidth / bars.length) + barWidth * 0.5;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + w, toY(runningTop));
      ctx.lineTo(nextX, toY(runningTop));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

// ===================================================================
// BREAKEVEN CHART
// ===================================================================

function drawBreakevenChart(
  price,
  vcPerUnit,
  totalFC,
  beUnits,
  actualUnits,
  capacity,
) {
  const canvas = document.getElementById("sp-breakeven-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      drawBreakevenChart(
        price,
        vcPerUnit,
        totalFC,
        beUnits,
        actualUnits,
        capacity,
      ),
    );
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const maxUnits = Math.max(
    actualUnits * 1.3,
    beUnits === Infinity ? actualUnits * 2 : beUnits * 1.5,
    capacity ? capacity * 1.1 : 0,
  );

  const maxRevenue = price * maxUnits * 1.1;

  function toX(units) {
    return padding.left + (units / maxUnits) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / maxRevenue) * chartHeight;
  }

  function drawStaticLayer(offCtx) {
    offCtx.clearRect(0, 0, chart.width, chart.height);

    // Grid (Y)
    for (let i = 0; i <= 5; i++) {
      const val = (maxRevenue / 5) * i;
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

    // X-axis labels
    offCtx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const u = (maxUnits / 6) * i;
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.xs;
      offCtx.fillText(
        Math.round(u).toLocaleString(),
        toX(u),
        chart.height - padding.bottom + 16,
      );
    }
    offCtx.fillStyle = "#94a3b8";
    offCtx.font = window.CHART_FONTS.md;
    offCtx.fillText("Units", chart.width / 2, chart.height - 5);

    // Fixed cost line
    offCtx.strokeStyle = "#f59e0b";
    offCtx.lineWidth = 2;
    offCtx.setLineDash([6, 4]);
    offCtx.beginPath();
    offCtx.moveTo(toX(0), toY(totalFC));
    offCtx.lineTo(toX(maxUnits), toY(totalFC));
    offCtx.stroke();
    offCtx.setLineDash([]);
    drawLabelWithBackground(
      offCtx,
      `Fixed Costs: ${formatCurrency(totalFC)}`,
      padding.left + 5,
      toY(totalFC) - 6,
      { color: "#f59e0b", font: window.CHART_FONTS.xs, align: "left" },
    );

    // Total cost line
    offCtx.strokeStyle = "#f472b6";
    offCtx.lineWidth = 2.5;
    offCtx.beginPath();
    offCtx.moveTo(toX(0), toY(totalFC));
    offCtx.lineTo(toX(maxUnits), toY(totalFC + vcPerUnit * maxUnits));
    offCtx.stroke();
    drawLabelWithBackground(
      offCtx,
      "Total Cost",
      chart.width - padding.right - 5,
      toY(totalFC + vcPerUnit * maxUnits) - 6,
      { color: "#f472b6", font: window.CHART_FONTS.xs, align: "right" },
    );

    // Revenue line
    offCtx.strokeStyle = "#2dd4bf";
    offCtx.lineWidth = 2.5;
    offCtx.beginPath();
    offCtx.moveTo(toX(0), toY(0));
    offCtx.lineTo(toX(maxUnits), toY(price * maxUnits));
    offCtx.stroke();
    drawLabelWithBackground(
      offCtx,
      "Revenue",
      chart.width - padding.right - 5,
      toY(price * maxUnits) - 6,
      { color: "#2dd4bf", font: window.CHART_FONTS.xs, align: "right" },
    );

    // Breakeven point
    if (beUnits !== Infinity && beUnits <= maxUnits) {
      const bx = toX(beUnits);
      const by = toY(price * beUnits);

      offCtx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      offCtx.lineWidth = 1;
      offCtx.setLineDash([3, 3]);
      offCtx.beginPath();
      offCtx.moveTo(bx, padding.top);
      offCtx.lineTo(bx, padding.top + chartHeight);
      offCtx.stroke();
      offCtx.setLineDash([]);

      offCtx.beginPath();
      offCtx.arc(bx, by, 6, 0, Math.PI * 2);
      offCtx.fillStyle = "#fff";
      offCtx.fill();
      offCtx.strokeStyle = "#2dd4bf";
      offCtx.lineWidth = 2.5;
      offCtx.stroke();

      drawLabelWithBackground(
        offCtx,
        `BE: ${Math.ceil(beUnits).toLocaleString()} units`,
        bx,
        padding.top - 8,
        { color: "#e2e8f0", font: window.CHART_FONTS.boldSm, align: "center" },
      );
    }

    // Capacity line
    if (capacity && capacity <= maxUnits) {
      const cx = toX(capacity);
      offCtx.strokeStyle = "rgba(168, 85, 247, 0.6)";
      offCtx.lineWidth = 1.5;
      offCtx.setLineDash([4, 4]);
      offCtx.beginPath();
      offCtx.moveTo(cx, padding.top);
      offCtx.lineTo(cx, padding.top + chartHeight);
      offCtx.stroke();
      offCtx.setLineDash([]);
      drawLabelWithBackground(
        offCtx,
        `Capacity: ${capacity.toLocaleString()}`,
        cx,
        padding.top + 12,
        { color: "#a855f7", font: window.CHART_FONTS.xs, align: "center" },
      );
    }

    // Actual units marker
    const ax = toX(actualUnits);
    offCtx.strokeStyle = "rgba(96, 165, 250, 0.5)";
    offCtx.lineWidth = 1;
    offCtx.setLineDash([4, 4]);
    offCtx.beginPath();
    offCtx.moveTo(ax, padding.top);
    offCtx.lineTo(ax, padding.top + chartHeight);
    offCtx.stroke();
    offCtx.setLineDash([]);
    drawLabelWithBackground(
      offCtx,
      `Actual: ${actualUnits.toLocaleString()}`,
      ax,
      padding.top + 24,
      { color: "#60a5fa", font: window.CHART_FONTS.xs, align: "center" },
    );
  }

  function ensureCache() {
    const key = JSON.stringify({
      w: chart.width,
      h: chart.height,
      price,
      vcPerUnit,
      totalFC,
      beUnits,
      actualUnits,
      capacity,
    });

    if (canvas._beCacheKey === key && canvas._beStaticCanvas) return;

    const off = document.createElement("canvas");
    off.width = chart.width;
    off.height = chart.height;
    const offCtx = off.getContext("2d");
    drawStaticLayer(offCtx);

    canvas._beCacheKey = key;
    canvas._beStaticCanvas = off;
  }

  function blitStatic() {
    ensureCache();
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(canvas._beStaticCanvas, 0, 0);
  }

  function drawOverlay(hoverUnits) {
    blitStatic();

    if (hoverUnits === null || hoverUnits < 0 || hoverUnits > maxUnits) return;

    const hx = toX(hoverUnits);
    const hRevenue = price * hoverUnits;
    const hTotalCost = totalFC + vcPerUnit * hoverUnits;
    const hProfit = hRevenue - hTotalCost;

    // Crosshair
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots
    const revY = toY(hRevenue);
    const costY = toY(hTotalCost);

    ctx.beginPath();
    ctx.arc(hx, revY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#2dd4bf";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx, costY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f472b6";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tooltip
    const tooltipLines = [
      { text: `Units: ${Math.round(hoverUnits).toLocaleString()}`, color: "#e2e8f0", bold: true },
      { text: `Revenue: ${formatCurrency(hRevenue)}`, color: "#2dd4bf" },
      { text: `Variable Costs: ${formatCurrency(vcPerUnit * hoverUnits)}`, color: "#94a3b8" },
      { text: `Fixed Costs: ${formatCurrency(totalFC)}`, color: "#f59e0b" },
      { text: `Total Costs: ${formatCurrency(hTotalCost)}`, color: "#f472b6" },
      { text: `${hProfit >= 0 ? "Profit" : "Loss"}: ${formatCurrency(Math.abs(hProfit))}`, color: hProfit >= 0 ? "#4ade80" : "#f472b6", bold: true },
    ];

    if (beUnits !== Infinity) {
      const distFromBE = Math.round(hoverUnits) - Math.ceil(beUnits);
      tooltipLines.push({
        text: distFromBE >= 0
          ? `${distFromBE.toLocaleString()} units above BE`
          : `${Math.abs(distFromBE).toLocaleString()} units below BE`,
        color: distFromBE >= 0 ? "#4ade80" : "#f472b6",
      });
    }

    ctx.font = window.CHART_FONTS.md;
    const tooltipWidth = Math.max(...tooltipLines.map(l => ctx.measureText(l.text).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;

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
    tooltipLines.forEach((line, i) => {
      ctx.fillStyle = line.color || "#e2e8f0";
      ctx.font = line.bold ? window.CHART_FONTS.boldMd : window.CHART_FONTS.md;
      ctx.fillText(line.text, tx + 12, ty + 18 + i * 20);
    });
  }

  blitStatic();

  if (canvas._beController) canvas._beController.abort();
  canvas._beController = new AbortController();
  const { signal: beSignal } = canvas._beController;

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = chart.width / r.width;
      const hoverUnits =
        (((e.clientX - r.left) * scaleX - padding.left) / chartWidth) * maxUnits;

      if (hoverUnits >= 0 && hoverUnits <= maxUnits) {
        canvas.style.cursor = "crosshair";
        drawOverlay(hoverUnits);
      } else {
        canvas.style.cursor = "default";
        drawOverlay(null);
      }
    }),
    { signal: beSignal },
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      canvas.style.cursor = "default";
      drawOverlay(null);
    },
    { signal: beSignal },
  );
}

// MULTI-PRODUCT — SETUP
// ===================================================================

let productCount = 0;

function addProduct(name = "", price = "", mix = "", maxUnits = "") {
  productCount++;
  const id = productCount;
  const card = document.createElement("div");
  card.className = "mp-product-card";
  card.dataset.productId = id;

  card.innerHTML = `
    <div class="mp-product-header">
      <span class="mp-product-title">Product ${id}</span>
      <button class="cost-remove mp-remove-product" aria-label="Remove product">✕ Remove</button>
    </div>
    <div class="mp-product-inputs">
      <div class="form-group">
        <label>Product Name</label>
        <input type="text" class="mp-name" placeholder="e.g. Product A" value="${name}" />
      </div>
      <div class="form-group">
        <label>Price per Unit ($)</label>
        <input type="number" class="mp-price" placeholder="e.g. 100" min="0" step="any" value="${price}" />
      </div>
      <div class="form-group">
        <label>Sales Mix (%)</label>
        <input type="number" class="mp-mix" placeholder="e.g. 60" min="0" max="100" step="any" value="${mix}" />
      </div>
      <div class="form-group">
        <label>Max Units (optional)</label>
        <input type="number" class="mp-max-units" placeholder="Capacity ceiling" min="0" step="1" value="${maxUnits}" />
      </div>
      <div class="form-group">
        <label id="mp-resource-label-${id}" class="mp-resource-label hidden">Resource Units Required</label>
        <input type="number" class="mp-resource-units hidden" placeholder="e.g. 2" min="0" step="any" />
      </div>
    </div>
    <div class="mp-product-vc-label">Variable Costs (per unit)</div>
    <div class="mp-product-vc-list" id="mp-vc-${id}"></div>
    <button class="btn-add mp-add-vc" data-product="${id}" style="margin-top:0.5rem; font-size:0.8rem;">+ Add Variable Cost</button>
  `;

  card
    .querySelector(".mp-remove-product")
    .addEventListener("click", () => card.remove());
  card.querySelector(".mp-add-vc").addEventListener("click", () => {
    document
      .getElementById(`mp-vc-${id}`)
      .appendChild(createVariableCostRow("", "", false));
  });

  // Add default VC row
  document.getElementById("mp-products").appendChild(card);
  document
    .getElementById(`mp-vc-${id}`)
    .appendChild(createVariableCostRow("Variable Cost", "", false));

  // Show/hide resource units field based on constraint toggle
  updateResourceFields();
}

function updateResourceFields() {
  const enabled = document.getElementById("mp-constraint-toggle").checked;
  const resourceName =
    document.getElementById("mp-resource-name").value || "Resource Units";
  document.querySelectorAll(".mp-resource-units").forEach((input) => {
    input.classList.toggle("hidden", !enabled);
  });
  document.querySelectorAll(".mp-resource-label").forEach((label) => {
    label.textContent = resourceName + " Required";
    label.classList.toggle("hidden", !enabled);
  });
}

document
  .getElementById("mp-add-product")
  .addEventListener("click", () => addProduct());
document.getElementById("mp-add-fixed").addEventListener("click", () => {
  document.getElementById("mp-fixed-costs").appendChild(createFixedCostRow());
});

document
  .getElementById("mp-constraint-toggle")
  .addEventListener("change", () => {
    document.getElementById("mp-constraint-fields").classList.toggle("hidden");
    updateResourceFields();
  });

document
  .getElementById("mp-resource-name")
  .addEventListener("input", updateResourceFields);

document
  .getElementById("mp-calculate")
  .addEventListener("click", handleMultiCalculate);

// Add default products and fixed cost
addProduct("Product A", "", "60", "");
addProduct("Product B", "", "40", "");
document
  .getElementById("mp-fixed-costs")
  .appendChild(createFixedCostRow("Fixed Overhead", ""));

// ===================================================================
// MULTI-PRODUCT — CALCULATION
// ===================================================================

function handleMultiCalculate() {
  const productCards = document.querySelectorAll(".mp-product-card");
  if (productCards.length === 0) {
    return;
  }

  const fixedCosts = getCostRows("mp-fixed-costs");
  const totalFC = fixedCosts.reduce((sum, c) => sum + c.amount, 0);
  const constraintEnabled = document.getElementById(
    "mp-constraint-toggle",
  ).checked;
  const resourceName =
    document.getElementById("mp-resource-name").value || "Resource Units";
  const resourceTotal = safeParseFloat(
    document.getElementById("mp-resource-total").value,
    0,
  );

  // Parse products
  const products = Array.from(productCards).map((card) => {
    const vcRows = Array.from(
      card.querySelectorAll(".mp-product-vc-list .cost-row"),
    ).map((row) => ({
      amount: safeParseFloat(row.querySelector(".cost-amount")?.value, 0),
    }));
    const vcPerUnit = vcRows.reduce((sum, r) => sum + r.amount, 0);
    const price = safeParseFloat(card.querySelector(".mp-price")?.value, 0);
    const mix = safeParseFloat(card.querySelector(".mp-mix")?.value, 0) / 100;
    const maxUnits =
      safeParseFloat(card.querySelector(".mp-max-units")?.value, 0) || null;
    const resourceUnits = safeParseFloat(
      card.querySelector(".mp-resource-units")?.value,
      0,
    );
    const name =
      card.querySelector(".mp-name")?.value.trim() ||
      `Product ${card.dataset.productId}`;
    const cmPerUnit = price - vcPerUnit;
    const cmRatio = price > 0 ? cmPerUnit / price : 0;
    const cmPerResource =
      constraintEnabled && resourceUnits > 0 ? cmPerUnit / resourceUnits : null;

    return {
      name,
      price,
      vcPerUnit,
      mix,
      maxUnits,
      resourceUnits,
      cmPerUnit,
      cmRatio,
      cmPerResource,
    };
  });

  // Validate mix sums to 100%
  const totalMix = products.reduce((sum, p) => sum + p.mix, 0);
  if (Math.abs(totalMix - 1) > 0.01) {
    const flag = document.getElementById("mp-capacity-flags");
    flag.innerHTML = `<div class="cm-flag negative">⚠️ Sales mix percentages must sum to 100%. Current total: ${(totalMix * 100).toFixed(1)}%.</div>`;
    document.getElementById("mp-results").classList.remove("hidden");
    return;
  }

  // Weighted CM
  const weightedCM = products.reduce((sum, p) => sum + p.cmPerUnit * p.mix, 0);
  const weightedCMRatio = products.reduce(
    (sum, p) => sum + p.cmRatio * p.mix,
    0,
  );

  // Bundle breakeven
  const beBundleUnits = weightedCM > 0 ? totalFC / weightedCM : Infinity;
  const beRevenue = weightedCMRatio > 0 ? totalFC / weightedCMRatio : Infinity;

  // Per-product BE — Option A and Option B
  products.forEach((p) => {
    p.beUnitsA = p.cmPerUnit > 0 ? (totalFC * p.mix) / p.cmPerUnit : Infinity;
    p.beUnitsB = beBundleUnits !== Infinity ? beBundleUnits * p.mix : Infinity;
  });

  // Total operating income (based on sales mix and bundle units sold)
  // Assume actual units = beBundleUnits * 1.2 for display if no units provided
  const totalRevenue = products.reduce(
    (sum, p) => sum + p.price * p.mix * beBundleUnits,
    0,
  );
  const totalVC = products.reduce(
    (sum, p) => sum + p.vcPerUnit * p.mix * beBundleUnits,
    0,
  );
  const totalCM = totalRevenue - totalVC;
  const opIncome = totalCM - totalFC;

  // Constraint ranking
  let constraintResults = null;
  if (constraintEnabled && resourceTotal > 0) {
    const ranked = [...products]
      .filter((p) => p.cmPerResource !== null)
      .sort((a, b) => b.cmPerResource - a.cmPerResource);

    let remainingResource = resourceTotal;
    let totalAchievableCM = 0;

    constraintResults = ranked.map((p, i) => {
      const maxByResource =
        p.resourceUnits > 0
          ? Math.floor(remainingResource / p.resourceUnits)
          : 0;
      const maxByCapacity = p.maxUnits || Infinity;
      const unitsToProduce = Math.min(maxByResource, maxByCapacity);
      const resourceUsed = unitsToProduce * p.resourceUnits;
      remainingResource -= resourceUsed;
      const productCM = unitsToProduce * p.cmPerUnit;
      totalAchievableCM += productCM;

      return {
        rank: i + 1,
        name: p.name,
        cmPerUnit: p.cmPerUnit,
        cmPerResource: p.cmPerResource,
        resourceUnits: p.resourceUnits,
        maxUnits: p.maxUnits,
        unitsToProduce,
        totalCM: productCM,
      };
    });

    constraintResults.totalAchievableCM = totalAchievableCM;
    constraintResults.resourceName = resourceName;
  }

  // Display bundle summary
  document.getElementById("mp-weighted-cm").textContent =
    formatCurrency(weightedCM);
  document.getElementById("mp-weighted-cm-ratio").textContent =
    formatPct(weightedCMRatio);
  document.getElementById("mp-fc-total").textContent = formatCurrency(totalFC);
  document.getElementById("mp-be-bundle").textContent =
    beBundleUnits === Infinity
      ? "N/A"
      : Math.ceil(beBundleUnits).toLocaleString();
  document.getElementById("mp-be-revenue").textContent =
    beRevenue === Infinity ? "N/A" : formatCurrency(beRevenue);
  document.getElementById("mp-operating-income").textContent =
    formatCurrency(opIncome);

  // Per-product table
  const tbody = document.getElementById("mp-product-tbody");
  tbody.innerHTML = "";

  const constraintColHeader = document.getElementById("mp-constraint-col");
  const rankColHeader = document.getElementById("mp-rank-col");
  constraintColHeader.classList.toggle("hidden", !constraintEnabled);
  rankColHeader.classList.toggle("hidden", !constraintEnabled);

  if (constraintEnabled) {
    constraintColHeader.textContent = `CM / ${resourceName}`;
  }

  // Rank lookup
  const rankMap = {};
  if (constraintResults) {
    constraintResults.forEach((r) => {
      rankMap[r.name] = r.rank;
    });
  }

  products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td>${formatCurrency(p.price)}</td>
      <td>${formatCurrency(p.vcPerUnit)}</td>
      <td style="color:${p.cmPerUnit >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(p.cmPerUnit)}</td>
      <td>${formatPct(p.cmRatio)}</td>
      <td>${(p.mix * 100).toFixed(1)}%</td>
      <td>${p.beUnitsA === Infinity ? "N/A" : Math.ceil(p.beUnitsA).toLocaleString()}</td>
      <td>${p.beUnitsB === Infinity ? "N/A" : Math.ceil(p.beUnitsB).toLocaleString()}</td>
      ${constraintEnabled ? `<td>${p.cmPerResource !== null ? formatCurrency(p.cmPerResource) : "—"}</td>` : ""}
      ${constraintEnabled ? `<td>${rankMap[p.name] || "—"}</td>` : ""}
    `;
    tbody.appendChild(tr);
  });

  // Capacity flags
  const flagsEl = document.getElementById("mp-capacity-flags");
  flagsEl.innerHTML = "";
  products.forEach((p) => {
    if (p.maxUnits && p.beUnitsB !== Infinity && p.beUnitsB > p.maxUnits) {
      const flag = document.createElement("div");
      flag.className = "cm-flag negative";
      flag.textContent = `⚠️ ${p.name}: Breakeven allocation (${Math.ceil(p.beUnitsB).toLocaleString()} units) exceeds capacity (${p.maxUnits.toLocaleString()} units).`;
      flagsEl.appendChild(flag);
    }
  });

  // Constraint results table
  const constraintResultsEl = document.getElementById("mp-constraint-results");
  if (constraintResults && constraintResults.length > 0) {
    document.getElementById("mp-resource-header").textContent =
      `CM / ${resourceName}`;
    const ctbody = document.getElementById("mp-constraint-tbody");
    const ctfoot = document.getElementById("mp-constraint-tfoot");
    ctbody.innerHTML = "";
    ctfoot.innerHTML = "";

    constraintResults.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.rank}</td>
        <td><strong>${r.name}</strong></td>
        <td style="color:var(--accent)">${formatCurrency(r.cmPerUnit)}</td>
        <td style="color:var(--accent)">${formatCurrency(r.cmPerResource)}</td>
        <td>${r.resourceUnits}</td>
        <td>${r.maxUnits ? r.maxUnits.toLocaleString() : "Unlimited"}</td>
        <td style="color:var(--accent)">${r.unitsToProduce.toLocaleString()}</td>
        <td style="color:var(--accent)">${formatCurrency(r.totalCM)}</td>
      `;
      ctbody.appendChild(tr);
    });

    const tftr = document.createElement("tr");
    tftr.innerHTML = `
      <td colspan="7" style="font-weight:700; color:var(--text-primary);">Maximum Achievable CM</td>
      <td style="font-weight:700; color:var(--accent)">${formatCurrency(constraintResults.totalAchievableCM)}</td>
    `;
    ctfoot.appendChild(tftr);

    constraintResultsEl.classList.remove("hidden");
  } else {
    constraintResultsEl.classList.add("hidden");
  }

  // Show results
  document.getElementById("mp-results").classList.remove("hidden");
  document.getElementById("mp-chart-section").classList.remove("hidden");

  // Chart
  showChartLoading("mp-chart-canvas");
  requestAnimationFrame(() => {
    drawMultiProductChart(products, beBundleUnits);
    hideChartLoading("mp-chart-canvas");
  });


  // Render step-by-step calculations
  renderMultiStepByStep(
    products, totalFC, weightedCM, weightedCMRatio,
    beBundleUnits, beRevenue, constraintResults, resourceName
  );

  document.getElementById("mp-results").scrollIntoView({ behavior: "smooth" });
}

// ===================================================================
// ===================================================================
// MULTI-PRODUCT STEP-BY-STEP
// ===================================================================

function buildMultiStepByStep(products, totalFC, weightedCM, weightedCMRatio,
  beBundleUnits, beRevenue, constraintResults, resourceName) {

  const f = formatCurrency;
  const pct = formatPct;

  function step(formula, lines, result, isNegative = false) {
    const lineHTML = Array.isArray(lines)
      ? lines.map(l => `<div class="cm-step-substituted">${l}</div>`).join('')
      : `<div class="cm-step-substituted">= ${lines}</div>`;
    return `<div class="cm-step">
      <div class="cm-step-formula">${formula}</div>
      ${lineHTML}
      <div class="cm-step-result ${isNegative ? 'negative' : ''}">= ${result}</div>
    </div>`;
  }

  function indent(text) {
    return `<div class="cm-step-indent">${text}</div>`;
  }

  function section(title,...items) {
    return `<div class="cm-step-section">
      <div class="cm-step-section-title">${title}</div>
      ${items.join('')}
    </div>`;
  }

  const sections = [];

  // Section 1 — Per-Product Setup
  const productSetup = products.map(p => `
    <div class="cm-step" style="margin-bottom:1rem;">
      <div class="cm-step-formula" style="color:var(--accent); font-size:0.85rem;">${p.name}</div>
      ${indent(`Price per Unit: ${f(p.price)}`)}
      ${indent(`Variable Costs per Unit: ${f(p.vcPerUnit)}`)}
      ${indent(`CM per Unit = ${f(p.price)} − ${f(p.vcPerUnit)} = <strong style="color:var(--accent)">${f(p.cmPerUnit)}</strong>`)}
      ${indent(`CM Ratio = ${f(p.cmPerUnit)} ÷ ${f(p.price)} = <strong style="color:var(--accent)">${pct(p.cmRatio)}</strong>`)}
      ${indent(`Sales Mix: ${(p.mix * 100).toFixed(1)}%`)}
      ${p.maxUnits ? indent(`Capacity Ceiling: ${p.maxUnits.toLocaleString()} units`) : ''}
    </div>
  `).join('');

  sections.push(section('1. Per-Product Setup', productSetup));

  // Section 2 — Weighted Average CM
  const wcmLines = [
    `= ${products.map(p => `(${f(p.cmPerUnit)} × ${(p.mix * 100).toFixed(0)}%)`).join(' + ')}`,
    `= ${products.map(p => f(p.cmPerUnit * p.mix)).join(' + ')}`,
  ];
  const wcmRatioLines = [
    `= ${products.map(p => `(${pct(p.cmRatio)} × ${(p.mix * 100).toFixed(0)}%)`).join(' + ')}`,
    `= ${products.map(p => pct(p.cmRatio * p.mix)).join(' + ')}`,
  ];

  sections.push(section('2. Weighted Average Contribution Margin',
    step('Weighted CM per Unit = Σ (CM per Unit × Sales Mix)', wcmLines, f(weightedCM), weightedCM < 0),
    step('Weighted CM Ratio = Σ (CM Ratio × Sales Mix)', wcmRatioLines, pct(weightedCMRatio), weightedCMRatio < 0)
  ));

  // Section 3 — Fixed Costs
  sections.push(section('3. Fixed Costs',
    `<div class="cm-step">
      <div class="cm-step-formula">Total Fixed Costs (shared across all products)</div>
      <div class="cm-step-result">= ${f(totalFC)}</div>
    </div>`
  ));

  // Section 4 — Bundle Breakeven
  if (weightedCM > 0) {
    sections.push(section('4. Bundle Breakeven',
      step('Breakeven Bundle Units = Fixed Costs ÷ Weighted CM per Unit',
        `${f(totalFC)} ÷ ${f(weightedCM)}`,
        `${Math.ceil(beBundleUnits).toLocaleString()} units`),
      step('Breakeven Revenue = Fixed Costs ÷ Weighted CM Ratio',
        `${f(totalFC)} ÷ ${pct(weightedCMRatio)}`,
        f(beRevenue))
    ));

    // Section 5 — Per-Product Breakeven
    const optionALines = products.map(p =>
      indent(`${p.name}: (${f(totalFC)} × ${(p.mix * 100).toFixed(0)}%) ÷ ${f(p.cmPerUnit)} = <strong style="color:var(--accent)">${p.cmPerUnit > 0 ? Math.ceil(p.beUnitsA).toLocaleString() : 'N/A'} units</strong>`)
    ).join('');

    const optionBLines = products.map(p =>
      indent(`${p.name}: ${Math.ceil(beBundleUnits).toLocaleString()} × ${(p.mix * 100).toFixed(0)}% = <strong style="color:var(--accent)">${Math.ceil(p.beUnitsB).toLocaleString()} units</strong>`)
    ).join('');

    sections.push(section('5. Per-Product Breakeven',
      `<div class="cm-step">
        <div class="cm-step-formula">Option A — Each product covers its proportional share of fixed costs</div>
        <div class="cm-step-substituted">Formula: (Fixed Costs × Sales Mix) ÷ CM per Unit</div>
        ${optionALines}
      </div>`,
      `<div class="cm-step" style="margin-top:0.75rem;">
        <div class="cm-step-formula">Option B — Allocate bundle breakeven units by sales mix</div>
        <div class="cm-step-substituted">Formula: Bundle BE Units × Sales Mix</div>
        ${optionBLines}
      </div>`
    ));
  } else {
    sections.push(section('4. Bundle Breakeven',
      `<div class="cm-step"><div class="cm-step-result negative">⚠️ Weighted CM is zero or negative — breakeven cannot be calculated.</div></div>`
    ));
  }

  // Section 6 — Constraint Ranking (optional)
  if (constraintResults && constraintResults.length > 0) {
    const rankingSteps = constraintResults.map((r, i) => {
      const prevUsed = constraintResults.slice(0, i).reduce((sum, prev) => sum + prev.unitsToProduce * prev.resourceUnits, 0);
      const remaining = constraintResults[0] ? (constraintResults.reduce((_, __, idx) => idx === 0 ? 0 : 0, 0)) : 0;
      return `<div class="cm-step" style="margin-bottom:0.75rem;">
        <div class="cm-step-formula" style="color:var(--accent);">Rank ${r.rank}: ${r.name}</div>
        ${indent(`CM per ${resourceName}: ${f(r.cmPerUnit)} ÷ ${r.resourceUnits} = <strong style="color:var(--accent)">${f(r.cmPerResource)}</strong>`)}
        ${indent(`Units to Produce: min(available ÷ ${r.resourceUnits}, ${r.maxUnits ? r.maxUnits.toLocaleString() : 'unlimited'}) = <strong style="color:var(--accent)">${r.unitsToProduce.toLocaleString()} units</strong>`)}
        ${indent(`CM Generated: ${r.unitsToProduce.toLocaleString()} × ${f(r.cmPerUnit)} = <strong style="color:var(--accent)">${f(r.totalCM)}</strong>`)}
        ${indent(`Resource Used: ${r.unitsToProduce.toLocaleString()} × ${r.resourceUnits} = ${(r.unitsToProduce * r.resourceUnits).toLocaleString()} ${resourceName}`)}
      </div>`;
    }).join('');

    sections.push(section(`6. Constraint Ranking (${resourceName})`,
      `<div class="cm-step">
        <div class="cm-step-formula">Ranking Rule: Prioritize products with highest CM per unit of ${resourceName}</div>
        <div class="cm-step-substituted">Formula: CM per Unit ÷ ${resourceName} Required per Unit</div>
      </div>`,
      rankingSteps,
      `<div class="cm-step">
        <div class="cm-step-formula">Maximum Achievable CM</div>
        <div class="cm-step-result">= ${f(constraintResults.totalAchievableCM)}</div>
      </div>`
    ));
  }

  return sections.join('');
}

function renderMultiStepByStep(products, totalFC, weightedCM, weightedCMRatio,
  beBundleUnits, beRevenue, constraintResults, resourceName) {
  const container = document.getElementById('mp-steps-content');
  const section = document.getElementById('mp-steps-section');
  const toggle = document.getElementById('mp-steps-toggle');
  const body = document.getElementById('mp-steps-body');

  container.innerHTML = buildMultiStepByStep(products, totalFC, weightedCM,
    weightedCMRatio, beBundleUnits, beRevenue, constraintResults, resourceName);
  section.classList.remove('hidden');
  toggle.setAttribute('aria-expanded', 'true');
  body.classList.remove('hidden');
}

// MULTI-PRODUCT CHART
// ===================================================================

function drawMultiProductChart(products, beBundleUnits) {
  const canvas = document.getElementById("mp-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawMultiProductChart(products, beBundleUnits));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 30, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const colors = [
    "#2dd4bf",
    "#60a5fa",
    "#f59e0b",
    "#a855f7",
    "#f472b6",
    "#4ade80",
  ];
  const bundleUnits =
    beBundleUnits === Infinity ? 1000 : Math.ceil(beBundleUnits) * 1.5;

  const maxCM =
    products.reduce((sum, p) => sum + p.cmPerUnit * p.mix * bundleUnits, 0) *
    1.2;
  const barWidth = chartWidth / (products.length * 2);

  function toY(val) {
    return padding.top + chartHeight - (Math.max(0, val) / maxCM) * chartHeight;
  }

  chart.clear();

  // Grid
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxCM / ySteps) * i;
    const y = toY(val);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(val), padding.left - 8, y + 4);
  }

  products.forEach((p, i) => {
    const totalProductCM = p.cmPerUnit * p.mix * bundleUnits;
    const x =
      padding.left + i * (chartWidth / products.length) + barWidth * 0.5;
    const w = barWidth;
    const barY = toY(totalProductCM);
    const barH = chartHeight - (barY - padding.top);
    const color = colors[i % colors.length];

    ctx.fillStyle = color + "cc";
    ctx.beginPath();
    ctx.roundRect(x, barY, w, barH, [4, 4, 0, 0]);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = window.CHART_FONTS.boldSm;
    ctx.textAlign = "center";
    ctx.fillText(formatCurrency(totalProductCM), x + w / 2, barY - 6);

    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.fillText(p.name, x + w / 2, chart.height - padding.bottom + 16);
    ctx.fillText(
      `${(p.mix * 100).toFixed(0)}% mix`,
      x + w / 2,
      chart.height - padding.bottom + 30,
    );
  });

  // Title
  ctx.fillStyle = "#e2e8f0";
  ctx.font = window.CHART_FONTS.boldMd;
  ctx.textAlign = "left";
  ctx.fillText(
    "Total CM Contribution by Product (at breakeven bundle volume)",
    padding.left,
    padding.top - 12,
  );
}

// ===================================================================
// SENSITIVITY TAB
// ===================================================================

function updateSensitivity() {
  if (!spBaseData) return;

  const priceAdj =
    safeParseFloat(document.getElementById("sens-price").value, 0) / 100;
  const volumeAdj =
    safeParseFloat(document.getElementById("sens-volume").value, 0) / 100;
  const vcAdj =
    safeParseFloat(document.getElementById("sens-vc").value, 0) / 100;
  const fcAdj =
    safeParseFloat(document.getElementById("sens-fc").value, 0) / 100;

  const adjPrice = spBaseData.price * (1 + priceAdj);
  const adjUnits = Math.round(spBaseData.units * (1 + volumeAdj));
  const adjVC = spBaseData.vcPerUnit * (1 + vcAdj);
  const adjFC = spBaseData.totalFC * (1 + fcAdj);

  const adjCMPerUnit = adjPrice - adjVC;
  const adjRevenue = adjPrice * adjUnits;
  const adjCM = adjCMPerUnit * adjUnits;
  const adjCMRatio = adjRevenue > 0 ? adjCM / adjRevenue : 0;
  const adjOpIncome = adjCM - adjFC;
  const adjBEUnits = adjCMPerUnit > 0 ? adjFC / adjCMPerUnit : Infinity;
  const adjBERevenue = adjCMRatio > 0 ? adjFC / adjCMRatio : Infinity;
  const adjMoS = adjRevenue > 0 ? (adjRevenue - adjBERevenue) / adjRevenue : 0;

  document.getElementById("sens-cm-unit").textContent =
    formatCurrency(adjCMPerUnit);
  document.getElementById("sens-cm-ratio").textContent = formatPct(adjCMRatio);
  const opEl = document.getElementById("sens-operating-income");
  opEl.textContent = formatCurrency(adjOpIncome);
  opEl.className = `result-value ${adjOpIncome >= 0 ? "positive" : "negative"}`;
  document.getElementById("sens-be-units").textContent =
    adjBEUnits === Infinity ? "N/A" : Math.ceil(adjBEUnits).toLocaleString();
  document.getElementById("sens-be-revenue").textContent =
    adjBERevenue === Infinity ? "N/A" : formatCurrency(adjBERevenue);
  document.getElementById("sens-mos").textContent = formatPct(adjMoS);

  document.getElementById("sensitivity-results").classList.remove("hidden");
  document
    .getElementById("sensitivity-chart-section")
    .classList.remove("hidden");
  document
    .getElementById("sensitivity-matrix-section")
    .classList.remove("hidden");

  requestAnimationFrame(() => {
    drawSensitivityChart(adjPrice, adjVC, adjFC, spBaseData.capacity);
    drawSensitivityMatrix(adjPrice, adjVC, adjFC);
  });
}

// Slider event listeners
["sens-price", "sens-volume", "sens-vc", "sens-fc"].forEach((id) => {
  const slider = document.getElementById(id);
  const label = document.getElementById(`${id}-label`);
  slider.addEventListener(
    "input",
    rafThrottle(() => {
      const val = safeParseFloat(slider.value, 0);
      label.textContent = `${val >= 0 ? "+" : ""}${val}%`;
      updateSensitivity();
    }),
  );
});

document.getElementById("sens-reset").addEventListener("click", () => {
  ["sens-price", "sens-volume", "sens-vc", "sens-fc"].forEach((id) => {
    document.getElementById(id).value = 0;
    document.getElementById(`${id}-label`).textContent = "0%";
  });
  updateSensitivity();
});

// ===================================================================
// SENSITIVITY CHART
// ===================================================================

function drawSensitivityChart(adjPrice, adjVC, adjFC, capacity) {
  const canvas = document.getElementById("sens-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const adjCMPerUnit = adjPrice - adjVC;
  const beUnits = adjCMPerUnit > 0 ? adjFC / adjCMPerUnit : null;
  const maxUnits = Math.max(
    spBaseData.units * 2,
    beUnits ? beUnits * 1.5 : spBaseData.units * 2,
    capacity ? capacity * 1.1 : 0,
  );

  const steps = 100;
  const data = [];
  for (let i = 0; i <= steps; i++) {
    const u = (maxUnits / steps) * i;
    const opIncome = adjCMPerUnit * u - adjFC;
    data.push({ units: u, opIncome });
  }

  const values = data.map((d) => d.opIncome);
  const minVal = Math.min(...values) * 1.1;
  const maxVal = Math.max(...values) * 1.1;
  const range = maxVal - minVal || 1;

  function toX(u) {
    return padding.left + (u / maxUnits) * chartWidth;
  }

  function toY(val) {
    return padding.top + chartHeight - ((val - minVal) / range) * chartHeight;
  }

  chart.clear();

  // Grid
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) {
    const val = minVal + (range / ySteps) * i;
    const y = toY(val);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(val), padding.left - 8, y + 4);
  }

  // X-axis labels
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i++) {
    const u = (maxUnits / 6) * i;
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.xs;
    ctx.fillText(
      Math.round(u).toLocaleString(),
      toX(u),
      chart.height - padding.bottom + 16,
    );
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = window.CHART_FONTS.md;
  ctx.fillText("Units", chart.width / 2, chart.height - 5);

  // Zero line
  if (minVal < 0 && maxVal > 0) {
    const zeroY = toY(0);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(chart.width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Operating income line
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = toX(d.units);
    const y = toY(d.opIncome);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Breakeven marker
  if (beUnits && beUnits <= maxUnits) {
    const bx = toX(beUnits);
    const by = toY(0);
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawLabelWithBackground(ctx, `BE: ${Math.ceil(beUnits).toLocaleString()}`, bx, by - 10,
      { color: "#f59e0b", font: window.CHART_FONTS.boldSm, align: "center" });
  }
}

// ===================================================================
// SENSITIVITY MATRIX
// ===================================================================

function drawSensitivityMatrix(adjPrice, adjVC, adjFC) {
  const priceSteps = [-20, -10, 0, 10, 20];
  const volumeSteps = [-30, -15, 0, 15, 30];

  const header = document.getElementById("sens-matrix-header");
  const body = document.getElementById("sens-matrix-body");

  header.innerHTML = `<tr><th>Price \\ Volume</th>${volumeSteps.map((v) => `<th>${v >= 0 ? "+" : ""}${v}%</th>`).join("")}</tr>`;
  body.innerHTML = "";

  const adjCMPerUnit = adjPrice - adjVC;
  const adjUnits = spBaseData.units;

  priceSteps.forEach((ps) => {
    const tr = document.createElement("tr");
    const pAdj = adjPrice * (1 + ps / 100);
    const cmAdj = pAdj - adjVC;

    let cells = `<td style="font-weight:600;">${ps >= 0 ? "+" : ""}${ps}%</td>`;
    volumeSteps.forEach((vs) => {
      const uAdj = Math.round(adjUnits * (1 + vs / 100));
      const opIncome = cmAdj * uAdj - adjFC;
      const isCurrent = ps === 0 && vs === 0;
      cells += `<td class="${isCurrent ? "sens-matrix-current" : opIncome >= 0 ? "sens-matrix-positive" : "sens-matrix-negative"}">${formatCurrency(opIncome)}</td>`;
    });

    tr.innerHTML = cells;
    body.appendChild(tr);
  });
}


// ===================================================================
// OPERATING LEVERAGE TAB


function computeBreakevenUnits(price, vcPerUnit, fixedCost) {
  const cmPerUnit = price - vcPerUnit;
  if (cmPerUnit <= 0) return null;
  return fixedCost / cmPerUnit;
}

function formatMaybeUnits(x) {
  if (x === null || !Number.isFinite(x)) return "N/A";
  return Math.ceil(x).toLocaleString();
}

function formatMaybeRatio(x) {
  if (x === null || !Number.isFinite(x)) return "N/A";
  return x.toFixed(2);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setValueIfEmpty(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.value === "" || el.value === null || el.value === undefined) el.value = str(val);
}

function syncOLClassMode(fromSource) {
  if (!spBaseData) return;

  const lock = document.getElementById("ol-lock-multipliers")?.checked ?? true;

  const basePrice = spBaseData.price;
  const baseVC = spBaseData.vcPerUnit;
  const baseFC = spBaseData.totalFC;

  setText("ol-base-price", formatCurrency(basePrice));
  setText("ol-base-vc", formatCurrency(baseVC));
  setText("ol-base-fc", formatCurrency(baseFC));

  const mult = getOLMultipliers();

  const aFcInput = document.getElementById("ol-a-fc");
  const aVcInput = document.getElementById("ol-a-vc");
  const bFcInput = document.getElementById("ol-b-fc");
  const bVcInput = document.getElementById("ol-b-vc");

  if (!aFcInput || !aVcInput || !bFcInput || !bVcInput) return;

  if (lock) {
    const aFC = baseFC * mult.lowFC;
    const aVC = baseVC * mult.lowVC;
    const bFC = baseFC * mult.highFC;
    const bVC = baseVC * mult.highVC;

    aFcInput.value = String(aFC);
    aVcInput.value = String(aVC);
    bFcInput.value = String(bFC);
    bVcInput.value = String(bVC);
  } else {
    const aFC = safeParseFloat(aFcInput.value, baseFC * mult.lowFC);
    const aVC = safeParseFloat(aVcInput.value, baseVC * mult.lowVC);
    const bFC = safeParseFloat(bFcInput.value, baseFC * mult.highFC);
    const bVC = safeParseFloat(bVcInput.value, baseVC * mult.highVC);

    // Update multipliers inputs to match class-mode edits
    const lowFcEl = document.getElementById("ol-low-fc-mult");
    const lowVcEl = document.getElementById("ol-low-vc-mult");
    const highFcEl = document.getElementById("ol-high-fc-mult");
    const highVcEl = document.getElementById("ol-high-vc-mult");

    if (lowFcEl) lowFcEl.value = String(baseFC > 0 ? aFC / baseFC : 0);
    if (lowVcEl) lowVcEl.value = String(baseVC > 0 ? aVC / baseVC : 0);
    if (highFcEl) highFcEl.value = String(baseFC > 0 ? bFC / baseFC : 0);
    if (highVcEl) highVcEl.value = String(baseVC > 0 ? bVC / baseVC : 0);
  }

  // Display implied multipliers + breakeven units
  const aFC = safeParseFloat(aFcInput.value, baseFC * mult.lowFC);
  const aVC = safeParseFloat(aVcInput.value, baseVC * mult.lowVC);
  const bFC = safeParseFloat(bFcInput.value, baseFC * mult.highFC);
  const bVC = safeParseFloat(bVcInput.value, baseVC * mult.highVC);

  setText("ol-a-fc-mult", formatMaybeRatio(baseFC > 0 ? aFC / baseFC : null));
  setText("ol-a-vc-mult", formatMaybeRatio(baseVC > 0 ? aVC / baseVC : null));
  setText("ol-b-fc-mult", formatMaybeRatio(baseFC > 0 ? bFC / baseFC : null));
  setText("ol-b-vc-mult", formatMaybeRatio(baseVC > 0 ? bVC / baseVC : null));

  setText("ol-a-be", formatMaybeUnits(computeBreakevenUnits(basePrice, aVC, aFC)));
  setText("ol-b-be", formatMaybeUnits(computeBreakevenUnits(basePrice, bVC, bFC)));
}

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

function getOLMultipliers() {
  return {
    lowFC: safeParseFloat(document.getElementById("ol-low-fc-mult")?.value, 0.6),
    highFC: safeParseFloat(document.getElementById("ol-high-fc-mult")?.value, 1.4),
    lowVC: safeParseFloat(document.getElementById("ol-low-vc-mult")?.value, 1.15),
    highVC: safeParseFloat(document.getElementById("ol-high-vc-mult")?.value, 0.9),
  };
}

function updateOperatingLeverage() {
  if (!spBaseData) return;

  syncOLClassMode();

  const price = spBaseData.price;
  const units = spBaseData.units;
  const baseVC = spBaseData.vcPerUnit;
  const baseFC = spBaseData.totalFC;

  const baseRevenue = price * units;
  const baseCM = (price - baseVC) * units;
  const baseOI = baseCM - baseFC;

  const aName = document.getElementById("ol-scn-a-name")?.value || "Scenario A";
  const bName = document.getElementById("ol-scn-b-name")?.value || "Scenario B";

  const aFC = safeParseFloat(document.getElementById("ol-a-fc")?.value, baseFC);
  const aVC = safeParseFloat(document.getElementById("ol-a-vc")?.value, baseVC);
  const bFC = safeParseFloat(document.getElementById("ol-b-fc")?.value, baseFC);
  const bVC = safeParseFloat(document.getElementById("ol-b-vc")?.value, baseVC);

  const aCM = (price - aVC) * units;
  const aOI = aCM - aFC;

  const bCM = (price - bVC) * units;
  const bOI = bCM - bFC;

  document.getElementById("ol-dol-base").textContent = formatDOL(computeDOL(baseCM, baseOI));
  document.getElementById("ol-dol-low").textContent = formatDOL(computeDOL(aCM, aOI));
  document.getElementById("ol-dol-high").textContent = formatDOL(computeDOL(bCM, bOI));

  document.getElementById("ol-results").classList.remove("hidden");
  document.getElementById("ol-chart-section").classList.remove("hidden");

  requestAnimationFrame(() => {
    drawOperatingLeverageChart(price, baseVC, baseFC, spBaseData.capacity);
  });
}

function drawOperatingLeverageChart(price, baseVC, baseFC, capacity) {
  const canvas = document.getElementById("ol-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const baseUnits = spBaseData?.units || 1000;
  const maxUnits = Math.max(baseUnits * 2, capacity ? capacity * 1.1 : 0);
  const steps = 140;

  const aName = document.getElementById("ol-scn-a-name")?.value || "Scenario A";
  const bName = document.getElementById("ol-scn-b-name")?.value || "Scenario B";

  const aFC = safeParseFloat(document.getElementById("ol-a-fc")?.value, baseFC);
  const aVC = safeParseFloat(document.getElementById("ol-a-vc")?.value, baseVC);
  const bFC = safeParseFloat(document.getElementById("ol-b-fc")?.value, baseFC);
  const bVC = safeParseFloat(document.getElementById("ol-b-vc")?.value, baseVC);

  const series = [
    { key: "a", name: aName, color: "#60a5fa", vc: aVC, fc: aFC },
    { key: "b", name: bName, color: "#f59e0b", vc: bVC, fc: bFC },
  ];

  const seriesData = series.map((s) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const u = (maxUnits / steps) * i;
      const oi = (price - s.vc) * u - s.fc;
      pts.push({ u, oi });
    }
    return {...s, pts };
  });

  const allVals = [];
  seriesData.forEach((sd) => sd.pts.forEach((p) => allVals.push(p.oi)));
  const minVal = Math.min(...allVals) * 1.1;
  const maxVal = Math.max(...allVals) * 1.1;
  const range = maxVal - minVal || 1;

  function toX(u) {
    return padding.left + (u / maxUnits) * chartWidth;
  }
  function toY(v) {
    return padding.top + chartHeight - ((v - minVal) / range) * chartHeight;
  }

  function drawStatic(offCtx) {
    offCtx.clearRect(0, 0, chart.width, chart.height);

    // Grid
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

    // X-axis labels
    offCtx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const u = (maxUnits / 6) * i;
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.xs;
      offCtx.fillText(
        Math.round(u).toLocaleString(),
        toX(u),
        chart.height - padding.bottom + 16,
      );
    }
    offCtx.fillStyle = "#94a3b8";
    offCtx.font = window.CHART_FONTS.md;
    offCtx.fillText("Units", chart.width / 2, chart.height - 5);

    // Zero line
    if (minVal < 0 && maxVal > 0) {
      const zeroY = toY(0);
      offCtx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      offCtx.lineWidth = 1;
      offCtx.setLineDash([4, 4]);
      offCtx.beginPath();
      offCtx.moveTo(padding.left, zeroY);
      offCtx.lineTo(chart.width - padding.right, zeroY);
      offCtx.stroke();
      offCtx.setLineDash([]);
    }

    // Series lines
    seriesData.forEach((sd) => {
      offCtx.strokeStyle = sd.color;
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      sd.pts.forEach((pt, i) => {
        const x = toX(pt.u);
        const y = toY(pt.oi);
        if (i === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      });
      offCtx.stroke();

      drawLabelWithBackground(
        offCtx,
        sd.name,
        chart.width - padding.right - 8,
        toY(sd.pts[sd.pts.length - 1].oi) - 8,
        { color: sd.color, font: window.CHART_FONTS.xs, align: "right" },
      );
    });

    // Capacity line
    if (capacity && capacity <= maxUnits) {
      const cx = toX(capacity);
      offCtx.strokeStyle = "rgba(168, 85, 247, 0.6)";
      offCtx.lineWidth = 1.5;
      offCtx.setLineDash([4, 4]);
      offCtx.beginPath();
      offCtx.moveTo(cx, padding.top);
      offCtx.lineTo(cx, padding.top + chartHeight);
      offCtx.stroke();
      offCtx.setLineDash([]);
      drawLabelWithBackground(
        offCtx,
        `Capacity: ${capacity.toLocaleString()}`,
        cx,
        padding.top + 12,
        { color: "#a855f7", font: window.CHART_FONTS.xs, align: "center" },
      );
    }

    // Title
    offCtx.fillStyle = "#e2e8f0";
    offCtx.font = window.CHART_FONTS.boldMd;
    offCtx.textAlign = "left";
    offCtx.fillText("Operating Income vs Volume (Cost Structure)", padding.left, padding.top - 10);
  }

  function ensureCache() {
    const key = JSON.stringify({
      w: chart.width,
      h: chart.height,
      price,
      capacity,
      aName,
      bName,
      aFC,
      aVC,
      bFC,
      bVC,
    });

    if (canvas._olCacheKey === key && canvas._olStaticCanvas) return;

    const off = document.createElement("canvas");
    off.width = chart.width;
    off.height = chart.height;
    const offCtx = off.getContext("2d");
    drawStatic(offCtx);

    canvas._olCacheKey = key;
    canvas._olStaticCanvas = off;
  }

  function blitStatic() {
    ensureCache();
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(canvas._olStaticCanvas, 0, 0);
  }

  function drawOverlay(hoverUnits) {
    blitStatic();
    if (hoverUnits === null || hoverUnits < 0 || hoverUnits > maxUnits) return;

    const hx = toX(hoverUnits);

    // Crosshair
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const lines = [
      { text: `Units: ${Math.round(hoverUnits).toLocaleString()}`, color: "#e2e8f0", bold: true },
    ];

    seriesData.forEach((sd) => {
      const oi = (price - sd.vc) * hoverUnits - sd.fc;
      const y = toY(oi);

      ctx.beginPath();
      ctx.arc(hx, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = sd.color;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      lines.push({ text: `${sd.name}: ${formatCurrency(oi)}`, color: sd.color });
    });

    // Tooltip box
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

  if (canvas._olController) canvas._olController.abort();
  canvas._olController = new AbortController();
  const { signal } = canvas._olController;

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = chart.width / r.width;
      const hoverUnits =
        (((e.clientX - r.left) * scaleX - padding.left) / chartWidth) * maxUnits;

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

function initOperatingLeverageTab() {
  const btn = document.getElementById("ol-recalc");
  if (btn) btn.addEventListener("click", () => updateOperatingLeverage());

  // Multipliers (always exist)
  ["ol-low-fc-mult", "ol-high-fc-mult", "ol-low-vc-mult", "ol-high-vc-mult"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(
      "input",
      rafThrottle(() => updateOperatingLeverage()),
    );
  });

  // Class mode fields
  ["ol-a-fc", "ol-a-vc", "ol-b-fc", "ol-b-vc", "ol-scn-a-name", "ol-scn-b-name"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(
      "input",
      rafThrottle(() => updateOperatingLeverage()),
    );
  });

  const lock = document.getElementById("ol-lock-multipliers");
  if (lock) {
    lock.addEventListener("change", () => updateOperatingLeverage());
  }
}

initOperatingLeverageTab();

// ===================================================================
// RESIZE HANDLER
// ===================================================================

let cmResizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(cmResizeTimeout);
  cmResizeTimeout = setTimeout(() => {
    if (spBaseData) {
      const price = spBaseData.price;
      const vcPerUnit = spBaseData.vcPerUnit;
      const totalFC = spBaseData.totalFC;
      const capacity = spBaseData.capacity;
      const beUnits =
        vcPerUnit < price ? totalFC / (price - vcPerUnit) : Infinity;
      drawBreakevenChart(
        price,
        vcPerUnit,
        totalFC,
        beUnits,
        spBaseData.units,
        capacity,
      );
      updateSensitivity();
    }
  }, 250);
});
