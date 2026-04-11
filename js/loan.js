// ===== DOM ELEMENTS =====
const calculateBtn = document.getElementById("calculate-btn");
const resultsSection = document.getElementById("results");
const chartSection = document.getElementById("chart-section");
const amortizationSection = document.getElementById("amortization-section");
const viewMonthlyBtn = document.getElementById("view-monthly");
const viewYearlyBtn = document.getElementById("view-yearly");

// Store the schedule globally so we can toggle between monthly/yearly
let monthlySchedule = [];
let yearlySchedule = [];

// ===== EVENT LISTENERS =====
calculateBtn.addEventListener("click", handleCalculate);
viewMonthlyBtn.addEventListener("click", () => switchView("monthly"));
viewYearlyBtn.addEventListener("click", () => switchView("yearly"));

// Allow Enter key to trigger calculation
bindFormEnter(() => handleCalculate());

// ===== MAIN CALCULATION =====
function handleCalculate() {
  // Grab inputs
  const principal = safeParseFloat(document.getElementById("loan-amount").value);
  const annualRate = safeParseFloat(document.getElementById("interest-rate").value);
  const termYears = safeParseInt(document.getElementById("loan-term").value);

  // Validate
  if (!principal || !annualRate || !termYears) {
    alert("Please fill in all fields with valid numbers.");
    return;
  }

  if (principal <= 0 || annualRate <= 0 || termYears <= 0) {
    alert("All values must be greater than zero.");
    return;
  }

  // Calculate
  const monthlyRate = annualRate / 100 / 12;
  const totalMonths = termYears * 12;

  // Monthly payment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
  const monthlyPayment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths))) /
    (Math.pow(1 + monthlyRate, totalMonths) - 1);

  // Build amortization schedule
  monthlySchedule = buildMonthlySchedule(
    principal,
    monthlyRate,
    totalMonths,
    monthlyPayment,
  );
  yearlySchedule = buildYearlySchedule(monthlySchedule);

  const totalCost = monthlyPayment * totalMonths;
  const totalInterest = totalCost - principal;

  // Display results
  displaySummary(monthlyPayment, principal, totalInterest, totalCost);
  displayChart(yearlySchedule);
  displayCumulativeChart(monthlySchedule);
  displayTable(monthlySchedule, "monthly");

  // Show all sections
  resultsSection.classList.remove("hidden");
  chartSection.classList.remove("hidden");
  document
    .getElementById("cumulative-chart-section")
    .classList.remove("hidden");
  amortizationSection.classList.remove("hidden");

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

// ===== BUILD SCHEDULES =====
function buildMonthlySchedule(
  principal,
  monthlyRate,
  totalMonths,
  monthlyPayment,
) {
  const schedule = [];
  let balance = principal;

  for (let month = 1; month <= totalMonths; month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    balance -= principalPayment;

    // Prevent floating point issues on the last payment
    if (balance < 0) balance = 0;

    schedule.push({
      period: month,
      payment: monthlyPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: balance,
    });
  }

  return schedule;
}

function buildYearlySchedule(monthly) {
  const yearly = [];
  let yearPrincipal = 0;
  let yearInterest = 0;
  let yearPayment = 0;

  for (let i = 0; i < monthly.length; i++) {
    yearPrincipal += monthly[i].principal;
    yearInterest += monthly[i].interest;
    yearPayment += monthly[i].payment;

    // End of year or last month
    if ((i + 1) % 12 === 0 || i === monthly.length - 1) {
      yearly.push({
        period: yearly.length + 1,
        payment: yearPayment,
        principal: yearPrincipal,
        interest: yearInterest,
        balance: monthly[i].balance,
      });
      yearPrincipal = 0;
      yearInterest = 0;
      yearPayment = 0;
    }
  }

  return yearly;
}

// ===== DISPLAY FUNCTIONS =====

function displaySummary(monthlyPayment, principal, totalInterest, totalCost) {
  document.getElementById("monthly-payment").textContent =
    formatCurrency(monthlyPayment);
  document.getElementById("total-principal").textContent =
    formatCurrency(principal);
  document.getElementById("total-interest").textContent =
    formatCurrency(totalInterest);
  document.getElementById("total-cost").textContent = formatCurrency(totalCost);
}

let loanBarController = null;
let loanLineController = null;

function displayChart(yearly) {
  const canvas = document.getElementById("loan-bar-canvas");
  if (!canvas) return;
  drawBarChart(canvas, yearly, {
    series: [
      { key: "principal", color: "#2dd4bf", label: "Principal" },
      { key: "interest", color: "#f472b6", label: "Interest" },
    ],
    xLabel: (d) => `Yr ${d.period}`,
    tooltip: (d) => [
      `Year ${d.period}`,
      `Principal: ${formatCurrency(d.principal)}`,
      `Interest: ${formatCurrency(d.interest)}`,
      `Balance: ${formatCurrency(d.balance)}`,
    ],
    controller: loanBarController,
  });
}

function displayCumulativeChart(schedule) {
  const canvas = document.getElementById("loan-line-canvas");
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
    controller: loanLineController,
  });
}

function displayTable(schedule, view) {
  const tbody = document.getElementById("amortization-body");
  const periodHeader = document.getElementById("period-header");

  periodHeader.textContent = view === "monthly" ? "Month" : "Year";
  tbody.innerHTML = "";

  schedule.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.period}</td>
      <td>${formatCurrency(row.payment)}</td>
      <td>${formatCurrency(row.principal)}</td>
      <td>${formatCurrency(row.interest)}</td>
      <td>${formatCurrency(row.balance)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== VIEW TOGGLE =====
function switchView(view) {
  if (view === "monthly") {
    viewMonthlyBtn.classList.add("active");
    viewYearlyBtn.classList.remove("active");
    displayTable(monthlySchedule, "monthly");
  } else {
    viewYearlyBtn.classList.add("active");
    viewMonthlyBtn.classList.remove("active");
    displayTable(yearlySchedule, "yearly");
  }
}
