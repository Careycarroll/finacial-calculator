import {
  safeParseFloat, safeParseInt, formatCurrency,
  drawBarChart, drawLineChart, showChartLoading, hideChartLoading,
  validateInputs, showFieldError, bindFormEnter
} from "./chart-utils.js";

// ===== DOM ELEMENTS =====
const calculateBtn = document.getElementById("adv-calculate-btn");
const existingToggle = document.getElementById("adv-existing-toggle");
const existingFields = document.getElementById("existing-loan-fields");
const addOnetimeBtn = document.getElementById("add-onetime-btn");
const onetimeList = document.getElementById("onetime-list");
const addRangeBtn = document.getElementById("add-range-btn");
const rangeList = document.getElementById("range-list");

// Chart toggles
const chartOriginalBtn = document.getElementById("chart-original");
const chartAdjustedBtn = document.getElementById("chart-adjusted");

// Table toggles
const viewMonthlyBtn = document.getElementById("adv-view-monthly");
const viewYearlyBtn = document.getElementById("adv-view-yearly");
const tableOriginalBtn = document.getElementById("adv-table-original");
const tableAdjustedBtn = document.getElementById("adv-table-adjusted");

// State
let oneTimePayments = [];
let extraRanges = [];
let originalMonthly = [];
let originalYearly = [];
let adjustedMonthly = [];
let adjustedYearly = [];
let currentChartView = "original";
let currentTableView = "original";
let currentTablePeriod = "monthly";

// ===== POPULATE YEAR DROPDOWNS =====
function populateYearDropdowns() {
  const currentYear = new Date().getFullYear();
  const yearSelects = [
    document.getElementById("adv-start-year"),
    document.getElementById("adv-onetime-year"),
    document.getElementById("adv-range-start-year"),
    document.getElementById("adv-range-end-year"),
  ];

  yearSelects.forEach((select) => {
    for (let y = currentYear - 30; y <= currentYear + 30; y++) {
      const option = document.createElement("option");
      option.value = y;
      option.textContent = y;
      select.appendChild(option);
    }
  });
}

populateYearDropdowns();

// ===== EVENT LISTENERS =====
calculateBtn.addEventListener("click", handleCalculate);

existingToggle.addEventListener("change", () => {
  existingFields.classList.toggle("hidden");
});

addOnetimeBtn.addEventListener("click", addOneTimePayment);
addRangeBtn.addEventListener("click", addExtraRange);

chartOriginalBtn.addEventListener("click", () => switchChart("original"));
chartAdjustedBtn.addEventListener("click", () => switchChart("adjusted"));

viewMonthlyBtn.addEventListener("click", () => switchTablePeriod("monthly"));
viewYearlyBtn.addEventListener("click", () => switchTablePeriod("yearly"));
tableOriginalBtn.addEventListener("click", () => switchTableView("original"));
tableAdjustedBtn.addEventListener("click", () => switchTableView("adjusted"));

// Disable end date fields when Ongoing is checked
document.getElementById("adv-range-ongoing").addEventListener("change", (e) => {
  const disabled = e.target.checked;
  document.getElementById("adv-range-end-month").disabled = disabled;
  document.getElementById("adv-range-end-year").disabled = disabled;
  if (disabled) {
    document.getElementById("adv-range-end-month").value = "";
    document.getElementById("adv-range-end-year").value = "";
  }
});

bindFormEnter(() => handleCalculate());

