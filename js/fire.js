import {
  CONFIG, safeParseFloat, safeParseInt, formatCurrency,
  createChartContext, showChartLoading, hideChartLoading,
  rafThrottle, validateInputs, showFieldError, bindFormEnter
} from "./chart-utils.js";

// ===== DOM ELEMENTS =====
const tabFireNumber = document.getElementById("tab-fire-number");
const tabCoastFire = document.getElementById("tab-coast-fire");
const fireNumberTab = document.getElementById("fire-number-tab");
const coastFireTab = document.getElementById("coast-fire-tab");

const fireCalculateBtn = document.getElementById("fire-calculate-btn");
const coastCalculateBtn = document.getElementById("coast-calculate-btn");

let calculatedFireNumber = null;
let calculatedFireNumberFuture = null;

// ===== TAB SWITCHING =====
tabFireNumber.addEventListener("click", () => {
  tabFireNumber.classList.add("active");
  tabCoastFire.classList.remove("active");
  fireNumberTab.classList.remove("hidden");
  coastFireTab.classList.add("hidden");
});

tabCoastFire.addEventListener("click", () => {
  tabCoastFire.classList.add("active");
  tabFireNumber.classList.remove("active");
  coastFireTab.classList.remove("hidden");
  fireNumberTab.classList.add("hidden");

  // Auto-fill FIRE number if calculated
  if (calculatedFireNumberFuture) {
    const coastInput = document.getElementById("coast-fire-number");
    if (!coastInput.value) {
      coastInput.value = Math.round(calculatedFireNumberFuture);
    }
  }
});

// ===== EVENT LISTENERS =====
fireCalculateBtn.addEventListener("click", handleFireCalculate);
coastCalculateBtn.addEventListener("click", handleCoastCalculate);

// Enter key support
bindFormEnter(() => {
  if (!coastFireTab.classList.contains("hidden")) {
    handleCoastCalculate();
  } else {
    handleFireCalculate();
  }
});

// ===== FORMATTING =====
// formatCurrency is now provided by chart-utils.js

// ===== GET PROFILE VALUES =====
function getProfile() {
  return {
    currentAge: safeParseInt(document.getElementById("fire-current-age").value),
    retireAge: safeParseInt(document.getElementById("fire-retire-age").value),
    lifeExpectancy: safeParseInt(document.getElementById("fire-life-expectancy").value, 90),
    portfolio:
      safeParseFloat(document.getElementById("fire-current-portfolio").value, 0),
    monthlyContribution:
      safeParseFloat(document.getElementById("fire-monthly-contribution").value, 0),
    annualReturn:
      safeParseFloat(document.getElementById("fire-annual-return").value) / 100,
    inflation:
      safeParseFloat(document.getElementById("fire-inflation").value) / 100,
  };
}

// ===== FUTURE VALUE WITH MONTHLY CONTRIBUTIONS =====
function futureValue(presentValue, monthlyContribution, annualRate, years) {
  const monthlyRate = annualRate / 12;
  const months = years * 12;

  const fvLump = presentValue * Math.pow(1 + monthlyRate, months);
  const fvContrib =
    monthlyContribution *
    ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

  return fvLump + fvContrib;
}

// ===== YEARS TO REACH TARGET =====
const MAX_PROJECTION_MONTHS = 1200; // 100 years — effectively infinity for FIRE projections

function yearsToTarget(currentValue, monthlyContribution, annualRate, target) {
  if (currentValue >= target) return 0;

  const monthlyRate = annualRate / 12;
  let balance = currentValue;

  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= target) {
      return month / 12;
    }
  }

  return Infinity;
}

// ===== MONTHLY CONTRIBUTION NEEDED =====
function monthlyNeeded(currentValue, annualRate, target, years) {
  if (years <= 0) return 0;

  const monthlyRate = annualRate / 12;
  const months = years * 12;

  const fvCurrent = currentValue * Math.pow(1 + monthlyRate, months);
  const remaining = target - fvCurrent;

  if (remaining <= 0) return 0;

  const payment =
    remaining / ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  return Math.max(0, payment);
}

