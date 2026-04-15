import {
  safeParseFloat, safeParseInt, formatCurrency,
  drawBarChart, showChartLoading, hideChartLoading,
  validateInputs, showFieldError
} from "./chart-utils.js";

// ===== DOM ELEMENTS =====
const modeSingleBtn = document.getElementById("mode-single");
const modeCompareBtn = document.getElementById("mode-compare");
const singleMode = document.getElementById("single-mode");
const compareMode = document.getElementById("compare-mode");
const calculateBtn = document.getElementById("npv-calculate-btn");
const compareBtn = document.getElementById("npv-compare-btn");

const cashflowList = document.getElementById("cashflow-list");
const cashflowListA = document.getElementById("cashflow-list-a");
const cashflowListB = document.getElementById("cashflow-list-b");

const tableShowA = document.getElementById("table-show-a");
const tableShowB = document.getElementById("table-show-b");

let currentMode = "single";
let compareDataA = null;
let compareDataB = null;
let lastSingleBreakdown = null;
let lastSinglePeriodType = "years";

// ===== EVENT LISTENERS =====
modeSingleBtn.addEventListener("click", () => switchMode("single"));
modeCompareBtn.addEventListener("click", () => switchMode("compare"));
calculateBtn.addEventListener("click", handleSingleCalculate);
compareBtn.addEventListener("click", handleCompareCalculate);

document
  .getElementById("add-period-btn")
  .addEventListener("click", () => addCashflowRow(cashflowList));
document
  .getElementById("add-period-a-btn")
  .addEventListener("click", () => addCashflowRow(cashflowListA));
document
  .getElementById("add-period-b-btn")
  .addEventListener("click", () => addCashflowRow(cashflowListB));

document.getElementById("qf-add-btn").addEventListener("click", () => {
  quickFill("qf-amount", "qf-from", "qf-to", cashflowList);
});
document.getElementById("qf-a-add-btn").addEventListener("click", () => {
  quickFill("qf-a-amount", "qf-a-from", "qf-a-to", cashflowListA);
});
document.getElementById("qf-b-add-btn").addEventListener("click", () => {
  quickFill("qf-b-amount", "qf-b-from", "qf-b-to", cashflowListB);
});

tableShowA.addEventListener("click", () => {
  tableShowA.classList.add("active");
  tableShowB.classList.remove("active");
  if (compareDataA) displayTable(compareDataA.breakdown);
});
tableShowB.addEventListener("click", () => {
  tableShowB.classList.add("active");
  tableShowA.classList.remove("active");
  if (compareDataB) displayTable(compareDataB.breakdown);
});

// ===== MODE SWITCHING =====
function switchMode(mode) {
  currentMode = mode;
  modeSingleBtn.classList.toggle("active", mode === "single");
  modeCompareBtn.classList.toggle("active", mode === "compare");

  if (mode === "single") {
    singleMode.classList.remove("hidden");
    compareMode.classList.add("hidden");
  } else {
    singleMode.classList.add("hidden");
    compareMode.classList.remove("hidden");
  }

  document.getElementById("npv-results").classList.add("hidden");
  document.getElementById("npv-compare-results").classList.add("hidden");
  document.getElementById("npv-sensitivity-section").classList.add("hidden");
  document.getElementById("npv-chart-section").classList.add("hidden");
  document.getElementById("npv-table-section").classList.add("hidden");
}

// ===== FORMATTING =====

// ===== CASH FLOW ROW MANAGEMENT =====
function addCashflowRow(listElement, value = "") {
  const rowCount = listElement.children.length + 1;
  const row = document.createElement("div");
  row.className = "cashflow-row";

  const periodType = getPeriodTypeForList(listElement);

  row.innerHTML = `
    <span class="period-label">${periodType} ${rowCount}</span>
    <input type="number" placeholder="Cash flow ($)" step="any" value="${value}">
    <button class="cashflow-remove">✕</button>
  `;

  const removeBtn = row.querySelector(".cashflow-remove");
  removeBtn.addEventListener("click", () => {
    row.remove();
    renumberRows(listElement);
  });

  listElement.appendChild(row);
}

function renumberRows(listElement) {
  const periodType = getPeriodTypeForList(listElement);
  const rows = listElement.querySelectorAll(".cashflow-row");
  rows.forEach((row, index) => {
    row.querySelector(".period-label").textContent =
      `${periodType} ${index + 1}`;
  });
}

