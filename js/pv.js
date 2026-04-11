// ===== DOM ELEMENTS =====
const calculateBtn = document.getElementById("pv-calculate-btn");
const modeLumpBtn = document.getElementById("mode-lump");
const modeAnnuityBtn = document.getElementById("mode-annuity");
const modeCompareBtn = document.getElementById("mode-compare");
const lumpFields = document.getElementById("lump-fields");
const annuityFields = document.getElementById("annuity-fields");
const compareFields = document.getElementById("compare-fields");
const yearsRow = document.getElementById("years-row");
const taxToggle = document.getElementById("pv-tax-toggle");
const taxFields = document.getElementById("pv-tax-fields");

let currentMode = "lump";

// ===== EVENT LISTENERS =====
calculateBtn.addEventListener("click", handleCalculate);

modeLumpBtn.addEventListener("click", () => switchMode("lump"));
modeAnnuityBtn.addEventListener("click", () => switchMode("annuity"));
modeCompareBtn.addEventListener("click", () => switchMode("compare"));

taxToggle.addEventListener("change", () => {
  taxFields.classList.toggle("hidden");
});

bindFormEnter(() => handleCalculate());

// ===== MODE SWITCHING =====
function switchMode(mode) {
  currentMode = mode;
  modeLumpBtn.classList.toggle("active", mode === "lump");
  modeAnnuityBtn.classList.toggle("active", mode === "annuity");
  modeCompareBtn.classList.toggle("active", mode === "compare");

  lumpFields.classList.add("hidden");
  annuityFields.classList.add("hidden");
  compareFields.classList.add("hidden");

  if (mode === "compare") {
    yearsRow.classList.add("hidden");
  } else {
    yearsRow.classList.remove("hidden");
  }

  if (mode === "lump") {
    lumpFields.classList.remove("hidden");
  } else if (mode === "annuity") {
    annuityFields.classList.remove("hidden");
  } else {
    compareFields.classList.remove("hidden");
  }

  document.getElementById("pv-results").classList.add("hidden");
  document.getElementById("pv-chart-section").classList.add("hidden");
  document.getElementById("pv-table-section").classList.add("hidden");
}