// ===== FIRE NUMBER CALCULATION =====
function handleFireCalculate() {
  const profile = getProfile();
  const annualExpenses = safeParseFloat(
    document.getElementById("fire-annual-expenses").value, 0
  );
  const withdrawalRate =
    safeParseFloat(document.getElementById("fire-withdrawal-rate").value, 0) / 100;
  const otherIncomeRaw =
    safeParseFloat(document.getElementById("fire-other-income").value, 0);
  const incomeType = document.getElementById("fire-income-type").value;
  let otherIncome = otherIncomeRaw;

  if (incomeType === "fv") {
    const startAge =
      safeParseFloat(document.getElementById("fire-income-start-age").value, 0);
    const inflation =
      (safeParseFloat(document.getElementById("fire-inflation").value, 3)) / 100;
    const years = startAge - profile.currentAge;
    if (years > 0) {
      otherIncome = otherIncomeRaw / Math.pow(1 + inflation, years);
    }
  }
  // Validate
  const valid = validateInputs([
    { id: "fire-current-age",        label: "Current Age",          required: true, min: 18,  max: 100, integer: true },
    { id: "fire-retire-age",         label: "Retirement Age",       required: true, min: 19,  max: 100, integer: true },
    { id: "fire-life-expectancy",    label: "Life Expectancy",      required: true, min: 20,  max: 120, integer: true },
    { id: "fire-annual-return",      label: "Annual Return",        required: true, min: 0,   max: 50  },
    { id: "fire-inflation",          label: "Inflation Rate",       required: true, min: 0,   max: 20  },
    { id: "fire-annual-expenses",    label: "Annual Expenses",      required: true, min: 1            },
    { id: "fire-withdrawal-rate",    label: "Withdrawal Rate",      required: true, min: 0.1, max: 20  },
  ], ".calc-form");
  if (!valid) return;

  if (profile.retireAge <= profile.currentAge) {
    showFieldError("fire-retire-age", "Retirement age must be greater than current age.");
    return;
  }
  if (profile.lifeExpectancy <= profile.retireAge) {
    showFieldError("fire-life-expectancy", "Life expectancy must be greater than retirement age.");
    return;
  }

  const yearsToRetire = profile.retireAge - profile.currentAge;

  // Gross FIRE number always based on full expenses
  const fireNumberToday = annualExpenses / withdrawalRate;

  // Portfolio must cover = expenses minus other income
  const portfolioMustCover = Math.max(0, annualExpenses - otherIncome);
  const fireNumberAdjusted = portfolioMustCover / withdrawalRate;

  // FIRE number in future dollars (inflation adjusted) — gross, for display
  const fireNumberFuture =
    fireNumberToday * Math.pow(1 + profile.inflation, yearsToRetire);

  // Adjusted future number — what portfolio actually needs to cover
  const fireNumberAdjustedFuture =
    fireNumberAdjusted * Math.pow(1 + profile.inflation, yearsToRetire);

  // Store for Coast FIRE tab (use gross number)
  calculatedFireNumber = fireNumberToday;
  calculatedFireNumberFuture = fireNumberFuture;

  // Auto-fill coast fire input (use gross number)
  const coastInput = document.getElementById("coast-fire-number");
  coastInput.value = Math.round(fireNumberFuture);

  // Years to FIRE at current rate — based on adjusted target
  const yearsAtCurrentRate = yearsToTarget(
    profile.portfolio,
    profile.monthlyContribution,
    profile.annualReturn,
    fireNumberAdjustedFuture,
  );

  const retireAgeAtCurrentRate = profile.currentAge + yearsAtCurrentRate;

  // Monthly needed to hit adjusted target by retirement age
  const monthlyNeededAmount = monthlyNeeded(
    profile.portfolio,
    profile.annualReturn,
    fireNumberAdjustedFuture,
    yearsToRetire,
  );

  const monthlyGap = monthlyNeededAmount - profile.monthlyContribution;

  // Display results
  document.getElementById("fire-number-today").textContent =
    formatCurrency(fireNumberToday);
  document.getElementById("fire-number-future").textContent =
    formatCurrency(fireNumberFuture);
  document.getElementById("fire-portfolio-covers").textContent =
    `${formatCurrency(portfolioMustCover)}/yr`;

  if (yearsAtCurrentRate === Infinity) {
    document.getElementById("fire-years-current").textContent = "Not reachable";
    document.getElementById("fire-years-current").className =
      "result-value negative";
    document.getElementById("fire-retire-age-current").textContent = "N/A";
    document.getElementById("fire-retire-age-current").className =
      "result-value negative";
  } else if (yearsAtCurrentRate <= 0) {
    document.getElementById("fire-years-current").textContent =
      "Already FIRE! 🎉";
    document.getElementById("fire-years-current").className =
      "result-value achieved";
    document.getElementById("fire-retire-age-current").textContent = "Now!";
    document.getElementById("fire-retire-age-current").className =
      "result-value achieved";
  } else {
    document.getElementById("fire-years-current").textContent =
      `${yearsAtCurrentRate.toFixed(1)} years`;
    document.getElementById("fire-years-current").className =
      `result-value ${retireAgeAtCurrentRate <= profile.retireAge ? "positive" : "negative"}`;
    document.getElementById("fire-retire-age-current").textContent =
      `Age ${Math.ceil(retireAgeAtCurrentRate)}`;
    document.getElementById("fire-retire-age-current").className =
      `result-value ${retireAgeAtCurrentRate <= profile.retireAge ? "positive" : "negative"}`;
  }

  document.getElementById("fire-monthly-needed").textContent =
    formatCurrency(monthlyNeededAmount) + "/mo";

  if (monthlyGap <= 0) {
    document.getElementById("fire-monthly-gap").textContent = "On track! ✅";
    document.getElementById("fire-monthly-gap").className =
      "result-value positive";
  } else {
    document.getElementById("fire-monthly-gap").textContent =
      `+${formatCurrency(monthlyGap)}/mo needed`;
    document.getElementById("fire-monthly-gap").className =
      "result-value negative";
  }

  // Update progress bars
  updateProgressBars(profile, fireNumberFuture);

  // Sensitivity table
  displayFireSensitivity(annualExpenses, otherIncome, profile, yearsToRetire, profile.lifeExpectancy);

  // Show results
  document.getElementById("fire-number-results").classList.remove("hidden");
  document
    .getElementById("fire-sensitivity-section")
    .classList.remove("hidden");
  document.getElementById("fire-chart-section").classList.remove("hidden");
  document.getElementById("fire-lifecycle-section").classList.remove("hidden");
  document.getElementById("fire-progress-section").classList.remove("hidden");

  // Compute Coast FIRE number for chart overlay
  const coastFireForChart =
    fireNumberFuture / Math.pow(1 + profile.annualReturn, yearsToRetire);

  // Projection chart
  showChartLoading("fire-chart-canvas");
  showChartLoading("fire-lifecycle-canvas");
  requestAnimationFrame(() => {
    displayFireChart(profile, fireNumberFuture, yearsToRetire, coastFireForChart);
    hideChartLoading("fire-chart-canvas");
  });

  // Lifecycle chart
  const retirementPortfolio = futureValue(
    profile.portfolio,
    profile.monthlyContribution,
    profile.annualReturn,
    yearsToRetire,
  );
  requestAnimationFrame(() => {
    displayLifecycleChart(profile, retirementPortfolio, annualExpenses, otherIncome, fireNumberFuture);
    hideChartLoading("fire-lifecycle-canvas");
  });

  document
    .getElementById("fire-number-results")
    .scrollIntoView({ behavior: "smooth" });
}