function getPeriodTypeForList(listElement) {
  let selectId;
  if (listElement.id === "cashflow-list") selectId = "npv-period-type";
  else if (listElement.id === "cashflow-list-a") selectId = "npv-a-period-type";
  else selectId = "npv-b-period-type";

  const select = document.getElementById(selectId);
  return select && select.value === "months" ? "Month" : "Year";
}

function getCashflows(listElement) {
  const rows = listElement.querySelectorAll(".cashflow-row input");
  return Array.from(rows).map((input) => safeParseFloat(input.value, 0));
}

// ===== QUICK FILL =====
function quickFill(amountId, fromId, toId, listElement) {
  const amount = safeParseFloat(document.getElementById(amountId).value);
  const from = safeParseInt(document.getElementById(fromId).value);
  const to = safeParseInt(document.getElementById(toId).value);

  if (!amount || !from || !to || from > to || from < 1) {
    showFieldError(amountId, "Please enter a valid amount and period range (From ≤ To).");
    return;
  }

  const currentRows = listElement.children.length;
  for (let i = currentRows; i < to; i++) {
    addCashflowRow(listElement, "");
  }

  const inputs = listElement.querySelectorAll(".cashflow-row input");
  for (let i = from - 1; i < to; i++) {
    inputs[i].value = amount;
  }

  document.getElementById(amountId).value = "";
  document.getElementById(fromId).value = "";
  document.getElementById(toId).value = "";
}

// ===== NPV CALCULATION =====
function calculateNPVFromAllFlows(allCashflows, rate) {
  // allCashflows[0] is time 0 (negative for investment), rest are future periods
  let npv = 0;
  for (let t = 0; t < allCashflows.length; t++) {
    npv += allCashflows[t] / Math.pow(1 + rate, t);
  }
  return npv;
}

function calculateNPV(initialInvestment, cashflows, ratePerPeriod) {
  let npv = -initialInvestment;
  cashflows.forEach((cf, index) => {
    npv += cf / Math.pow(1 + ratePerPeriod, index + 1);
  });
  return npv;
}

// ===== IRR CALCULATION (Find All IRRs) =====
function calculateIRR(initialInvestment, cashflows, compounding) {
  const allCashflows = [-initialInvestment, ...cashflows];

  // Count sign changes
  let signChanges = 0;
  for (let i = 1; i < allCashflows.length; i++) {
    if (allCashflows[i] !== 0 && allCashflows[i - 1] !== 0) {
      if (Math.sign(allCashflows[i]) !== Math.sign(allCashflows[i - 1])) {
        signChanges++;
      }
    }
  }

  // Scan using the periodic rate, then convert to annual at the end
  // Scan from -50% to 500% periodic rate in small steps
  const irrs = [];
  const step = 0.0001;
  let prevNPV = null;

  for (let r = -0.49; r <= 10.0; r += step) {
    if (Math.abs(r) < 0.00001) continue;

    const npv = calculateNPVFromAllFlows(allCashflows, r);

    if (
      prevNPV !== null &&
      !isNaN(npv) &&
      isFinite(npv) &&
      !isNaN(prevNPV) &&
      isFinite(prevNPV)
    ) {
      if ((prevNPV > 0 && npv < 0) || (prevNPV < 0 && npv > 0)) {
        const refined = refineIRR(allCashflows, r - step, r);
        if (refined !== null) {
          // Convert periodic rate to annual rate
          const annualRate = refined * compounding * 100;
          const isDuplicate = irrs.some(
            (existing) => Math.abs(existing.periodic - refined) < 0.0005,
          );
          if (!isDuplicate) {
            irrs.push({ periodic: refined, annual: annualRate });
          }
        }
      }
    }

    prevNPV = npv;
  }

  return { irrs: irrs, signChanges: signChanges };
}