// ===== EXTRA RANGE MANAGEMENT =====
function addExtraRange() {
  const startMonth = document.getElementById("adv-range-start-month").value;
  const startYear = document.getElementById("adv-range-start-year").value;
  const endMonth = document.getElementById("adv-range-end-month").value;
  const endYear = document.getElementById("adv-range-end-year").value;
  const ongoing = document.getElementById("adv-range-ongoing").checked;
  const amount = safeParseFloat(document.getElementById("adv-range-amount").value);

  let valid = true;
  if (!startMonth || !startYear || !amount || amount <= 0) {
    showFieldError("adv-range-amount", "Please enter a start date and amount.");
    valid = false;
  }
  if (!ongoing && (!endMonth || !endYear)) {
    showFieldError("adv-range-amount", "Please enter an end date or check Ongoing.");
    valid = false;
  }
  if (!valid) return;

  const startDate = `${startYear}-${String(startMonth).padStart(2, "0")}`;
  let endDate = "9999-12"; // Ongoing = effectively forever

  if (!ongoing) {
    endDate = `${endYear}-${String(endMonth).padStart(2, "0")}`;
    if (endDate < startDate) {
      showFieldError("adv-range-amount", "End date must be after start date.");
      return;
    }
  }

  extraRanges.push({ startDate, endDate, amount, ongoing });
  extraRanges.sort((a, b) => a.startDate.localeCompare(b.startDate));
  renderRangeList();

  // Reset inputs
  document.getElementById("adv-range-start-month").value = "";
  document.getElementById("adv-range-start-year").value = "";
  document.getElementById("adv-range-end-month").value = "";
  document.getElementById("adv-range-end-year").value = "";
  document.getElementById("adv-range-ongoing").checked = false;
  document.getElementById("adv-range-end-month").disabled = false;
  document.getElementById("adv-range-end-year").disabled = false;
  document.getElementById("adv-range-amount").value = "";
}

function removeExtraRange(index) {
  extraRanges.splice(index, 1);
  renderRangeList();
}

function renderRangeList() {
  rangeList.innerHTML = "";
  extraRanges.forEach((range, index) => {
    const li = document.createElement("li");
    li.className = "range-item";

    const [sy, sm] = range.startDate.split("-");
    const startLabel =
      new Date(sy, sm - 1).toLocaleString("en-US", { month: "short" }) +
      " " +
      sy;

    let endLabel = "End of loan";
    if (!range.ongoing) {
      const [ey, em] = range.endDate.split("-");
      endLabel =
        new Date(ey, em - 1).toLocaleString("en-US", { month: "short" }) +
        " " +
        ey;
    }

    li.innerHTML = `
      <span>${startLabel} → ${endLabel} — ${formatCurrency(range.amount)}/period</span>
      <button class="onetime-remove" onclick="removeExtraRange(${index})">✕</button>
    `;
    rangeList.appendChild(li);
  });
}

// ===== ONE-TIME PAYMENT MANAGEMENT =====
function addOneTimePayment() {
  const monthSelect = document.getElementById("adv-onetime-month");
  const yearSelect = document.getElementById("adv-onetime-year");
  const amountInput = document.getElementById("adv-onetime-amount");

  const month = monthSelect.value;
  const year = yearSelect.value;
  const amount = safeParseFloat(amountInput.value);

  if (!month || !year || !amount || amount <= 0) {
    showFieldError("adv-onetime-amount", "Please select a month, year, and enter a valid amount.");
    return;
  }

  const date = `${year}-${String(month).padStart(2, "0")}`;

  oneTimePayments.push({ date, amount });
  oneTimePayments.sort((a, b) => a.date.localeCompare(b.date));
  renderOneTimeList();

  monthSelect.value = "";
  yearSelect.value = "";
  amountInput.value = "";
}

function removeOneTimePayment(index) {
  oneTimePayments.splice(index, 1);
  renderOneTimeList();
}

function renderOneTimeList() {
  onetimeList.innerHTML = "";
  oneTimePayments.forEach((payment, index) => {
    const li = document.createElement("li");
    li.className = "onetime-item";

    const [year, month] = payment.date.split("-");
    const monthName = new Date(year, month - 1).toLocaleString("en-US", {
      month: "short",
    });

    li.innerHTML = `
      <span>${monthName} ${year} — ${formatCurrency(payment.amount)}</span>
      <button class="onetime-remove" onclick="removeOneTimePayment(${index})">✕</button>
    `;
    onetimeList.appendChild(li);
  });
}

// ===== FORMATTING =====

function formatDate(year, month) {
  const date = new Date(year, month - 1);
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

// ===== FREQUENCY HELPERS =====
function getPeriodsPerYear(frequency) {
  switch (frequency) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "monthly":
      return 12;
    default:
      return 12;
  }
}

function getFrequencyLabel(frequency) {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Bi-Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Monthly";
  }
}