// ===== COAST FIRE CALCULATION =====
function handleCoastCalculate() {
  const profile = getProfile();
  const fireTarget = safeParseFloat(
    document.getElementById("coast-fire-number").value
    );

  // Validate
  const valid = validateInputs([
    { id: "fire-current-age",     label: "Current Age",      required: true, min: 18, max: 100, integer: true },
    { id: "fire-retire-age",      label: "Retirement Age",   required: true, min: 19, max: 100, integer: true },
    { id: "fire-annual-return",   label: "Annual Return",    required: true, min: 0,  max: 50  },
    { id: "coast-fire-number",    label: "FIRE Number",      required: true, min: 1            },
  ], "#coast-fire-tab");
  if (!valid) return;

  if (profile.retireAge <= profile.currentAge) {
    showFieldError("fire-retire-age", "Retirement age must be greater than current age.");
    return;
  }

  const yearsToRetire = profile.retireAge - profile.currentAge;

  // Coast FIRE number = what you need TODAY so it grows to fireTarget by retirement
  // Using nominal return (not inflation-adjusted, since fireTarget is already in future dollars)
  const coastFireNumber =
    fireTarget / Math.pow(1 + profile.annualReturn, yearsToRetire);

  // Status
  const isPastCoast = profile.portfolio >= coastFireNumber;
  const gap = coastFireNumber - profile.portfolio;

  // When will they hit Coast FIRE at current savings rate?
  let coastFireAge = null;
  if (isPastCoast) {
    coastFireAge = profile.currentAge;
  } else {
    // Find when portfolio + contributions crosses the coast threshold at each age
    // Coast threshold decreases over time (less time to compound = need more)
    let balance = profile.portfolio;
    const monthlyRate = profile.annualReturn / 12;

    for (let month = 1; month <= yearsToRetire * 12; month++) {
      balance = balance * (1 + monthlyRate) + profile.monthlyContribution;
      const age = profile.currentAge + month / 12;
      const remainingYears = profile.retireAge - age;

      if (remainingYears <= 0) break;

      const coastThresholdAtAge =
        fireTarget / Math.pow(1 + profile.annualReturn, remainingYears);

      if (balance >= coastThresholdAtAge) {
        coastFireAge = age;
        break;
      }
    }
  }

  // Retirement age if they stop contributing now
  const yearsNoContrib = yearsToTarget(
    profile.portfolio,
    0,
    profile.annualReturn,
    fireTarget,
  );
  const retireAgeNoContrib = profile.currentAge + yearsNoContrib;

  // Retirement age if they keep contributing
  const yearsWithContrib = yearsToTarget(
    profile.portfolio,
    profile.monthlyContribution,
    profile.annualReturn,
    fireTarget,
  );
  const retireAgeWithContrib = profile.currentAge + yearsWithContrib;

  // Extra monthly to reach Coast FIRE by a reasonable age
  // How much extra per month to hit coastFireNumber in 1 year? 2 years? etc.
  let extraMonthly = 0;
  if (!isPastCoast && profile.monthlyContribution > 0) {
    // Find how much more per month to hit coast fire number in half the remaining time
    // Target reaching Coast FIRE within the sooner of 5 years or half the time to retirement.
    // This gives a realistic near-term savings goal rather than spreading it over decades.
    const coastTargetYears = Math.min(5, yearsToRetire / 2);
    const totalNeeded = monthlyNeeded(
      profile.portfolio,
      profile.annualReturn,
      coastFireNumber,
      coastTargetYears,
    );
    extraMonthly = Math.max(0, totalNeeded - profile.monthlyContribution);
  } else if (!isPastCoast) {
    const coastTargetYears = Math.min(5, yearsToRetire / 2);
    extraMonthly = monthlyNeeded(
      profile.portfolio,
      profile.annualReturn,
      coastFireNumber,
      coastTargetYears,
    );
  }

  // Display results
  document.getElementById("coast-fire-amount").textContent =
    formatCurrency(coastFireNumber);

  if (isPastCoast) {
    document.getElementById("coast-fire-status").textContent =
      "✅ Past Coast FIRE!";
    document.getElementById("coast-fire-status").className =
      "result-value achieved";
    document.getElementById("coast-fire-gap").textContent =
      formatCurrency(Math.abs(gap)) + " surplus";
    document.getElementById("coast-fire-gap").className =
      "result-value positive";
  } else {
    document.getElementById("coast-fire-status").textContent = "❌ Not yet";
    document.getElementById("coast-fire-status").className =
      "result-value not-achieved";
    document.getElementById("coast-fire-gap").textContent =
      formatCurrency(gap) + " needed";
    document.getElementById("coast-fire-gap").className =
      "result-value negative";
  }

  if (coastFireAge !== null) {
    document.getElementById("coast-fire-age").textContent = isPastCoast
      ? "Now! 🎉"
      : `Age ${Math.ceil(coastFireAge)}`;
    document.getElementById("coast-fire-age").className =
      `result-value ${isPastCoast ? "achieved" : "positive"}`;
  } else {
    document.getElementById("coast-fire-age").textContent =
      "After retirement age";
    document.getElementById("coast-fire-age").className =
      "result-value negative";
  }

  if (yearsNoContrib === Infinity) {
    document.getElementById("coast-retire-age-no-contrib").textContent =
      "Not reachable";
    document.getElementById("coast-retire-age-no-contrib").className =
      "result-value negative";
  } else {
    document.getElementById("coast-retire-age-no-contrib").textContent =
      `Age ${Math.ceil(retireAgeNoContrib)}`;
    document.getElementById("coast-retire-age-no-contrib").className =
      `result-value ${retireAgeNoContrib <= profile.retireAge ? "positive" : "negative"}`;
  }

  if (yearsWithContrib === Infinity) {
    document.getElementById("coast-retire-age-with-contrib").textContent =
      "Not reachable";
    document.getElementById("coast-retire-age-with-contrib").className =
      "result-value negative";
  } else {
    document.getElementById("coast-retire-age-with-contrib").textContent =
      `Age ${Math.ceil(retireAgeWithContrib)}`;
    document.getElementById("coast-retire-age-with-contrib").className =
      `result-value ${retireAgeWithContrib <= profile.retireAge ? "positive" : "negative"}`;
  }

  if (isPastCoast) {
    document.getElementById("coast-extra-monthly").textContent =
      "$0 — You're coasting!";
    document.getElementById("coast-extra-monthly").className =
      "result-value positive";
  } else if (extraMonthly > 0) {
    document.getElementById("coast-extra-monthly").textContent =
      formatCurrency(extraMonthly) + "/mo";
    document.getElementById("coast-extra-monthly").className =
      "result-value negative";
  } else {
    document.getElementById("coast-extra-monthly").textContent = "On track";
    document.getElementById("coast-extra-monthly").className =
      "result-value positive";
  }

  // Update progress bars
  if (calculatedFireNumberFuture) {
    updateProgressBars(profile, calculatedFireNumberFuture, coastFireNumber);
  } else {
    updateProgressBars(profile, fireTarget, coastFireNumber);
  }

  // Show results
  document.getElementById("coast-fire-results").classList.remove("hidden");
  document.getElementById("coast-chart-section").classList.remove("hidden");
  document.getElementById("fire-progress-section").classList.remove("hidden");

  // Coast FIRE chart
  showChartLoading("coast-chart-canvas");
  requestAnimationFrame(() => {
    displayCoastChart(profile, fireTarget, coastFireNumber, yearsToRetire);
    hideChartLoading("coast-chart-canvas");
  });

  document
    .getElementById("coast-fire-results")
    .scrollIntoView({ behavior: "smooth" });
}

// ===== PROGRESS BARS =====
function updateProgressBars(profile, fireTarget, coastTarget) {
  // Full FIRE progress
  const firePercent = Math.min(100, (profile.portfolio / fireTarget) * 100);
  document.getElementById("fire-full-progress-bar").style.width =
    `${firePercent}%`;
  document.getElementById("fire-full-progress-text").textContent =
    `${firePercent.toFixed(1)}% — ${formatCurrency(profile.portfolio)} / ${formatCurrency(fireTarget)}`;

  // Coast FIRE progress
  if (coastTarget) {
    const coastPercent = Math.min(100, (profile.portfolio / coastTarget) * 100);
    document.getElementById("fire-coast-progress-bar").style.width =
      `${coastPercent}%`;
    document.getElementById("fire-coast-progress-text").textContent =
      `${coastPercent.toFixed(1)}% — ${formatCurrency(profile.portfolio)} / ${formatCurrency(coastTarget)}`;
  } else {
    // Estimate coast target from profile
    const yearsToRetire = profile.retireAge - profile.currentAge;
    const estimatedCoast =
      fireTarget / Math.pow(1 + profile.annualReturn, yearsToRetire);
    const coastPercent = Math.min(
      100,
      (profile.portfolio / estimatedCoast) * 100,
    );
    document.getElementById("fire-coast-progress-bar").style.width =
      `${coastPercent}%`;
    document.getElementById("fire-coast-progress-text").textContent =
      `${coastPercent.toFixed(1)}% — ${formatCurrency(profile.portfolio)} / ${formatCurrency(estimatedCoast)}`;
  }
}

