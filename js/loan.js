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
  const principal = parseFloat(document.getElementById("loan-amount").value);
  const annualRate = parseFloat(document.getElementById("interest-rate").value);
  const termYears = parseInt(document.getElementById("loan-term").value);

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

function displayChart(yearly) {
  const chartBars = document.getElementById("chart-bars");
  const chartYAxis = document.getElementById("chart-y-axis");

  // Find the max total (principal + interest) for scaling
  const maxTotal = Math.max(...yearly.map((y) => y.principal + y.interest));

  // Build Y-axis labels
  chartYAxis.innerHTML = "";
  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const label = document.createElement("span");
    const value = (maxTotal / steps) * i;
    label.textContent =
      value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value.toFixed(0)}`;
    chartYAxis.appendChild(label);
  }

  // Build bars
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

    // Add tooltip via mouse events instead of CSS
    const tooltip = document.createElement("div");
    tooltip.className = "bar-tooltip";
    tooltip.innerHTML = `<strong>Year ${year.period}</strong><br>Principal: ${formatCurrency(year.principal)}<br>Interest: ${formatCurrency(year.interest)}`;
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

function displayCumulativeChart(schedule) {
  const svg = document.getElementById("cumulative-chart-svg");
  const tooltip = document.getElementById("cumulative-chart-tooltip");
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