// ===== GET EXTRA RECURRING FOR A DATE =====
function getExtraRecurringForDate(dateKey) {
  let total = 0;
  extraRanges.forEach((range) => {
    if (dateKey >= range.startDate && dateKey <= range.endDate) {
      total += range.amount;
    }
  });
  return total;
}

// ===== MAIN CALCULATION =====
function handleCalculate() {
  // Gather inputs
  const principal = safeParseFloat(
    document.getElementById("adv-loan-amount").value
    );
  const annualRate = safeParseFloat(
    document.getElementById("adv-interest-rate").value
    );
  const termValue = safeParseInt(document.getElementById("adv-loan-term").value);
  const termUnit = document.getElementById("adv-term-unit").value;
  const startMonth = safeParseInt(document.getElementById("adv-start-month").value);
  const startYear = safeParseInt(document.getElementById("adv-start-year").value);
  const frequency = document.getElementById("adv-frequency").value;
  const isExisting = existingToggle.checked;

  // Validate
  const valid = validateInputs([
    { id: "adv-loan-amount",   label: "Loan Amount",   required: true, min: 1              },
    { id: "adv-interest-rate", label: "Interest Rate", required: true, min: 0.01, max: 30  },
    { id: "adv-loan-term",     label: "Loan Term",     required: true, min: 1,    max: 50  },
    { id: "adv-start-year",    label: "Start Year",    required: true, min: 2000, max: 2100, integer: true },
  ], ".calc-form");
  if (!valid) return;

  // Calculate total months from term
  const totalMonths = termUnit === "years" ? termValue * 12 : termValue;

  // Existing loan values
  let currentBalance = principal;
  let paymentsMade = 0;
  if (isExisting) {
    currentBalance = safeParseFloat(
      document.getElementById("adv-current-balance").value
      );
    paymentsMade =
      safeParseInt(document.getElementById("adv-payments-made").value, 0);

    if (!currentBalance || currentBalance <= 0) {
      showFieldError("adv-current-balance", "Please enter a valid current balance.");
      return;
    }
  }

  // Periods per year and periodic rate
  const periodsPerYear = getPeriodsPerYear(frequency);
  const periodicRate = annualRate / 100 / periodsPerYear;

  // Total periods for the original loan
  const totalPeriods = Math.round(totalMonths * (periodsPerYear / 12));

  // Base periodic payment (calculated on original loan)
  const basePayment =
    (principal * (periodicRate * Math.pow(1 + periodicRate, totalPeriods))) /
    (Math.pow(1 + periodicRate, totalPeriods) - 1);

  // Determine remaining periods and starting balance
  const remainingPeriods =
    totalPeriods - Math.round(paymentsMade * (periodsPerYear / 12));
  const startingBalance = isExisting ? currentBalance : principal;

  // Calculate start date for remaining schedule
  let scheduleStartYear = startYear;
  let scheduleStartMonth = startMonth + paymentsMade;
  while (scheduleStartMonth > 12) {
    scheduleStartMonth -= 12;
    scheduleStartYear++;
  }

  // Build one-time payment map
  const onetimeMap = {};
  oneTimePayments.forEach((p) => {
    if (onetimeMap[p.date]) {
      onetimeMap[p.date] += p.amount;
    } else {
      onetimeMap[p.date] = p.amount;
    }
  });

  // Build original schedule (no extras)
  originalMonthly = buildSchedule(
    startingBalance,
    periodicRate,
    basePayment,
    false,
    {},
    periodsPerYear,
    scheduleStartYear,
    scheduleStartMonth,
    remainingPeriods,
  );

  // Build adjusted schedule (with extras)
  adjustedMonthly = buildSchedule(
    startingBalance,
    periodicRate,
    basePayment,
    true,
    onetimeMap,
    periodsPerYear,
    scheduleStartYear,
    scheduleStartMonth,
    remainingPeriods,
  );

  // Build yearly summaries
  originalYearly = buildYearlySummary(originalMonthly);
  adjustedYearly = buildYearlySummary(adjustedMonthly);

  // Calculate totals
  const origTotalInterest = originalMonthly.reduce(
    (sum, r) => sum + r.interest,
    0,
  );
  const origTotalCost = originalMonthly.reduce(
    (sum, r) => sum + r.payment + r.extra,
    0,
  );
  const adjTotalInterest = adjustedMonthly.reduce(
    (sum, r) => sum + r.interest,
    0,
  );
  const adjTotalCost = adjustedMonthly.reduce(
    (sum, r) => sum + r.payment + r.extra,
    0,
  );

  const interestSaved = origTotalInterest - adjTotalInterest;
  const periodsSaved = originalMonthly.length - adjustedMonthly.length;

  // Payoff dates
  const origLast = originalMonthly[originalMonthly.length - 1];
  const adjLast = adjustedMonthly[adjustedMonthly.length - 1];

  // Figure out effective adjusted payment for display
  const totalExtras = adjustedMonthly.reduce((sum, r) => sum + r.extra, 0);
  const avgExtra =
    adjustedMonthly.length > 0 ? totalExtras / adjustedMonthly.length : 0;

  // Display summary
  document.getElementById("adv-base-payment").textContent =
    formatCurrency(basePayment);
  document.getElementById("adv-adjusted-payment").textContent =
    avgExtra > 0
      ? formatCurrency(basePayment + avgExtra) + " (avg)"
      : formatCurrency(basePayment);
  document.getElementById("adv-frequency-display").textContent =
    getFrequencyLabel(frequency);

  document.getElementById("adv-orig-interest").textContent =
    formatCurrency(origTotalInterest);
  document.getElementById("adv-orig-cost").textContent =
    formatCurrency(origTotalCost);
  document.getElementById("adv-orig-payoff").textContent = origLast.dateLabel;
  document.getElementById("adv-orig-payments").textContent =
    originalMonthly.length;

  document.getElementById("adv-adj-interest").textContent =
    formatCurrency(adjTotalInterest);
  document.getElementById("adv-adj-cost").textContent =
    formatCurrency(adjTotalCost);
  document.getElementById("adv-adj-payoff").textContent = adjLast.dateLabel;
  document.getElementById("adv-adj-payments").textContent =
    adjustedMonthly.length;

  document.getElementById("adv-interest-saved").textContent =
    formatCurrency(interestSaved);

  const timeSavedText = formatTimeSaved(periodsSaved, frequency);
  document.getElementById("adv-time-saved").textContent = timeSavedText;

  // Show sections
  document.getElementById("adv-results").classList.remove("hidden");
  document.getElementById("adv-chart-section").classList.remove("hidden");
  document
    .getElementById("adv-cumulative-chart-section")
    .classList.remove("hidden");
  document
    .getElementById("adv-amortization-section")
    .classList.remove("hidden");

  showChartLoading("adv-bar-canvas");
  showChartLoading("adv-line-canvas");
  // Display chart and table (default views)
  currentChartView = "original";
  currentTableView = "original";
  currentTablePeriod = "monthly";
  resetToggleStates();
  requestAnimationFrame(() => {
    displayChart(originalYearly);
    hideChartLoading("adv-bar-canvas");
    displayCumulativeChart(originalMonthly);
    hideChartLoading("adv-line-canvas");
  });
  displayTable(originalMonthly, "monthly");

  document.getElementById("adv-results").scrollIntoView({ behavior: "smooth" });
}