// ===== FIRE SENSITIVITY TABLE =====
function displayFireSensitivity(annualExpenses, otherIncome, profile, yearsToRetire, lifeExpectancy) {
  const tbody = document.getElementById("fire-sensitivity-body");
  tbody.innerHTML = "";

  const rates = [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 5, 5.5, 6];
  const currentRate = safeParseFloat(
    document.getElementById("fire-withdrawal-rate").value
  );

  function getRiskLabel(rate) {
    if (rate <= 3.5) return { label: "🟢 Very Safe", color: "var(--accent)" };
    if (rate <= 4.25) return { label: "🟡 Moderate", color: "#f59e0b" };
    if (rate <= 5) return { label: "🟠 Aggressive", color: "#f97316" };
    return { label: "🔴 Risky", color: "#f472b6" };
  }

  rates.forEach((rate) => {
    const r = rate / 100;

    // Gross FIRE number (full expenses, today's dollars)
    const fireNumToday = annualExpenses / r;
    const fireNumFuture = fireNumToday * Math.pow(1 + profile.inflation, yearsToRetire);

    // Adjusted FIRE number (what portfolio must cover after other income)
    const portfolioMustCover = Math.max(0, annualExpenses - otherIncome);
    const adjFireNumToday = portfolioMustCover / r;
    const adjFireNumFuture = adjFireNumToday * Math.pow(1 + profile.inflation, yearsToRetire);

    // Monthly withdrawal from portfolio (today's dollars)
    const monthlyWithdrawal = portfolioMustCover / 12;

    // Years to reach adjusted target
    const years = yearsToTarget(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      adjFireNumFuture,
    );

    const risk = getRiskLabel(rate);
    const tr = document.createElement("tr");
    const isActive = Math.abs(rate - currentRate) < 0.01;

    const retirementPortfolio = futureValue(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      yearsToRetire,
    );
    const rateWithdrawal = retirementPortfolio * r;
    const drawdown = buildDrawdownData(
      retirementPortfolio,
      rateWithdrawal,
      otherIncome,
      profile.annualReturn,
      profile.inflation,
      profile.retireAge,
      lifeExpectancy || 90,
    );
    const lastPoint = drawdown[drawdown.length - 1];
    const portfolioAtDeath = lastPoint ? lastPoint.portfolio : 0;
    const ranOut = drawdown.find((d) => d.ranOut);

    tr.innerHTML = `
      <td style="${isActive ? "color: var(--accent); font-weight: 700;" : ""}">${rate}%</td>
      <td>${formatCurrency(fireNumFuture)}</td>
      <td>${formatCurrency(monthlyWithdrawal)}</td>
      <td style="color: ${years <= yearsToRetire ? "var(--accent)" : "#f472b6"}">${years === Infinity ? "Not reachable" : years.toFixed(1) + " yrs"}</td>
      <td style="color: ${portfolioAtDeath > 0 ? "var(--accent)" : "#f472b6"}">${ranOut ? "💀 Age " + ranOut.age : formatCurrency(portfolioAtDeath)}</td>
      <td style="color: ${risk.color}">${risk.label}</td>
    `;
    tbody.appendChild(tr);
  });
}


// ===== DRAWDOWN SIMULATION =====
function buildDrawdownData(startPortfolio, annualExpenses, otherIncome, annualReturn, inflation, retireAge, lifeExpectancy) {
  const data = [];
  let portfolio = startPortfolio;
  const retirementYears = lifeExpectancy - retireAge;

  for (let year = 0; year <= retirementYears; year++) {
    const age = retireAge + year;
    const inflationFactor = Math.pow(1 + inflation, year);
    const expenses = annualExpenses * inflationFactor;
    const income = otherIncome * inflationFactor;
    const netWithdrawal = Math.max(0, expenses - income);

    if (year > 0) {
      portfolio = portfolio * (1 + annualReturn) - netWithdrawal;
    }

    const ranOut = portfolio <= 0;
    if (ranOut) portfolio = 0;

    data.push({
      year,
      age,
      portfolio,
      withdrawal: netWithdrawal,
      ranOut: ranOut && year > 0,
    });

    if (ranOut && year > 0) break;
  }

  return data;
}