function refineIRR(allCashflows, low, high) {
  let mid;

  for (let i = 0; i < 200; i++) {
    mid = (low + high) / 2;
    const npv = calculateNPVFromAllFlows(allCashflows, mid);

    if (Math.abs(npv) < 0.05) return mid;

    const npvLow = calculateNPVFromAllFlows(allCashflows, low);

    if ((npvLow > 0 && npv > 0) || (npvLow < 0 && npv < 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Check if we actually converged close to zero
  const finalNPV = calculateNPVFromAllFlows(allCashflows, mid);
  if (Math.abs(finalNPV) < 10) return mid;
  return null;
}

// ===== PAYBACK PERIOD =====
function calculatePayback(initialInvestment, cashflows, periodType) {
  let cumulative = -initialInvestment;

  for (let i = 0; i < cashflows.length; i++) {
    const prevCumulative = cumulative;
    cumulative += cashflows[i];
    if (cumulative >= 0 && prevCumulative < 0) {
      const fraction = Math.abs(prevCumulative) / cashflows[i];
      const period = i + fraction;
      const label = periodType === "months" ? "months" : "years";
      return `${period.toFixed(1)} ${label}`;
    }
  }

  return "Not reached";
}

// ===== BUILD BREAKDOWN =====
function buildBreakdown(initialInvestment, cashflows, ratePerPeriod) {
  const breakdown = [];
  let cumulativeNPV = -initialInvestment;

  breakdown.push({
    period: 0,
    cashflow: -initialInvestment,
    discountFactor: 1,
    discountedValue: -initialInvestment,
    cumulativeNPV: cumulativeNPV,
  });

  cashflows.forEach((cf, index) => {
    const discountFactor = 1 / Math.pow(1 + ratePerPeriod, index + 1);
    const discountedValue = cf * discountFactor;
    cumulativeNPV += discountedValue;

    breakdown.push({
      period: index + 1,
      cashflow: cf,
      discountFactor: discountFactor,
      discountedValue: discountedValue,
      cumulativeNPV: cumulativeNPV,
    });
  });

  return breakdown;
}

// ===== SENSITIVITY ANALYSIS =====
function buildSensitivity(
  initialInvestment,
  cashflows,
  compounding,
  baseRate,
  irrs,
) {
  const rates = new Set();

  // Range around the base rate
  const start = Math.max(0.5, baseRate - 4);
  const end = baseRate + 6;
  for (let r = start; r <= end; r += 0.5) {
    rates.add(parseFloat(r.toFixed(1)));
  }

  // Always include the base rate
  rates.add(baseRate);

  // Include rates around each IRR so the zero crossing is visible
  if (irrs && irrs.length > 0) {
    irrs.forEach((irr) => {
      const irrRate = irr.annual;
      for (let r = Math.max(0.5, irrRate - 3); r <= irrRate + 3; r += 0.5) {
        rates.add(parseFloat(r.toFixed(1)));
      }
    });
  }

  // Also include some wide range points
  [1, 2, 5, 10, 15, 20, 25, 30, 40, 50].forEach((r) => rates.add(r));

  const sortedRates = [...rates].sort((a, b) => a - b);

  // Limit to reasonable number of columns
  let finalRates = sortedRates;
  if (finalRates.length > 25) {
    // Keep base rate, IRR-adjacent rates, and sample the rest
    const important = new Set();
    important.add(baseRate);
    if (irrs)
      irrs.forEach((irr) => {
        const nearby = finalRates.filter((r) => Math.abs(r - irr.annual) < 3);
        nearby.forEach((r) => important.add(r));
      });

    const sampled = finalRates.filter(
      (r, i) => important.has(r) || i % 2 === 0,
    );
    finalRates = sampled;
  }

  return finalRates.map((r) => {
    const ratePerPeriod = r / 100 / compounding;
    const npv = calculateNPV(initialInvestment, cashflows, ratePerPeriod);
    return { rate: r, npv: npv, isBase: r === baseRate };
  });
}

// ===== SINGLE INVESTMENT HANDLER =====
function handleSingleCalculate() {
  const initialInvestment = safeParseFloat(
    document.getElementById("npv-initial").value
    );
  const annualRate = safeParseFloat(document.getElementById("npv-rate").value);
  const compounding = safeParseInt(
    document.getElementById("npv-compounding").value
    );
  const periodType = document.getElementById("npv-period-type").value;
  const cashflows = getCashflows(cashflowList);

  const valid = validateInputs([
    { id: "npv-initial", label: "Initial Investment", required: true, min: 1    },
    { id: "npv-rate",    label: "Discount Rate",       required: true, min: 0.01, max: 100 },
  ], ".calc-form");
  if (!valid) return;
  if (cashflows.length === 0) {
    showFieldError("npv-initial", "Please add at least one cash flow period.");
    return;
  }

  const ratePerPeriod = annualRate / 100 / compounding;
  const npv = calculateNPV(initialInvestment, cashflows, ratePerPeriod);
  const irr = calculateIRR(initialInvestment, cashflows, compounding);
  const breakdown = buildBreakdown(initialInvestment, cashflows, ratePerPeriod);
  const sensitivity = buildSensitivity(
    initialInvestment,
    cashflows,
    compounding,
    annualRate,
    irr.irrs,
  );

  // Totals
  const totalInflows = cashflows
    .filter((cf) => cf > 0)
    .reduce((sum, cf) => sum + cf, 0);
  const totalOutflows =
    initialInvestment +
    Math.abs(cashflows.filter((cf) => cf < 0).reduce((sum, cf) => sum + cf, 0));
  const pvInflows = npv + initialInvestment;
  const pi = pvInflows / initialInvestment;
  const payback = calculatePayback(initialInvestment, cashflows, periodType);

  // Display NPV
  const npvEl = document.getElementById("npv-result");
  npvEl.textContent = formatCurrency(npv);
  npvEl.className = `result-value ${npv >= 0 ? "verdict-accept" : "verdict-reject"}`;

  // Display IRR
  const irrEl = document.getElementById("irr-result");
  if (irr.irrs.length > 0) {
    const irrStrings = irr.irrs.map((r) => `${r.annual.toFixed(2)}%`);
    irrEl.textContent = irrStrings.join("  |  ");
    const primaryIRR = irr.irrs[0].annual;
    irrEl.className = `result-value ${primaryIRR > annualRate ? "verdict-accept" : "verdict-reject"}`;
  } else {
    irrEl.textContent = "N/A";
    irrEl.className = "result-value";
  }

  if (irr.signChanges > 1) {
    const warning =
      irr.irrs.length > 1
        ? ` ⚠️ ${irr.irrs.length} IRRs found (${irr.signChanges} sign changes)`
        : ` ⚠️ ${irr.signChanges} sign changes`;
    irrEl.textContent += warning;
  }

  // Verdict
  const verdictEl = document.getElementById("npv-verdict");
  if (npv >= 0) {
    verdictEl.textContent = "✅ Accept";
    verdictEl.className = "result-value verdict-accept";
  } else {
    verdictEl.textContent = "❌ Reject";
    verdictEl.className = "result-value verdict-reject";
  }

  document.getElementById("npv-inflows").textContent =
    formatCurrency(totalInflows);
  document.getElementById("npv-outflows").textContent =
    formatCurrency(totalOutflows);
  document.getElementById("npv-pi").textContent = pi.toFixed(3);
  document.getElementById("npv-payback").textContent = payback;

  // Display sections
  lastSingleBreakdown = breakdown;
  lastSinglePeriodType = periodType;

  displaySensitivity(sensitivity);
  showChartLoading("npv-bar-canvas");
  requestAnimationFrame(() => {
    displayChart(breakdown, periodType);
    hideChartLoading("npv-bar-canvas");
  });
  displayTable(breakdown);

  document.getElementById("npv-results").classList.remove("hidden");
  document.getElementById("npv-compare-results").classList.add("hidden");
  document.getElementById("npv-sensitivity-section").classList.remove("hidden");
  document.getElementById("npv-chart-section").classList.remove("hidden");
  document.getElementById("npv-table-section").classList.remove("hidden");
  document.getElementById("npv-table-toggles").classList.add("hidden");

  document.getElementById("npv-results").scrollIntoView({ behavior: "smooth" });
}

// ===== COMPARE HANDLER =====
function handleCompareCalculate() {
  const initialA = safeParseFloat(document.getElementById("npv-a-initial").value);
  const rateA = safeParseFloat(document.getElementById("npv-a-rate").value);
  const compA = safeParseInt(document.getElementById("npv-a-compounding").value);
  const periodA = document.getElementById("npv-a-period-type").value;
  const nameA = document.getElementById("npv-a-name").value || "Investment A";
  const cashflowsA = getCashflows(cashflowListA);

  const initialB = safeParseFloat(document.getElementById("npv-b-initial").value);
  const rateB = safeParseFloat(document.getElementById("npv-b-rate").value);
  const compB = safeParseInt(document.getElementById("npv-b-compounding").value);
  const periodB = document.getElementById("npv-b-period-type").value;
  const nameB = document.getElementById("npv-b-name").value || "Investment B";
  const cashflowsB = getCashflows(cashflowListB);

  const valid = validateInputs([
    { id: "npv-a-initial", label: "Investment A Initial", required: true, min: 1              },
    { id: "npv-a-rate",    label: "Investment A Rate",    required: true, min: 0.01, max: 100 },
    { id: "npv-b-initial", label: "Investment B Initial", required: true, min: 1              },
    { id: "npv-b-rate",    label: "Investment B Rate",    required: true, min: 0.01, max: 100 },
  ], ".calc-form");
  if (!valid) return;
  if (cashflowsA.length === 0) {
    showFieldError("npv-a-initial", "Please add cash flows for Investment A.");
    return;
  }
  if (cashflowsB.length === 0) {
    showFieldError("npv-b-initial", "Please add cash flows for Investment B.");
    return;
  }

  const ratePerPeriodA = rateA / 100 / compA;
  const ratePerPeriodB = rateB / 100 / compB;

  const npvA = calculateNPV(initialA, cashflowsA, ratePerPeriodA);
  const npvB = calculateNPV(initialB, cashflowsB, ratePerPeriodB);

  const irrA = calculateIRR(initialA, cashflowsA, compA);
  const irrB = calculateIRR(initialB, cashflowsB, compB);

  const pvInflowsA = npvA + initialA;
  const pvInflowsB = npvB + initialB;
  const piA = pvInflowsA / initialA;
  const piB = pvInflowsB / initialB;

  const paybackA = calculatePayback(initialA, cashflowsA, periodA);
  const paybackB = calculatePayback(initialB, cashflowsB, periodB);

  const breakdownA = buildBreakdown(initialA, cashflowsA, ratePerPeriodA);
  const breakdownB = buildBreakdown(initialB, cashflowsB, ratePerPeriodB);

  compareDataA = { breakdown: breakdownA, name: nameA };
  compareDataB = { breakdown: breakdownB, name: nameB };

  // Display results
  document.getElementById("npv-col-a-title").textContent = nameA;
  document.getElementById("npv-col-b-title").textContent = nameB;

  const npvAEl = document.getElementById("npv-a-result");
  npvAEl.textContent = formatCurrency(npvA);
  npvAEl.className = `result-value ${npvA >= 0 ? "verdict-accept" : "verdict-reject"}`;

  const npvBEl = document.getElementById("npv-b-result");
  npvBEl.textContent = formatCurrency(npvB);
  npvBEl.className = `result-value ${npvB >= 0 ? "verdict-accept" : "verdict-reject"}`;

  const irrAEl = document.getElementById("irr-a-result");
  if (irrA.irrs.length > 0) {
    const irrAStrings = irrA.irrs.map((r) => `${r.annual.toFixed(2)}%`);
    irrAEl.textContent = irrAStrings.join("  |  ");
    if (irrA.signChanges > 1) {
      irrAEl.textContent += ` ⚠️`;
      irrAEl.title = `${irrA.signChanges} sign changes. ${irrA.irrs.length} IRRs found.`;
    }
  } else {
    irrAEl.textContent = "N/A";
  }

  const irrBEl = document.getElementById("irr-b-result");
  if (irrB.irrs.length > 0) {
    const irrBStrings = irrB.irrs.map((r) => `${r.annual.toFixed(2)}%`);
    irrBEl.textContent = irrBStrings.join("  |  ");
    if (irrB.signChanges > 1) {
      irrBEl.textContent += ` ⚠️`;
      irrBEl.title = `${irrB.signChanges} sign changes. ${irrB.irrs.length} IRRs found.`;
    }
  } else {
    irrBEl.textContent = "N/A";
  }

  document.getElementById("npv-a-pi").textContent = piA.toFixed(3);
  document.getElementById("npv-b-pi").textContent = piB.toFixed(3);
  document.getElementById("npv-a-payback").textContent = paybackA;
  document.getElementById("npv-b-payback").textContent = paybackB;

  // Winner
  const colA = document.getElementById("npv-col-a");
  const colB = document.getElementById("npv-col-b");
  colA.classList.remove("winner", "loser", "highlight");
  colB.classList.remove("winner", "loser", "highlight");

  if (npvA >= npvB) {
    colA.classList.add("winner");
    colB.classList.add("loser");
    document.getElementById("npv-compare-winner").textContent = nameA;
  } else {
    colB.classList.add("winner");
    colA.classList.add("loser");
    document.getElementById("npv-compare-winner").textContent = nameB;
  }

  document.getElementById("npv-compare-advantage").textContent = formatCurrency(
    Math.abs(npvA - npvB),
  );

  // Sensitivity for both
  const sensitivityA = buildSensitivity(
    initialA,
    cashflowsA,
    compA,
    rateA,
    irrA.irrs,
  );
  const sensitivityB = buildSensitivity(
    initialB,
    cashflowsB,
    compB,
    rateB,
    irrB.irrs,
  );
  displayCompareSensitivity(sensitivityA, sensitivityB, nameA, nameB);

  showChartLoading("npv-bar-canvas");
  requestAnimationFrame(() => {
    displayCompareChart(breakdownA, breakdownB, nameA, nameB);
    hideChartLoading("npv-bar-canvas");
  });

  tableShowA.textContent = nameA;
  tableShowB.textContent = nameB;
  tableShowA.classList.add("active");
  tableShowB.classList.remove("active");
  displayTable(breakdownA);

  document.getElementById("npv-results").classList.add("hidden");
  document.getElementById("npv-compare-results").classList.remove("hidden");
  document.getElementById("npv-sensitivity-section").classList.remove("hidden");
  document.getElementById("npv-chart-section").classList.remove("hidden");
  document.getElementById("npv-table-section").classList.remove("hidden");
  document.getElementById("npv-table-toggles").classList.remove("hidden");

  document
    .getElementById("npv-compare-results")
    .scrollIntoView({ behavior: "smooth" });
}

// ===== RESIZE HANDLER =====
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (currentMode === "single" && lastSingleBreakdown) {
      displayChart(lastSingleBreakdown, lastSinglePeriodType);
    } else if (compareDataA && compareDataB) {
      displayCompareChart(compareDataA.breakdown, compareDataB.breakdown, compareDataA.name, compareDataB.name);
    }
  }, 250);
});