// ===== BUILD SCHEDULE =====
function buildSchedule(
  balance,
  periodicRate,
  basePayment,
  useExtras,
  onetimeMap,
  periodsPerYear,
  startYear,
  startMonth,
  maxPeriods,
) {
  const schedule = [];
  let currentBalance = balance;
  let year = startYear;
  let month = startMonth;

  const monthsPerPeriod = 12 / periodsPerYear;

  for (let i = 1; i <= maxPeriods; i++) {
    if (currentBalance <= 0) break;

    const interestPayment = currentBalance * periodicRate;
    let principalPayment = basePayment - interestPayment;
    let extraPayment = 0;

    if (useExtras) {
      const dateKey = `${year}-${String(Math.floor(month)).padStart(2, "0")}`;

      // Get recurring extras for this date
      extraPayment = getExtraRecurringForDate(dateKey);

      // Add one-time payment if applicable
      if (onetimeMap && onetimeMap[dateKey]) {
        extraPayment += onetimeMap[dateKey];
      }
    }

    // Make sure we don't overpay
    if (principalPayment + extraPayment > currentBalance) {
      const totalNeeded = currentBalance;
      principalPayment = Math.min(principalPayment, totalNeeded);
      extraPayment = Math.min(extraPayment, totalNeeded - principalPayment);
    }

    currentBalance -= principalPayment + extraPayment;
    if (currentBalance < 0.01) currentBalance = 0;

    schedule.push({
      period: i,
      dateLabel: formatDate(year, Math.floor(month)),
      payment: basePayment,
      extra: extraPayment,
      principal: principalPayment + extraPayment,
      interest: interestPayment,
      balance: currentBalance,
    });

    if (currentBalance === 0) break;

    // Advance date
    month += monthsPerPeriod;
    while (month > 12) {
      month -= 12;
      year++;
    }
  }

  return schedule;
}

