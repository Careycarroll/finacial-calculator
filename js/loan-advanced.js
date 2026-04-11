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
  const amount = parseFloat(document.getElementById("adv-range-amount").value);

  if (!startMonth || !startYear || !amount || amount <= 0) {
    alert("Please enter a start date and amount.");
    return;
  }

  if (!ongoing && (!endMonth || !endYear)) {
    alert("Please enter an end date or check 'Ongoing'.");
    return;
  }

  const startDate = `${startYear}-${String(startMonth).padStart(2, "0")}`;
  let endDate = "9999-12"; // Ongoing = effectively forever

  if (!ongoing) {
    endDate = `${endYear}-${String(endMonth).padStart(2, "0")}`;
    if (endDate < startDate) {
      alert("End date must be after start date.");
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
  const amount = parseFloat(amountInput.value);

  if (!month || !year || !amount || amount <= 0) {
    alert("Please select a month, year, and enter a valid amount.");
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
  const principal = parseFloat(
    document.getElementById("adv-loan-amount").value,
  );
  const annualRate = parseFloat(
    document.getElementById("adv-interest-rate").value,
  );
  const termValue = parseInt(document.getElementById("adv-loan-term").value);
  const termUnit = document.getElementById("adv-term-unit").value;
  const startMonth = parseInt(document.getElementById("adv-start-month").value);
  const startYear = parseInt(document.getElementById("adv-start-year").value);
  const frequency = document.getElementById("adv-frequency").value;
  const isExisting = existingToggle.checked;

  // Validate
  if (!principal || !annualRate || !termValue || !startMonth || !startYear) {
    alert("Please fill in all required fields in Loan Setup.");
    return;
  }

  if (principal <= 0 || annualRate <= 0 || termValue <= 0) {
    alert("Loan amount, interest rate, and term must be greater than zero.");
    return;
  }

  // Calculate total months from term
  const totalMonths = termUnit === "years" ? termValue * 12 : termValue;

  // Existing loan values
  let currentBalance = principal;
  let paymentsMade = 0;
  if (isExisting) {
    currentBalance = parseFloat(
      document.getElementById("adv-current-balance").value,
    );
    paymentsMade =
      parseInt(document.getElementById("adv-payments-made").value) || 0;

    if (!currentBalance || currentBalance <= 0) {
      alert("Please enter a valid current balance.");
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

  // Display chart and table (default views)
  currentChartView = "original";
  currentTableView = "original";
  currentTablePeriod = "monthly";
  resetToggleStates();
  displayChart(originalYearly);
  displayCumulativeChart(originalMonthly);
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
function displayChart(yearly) {
  const chartBars = document.getElementById("adv-chart-bars");
  const chartYAxis = document.getElementById("adv-chart-y-axis");

  const maxTotal = Math.max(...yearly.map((y) => y.principal + y.interest));

  // Y-axis
  chartYAxis.innerHTML = "";
  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const label = document.createElement("span");
    const value = (maxTotal / steps) * i;
    label.textContent =
      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value.toFixed(0)}`;
    chartYAxis.appendChild(label);
  }

  // Bars
  chartBars.innerHTML = "";
  yearly.forEach((year) => {
    const total = year.principal + year.interest;
    const totalHeight = (total / maxTotal) * 100;
    const principalHeight = (year.principal / total) * totalHeight;
    const interestHeight = (year.interest / total) * totalHeight;

    const group = document.createElement("div");
    group.className = "bar-group";

    const stack = document.createElement("div");
    stack.className = "bar-stack";
    stack.style.height = `${totalHeight}%`;

    const interestBar = document.createElement("div");
    interestBar.className = "bar-interest";
    interestBar.style.height = `${interestHeight}%`;

    const principalBar = document.createElement("div");
    principalBar.className = "bar-principal";
    principalBar.style.height = `${principalHeight}%`;

    stack.appendChild(interestBar);
    stack.appendChild(principalBar);

    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = year.period;

    group.appendChild(stack);
    group.appendChild(label);
    chartBars.appendChild(group);

    // Tooltip
    const tooltip = document.createElement("div");
    tooltip.className = "bar-tooltip";
    tooltip.innerHTML = `<strong>${year.period}</strong><br>Principal: ${formatCurrency(year.principal)}<br>Interest: ${formatCurrency(year.interest)}${year.extra > 0 ? `<br>Extra: ${formatCurrency(year.extra)}` : ""}`;
    group.appendChild(tooltip);

    const positionYearTooltip = (event) => {
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 8;
      let left = event.clientX + 12;
      let top = event.clientY - tooltipRect.height - 8;

      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
      }
      if (left < margin) {
        left = margin;
      }
      if (top < margin) {
        top = event.clientY + 12;
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    group.addEventListener("mouseenter", (event) => {
      tooltip.style.display = "block";
      positionYearTooltip(event);
    });
    group.addEventListener("mousemove", positionYearTooltip);
    group.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

// ===== TABLE =====
function displayTable(schedule, period) {
  const tbody = document.getElementById("adv-amortization-body");
  const periodHeader = document.getElementById("adv-period-header");

  periodHeader.textContent = period === "monthly" ? "Period" : "Year";
  tbody.innerHTML = "";

  schedule.forEach((row) => {
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
  const svg = document.getElementById("adv-cumulative-chart-svg");
  const tooltip = document.getElementById("adv-cumulative-chart-tooltip");
  if (!svg || !tooltip || schedule.length === 0) return;

  const width = 700;
  const height = 240;
  const padding = 40;
  const points = schedule.length;

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

  const maxValue =
    Math.max(
      cumulative[cumulative.length - 1].total || 0,
      cumulative[0]?.balance || 0,
    ) || 1;
  const xStep = points > 1 ? (width - padding * 2) / (points - 1) : 0;

  const getX = (index) => padding + index * xStep;
  const getY = (value) =>
    height - padding - (value / maxValue) * (height - padding * 2);

  const buildPath = (key) =>
    cumulative
      .map((point, index) =>
        index === 0
          ? `M ${getX(index)} ${getY(point[key])}`
          : `L ${getX(index)} ${getY(point[key])}`,
      )
      .join(" ");

  let svgContent = `
    <g class="line-chart-grid">
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" class="line-axis-line" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="line-axis-line" />
    </g>
  `;

  for (let i = 0; i <= 5; i += 1) {
    const y = padding + ((height - padding * 2) / 5) * i;
    svgContent += `
      <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="line-chart-grid" />
      <text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-secondary)">$${((maxValue * (5 - i)) / 5 / 1000).toFixed(0)}k</text>
    `;
  }

  svgContent += `
    <path d="${buildPath("total")}" class="line-series line-total" />
    <path d="${buildPath("principal")}" class="line-series line-principal" />
    <path d="${buildPath("interest")}" class="line-series line-interest" />
    <path d="${buildPath("balance")}" class="line-series line-balance" />
  `;

  cumulative.forEach((point, index) => {
    [
      { key: "total", label: "Total Paid" },
      { key: "principal", label: "Principal" },
      { key: "interest", label: "Interest" },
      { key: "balance", label: "Balance" },
    ].forEach((series) => {
      const x = getX(index);
      const y = getY(point[series.key]);
      svgContent += `
        <circle cx="${x}" cy="${y}" r="10" fill="transparent" class="line-point" data-series="${series.key}" data-index="${index}" />
      `;
    });
  });

  svg.innerHTML = svgContent;

  svg.querySelectorAll("circle").forEach((circle) => {
    circle.addEventListener("mouseenter", (event) => {
      const index = Number(event.target.dataset.index);
      const series = event.target.dataset.series;
      const point = cumulative[index];
      const label =
        series === "total"
          ? "Total Paid"
          : series.charAt(0).toUpperCase() + series.slice(1);
      tooltip.innerHTML = `
        <strong>Payment ${point.period}</strong>
        ${label}: ${formatCurrency(point[series])}
      `;
      tooltip.style.display = "block";
      const rect = svg.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 8;
      let left = event.clientX - rect.left + 14;
      let top = event.clientY - rect.top - tooltipRect.height - 8;

      if (left + tooltipRect.width > rect.width - margin) {
        left = rect.width - tooltipRect.width - margin;
      }
      if (left < margin) {
        left = margin;
      }
      if (top < margin) {
        top = event.clientY - rect.top + 12;
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    circle.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
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

function resetToggleStates() {
  chartOriginalBtn.classList.add("active");
  chartAdjustedBtn.classList.remove("active");
  viewMonthlyBtn.classList.add("active");
  viewYearlyBtn.classList.remove("active");
  tableOriginalBtn.classList.add("active");
  tableAdjustedBtn.classList.remove("active");
}