// ===== DISPLAY: SENSITIVITY =====
function displaySensitivity(sensitivity) {
  const header = document.getElementById("sensitivity-header");
  const body = document.getElementById("sensitivity-body");

  header.innerHTML = "<th>Discount Rate</th>";
  sensitivity.forEach((s) => {
    const th = document.createElement("th");
    th.textContent = `${s.rate.toFixed(1)}%`;
    if (s.isBase) th.style.color = "var(--accent)";
    header.appendChild(th);
  });

  body.innerHTML = "";
  const tr = document.createElement("tr");
  const tdLabel = document.createElement("td");
  tdLabel.textContent = "NPV";
  tr.appendChild(tdLabel);

  sensitivity.forEach((s) => {
    const td = document.createElement("td");
    td.textContent = formatCurrency(s.npv);
    if (s.npv >= 0) {
      td.className = "sensitivity-positive";
    } else {
      td.className = "sensitivity-negative";
    }
    if (s.isBase) td.style.fontWeight = "700";
    tr.appendChild(td);
  });

  body.appendChild(tr);
}

function displayCompareSensitivity(sensA, sensB, nameA, nameB) {
  const allRates = new Set([
    ...sensA.map((s) => s.rate),
    ...sensB.map((s) => s.rate),
  ]);
  const sortedRates = [...allRates].sort((a, b) => a - b);

  const rates =
    sortedRates.length > 20
      ? sortedRates.filter(
          (r, i) => i % Math.ceil(sortedRates.length / 20) === 0,
        )
      : sortedRates;

  const header = document.getElementById("sensitivity-header");
  const body = document.getElementById("sensitivity-body");

  header.innerHTML = "<th>Discount Rate</th>";
  rates.forEach((r) => {
    const th = document.createElement("th");
    th.textContent = `${r.toFixed(1)}%`;
    header.appendChild(th);
  });

  body.innerHTML = "";

  const trA = document.createElement("tr");
  const tdLabelA = document.createElement("td");
  tdLabelA.textContent = nameA;
  trA.appendChild(tdLabelA);

  rates.forEach((r) => {
    const td = document.createElement("td");
    const match = sensA.find((s) => Math.abs(s.rate - r) < 0.01);
    if (match) {
      td.textContent = formatCurrency(match.npv);
      td.className =
        match.npv >= 0 ? "sensitivity-positive" : "sensitivity-negative";
    } else {
      td.textContent = "—";
    }
    trA.appendChild(td);
  });
  body.appendChild(trA);

  const trB = document.createElement("tr");
  const tdLabelB = document.createElement("td");
  tdLabelB.textContent = nameB;
  trB.appendChild(tdLabelB);

  rates.forEach((r) => {
    const td = document.createElement("td");
    const match = sensB.find((s) => Math.abs(s.rate - r) < 0.01);
    if (match) {
      td.textContent = formatCurrency(match.npv);
      td.className =
        match.npv >= 0 ? "sensitivity-positive" : "sensitivity-negative";
    } else {
      td.textContent = "—";
    }
    trB.appendChild(td);
  });
  body.appendChild(trB);
}