// ===== YEARLY SUMMARY =====
function buildYearlySummary(schedule) {
  if (schedule.length === 0) return [];

  const yearlyMap = {};

  schedule.forEach((row) => {
    const year = row.dateLabel.split(" ")[1];
    if (!yearlyMap[year]) {
      yearlyMap[year] = {
        period: year,
        payment: 0,
        extra: 0,
        principal: 0,
        interest: 0,
        balance: 0,
      };
    }
    yearlyMap[year].payment += row.payment;
    yearlyMap[year].extra += row.extra;
    yearlyMap[year].principal += row.principal;
    yearlyMap[year].interest += row.interest;
    yearlyMap[year].balance = row.balance;
  });

  return Object.values(yearlyMap);
}

// ===== FORMAT TIME SAVED =====
function formatTimeSaved(periods, frequency) {
  let totalMonths;
  switch (frequency) {
    case "weekly":
      totalMonths = Math.round((periods / 52) * 12);
      break;
    case "biweekly":
      totalMonths = Math.round((periods / 26) * 12);
      break;
    default:
      totalMonths = periods;
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years > 0 && months > 0) {
    return `${years}y ${months}m`;
  } else if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}`;
  } else {
    return `${months} month${months !== 1 ? "s" : ""}`;
  }
}

// ===== CHART =====
let advBarController = null;
let advLineController = null;

function displayChart(yearly) {
  const canvas = document.getElementById("adv-bar-canvas");
  if (!canvas) return;
  drawBarChart(canvas, yearly, {
    series: [
      { key: "principal", color: "#2dd4bf", label: "Principal" },
      { key: "interest", color: "#f472b6", label: "Interest" },
      { key: "extra", color: "#a78bfa", label: "Extra Payment" },
    ],
    xLabel: (d) => `Yr ${d.period}`,
    tooltip: (d) => [
      `Year ${d.period}`,
      `Principal: ${formatCurrency(d.principal)}`,
      `Interest: ${formatCurrency(d.interest)}`,...(d.extra > 0 ? [`Extra: ${formatCurrency(d.extra)}`] : []),
      `Balance: ${formatCurrency(d.balance)}`,
    ],
    controller: advBarController,
    legendEl: "adv-bar-legend",
  });
}

// ===== TABLE =====
function displayTable(schedule, period) {
  const tbody = document.getElementById("adv-amortization-body");
  const periodHeader = document.getElementById("adv-period-header");

  periodHeader.textContent = period === "monthly" ? "Period" : "Year";
  tbody.innerHTML = "";

  const pageSize = 30;
  let currentPage = 0;

  function renderPage() {
    tbody.innerHTML = "";
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, schedule.length);
    const slice = schedule.slice(start, end);

    slice.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${period === "monthly" ? row.dateLabel : row.period}</td>
        <td>${formatCurrency(row.payment)}</td>
        <td>${formatCurrency(row.extra)}</td>
        <td>${formatCurrency(row.principal)}</td>
        <td>${formatCurrency(row.interest)}</td>
        <td>${formatCurrency(row.balance)}</td>
      `;
      tbody.appendChild(tr);
    });

    let pager = document.getElementById("adv-table-pager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "adv-table-pager";
      pager.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-top:0.75rem;font-size:0.85rem;color:#94a3b8;";
      tbody.closest("table").after(pager);
    }

    const totalPages = Math.ceil(schedule.length / pageSize);
    pager.innerHTML = "";

    if (totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.textContent = "← Prev";
    prev.className = "btn-toggle";
    prev.disabled = currentPage === 0;
    prev.addEventListener("click", () => { currentPage--; renderPage(); });

    const info = document.createElement("span");
    info.textContent = `Page ${currentPage + 1} of ${totalPages} (${schedule.length} rows)`;

    const next = document.createElement("button");
    next.textContent = "Next →";
    next.className = "btn-toggle";
    next.disabled = currentPage >= totalPages - 1;
    next.addEventListener("click", () => { currentPage++; renderPage(); });

    pager.appendChild(prev);
    pager.appendChild(info);
    pager.appendChild(next);
  }

  renderPage();
}