// ===== RETIREMENT LIFECYCLE CHART =====
function displayLifecycleChart(profile, retirementPortfolio, annualExpenses, otherIncome, fireTarget) {
  const canvas = document.getElementById("fire-lifecycle-canvas");
  if (!canvas) return;

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => displayLifecycleChart(profile, retirementPortfolio, annualExpenses, otherIncome, fireTarget));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 30, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const yearsToRetire = profile.retireAge - profile.currentAge;
  const retirementYears = profile.lifeExpectancy - profile.retireAge;
  const totalYears = yearsToRetire + retirementYears;

  // Accumulation data
  const accumData = [];
  for (let year = 0; year <= yearsToRetire; year++) {
    accumData.push({
      year,
      age: profile.currentAge + year,
      portfolio: futureValue(profile.portfolio, profile.monthlyContribution, profile.annualReturn, year),
    });
  }

  // Drawdown scenarios
  const scenarios = [
    { rate: 0.03, color: "#22c55e", label: "3%" },
    { rate: 0.04, color: "#a78bfa", label: "4%" },
    { rate: 0.05, color: "#f59e0b", label: "5%" },
    { rate: 0.06, color: "#f472b6", label: "6%" },
  ];

  scenarios.forEach((s) => {
    const yearlyWithdrawal = retirementPortfolio * s.rate;
    const adjustedExpenses = Math.max(yearlyWithdrawal, annualExpenses);
    s.data = buildDrawdownData(
      retirementPortfolio,
      adjustedExpenses,
      otherIncome,
      profile.annualReturn,
      profile.inflation,
      profile.retireAge,
      profile.lifeExpectancy,
    );
  });

  const maxPortfolio = Math.max(...accumData.map((d) => d.portfolio),...scenarios.flatMap((s) => s.data.map((d) => d.portfolio)),
    fireTarget * 1.1,
  );

  function toX(age) {
    return padding.left + ((age - profile.currentAge) / totalYears) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / maxPortfolio) * chartHeight;
  }

  function fromX(x) {
    return profile.currentAge + ((x - padding.left) / chartWidth) * totalYears;
  }

  function drawChart(highlightAge) {
    ctx.clearRect(0, 0, chart.width, chart.height);

    // Y-axis grid
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxPortfolio / ySteps) * i;
      const y = toY(value);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatCurrency(value), padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    const xStep = Math.ceil(totalYears / 10);
    for (let yr = 0; yr <= totalYears; yr += xStep) {
      const age = profile.currentAge + yr;
      const x = toX(age);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(`${age}`, x, chart.height - padding.bottom + 16);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Age", chart.width / 2, chart.height - 5);

    // Retirement line
    const retireX = toX(profile.retireAge);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(retireX, padding.top);
    ctx.lineTo(retireX, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("You retire here", retireX, padding.top - 10);

    // Drawdown fills (back to front so 3% is on top)
    [...scenarios].reverse().forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(toX(profile.retireAge), toY(retirementPortfolio));
      s.data.forEach((d) => {
        ctx.lineTo(toX(d.age), toY(d.portfolio));
      });
      const lastD = s.data[s.data.length - 1];
      ctx.lineTo(toX(lastD.age), toY(0));
      ctx.lineTo(toX(profile.retireAge), toY(0));
      ctx.closePath();
      ctx.fillStyle = s.color + "55";
      ctx.fill();
    });

    // Drawdown lines
    scenarios.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.data.forEach((d, i) => {
        const x = toX(d.age);
        const y = toY(d.portfolio);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Accumulation fill
    ctx.beginPath();
    ctx.moveTo(toX(profile.currentAge), toY(0));
    accumData.forEach((d) => ctx.lineTo(toX(d.age), toY(d.portfolio)));
    ctx.lineTo(toX(profile.retireAge), toY(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(45, 212, 191, 0.15)";
    ctx.fill();

    // Accumulation line
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    accumData.forEach((d, i) => {
      if (i === 0) ctx.moveTo(toX(d.age), toY(d.portfolio));
      else ctx.lineTo(toX(d.age), toY(d.portfolio));
    });
    ctx.stroke();

    // FIRE target line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(fireTarget));
    ctx.lineTo(chart.width - padding.right, toY(fireTarget));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ef4444";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`FIRE: ${formatCurrency(fireTarget)}`, padding.left + 4, toY(fireTarget) - 6);

    // Crosshair
    if (highlightAge !== null) {
      const hx = toX(highlightAge);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      const tooltipLines = [`Age ${Math.round(highlightAge)}`];

      if (highlightAge <= profile.retireAge) {
        const idx = Math.min(Math.round(highlightAge - profile.currentAge), accumData.length - 1);
        if (idx >= 0) {
          const d = accumData[idx];
          const hy = toY(d.portfolio);
          ctx.beginPath();
          ctx.arc(hx, hy, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#2dd4bf";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          tooltipLines.push(`Portfolio: ${formatCurrency(d.portfolio)}`);
          tooltipLines.push(`Gap to FIRE: ${formatCurrency(fireTarget - d.portfolio)}`);
        }
      } else {
        scenarios.forEach((s) => {
          const idx = Math.round(highlightAge - profile.retireAge);
          if (idx < s.data.length) {
            const d = s.data[idx];
            const hy = toY(d.portfolio);
            ctx.beginPath();
            ctx.arc(hx, hy, 4, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
            tooltipLines.push(`${s.label}: ${d.ranOut ? "💀 Ran out" : formatCurrency(d.portfolio)}`);
          }
        });
      }

      ctx.font = "12px sans-serif";
      const tooltipWidth = Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
      const tooltipHeight = tooltipLines.length * 20 + 16;
      let tx = hx + 15;
      let ty = padding.top + 10;
      if (tx + tooltipWidth > chart.width - padding.right) tx = hx - tooltipWidth - 15;
      if (ty + tooltipHeight > padding.top + chartHeight) ty = padding.top + chartHeight - tooltipHeight;

      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 1;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(tx + r, ty);
      ctx.lineTo(tx + tooltipWidth - r, ty);
      ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + r, r);
      ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - r);
      ctx.arcTo(tx + tooltipWidth, ty + tooltipHeight, tx + tooltipWidth - r, ty + tooltipHeight, r);
      ctx.lineTo(tx + r, ty + tooltipHeight);
      ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - r, r);
      ctx.lineTo(tx, ty + r);
      ctx.arcTo(tx, ty, tx + r, ty, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "left";
      tooltipLines.forEach((line, li) => {
        ctx.fillStyle = li === 0 ? "#e2e8f0" : "#94a3b8";
        ctx.font = li === 0 ? "bold 12px sans-serif" : "12px sans-serif";
        ctx.fillText(line, tx + 12, ty + 18 + li * 20);
      });
    }
  }

  drawChart(null);

  if (canvas._lifecycleController) canvas._lifecycleController.abort();
  canvas._lifecycleController = new AbortController();
  const { signal } = canvas._lifecycleController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = chart.width / r.width;
    const age = fromX((e.clientX - r.left) * scaleX);
    if (age >= profile.currentAge && age <= profile.lifeExpectancy) {
      canvas.style.cursor = "crosshair";
      drawChart(age);
    } else {
      canvas.style.cursor = "default";
      drawChart(null);
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal });
}

// ===== FIRE PROJECTION CHART (Canvas) =====
function displayFireChart(profile, fireTarget, yearsToRetire, coastFireNumber) {
  const canvas = document.getElementById("fire-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      displayFireChart(profile, fireTarget, yearsToRetire, coastFireNumber),
    );
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const totalYears = Math.max(yearsToRetire + 10, 40);
  const dataPoints = [];

  // Accumulation phase — with contributions up to retirement
  for (let year = 0; year <= yearsToRetire; year++) {
    const value = futureValue(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      year,
    );
    dataPoints.push({
      year,
      age: profile.currentAge + year,
      value,
      retired: false,
    });
  }

  // Post-retirement phase — no contributions, portfolio grows then draws down
  const retirementPortfolioValue = dataPoints[yearsToRetire].value;
  const annualWithdrawal = retirementPortfolioValue * (
    safeParseFloat(document.getElementById("fire-withdrawal-rate").value, 4) / 100
  );
  let postRetirementValue = retirementPortfolioValue;

  for (let year = 1; year <= totalYears - yearsToRetire; year++) {
    postRetirementValue = postRetirementValue * (1 + profile.annualReturn) - annualWithdrawal;
    if (postRetirementValue < 0) postRetirementValue = 0;
    dataPoints.push({
      year: yearsToRetire + year,
      age: profile.currentAge + yearsToRetire + year,
      value: postRetirementValue,
      retired: true,
    });
  }

  const maxValue = Math.max(
    fireTarget * 1.2,
    ...dataPoints.map((d) => d.value),
  );

  function toX(year) {
    return padding.left + (year / totalYears) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  function fromX(x) {
    return ((x - padding.left) / chartWidth) * totalYears;
  }

  // ── Offscreen static layer ──
  const offscreen = document.createElement("canvas");
  offscreen.width = chart.width;
  offscreen.height = chart.height;
  const offCtx = offscreen.getContext("2d");

  function drawStatic() {
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    // Grid
    offCtx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    offCtx.lineWidth = 1;

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      offCtx.beginPath();
      offCtx.moveTo(padding.left, y);
      offCtx.lineTo(offscreen.width - padding.right, y);
      offCtx.stroke();

      offCtx.fillStyle = "#94a3b8";
      offCtx.font = "11px sans-serif";
      offCtx.textAlign = "right";
      offCtx.fillText(formatCurrency(value), padding.left - 10, y + 4);
    }

    // X-axis labels
    offCtx.textAlign = "center";
    const xStep = Math.ceil(totalYears / 10);
    for (let year = 0; year <= totalYears; year += xStep) {
      const x = toX(year);
      const age = profile.currentAge + year;
      offCtx.fillStyle = "#94a3b8";
      offCtx.fillText(`${age}`, x, chart.height - padding.bottom + 20);

      offCtx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      offCtx.beginPath();
      offCtx.moveTo(x, padding.top);
      offCtx.lineTo(x, padding.top + chartHeight);
      offCtx.stroke();
    }

    offCtx.fillStyle = "#94a3b8";
    offCtx.font = "12px sans-serif";
    offCtx.fillText("Age", chart.width / 2, chart.height - 5);

    // FIRE target line
    offCtx.strokeStyle = "#ef4444";
    offCtx.lineWidth = 2;
    offCtx.setLineDash([8, 4]);
    offCtx.beginPath();
    offCtx.moveTo(padding.left, toY(fireTarget));
    offCtx.lineTo(offscreen.width - padding.right, toY(fireTarget));
    offCtx.stroke();
    offCtx.setLineDash([]);

    offCtx.fillStyle = "#ef4444";
    offCtx.font = "11px sans-serif";
    offCtx.textAlign = "left";
    offCtx.fillText(
      `FIRE: ${formatCurrency(fireTarget)}`,
      padding.left + 5,
      toY(fireTarget) - 8,
    );

    // Coast FIRE threshold curve
    if (coastFireNumber) {
      offCtx.strokeStyle = "#f59e0b";
      offCtx.lineWidth = 2;
      offCtx.setLineDash([6, 3]);
      offCtx.beginPath();
      for (let year = 0; year <= totalYears; year++) {
        const remainingYears = profile.retireAge - profile.currentAge - year;
        if (remainingYears <= 0) break;
        const threshold =
          fireTarget / Math.pow(1 + profile.annualReturn, remainingYears);
        const x = toX(year);
        const y = toY(threshold);
        if (year === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      }
      offCtx.stroke();
      offCtx.setLineDash([]);

      offCtx.fillStyle = "#f59e0b";
      offCtx.font = "11px sans-serif";
      offCtx.textAlign = "left";
      offCtx.fillText(
        `Coast: ${formatCurrency(coastFireNumber)}`,
        padding.left + 5,
        toY(coastFireNumber) - 8,
      );

      const coastCrossing = dataPoints.find((d) => {
        const remainingYears = profile.retireAge - d.age;
        if (remainingYears <= 0) return false;
        const threshold =
          fireTarget / Math.pow(1 + profile.annualReturn, remainingYears);
        return d.value >= threshold;
      });

      if (coastCrossing) {
        const remainingYears = profile.retireAge - coastCrossing.age;
        const threshold =
          fireTarget / Math.pow(1 + profile.annualReturn, remainingYears);
        const cx = toX(coastCrossing.year);
        const cy = toY(threshold);

        offCtx.beginPath();
        offCtx.arc(cx, cy, 6, 0, Math.PI * 2);
        offCtx.fillStyle = "#f59e0b";
        offCtx.fill();
        offCtx.strokeStyle = "#0f172a";
        offCtx.lineWidth = 2;
        offCtx.stroke();

        offCtx.fillStyle = "#f59e0b";
        offCtx.font = "bold 11px sans-serif";
        offCtx.textAlign = "center";
        offCtx.fillText(`Coast Age ${coastCrossing.age}`, cx, cy - 12);
      }
    }

    // Retirement age line
    const retireX = toX(yearsToRetire);
    offCtx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    offCtx.lineWidth = 1;
    offCtx.setLineDash([4, 4]);
    offCtx.beginPath();
    offCtx.moveTo(retireX, padding.top);
    offCtx.lineTo(retireX, padding.top + chartHeight);
    offCtx.stroke();
    offCtx.setLineDash([]);

    offCtx.fillStyle = "#94a3b8";
    offCtx.textAlign = "center";
    offCtx.fillText(`Retire: ${profile.retireAge}`, retireX, padding.top - 10);

    // Accumulation line
    const accumPoints = dataPoints.filter((d) => !d.retired);
    const retirePoints = dataPoints.filter((d) => d.retired);

    offCtx.strokeStyle = "#2dd4bf";
    offCtx.lineWidth = 3;
    offCtx.beginPath();
    accumPoints.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) offCtx.moveTo(x, y);
      else offCtx.lineTo(x, y);
    });
    offCtx.stroke();

    // Fill under accumulation
    offCtx.lineTo(toX(yearsToRetire), toY(0));
    offCtx.lineTo(toX(0), toY(0));
    offCtx.closePath();
    offCtx.fillStyle = "rgba(45, 212, 191, 0.1)";
    offCtx.fill();

    // Post-retirement drawdown line
    if (retirePoints.length > 0) {
      offCtx.strokeStyle = "#f59e0b";
      offCtx.lineWidth = 3;
      offCtx.beginPath();
      offCtx.moveTo(toX(yearsToRetire), toY(retirementPortfolioValue));
      retirePoints.forEach((point) => {
        offCtx.lineTo(toX(point.year), toY(point.value));
      });
      offCtx.stroke();

      const lastRetire = retirePoints[retirePoints.length - 1];
      offCtx.lineTo(toX(lastRetire.year), toY(0));
      offCtx.lineTo(toX(yearsToRetire), toY(0));
      offCtx.closePath();
      offCtx.fillStyle = "rgba(245, 158, 11, 0.1)";
      offCtx.fill();
    }

    // FIRE crossing point
    const crossingPoint = dataPoints.find((d) => d.value >= fireTarget);
    if (crossingPoint) {
      const cx = toX(crossingPoint.year);
      const cy = toY(crossingPoint.value);

      offCtx.beginPath();
      offCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      offCtx.fillStyle = "#2dd4bf";
      offCtx.fill();
      offCtx.strokeStyle = "#0f172a";
      offCtx.lineWidth = 2;
      offCtx.stroke();

      offCtx.fillStyle = "#2dd4bf";
      offCtx.font = "bold 11px sans-serif";
      offCtx.textAlign = "center";
      offCtx.fillText(`Age ${crossingPoint.age}`, cx, cy - 12);
    }
  }

  drawStatic();

  function drawChart(highlightYear) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(offscreen, 0, 0);

    // Hover crosshair and tooltip
    if (
      highlightYear !== null &&
      highlightYear >= 0 &&
      highlightYear <= totalYears
    ) {
      const yearIndex = Math.round(highlightYear);
      if (yearIndex >= 0 && yearIndex < dataPoints.length) {
        const point = dataPoints[yearIndex];
        const hx = toX(point.year);
        const hy = toY(point.value);

        // Crosshair line
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, padding.top);
        ctx.lineTo(hx, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot on line
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#2dd4bf";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tooltip background
        const gap = point.value - fireTarget;
        const gapText =
          gap >= 0
            ? `✅ ${formatCurrency(gap)} above FIRE`
            : `❌ ${formatCurrency(Math.abs(gap))} below FIRE`;

        const tooltipLines = [
          `Age ${point.age}`,
          `Portfolio: ${formatCurrency(point.value)}`,
          gapText,
        ];

        ctx.font = "12px sans-serif";
        const tooltipWidth =
          Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 20;
        const tooltipHeight = tooltipLines.length * 20 + 12;

        let tx = hx + 15;
        let ty = hy - tooltipHeight / 2;

        // Keep tooltip on screen
        if (tx + tooltipWidth > chart.width - padding.right) {
          tx = hx - tooltipWidth - 15;
        }
        if (ty < padding.top) ty = padding.top;
        if (ty + tooltipHeight > padding.top + chartHeight) {
          ty = padding.top + chartHeight - tooltipHeight;
        }

        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.lineWidth = 1;

        // Rounded rect
        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(tx + radius, ty);
        ctx.lineTo(tx + tooltipWidth - radius, ty);
        ctx.arcTo(
          tx + tooltipWidth,
          ty,
          tx + tooltipWidth,
          ty + radius,
          radius,
        );
        ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
        ctx.arcTo(
          tx + tooltipWidth,
          ty + tooltipHeight,
          tx + tooltipWidth - radius,
          ty + tooltipHeight,
          radius,
        );
        ctx.lineTo(tx + radius, ty + tooltipHeight);
        ctx.arcTo(
          tx,
          ty + tooltipHeight,
          tx,
          ty + tooltipHeight - radius,
          radius,
        );
        ctx.lineTo(tx, ty + radius);
        ctx.arcTo(tx, ty, tx + radius, ty, radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Tooltip text
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(tooltipLines[0], tx + 10, ty + 18);

        ctx.font = "12px sans-serif";
        ctx.fillText(tooltipLines[1], tx + 10, ty + 38);

        ctx.fillStyle = gap >= 0 ? "#2dd4bf" : "#f472b6";
        ctx.fillText(tooltipLines[2], tx + 10, ty + 58);
      }
    }
  }

  // Initial draw
  drawChart(null);

  // Mouse interaction
  if (canvas._fireController) canvas._fireController.abort();
  canvas._fireController = new AbortController();
  const { signal: fireSignal } = canvas._fireController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const year = fromX(mouseX);

    if (year >= 0 && year <= totalYears) {
      canvas.style.cursor = "crosshair";
      drawChart(year);
    } else {
      canvas.style.cursor = "default";
      drawChart(null);
    }
  }), { signal: fireSignal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal: fireSignal });
}