// ===== FORMATTING =====
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ===== MAIN CALCULATION =====
function handleCalculate() {
  if (currentMode === "compare") {
    handleCompare();
    return;
  }

  const annualRate = parseFloat(document.getElementById("pv-rate").value);
  const years = parseInt(document.getElementById("pv-periods").value);
  const compounding = parseInt(document.getElementById("pv-compounding").value);

  if (!annualRate || !years) {
    alert("Please fill in the discount rate and number of years.");
    return;
  }

  if (annualRate <= 0 || years <= 0) {
    alert("Discount rate and years must be greater than zero.");
    return;
  }

  const ratePerPeriod = annualRate / 100 / compounding;
  const totalPeriods = years * compounding;

  let presentValue, futureValue, totalPayments;

  if (currentMode === "lump") {
    futureValue = parseFloat(document.getElementById("pv-future-value").value);

    if (!futureValue || futureValue <= 0) {
      alert("Please enter a valid future value.");
      return;
    }

    presentValue = futureValue / Math.pow(1 + ratePerPeriod, totalPeriods);
    totalPayments = futureValue;
  } else {
    const payment = parseFloat(document.getElementById("pv-payment").value);

    if (!payment || payment <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    presentValue =
      (payment * (1 - Math.pow(1 + ratePerPeriod, -totalPeriods))) /
      ratePerPeriod;
    futureValue = payment * totalPeriods;
    totalPayments = futureValue;
  }

  const discount = totalPayments - presentValue;

  // Display standard results
  document.getElementById("pv-standard-results").classList.remove("hidden");
  document.getElementById("pv-compare-results").classList.add("hidden");

  document.getElementById("pv-result").textContent =
    formatCurrency(presentValue);
  document.getElementById("pv-fv-display").textContent =
    formatCurrency(totalPayments);
  document.getElementById("pv-fv-label").textContent =
    currentMode === "lump" ? "Future Value" : "Total Payments";
  document.getElementById("pv-discount").textContent = formatCurrency(discount);
  document.getElementById("pv-effective-rate").textContent =
    `${ratePerPeriod.toFixed(4)}% (${compounding}x/year)`;

  const breakdown = buildBreakdown(
    presentValue,
    futureValue,
    ratePerPeriod,
    compounding,
    years,
  );

  displayChart(breakdown);
  displayTable(breakdown);

  document.getElementById("pv-results").classList.remove("hidden");
  document.getElementById("pv-chart-section").classList.remove("hidden");
  document.getElementById("pv-table-section").classList.remove("hidden");

  document.getElementById("pv-results").scrollIntoView({ behavior: "smooth" });
}

// ===== COMPARE CALCULATION =====
function handleCompare() {
  const annualRate = parseFloat(document.getElementById("pv-rate").value);
  const compounding = parseInt(document.getElementById("pv-compounding").value);
  const lumpSum = parseFloat(document.getElementById("pv-compare-lump").value);
  const annuityPayment = parseFloat(
    document.getElementById("pv-compare-payment").value,
  );
  const annuityYears = parseInt(
    document.getElementById("pv-compare-years").value,
  );

  if (!annualRate || !lumpSum || !annuityPayment || !annuityYears) {
    alert(
      "Please fill in all fields: lump sum, annuity payment, annuity duration, and discount rate.",
    );
    return;
  }

  if (
    annualRate <= 0 ||
    lumpSum <= 0 ||
    annuityPayment <= 0 ||
    annuityYears <= 0
  ) {
    alert("All values must be greater than zero.");
    return;
  }

  const useTax = taxToggle.checked;
  let lumpTaxRate = 0;
  let annuityTaxRate = 0;
  let investmentTaxRate = 0;

  if (useTax) {
    lumpTaxRate =
      (parseFloat(document.getElementById("pv-lump-tax-rate").value) || 0) /
      100;
    annuityTaxRate =
      (parseFloat(document.getElementById("pv-annuity-tax-rate").value) || 0) /
      100;
    investmentTaxRate =
      (parseFloat(document.getElementById("pv-investment-tax-rate").value) ||
        0) / 100;
  }

  const ratePerPeriod = annualRate / 100 / compounding;
  const totalPeriods = annuityYears * compounding;

  // After-tax values
  const lumpAfterTax = lumpSum * (1 - lumpTaxRate);
  const annuityPaymentAfterTax = annuityPayment * (1 - annuityTaxRate);
  const annuityTotalAfterTax = annuityPaymentAfterTax * totalPeriods;
  const annuityTotalPreTax = annuityPayment * totalPeriods;

  // After-tax discount rate (investment returns are taxed)
  const afterTaxRatePerPeriod = useTax
    ? ((annualRate / 100) * (1 - investmentTaxRate)) / compounding
    : ratePerPeriod;

  // Lump sum PV = after-tax lump sum (received today)
  const lumpPV = lumpAfterTax;

  // Annuity PV using after-tax payment and after-tax discount rate
  const annuityPV =
    (annuityPaymentAfterTax *
      (1 - Math.pow(1 + afterTaxRatePerPeriod, -totalPeriods))) /
    afterTaxRatePerPeriod;

  const difference = Math.abs(lumpPV - annuityPV);
  const winner = lumpPV >= annuityPV ? "lump" : "annuity";

  // Calculate breakeven rate
  const breakevenRate = findBreakevenRate(
    lumpAfterTax,
    annuityPaymentAfterTax,
    totalPeriods,
    compounding,
    useTax,
    investmentTaxRate,
  );

  // Display compare results
  document.getElementById("pv-standard-results").classList.add("hidden");
  document.getElementById("pv-compare-results").classList.remove("hidden");

  // Tax indicator
  const taxIndicator = document.getElementById("pv-tax-indicator");
  if (useTax) {
    taxIndicator.classList.remove("hidden");
  } else {
    taxIndicator.classList.add("hidden");
  }

  // Tax detail rows
  const lumpTaxRow = document.getElementById("pv-lump-tax-row");
  const lumpAfterTaxRow = document.getElementById("pv-lump-after-tax-row");
  const annuityTaxRow = document.getElementById("pv-annuity-tax-row");
  const annuityAfterTaxRow = document.getElementById(
    "pv-annuity-after-tax-row",
  );

  if (useTax) {
    lumpTaxRow.classList.remove("hidden");
    lumpAfterTaxRow.classList.remove("hidden");
    annuityTaxRow.classList.remove("hidden");
    annuityAfterTaxRow.classList.remove("hidden");

    document.getElementById("pv-compare-lump-tax").textContent =
      `-${formatCurrency(lumpSum * lumpTaxRate)}`;
    document.getElementById("pv-compare-lump-after-tax").textContent =
      formatCurrency(lumpAfterTax);
    document.getElementById("pv-compare-annuity-tax").textContent =
      `-${formatCurrency(annuityTotalPreTax * annuityTaxRate)}`;
    document.getElementById("pv-compare-annuity-after-tax").textContent =
      formatCurrency(annuityTotalAfterTax);
  } else {
    lumpTaxRow.classList.add("hidden");
    lumpAfterTaxRow.classList.add("hidden");
    annuityTaxRow.classList.add("hidden");
    annuityAfterTaxRow.classList.add("hidden");
  }

  document.getElementById("pv-compare-lump-amount").textContent =
    formatCurrency(lumpSum);
  document.getElementById("pv-compare-lump-pv").textContent =
    formatCurrency(lumpPV);
  document.getElementById("pv-compare-annuity-total").textContent = useTax
    ? formatCurrency(annuityTotalAfterTax)
    : formatCurrency(annuityTotalPreTax);
  document.getElementById("pv-compare-annuity-pv").textContent =
    formatCurrency(annuityPV);

  // Highlight winner
  const lumpCol = document.getElementById("pv-lump-column");
  const annuityCol = document.getElementById("pv-annuity-column");

  lumpCol.classList.remove("winner", "loser", "highlight");
  annuityCol.classList.remove("winner", "loser", "highlight");

  if (winner === "lump") {
    lumpCol.classList.add("winner");
    annuityCol.classList.add("loser");
    document.getElementById("pv-verdict").textContent = "💵 Take the Lump Sum";
  } else {
    annuityCol.classList.add("winner");
    lumpCol.classList.add("loser");
    document.getElementById("pv-verdict").textContent = "📅 Take the Annuity";
  }

  document.getElementById("pv-advantage").textContent =
    formatCurrency(difference);

  // Breakeven rate
  if (breakevenRate !== null) {
    document.getElementById("pv-breakeven").textContent =
      `${breakevenRate.toFixed(2)}%`;
  } else {
    document.getElementById("pv-breakeven").textContent = "N/A";
  }

  // Build comparison chart and table
  const comparisonBreakdown = buildComparisonBreakdown(
    lumpAfterTax,
    annuityPaymentAfterTax,
    afterTaxRatePerPeriod,
    compounding,
    annuityYears,
  );

  displayComparisonChart(comparisonBreakdown, lumpAfterTax);
  displayComparisonTable(comparisonBreakdown, lumpAfterTax);

  document.getElementById("pv-results").classList.remove("hidden");
  document.getElementById("pv-chart-section").classList.remove("hidden");
  document.getElementById("pv-table-section").classList.remove("hidden");

  document.getElementById("pv-results").scrollIntoView({ behavior: "smooth" });
}

// ===== BREAKEVEN RATE FINDER =====
function findBreakevenRate(
  lumpPV,
  annuityPayment,
  totalPeriods,
  compounding,
  useTax,
  investmentTaxRate,
) {
  // Use bisection method to find the annual rate where lump PV = annuity PV
  let low = 0.001;
  let high = 50;
  let mid;

  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;

    // Apply investment tax to the rate if tax mode is on
    const testRate = useTax
      ? ((mid / 100) * (1 - investmentTaxRate)) / compounding
      : mid / 100 / compounding;

    if (testRate <= 0) {
      low = mid;
      continue;
    }

    const annuityPV =
      (annuityPayment * (1 - Math.pow(1 + testRate, -totalPeriods))) / testRate;

    if (Math.abs(annuityPV - lumpPV) < 0.01) {
      return mid;
    }

    if (annuityPV > lumpPV) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return mid;
}

// ===== BUILD BREAKDOWNS =====
function buildBreakdown(
  presentValue,
  futureValue,
  ratePerPeriod,
  compounding,
  years,
) {
  const breakdown = [];

  if (currentMode === "lump") {
    for (let year = 0; year <= years; year++) {
      const periods = year * compounding;
      const discountFactor = 1 / Math.pow(1 + ratePerPeriod, periods);
      const pvAtYear = futureValue * discountFactor;
      const interestPortion = futureValue - pvAtYear;

      breakdown.push({
        year: year,
        discountFactor: discountFactor,
        value: pvAtYear,
        interest: interestPortion,
      });
    }
  } else {
    const payment = parseFloat(document.getElementById("pv-payment").value);

    for (let year = 0; year <= years; year++) {
      const periods = year * compounding;

      let cumulativePV = 0;
      if (periods > 0) {
        cumulativePV =
          (payment * (1 - Math.pow(1 + ratePerPeriod, -periods))) /
          ratePerPeriod;
      }

      const totalReceived = payment * periods;
      const interestPortion = totalReceived - cumulativePV;
      const discountFactor = periods > 0 ? cumulativePV / totalReceived : 1;

      breakdown.push({
        year: year,
        discountFactor: discountFactor,
        value: cumulativePV,
        interest: interestPortion,
      });
    }
  }

  return breakdown;
}

function buildComparisonBreakdown(
  lumpAfterTax,
  annuityPayment,
  ratePerPeriod,
  compounding,
  years,
) {
  const breakdown = [];

  for (let year = 0; year <= years; year++) {
    const periods = year * compounding;

    const lumpGrowth = lumpAfterTax * Math.pow(1 + ratePerPeriod, periods);
    const annuityReceived = annuityPayment * periods;

    let annuityPV = 0;
    if (periods > 0) {
      annuityPV =
        (annuityPayment * (1 - Math.pow(1 + ratePerPeriod, -periods))) /
        ratePerPeriod;
    }

    breakdown.push({
      year: year,
      lumpGrowth: lumpGrowth,
      annuityReceived: annuityReceived,
      annuityPV: annuityPV,
    });
  }

  return breakdown;
}

// ===== STANDARD CHART =====
function displayChart(breakdown) {
  const chartBars = document.getElementById("pv-chart-bars");
  const chartYAxis = document.getElementById("pv-chart-y-axis");
  const legend = document.getElementById("pv-chart-legend");

  // Update header and legend for standard mode
  document.querySelector("#pv-chart-section h2").textContent =
    "Value Over Time";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color legend-principal"></span> Present Value Portion</span>
    <span class="legend-item"><span class="legend-color legend-interest"></span> Interest (Discount)</span>
  `;

  const data = breakdown.filter((d) => d.year > 0);
  const maxTotal = Math.max(...data.map((d) => d.value + d.interest));

  chartYAxis.innerHTML = "";
  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const label = document.createElement("span");
    const value = (maxTotal / steps) * i;
    label.textContent =
      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value.toFixed(0)}`;
    chartYAxis.appendChild(label);
  }

  chartBars.innerHTML = "";
  data.forEach((d) => {
    const total = d.value + d.interest;
    const totalHeight = (total / maxTotal) * 100;
    const pvHeight = (d.value / total) * totalHeight;
    const interestHeight = (d.interest / total) * totalHeight;

    const group = document.createElement("div");
    group.className = "bar-group";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${totalHeight}%`;

    const interestBar = document.createElement("div");
    interestBar.className = "bar-interest";
    interestBar.style.height = `${interestHeight}%`;

    const pvBar = document.createElement("div");
    pvBar.className = "bar-principal";
    pvBar.style.height = `${pvHeight}%`;

    stack.appendChild(interestBar);
    stack.appendChild(pvBar);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = `Yr ${d.year}`;

    group.appendChild(stack);
    group.appendChild(label);
    chartBars.appendChild(group);

    const tooltip = document.createElement("div");
    tooltip.className = "bar-tooltip";
    tooltip.innerHTML = `<strong>Year ${d.year}</strong><br>Present Value: ${formatCurrency(d.value)}<br>Discount: ${formatCurrency(d.interest)}`;
    group.appendChild(tooltip);

    group.addEventListener("mouseenter", (e) => {
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 12}px`;
    });
    group.addEventListener("mousemove", (e) => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 12}px`;
    });
    group.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

// ===== COMPARISON CHART =====
function displayComparisonChart(breakdown, lumpAfterTax) {
  const chartBars = document.getElementById("pv-chart-bars");
  const chartYAxis = document.getElementById("pv-chart-y-axis");
  const legend = document.getElementById("pv-chart-legend");

  document.querySelector("#pv-chart-section h2").textContent =
    "Lump Sum Growth vs. Annuity Payments";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color legend-principal"></span> Lump Sum (Invested)</span>
    <span class="legend-item"><span class="legend-color legend-interest"></span> Annuity (Cumulative Received)</span>
  `;

  const data = breakdown.filter((d) => d.year > 0);
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.lumpGrowth, d.annuityReceived)),
  );

  chartYAxis.innerHTML = "";
  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const label = document.createElement("span");
    const value = (maxVal / steps) * i;
    label.textContent =
      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value.toFixed(0)}`;
    chartYAxis.appendChild(label);
  }

  chartBars.innerHTML = "";
  data.forEach((d) => {
    const group = document.createElement("div");
    group.className = "bar-group";

    const barContainer = document.createElement("div");
    barContainer.style.display = "flex";
    barContainer.style.alignItems = "flex-end";
    barContainer.style.gap = "2px";
    barContainer.style.width = "100%";
    barContainer.style.height = "100%";
    barContainer.style.justifyContent = "center";

    const lumpBar = document.createElement("div");
    lumpBar.className = "bar-principal";
    lumpBar.style.width = "45%";
    lumpBar.style.height = `${(d.lumpGrowth / maxVal) * 100}%`;
    lumpBar.style.borderRadius = "3px 3px 0 0";

    const annuityBar = document.createElement("div");
    annuityBar.className = "bar-interest";
    annuityBar.style.width = "45%";
    annuityBar.style.height = `${(d.annuityReceived / maxVal) * 100}%`;
    annuityBar.style.borderRadius = "3px 3px 0 0";

    barContainer.appendChild(lumpBar);
    barContainer.appendChild(annuityBar);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = `Yr ${d.year}`;

    group.appendChild(barContainer);
    group.appendChild(label);
    chartBars.appendChild(group);

    const tooltip = document.createElement("div");
    tooltip.className = "bar-tooltip";
    tooltip.innerHTML = `<strong>Year ${d.year}</strong><br>Lump Invested: ${formatCurrency(d.lumpGrowth)}<br>Annuity Received: ${formatCurrency(d.annuityReceived)}<br>Annuity PV: ${formatCurrency(d.annuityPV)}`;
    group.appendChild(tooltip);

    group.addEventListener("mouseenter", (e) => {
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 12}px`;
    });
    group.addEventListener("mousemove", (e) => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 12}px`;
    });
    group.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

// ===== STANDARD TABLE =====
function displayTable(breakdown) {
  const tbody = document.getElementById("pv-table-body");
  const header = document.querySelector("#pv-table-section h2");
  header.textContent = "Year-by-Year Breakdown";

  const thead = document.querySelector("#pv-table-section thead tr");
  thead.innerHTML = `
    <th>Year</th>
    <th>Discount Factor</th>
    <th>${currentMode === "lump" ? "Present Value" : "Cumulative PV"}</th>
    <th>Interest Portion</th>
  `;

  tbody.innerHTML = "";

  breakdown.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.year === 0 ? "Today" : row.year}</td>
      <td>${row.discountFactor.toFixed(6)}</td>
      <td>${formatCurrency(row.value)}</td>
      <td>${formatCurrency(row.interest)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== COMPARISON TABLE =====
function displayComparisonTable(breakdown, lumpAfterTax) {
  const tbody = document.getElementById("pv-table-body");
  const header = document.querySelector("#pv-table-section h2");
  header.textContent = "Year-by-Year Comparison";

  const thead = document.querySelector("#pv-table-section thead tr");
  thead.innerHTML = `
    <th>Year</th>
    <th>Lump (Invested)</th>
    <th>Annuity (Received)</th>
    <th>Annuity PV</th>
    <th>Difference</th>
  `;

  tbody.innerHTML = "";

  breakdown.forEach((row) => {
    const diff = row.lumpGrowth - row.annuityPV;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.year === 0 ? "Today" : row.year}</td>
      <td>${formatCurrency(row.lumpGrowth)}</td>
      <td>${formatCurrency(row.annuityReceived)}</td>
      <td>${formatCurrency(row.annuityPV)}</td>
      <td style="color: ${diff >= 0 ? "var(--accent)" : "#f472b6"}">${diff >= 0 ? "+" : ""}${formatCurrency(diff)}</td>
    `;
    tbody.appendChild(tr);
  });
}