// ===== VIEW SWITCHING =====
function switchChart(view) {
  currentChartView = view;
  chartOriginalBtn.classList.toggle("active", view === "original");
  chartAdjustedBtn.classList.toggle("active", view === "adjusted");
  displayChart(view === "original" ? originalYearly : adjustedYearly);
  displayCumulativeChart(
    view === "original" ? originalMonthly : adjustedMonthly,
  );
}

function displayCumulativeChart(schedule) {
  const canvas = document.getElementById("adv-line-canvas");
  if (!canvas || schedule.length === 0) return;

  const cumulative = schedule.reduce((acc, row) => {
    const previous = acc.length
      ? acc[acc.length - 1]
      : { principal: 0, interest: 0, total: 0, balance: row.balance };
    const principal = previous.principal + row.principal;
    const interest = previous.interest + row.interest;
    acc.push({
      period: row.period,
      principal,
      interest,
      total: principal + interest,
      balance: row.balance,
    });
    return acc;
  }, []);

  drawLineChart(canvas, cumulative, {
    series: [
      { key: "total", color: "#2dd4bf", label: "Total Paid", fill: true },
      { key: "principal", color: "#60a5fa", label: "Principal" },
      { key: "interest", color: "#f472b6", label: "Interest" },
      { key: "balance", color: "#f59e0b", label: "Balance" },
    ],
    xLabel: (d) => `Mo ${d.period}`,
    xTicks: 12,
    tooltip: (d) => [
      `Month ${d.period}`,
      `Total Paid: ${formatCurrency(d.total)}`,
      `Principal: ${formatCurrency(d.principal)}`,
      `Interest: ${formatCurrency(d.interest)}`,
      `Balance: ${formatCurrency(d.balance)}`,
    ],
    controller: advLineController,
    legendEl: "adv-line-legend",
  });
}

function switchTablePeriod(period) {
  currentTablePeriod = period;
  viewMonthlyBtn.classList.toggle("active", period === "monthly");
  viewYearlyBtn.classList.toggle("active", period === "yearly");
  updateTable();
}

function switchTableView(view) {
  currentTableView = view;
  tableOriginalBtn.classList.toggle("active", view === "original");
  tableAdjustedBtn.classList.toggle("active", view === "adjusted");
  updateTable();
}

function updateTable() {
  let schedule;
  if (currentTableView === "original") {
    schedule =
      currentTablePeriod === "monthly" ? originalMonthly : originalYearly;
  } else {
    schedule =
      currentTablePeriod === "monthly" ? adjustedMonthly : adjustedYearly;
  }
  displayTable(schedule, currentTablePeriod);
}

// ===== RESIZE HANDLER =====
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (originalYearly.length > 0) {
      displayChart(currentChartView === "original" ? originalYearly : adjustedYearly);
      displayCumulativeChart(currentChartView === "original" ? originalMonthly : adjustedMonthly);
    }
  }, 250);
});

function resetToggleStates() {
  chartOriginalBtn.classList.add("active");
  chartAdjustedBtn.classList.remove("active");
  viewMonthlyBtn.classList.add("active");
  viewYearlyBtn.classList.remove("active");
  tableOriginalBtn.classList.add("active");
  tableAdjustedBtn.classList.remove("active");
}