// ===== COAST FIRE CHART (Canvas) =====
function displayCoastChart(
  profile,
  fireTarget,
  coastFireNumber,
  yearsToRetire,
) {
  const canvas = document.getElementById("coast-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      displayCoastChart(profile, fireTarget, coastFireNumber, yearsToRetire),
    );
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const totalYears = yearsToRetire + 5;

  // Portfolio projection (with contributions)
  const portfolioData = [];
  for (let year = 0; year <= totalYears; year++) {
    const value = futureValue(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      year,
    );
    portfolioData.push({
      year: year,
      age: profile.currentAge + year,
      value: value,
    });
  }

  // Coast threshold curve
  const coastData = [];
  for (let year = 0; year <= yearsToRetire; year++) {
    const remainingYears = yearsToRetire - year;
    const threshold =
      remainingYears > 0
        ? fireTarget / Math.pow(1 + profile.annualReturn, remainingYears)
        : fireTarget;
    coastData.push({
      year: year,
      age: profile.currentAge + year,
      value: threshold,
    });
  }

  const maxValue = Math.max(
    fireTarget * 1.2,
    ...portfolioData.map((d) => d.value),
  );

  function toX(year) {
    return padding.left + (year / totalYears) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  function fromX(x) {
    return ((x - padding.left) / chartWidth) * totalYears;
  }

  // ── Offscreen static layer ──
  const offscreenCoast = document.createElement("canvas");
  offscreenCoast.width = chart.width;
  offscreenCoast.height = chart.height;
  const offCtxCoast = offscreenCoast.getContext("2d");

  function drawStaticCoast() {
    offCtxCoast.clearRect(0, 0, offscreenCoast.width, offscreenCoast.height);

    // Grid
    offCtxCoast.strokeStyle = "rgba(148, 163, 184, 0.15)";
    offCtxCoast.lineWidth = 1;
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      offCtxCoast.beginPath();
      offCtxCoast.moveTo(padding.left, y);
      offCtxCoast.lineTo(offscreenCoast.width - padding.right, y);
      offCtxCoast.stroke();
      offCtxCoast.fillStyle = "#94a3b8";
      offCtxCoast.font = "11px sans-serif";
      offCtxCoast.textAlign = "right";
      offCtxCoast.fillText(formatCurrency(value), padding.left - 10, y + 4);
    }

    // X-axis
    offCtxCoast.textAlign = "center";
    const xStep = Math.ceil(totalYears / 10);
    for (let year = 0; year <= totalYears; year += xStep) {
      const x = toX(year);
      const age = profile.currentAge + year;
      offCtxCoast.fillStyle = "#94a3b8";
      offCtxCoast.fillText(`${age}`, x, chart.height - padding.bottom + 20);
    }

    offCtxCoast.fillStyle = "#94a3b8";
    offCtxCoast.font = "12px sans-serif";
    offCtxCoast.fillText("Age", chart.width / 2, chart.height - 5);

    // FIRE target line
    offCtxCoast.strokeStyle = "#ef4444";
    offCtxCoast.lineWidth = 2;
    offCtxCoast.setLineDash([8, 4]);
    offCtxCoast.beginPath();
    offCtxCoast.moveTo(padding.left, toY(fireTarget));
    offCtxCoast.lineTo(offscreenCoast.width - padding.right, toY(fireTarget));
    offCtxCoast.stroke();
    offCtxCoast.setLineDash([]);
    offCtxCoast.fillStyle = "#ef4444";
    offCtxCoast.font = "11px sans-serif";
    offCtxCoast.textAlign = "left";
    offCtxCoast.fillText(`FIRE: ${formatCurrency(fireTarget)}`, padding.left + 5, toY(fireTarget) - 8);

    // Retirement age line
    const retireX = toX(yearsToRetire);
    offCtxCoast.strokeStyle = "rgba(148, 163, 184, 0.4)";
    offCtxCoast.lineWidth = 1;
    offCtxCoast.setLineDash([4, 4]);
    offCtxCoast.beginPath();
    offCtxCoast.moveTo(retireX, padding.top);
    offCtxCoast.lineTo(retireX, padding.top + chartHeight);
    offCtxCoast.stroke();
    offCtxCoast.setLineDash([]);
    offCtxCoast.fillStyle = "#94a3b8";
    offCtxCoast.textAlign = "center";
    offCtxCoast.fillText(`Retire: ${profile.retireAge}`, retireX, padding.top - 10);

    // Coast threshold curve
    offCtxCoast.strokeStyle = "#f59e0b";
    offCtxCoast.lineWidth = 2;
    offCtxCoast.setLineDash([6, 3]);
    offCtxCoast.beginPath();
    coastData.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) offCtxCoast.moveTo(x, y);
      else offCtxCoast.lineTo(x, y);
    });
    offCtxCoast.stroke();
    offCtxCoast.setLineDash([]);
    offCtxCoast.fillStyle = "#f59e0b";
    offCtxCoast.font = "11px sans-serif";
    offCtxCoast.textAlign = "left";
    offCtxCoast.fillText("Coast Threshold", toX(0) + 5, toY(coastData[0].value) - 8);

    // Portfolio line
    offCtxCoast.strokeStyle = "#2dd4bf";
    offCtxCoast.lineWidth = 3;
    offCtxCoast.beginPath();
    portfolioData.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) offCtxCoast.moveTo(x, y);
      else offCtxCoast.lineTo(x, y);
    });
    offCtxCoast.stroke();
    offCtxCoast.lineTo(toX(totalYears), toY(0));
    offCtxCoast.lineTo(toX(0), toY(0));
    offCtxCoast.closePath();
    offCtxCoast.fillStyle = "rgba(45, 212, 191, 0.1)";
    offCtxCoast.fill();

    // Coast crossing point
    for (let i = 1; i < portfolioData.length && i < coastData.length; i++) {
      if (portfolioData[i].value >= coastData[i].value && portfolioData[i-1].value < coastData[i-1].value) {
        const cx = toX(portfolioData[i].year);
        const cy = toY(portfolioData[i].value);
        offCtxCoast.beginPath();
        offCtxCoast.arc(cx, cy, 6, 0, Math.PI * 2);
        offCtxCoast.fillStyle = "#f59e0b";
        offCtxCoast.fill();
        offCtxCoast.strokeStyle = "#0f172a";
        offCtxCoast.lineWidth = 2;
        offCtxCoast.stroke();
        offCtxCoast.fillStyle = "#f59e0b";
        offCtxCoast.font = "bold 11px sans-serif";
        offCtxCoast.textAlign = "center";
        offCtxCoast.fillText(`Coast: Age ${portfolioData[i].age}`, cx, cy - 12);
        break;
      }
    }

    // FIRE crossing point
    for (let i = 1; i < portfolioData.length; i++) {
      if (portfolioData[i].value >= fireTarget && portfolioData[i-1].value < fireTarget) {
        const cx = toX(portfolioData[i].year);
        const cy = toY(portfolioData[i].value);
        offCtxCoast.beginPath();
        offCtxCoast.arc(cx, cy, 6, 0, Math.PI * 2);
        offCtxCoast.fillStyle = "#2dd4bf";
        offCtxCoast.fill();
        offCtxCoast.strokeStyle = "#0f172a";
        offCtxCoast.lineWidth = 2;
        offCtxCoast.stroke();
        offCtxCoast.fillStyle = "#2dd4bf";
        offCtxCoast.font = "bold 11px sans-serif";
        offCtxCoast.textAlign = "center";
        offCtxCoast.fillText(`FIRE: Age ${portfolioData[i].age}`, cx, cy - 12);
        break;
      }
    }
  }

  drawStaticCoast();

  function drawChart(highlightYear) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(offscreenCoast, 0, 0);

    // Hover crosshair and tooltip
    if (
      highlightYear !== null &&
      highlightYear >= 0 &&
      highlightYear <= totalYears
    ) {
      const yearIndex = Math.round(highlightYear);
      if (yearIndex >= 0 && yearIndex < portfolioData.length) {
        const point = portfolioData[yearIndex];
        const hx = toX(point.year);
        const hy = toY(point.value);

        // Crosshair
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, padding.top);
        ctx.lineTo(hx, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot on portfolio line
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#2dd4bf";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dot on coast threshold (if in range)
        let coastVal = null;
        if (yearIndex < coastData.length) {
          coastVal = coastData[yearIndex].value;
          const coastY = toY(coastVal);
          ctx.beginPath();
          ctx.arc(hx, coastY, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Tooltip
        const fireGap = point.value - fireTarget;
        const coastGap = coastVal !== null ? point.value - coastVal : null;

        const tooltipLines = [
          `Age ${point.age}`,
          `Portfolio: ${formatCurrency(point.value)}`,
        ];

        if (coastGap !== null) {
          tooltipLines.push(`Coast Threshold: ${formatCurrency(coastVal)}`);
          tooltipLines.push(
            coastGap >= 0
              ? `✅ ${formatCurrency(coastGap)} above Coast`
              : `❌ ${formatCurrency(Math.abs(coastGap))} below Coast`,
          );
        }

        tooltipLines.push(
          fireGap >= 0
            ? `✅ ${formatCurrency(fireGap)} above FIRE`
            : `❌ ${formatCurrency(Math.abs(fireGap))} below FIRE`,
        );

        ctx.font = "12px sans-serif";
        const tooltipWidth =
          Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 20;
        const tooltipHeight = tooltipLines.length * 20 + 12;

        let tx = hx + 15;
        let ty = hy - tooltipHeight / 2;

        if (tx + tooltipWidth > chart.width - padding.right) {
          tx = hx - tooltipWidth - 15;
        }
        if (ty < padding.top) ty = padding.top;
        if (ty + tooltipHeight > padding.top + chartHeight) {
          ty = padding.top + chartHeight - tooltipHeight;
        }

        // Tooltip background
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.lineWidth = 1;

        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(tx + radius, ty);
        ctx.lineTo(tx + tooltipWidth - radius, ty);
        ctx.arcTo(
          tx + tooltipWidth,
          ty,
          tx + tooltipWidth,
          ty + radius,
          radius,
        );
        ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
        ctx.arcTo(
          tx + tooltipWidth,
          ty + tooltipHeight,
          tx + tooltipWidth - radius,
          ty + tooltipHeight,
          radius,
        );
        ctx.lineTo(tx + radius, ty + tooltipHeight);
        ctx.arcTo(
          tx,
          ty + tooltipHeight,
          tx,
          ty + tooltipHeight - radius,
          radius,
        );
        ctx.lineTo(tx, ty + radius);
        ctx.arcTo(tx, ty, tx + radius, ty, radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Tooltip text
        ctx.textAlign = "left";
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(tooltipLines[0], tx + 10, ty + 18);

        ctx.font = "12px sans-serif";
        for (let i = 1; i < tooltipLines.length; i++) {
          const line = tooltipLines[i];
          if (line.startsWith("✅")) {
            ctx.fillStyle = "#2dd4bf";
          } else if (line.startsWith("❌")) {
            ctx.fillStyle = "#f472b6";
          } else if (line.startsWith("Coast")) {
            ctx.fillStyle = "#f59e0b";
          } else {
            ctx.fillStyle = "#e2e8f0";
          }
          ctx.fillText(line, tx + 10, ty + 18 + i * 20);
        }
      }
    }
  }

  // Initial draw
  drawChart(null);

  // Mouse interaction
  if (canvas._coastController) canvas._coastController.abort();
  canvas._coastController = new AbortController();
  const { signal: coastSignal } = canvas._coastController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const year = fromX(mouseX);

    if (year >= 0 && year <= totalYears) {
      canvas.style.cursor = "crosshair";
      drawChart(year);
    } else {
      canvas.style.cursor = "default";
      drawChart(null);
    }
  }), { signal: coastSignal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal: coastSignal });
}