// ===== DISPLAY: CHART =====
let npvBarController = null;

function displayChart(breakdown, periodType) {
  const canvas = document.getElementById("npv-bar-canvas");
  const legend = document.getElementById("npv-chart-legend");
  const title = document.getElementById("npv-chart-title");
  if (!canvas) return;

  title.textContent = "Cash Flows by Period";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color legend-principal"></span> Cash Inflow</span>
    <span class="legend-item"><span class="legend-color legend-interest"></span> Cash Outflow</span>
  `;

  const pLabel = periodType === "months" ? "M" : "Yr";
  drawBarChart(canvas, breakdown, {
    series: [
      { key: "cashflow", color: "#2dd4bf", label: "Cash Flow" },
    ],
    xLabel: (d) => d.period === 0 ? "Init" : `${pLabel}${d.period}`,
    tooltip: (d) => [
      d.period === 0 ? "Initial Investment" : `Period ${d.period}`,
      `Cash Flow: ${formatCurrency(d.cashflow)}`,
      `Discounted: ${formatCurrency(d.discountedValue)}`,
      `Cumulative NPV: ${formatCurrency(d.cumulativeNPV)}`,
    ],
    controller: npvBarController,
  });
}

function displayCompareChart(breakdownA, breakdownB, nameA, nameB) {
  const canvas = document.getElementById("npv-bar-canvas");
  const legend = document.getElementById("npv-chart-legend");
  const title = document.getElementById("npv-chart-title");
  if (!canvas) return;

  title.textContent = "Cumulative NPV Comparison";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color legend-principal"></span> ${nameA}</span>
    <span class="legend-item"><span class="legend-color legend-interest"></span> ${nameB}</span>
  `;

  const maxPeriods = Math.max(breakdownA.length, breakdownB.length);
  const combined = [];
  for (let i = 0; i < maxPeriods; i++) {
    combined.push({
      period: i,
      npvA: breakdownA[i] ? breakdownA[i].cumulativeNPV : 0,
      npvB: breakdownB[i] ? breakdownB[i].cumulativeNPV : 0,
    });
  }

  drawBarChart(canvas, combined, {
    series: [
      { key: "npvA", color: "#2dd4bf", label: nameA },
      { key: "npvB", color: "#f472b6", label: nameB },
    ],
    xLabel: (d) => d.period === 0 ? "Init" : `${d.period}`,
    tooltip: (d) => [
      `Period ${d.period}`,
      `${nameA}: ${formatCurrency(d.npvA)}`,
      `${nameB}: ${formatCurrency(d.npvB)}`,
    ],
    controller: npvBarController,
  });
}

// ===== DISPLAY: TABLE =====
function displayTable(breakdown) {
  const tbody = document.getElementById("npv-table-body");
  tbody.innerHTML = "";

  breakdown.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.period === 0 ? "Initial" : row.period}</td>
      <td style="color: ${row.cashflow >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(row.cashflow)}</td>
      <td>${row.discountFactor.toFixed(6)}</td>
      <td style="color: ${row.discountedValue >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(row.discountedValue)}</td>
      <td style="color: ${row.cumulativeNPV >= 0 ? "var(--accent)" : "#f472b6"}">${formatCurrency(row.cumulativeNPV)}</td>
    `;
    tbody.appendChild(tr);
  });
}
