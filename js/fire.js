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
document.querySelectorAll(".calc-form input").forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!coastFireTab.classList.contains("hidden")) {
        handleCoastCalculate();
      } else {
        handleFireCalculate();
      }
    }
  });
});

// ===== FORMATTING =====
function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ===== GET PROFILE VALUES =====
function getProfile() {
  return {
    currentAge: parseInt(document.getElementById("fire-current-age").value),
    retireAge: parseInt(document.getElementById("fire-retire-age").value),
    portfolio:
      parseFloat(document.getElementById("fire-current-portfolio").value) || 0,
    monthlyContribution:
      parseFloat(document.getElementById("fire-monthly-contribution").value) ||
      0,
    annualReturn:
      parseFloat(document.getElementById("fire-annual-return").value) / 100,
    inflation:
      parseFloat(document.getElementById("fire-inflation").value) / 100,
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
function yearsToTarget(currentValue, monthlyContribution, annualRate, target) {
  if (currentValue >= target) return 0;

  const monthlyRate = annualRate / 12;
  let balance = currentValue;

  for (let month = 1; month <= 1200; month++) {
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
  const annualExpenses = parseFloat(
    document.getElementById("fire-annual-expenses").value,
  );
  const withdrawalRate =
    parseFloat(document.getElementById("fire-withdrawal-rate").value) / 100;
  const otherIncomeRaw =
    parseFloat(document.getElementById("fire-other-income").value) || 0;
  const incomeType = document.getElementById("fire-income-type").value;
  let otherIncome = otherIncomeRaw;

  if (incomeType === "fv") {
    const startAge =
      parseFloat(document.getElementById("fire-income-start-age").value) || 0;
    const inflation =
      (parseFloat(document.getElementById("fire-inflation").value) || 3) / 100;
    const years = startAge - profile.currentAge;
    if (years > 0) {
      otherIncome = otherIncomeRaw / Math.pow(1 + inflation, years);
    }
  }
  // Validate
  if (!profile.currentAge || !profile.retireAge) {
    alert(
      "Please fill in your current age and target retirement age in the Profile section.",
    );
    return;
  }

  if (!annualExpenses || !withdrawalRate) {
    alert("Please enter your annual expenses and withdrawal rate.");
    return;
  }

  if (profile.retireAge <= profile.currentAge) {
    alert("Target retirement age must be greater than current age.");
    return;
  }

  const yearsToRetire = profile.retireAge - profile.currentAge;

  // Portfolio must cover = expenses minus other income
  const portfolioMustCover = Math.max(0, annualExpenses - otherIncome);

  // FIRE number in today's dollars
  const fireNumberToday = portfolioMustCover / withdrawalRate;

  // FIRE number in future dollars (inflation adjusted)
  const fireNumberFuture =
    fireNumberToday * Math.pow(1 + profile.inflation, yearsToRetire);

  // Store for Coast FIRE tab
  calculatedFireNumber = fireNumberToday;
  calculatedFireNumberFuture = fireNumberFuture;

  // Auto-fill coast fire input
  const coastInput = document.getElementById("coast-fire-number");
  coastInput.value = Math.round(fireNumberFuture);

  // Years to FIRE at current rate (using real return)
  const realReturn = (1 + profile.annualReturn) / (1 + profile.inflation) - 1;
  const yearsAtCurrentRate = yearsToTarget(
    profile.portfolio,
    profile.monthlyContribution,
    profile.annualReturn,
    fireNumberFuture,
  );

  const retireAgeAtCurrentRate = profile.currentAge + yearsAtCurrentRate;

  // Monthly needed to hit target by retirement age
  const monthlyNeededAmount = monthlyNeeded(
    profile.portfolio,
    profile.annualReturn,
    fireNumberFuture,
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
  displayFireSensitivity(portfolioMustCover, profile, yearsToRetire);

  // Show results
  document.getElementById("fire-number-results").classList.remove("hidden");
  document
    .getElementById("fire-sensitivity-section")
    .classList.remove("hidden");
  document.getElementById("fire-chart-section").classList.remove("hidden");
  document.getElementById("fire-progress-section").classList.remove("hidden");

  // Compute Coast FIRE number for chart overlay
  const coastFireForChart =
    fireNumberFuture / Math.pow(1 + profile.annualReturn, yearsToRetire);

  // Projection chart
  displayFireChart(profile, fireNumberFuture, yearsToRetire, coastFireForChart);

  document
    .getElementById("fire-number-results")
    .scrollIntoView({ behavior: "smooth" });
}

// ===== COAST FIRE CALCULATION =====
function handleCoastCalculate() {
  const profile = getProfile();
  const fireTarget = parseFloat(
    document.getElementById("coast-fire-number").value,
  );

  // Validate
  if (!profile.currentAge || !profile.retireAge) {
    alert(
      "Please fill in your current age and target retirement age in the Profile section.",
    );
    return;
  }

  if (!fireTarget || fireTarget <= 0) {
    alert(
      "Please enter a FIRE number target. Calculate your FIRE Number first, or enter one manually.",
    );
    return;
  }

  if (profile.retireAge <= profile.currentAge) {
    alert("Target retirement age must be greater than current age.");
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
  displayCoastChart(profile, fireTarget, coastFireNumber, yearsToRetire);

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
function displayFireSensitivity(portfolioMustCover, profile, yearsToRetire) {
  const tbody = document.getElementById("fire-sensitivity-body");
  tbody.innerHTML = "";

  const rates = [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 5, 5.5, 6];
  const currentRate = parseFloat(
    document.getElementById("fire-withdrawal-rate").value,
  );

  function getRiskLabel(rate) {
    if (rate <= 3.5) return { label: "🟢 Very Safe", color: "var(--accent)" };
    if (rate <= 4.25) return { label: "🟡 Moderate", color: "#f59e0b" };
    if (rate <= 5) return { label: "🟠 Aggressive", color: "#f97316" };
    return { label: "🔴 Risky", color: "#f472b6" };
  }

  rates.forEach((rate) => {
    const fireNum = portfolioMustCover / (rate / 100);
    const fireNumFuture =
      fireNum * Math.pow(1 + profile.inflation, yearsToRetire);
    const monthlyWithdrawal = (fireNumFuture * (rate / 100)) / 12;
    const years = yearsToTarget(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      fireNumFuture,
    );

    const risk = getRiskLabel(rate);
    const tr = document.createElement("tr");
    const isActive = Math.abs(rate - currentRate) < 0.01;

    tr.innerHTML = `
      <td style="${isActive ? "color: var(--accent); font-weight: 700;" : ""}">${rate}%</td>
      <td>${formatCurrency(fireNumFuture)}</td>
      <td>${formatCurrency(monthlyWithdrawal)}</td>
      <td style="color: ${years <= yearsToRetire ? "var(--accent)" : "#f472b6"}">${years === Infinity ? "Not reachable" : years.toFixed(1) + " yrs"}</td>
      <td style="color: ${risk.color}">${risk.label}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== FIRE PROJECTION CHART (Canvas) =====
function displayFireChart(profile, fireTarget, yearsToRetire, coastFireNumber) {
  const canvas = document.getElementById("fire-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0) {
    requestAnimationFrame(() =>
      displayFireChart(profile, fireTarget, yearsToRetire, coastFireNumber),
    );
    return;
  }
  const chart = createChartContext(canvas, rect.width, 350);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const totalYears = Math.max(yearsToRetire + 10, 40);
  const dataPoints = [];

  for (let year = 0; year <= totalYears; year++) {
    const value = futureValue(
      profile.portfolio,
      profile.monthlyContribution,
      profile.annualReturn,
      year,
    );
    dataPoints.push({
      year: year,
      age: profile.currentAge + year,
      value: value,
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

  function drawChart(highlightYear) {
    ctx.clearRect(0, 0, chart.width, chart.height);

    // Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      const label =
        value >= 1000000
          ? `$${(value / 1000000).toFixed(1)}M`
          : `$${(value / 1000).toFixed(0)}k`;
      ctx.fillText(label, padding.left - 10, y + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    const xStep = Math.ceil(totalYears / 10);
    for (let year = 0; year <= totalYears; year += xStep) {
      const x = toX(year);
      const age = profile.currentAge + year;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${age}`, x, chart.height - padding.bottom + 20);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("Age", chart.width / 2, chart.height - 5);

    // FIRE target line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(fireTarget));
    ctx.lineTo(chart.width - padding.right, toY(fireTarget));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ef4444";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `FIRE: ${formatCurrency(fireTarget)}`,
      padding.left + 5,
      toY(fireTarget) - 8,
    );

    // Coast FIRE threshold curve
    if (coastFireNumber) {
      // Draw the coast threshold as a declining curve
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      for (let year = 0; year <= totalYears; year++) {
        const remainingYears = profile.retireAge - profile.currentAge - year;
        if (remainingYears <= 0) break;
        const threshold =
          fireTarget / Math.pow(1 + profile.annualReturn, remainingYears);
        const x = toX(year);
        const y = toY(threshold);
        if (year === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = "#f59e0b";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `Coast: ${formatCurrency(coastFireNumber)}`,
        padding.left + 5,
        toY(coastFireNumber) - 8,
      );

      // Find and mark the Coast FIRE crossing point
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

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Coast Age ${coastCrossing.age}`, cx, cy - 12);
      }
    }

    // Retirement age line
    const retireX = toX(yearsToRetire);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(retireX, padding.top);
    ctx.lineTo(retireX, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`Retire: ${profile.retireAge}`, retireX, padding.top - 10);

    // Portfolio line
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    dataPoints.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(toX(totalYears), toY(0));
    ctx.lineTo(toX(0), toY(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(45, 212, 191, 0.1)";
    ctx.fill();

    // FIRE crossing point
    const crossingPoint = dataPoints.find((d) => d.value >= fireTarget);
    if (crossingPoint) {
      const cx = toX(crossingPoint.year);
      const cy = toY(crossingPoint.value);

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#2dd4bf";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#2dd4bf";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Age ${crossingPoint.age}`, cx, cy - 12);
    }

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
  canvas.addEventListener("mousemove", (e) => {
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
  });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  });
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
  if (rect.width === 0) {
    requestAnimationFrame(() =>
      displayCoastChart(profile, fireTarget, coastFireNumber, yearsToRetire),
    );
    return;
  }
  const chart = createChartContext(canvas, rect.width, 350);
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

  function drawChart(highlightYear) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    // Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      const label =
        value >= 1000000
          ? `$${(value / 1000000).toFixed(1)}M`
          : `$${(value / 1000).toFixed(0)}k`;
      ctx.fillText(label, padding.left - 10, y + 4);
    }

    // X-axis
    ctx.textAlign = "center";
    const xStep = Math.ceil(totalYears / 10);
    for (let year = 0; year <= totalYears; year += xStep) {
      const x = toX(year);
      const age = profile.currentAge + year;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${age}`, x, chart.height - padding.bottom + 20);
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("Age", chart.width / 2, chart.height - 5);

    // FIRE target line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(fireTarget));
    ctx.lineTo(chart.width - padding.right, toY(fireTarget));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ef4444";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `FIRE: ${formatCurrency(fireTarget)}`,
      padding.left + 5,
      toY(fireTarget) - 8,
    );

    // Retirement age line
    const retireX = toX(yearsToRetire);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(retireX, padding.top);
    ctx.lineTo(retireX, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`Retire: ${profile.retireAge}`, retireX, padding.top - 10);

    // Coast threshold curve
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    coastData.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Coast Threshold", toX(0) + 5, toY(coastData[0].value) - 8);

    // Portfolio line
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 3;
    ctx.beginPath();
    portfolioData.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under portfolio
    ctx.lineTo(toX(totalYears), toY(0));
    ctx.lineTo(toX(0), toY(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(45, 212, 191, 0.1)";
    ctx.fill();

    // Coast crossing point
    for (let i = 1; i < portfolioData.length && i < coastData.length; i++) {
      if (
        portfolioData[i].value >= coastData[i].value &&
        portfolioData[i - 1].value < coastData[i - 1].value
      ) {
        const cx = toX(portfolioData[i].year);
        const cy = toY(portfolioData[i].value);

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Coast: Age ${portfolioData[i].age}`, cx, cy - 12);
        break;
      }
    }

    // FIRE crossing point
    for (let i = 1; i < portfolioData.length; i++) {
      if (
        portfolioData[i].value >= fireTarget &&
        portfolioData[i - 1].value < fireTarget
      ) {
        const cx = toX(portfolioData[i].year);
        const cy = toY(portfolioData[i].value);

        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#2dd4bf";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#2dd4bf";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`FIRE: Age ${portfolioData[i].age}`, cx, cy - 12);
        break;
      }
    }

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
  canvas.addEventListener("mousemove", (e) => {
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
  });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  });
}

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
    parseFloat(document.getElementById("fire-other-income").value) || 0;
  const startAge =
    parseFloat(document.getElementById("fire-income-start-age").value) || 0;
  const currentAge =
    parseFloat(document.getElementById("fire-current-age").value) || 0;
  const inflation =
    (parseFloat(document.getElementById("fire-inflation").value) || 3) / 100;

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