// ===================================================================
// RESIZE HANDLER
// ===================================================================

let fireResizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(fireResizeTimeout);
  fireResizeTimeout = setTimeout(() => {
    const fireChartSection = document.getElementById("fire-chart-section");
    const coastChartSection = document.getElementById("coast-chart-section");
    if (fireChartSection && !fireChartSection.classList.contains("hidden")) {
      fireCalculateBtn.click();
    } else if (coastChartSection && !coastChartSection.classList.contains("hidden")) {
      coastCalculateBtn.click();
    }
  }, 250);
});

// ===================================================================
// FUTURE VALUE INCOME TOGGLE
// ===================================================================

document
  .getElementById("fire-income-type")
  .addEventListener("change", function () {
    const fvOptions = document.getElementById("fire-fv-options");
    if (this.value === "fv") {
      fvOptions.classList.remove("hidden");
      updateIncomePVDisplay();
    } else {
      fvOptions.classList.add("hidden");
    }
  });

document
  .getElementById("fire-other-income")
  .addEventListener("input", updateIncomePVDisplay);
document
  .getElementById("fire-income-start-age")
  .addEventListener("input", updateIncomePVDisplay);
document
  .getElementById("fire-inflation")
  .addEventListener("input", updateIncomePVDisplay);
document
  .getElementById("fire-current-age")
  .addEventListener("input", updateIncomePVDisplay);

function updateIncomePVDisplay() {
  const type = document.getElementById("fire-income-type").value;
  if (type !== "fv") return;

  const fv =
    safeParseFloat(document.getElementById("fire-other-income").value, 0);
  const startAge =
    safeParseFloat(document.getElementById("fire-income-start-age").value, 0);
  const currentAge =
    safeParseFloat(document.getElementById("fire-current-age").value, 0);
  const inflation =
    (safeParseFloat(document.getElementById("fire-inflation").value, 3)) / 100;

  const display = document.getElementById("fire-income-pv-display");

  if (!fv || !startAge || !currentAge || startAge <= currentAge) {
    display.textContent = "—";
    return;
  }

  const years = startAge - currentAge;
  const pv = fv / Math.pow(1 + inflation, years);
  display.textContent =
    "$" + pv.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ===================================================================
// AUTO-SAVE & RESTORE INPUTS
// ===================================================================

const FIRE_STORAGE_KEY = "fire_inputs";

const FIRE_FIELDS = [
  "fire-current-age",
  "fire-retire-age",
  "fire-life-expectancy",
  "fire-current-portfolio",
  "fire-monthly-contribution",
  "fire-annual-return",
  "fire-inflation",
  "fire-annual-expenses",
  "fire-withdrawal-rate",
  "fire-other-income",
  "fire-income-type",
  "fire-income-start-age",
  "coast-fire-number",
];

function saveFireInputs() {
  const data = {};
  FIRE_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.value) {
      data[id] = el.value;
    }
  });
  localStorage.setItem(FIRE_STORAGE_KEY, JSON.stringify(data));
}

function loadFireInputs() {
  try {
    const data = JSON.parse(localStorage.getItem(FIRE_STORAGE_KEY));
    if (!data) return;
    Object.entries(data).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    // Show FV options if saved as future value
    if (data["fire-income-type"] === "fv") {
      document.getElementById("fire-fv-options").classList.remove("hidden");
      updateIncomePVDisplay();
    }
  } catch {
    // ignore
  }
}

// Load saved inputs on page load
loadFireInputs();

// Save on every input change
FIRE_FIELDS.forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", saveFireInputs);
  }
});
