// ===== CONSTANTS =====
const SP500_NOMINAL = 10.5;
const SP500_REAL = 7.0;

// ===== DOM ELEMENTS =====
const calculateBtn = document.getElementById("proj-calculate-btn");
const nominalBtn = document.getElementById("proj-nominal-btn");
const realBtn = document.getElementById("proj-real-btn");

let currentView = "nominal";
let storedProjections = null;
let projectionChartController = null;
let storedInputs = null;

// ===== EVENT LISTENERS =====
calculateBtn.addEventListener("click", handleCalculate);

nominalBtn.addEventListener("click", () => {
  if (currentView === "nominal") return;
  currentView = "nominal";
  nominalBtn.classList.add("active");
  realBtn.classList.remove("active");
  if (storedProjections && storedInputs) {
    displayChart(storedProjections, storedInputs, "nominal");
  }
});

realBtn.addEventListener("click", () => {
  if (currentView === "real") return;
  currentView = "real";
  realBtn.classList.add("active");
  nominalBtn.classList.remove("active");
  if (storedProjections && storedInputs) {
    displayChart(storedProjections, storedInputs, "real");
  }
});

// Enter key
bindFormEnter(() => handleCalculate());

// ===== FORMATTING =====
// formatCurrency is now provided by chart-utils.js
// Unified function auto-scales: <$1K → 2 decimals, $1K-$999K → whole, $1M+ → compact

// ===== SCENARIO DEFINITIONS =====
function buildScenarios(baseRate, deviation, showSP500) {
  const scenarios = [
    {
      name: "Bear Case",
      rate: baseRate - deviation,
      color: "#f472b6",
      dash: [],
    },
    {
      name: "Conservative",
      rate: baseRate - deviation / 2,
      color: "#f59e0b",
      dash: [],
    },
    {
      name: "Base Case",
      rate: baseRate,
      color: "#2dd4bf",
      dash: [],
      bold: true,
    },
    {
      name: "Optimistic",
      rate: baseRate + deviation / 2,
      color: "#4ade80",
      dash: [],
    },
    {
      name: "Bull Case",
      rate: baseRate + deviation,
      color: "#22c55e",
      dash: [],
    },
  ];

  if (showSP500) {
    scenarios.push({
      name: "S&P 500 Avg",
      rate: SP500_NOMINAL,
      color: "#e2e8f0",
      dash: [6, 4],
      isBenchmark: true,
    });
  }

  // Ensure no negative rates
  scenarios.forEach((s) => {
    if (s.rate < 0) s.rate = 0;
  });

  return scenarios;
}

// ===== PROJECTION CALCULATION =====
function projectPortfolio(
  portfolio,
  monthlyContrib,
  contribIncrease,
  annualRate,
  years,
) {
  const monthlyRate = annualRate / 100 / 12;
  const yearlyData = [];
  let balance = portfolio;
  let totalContributed = portfolio;
  let currentMonthly = monthlyContrib;

  yearlyData.push({
    year: 0,
    balance: balance,
    totalContributed: portfolio,
    growth: 0,
  });

  for (let year = 1; year <= years; year++) {
    for (let month = 1; month <= 12; month++) {
      balance = balance * (1 + monthlyRate) + currentMonthly;
      totalContributed += currentMonthly;
    }

    yearlyData.push({
      year: year,
      balance: balance,
      totalContributed: totalContributed,
      growth: balance - totalContributed,
    });

    // Increase contributions annually
    currentMonthly = currentMonthly * (1 + contribIncrease / 100);
  }

  return yearlyData;
}

// ===== MILESTONE CALCULATION =====
function findMilestoneYear(yearlyData, milestone) {
  for (let i = 1; i < yearlyData.length; i++) {
    if (
      yearlyData[i].balance >= milestone &&
      yearlyData[i - 1].balance < milestone
    ) {
      // Interpolate
      const prev = yearlyData[i - 1].balance;
      const curr = yearlyData[i].balance;
      const fraction = (milestone - prev) / (curr - prev);
      return (i - 1 + fraction).toFixed(1);
    }
  }
  return null;
}

// ===== MAIN HANDLER =====
function handleCalculate() {
  const portfolio =
    safeParseFloat(document.getElementById("proj-portfolio").value, 0);
  const monthly =
    safeParseFloat(document.getElementById("proj-monthly").value, 0);
  const contribIncrease =
    safeParseFloat(document.getElementById("proj-contrib-increase").value, 0);
  const horizon = safeParseInt(document.getElementById("proj-horizon").value);
  const expectedReturn = safeParseFloat(
    document.getElementById("proj-return").value
    );
  const deviation = safeParseFloat(document.getElementById("proj-deviation").value);
  const inflation = safeParseFloat(document.getElementById("proj-inflation").value);
  const showSP500 = document.getElementById("proj-sp500").value === "yes";

  // Validate
  if (!horizon || !expectedReturn) {
    alert("Please enter a time horizon and expected annual return.");
    return;
  }

  if (portfolio === 0 && monthly === 0) {
    alert("Please enter a portfolio value or monthly contribution.");
    return;
  }

  const milestones = [];
  const m1 = safeParseFloat(document.getElementById("proj-milestone-1").value);
  const m2 = safeParseFloat(document.getElementById("proj-milestone-2").value);
  const m3 = safeParseFloat(document.getElementById("proj-milestone-3").value);
  if (m1) milestones.push(m1);
  if (m2) milestones.push(m2);
  if (m3) milestones.push(m3);

  const scenarios = buildScenarios(expectedReturn, deviation, showSP500);

  // Calculate projections for each scenario
  const projections = scenarios.map((scenario) => {
    const data = projectPortfolio(
      portfolio,
      monthly,
      contribIncrease,
      scenario.rate,
      horizon,
    );
    return {
      ...scenario,
      data: data,
      finalValue: data[data.length - 1].balance,
      totalContributed: data[data.length - 1].totalContributed,
      growth: data[data.length - 1].growth,
    };
  });

  // Store for view toggling
  storedProjections = projections;
  storedInputs = {
    portfolio,
    monthly,
    contribIncrease,
    horizon,
    inflation,
    milestones,
    showSP500,
  };

  // Show sections first so canvas has dimensions
  document.getElementById("proj-results").classList.remove("hidden");
  document.getElementById("proj-chart-section").classList.remove("hidden");
  if (milestones.length > 0) {
    document
      .getElementById("proj-milestones-section")
      .classList.remove("hidden");
  }
  document.getElementById("proj-breakdown-section").classList.remove("hidden");

  // Render everything
  displayResults(projections);
  currentView = "nominal";
  nominalBtn.classList.add("active");
  realBtn.classList.remove("active");
  displayChart(projections, storedInputs, "nominal");
  if (milestones.length > 0) {
    displayMilestones(projections, milestones);
  }
  displayBreakdown(projections);

  document
    .getElementById("proj-results")
    .scrollIntoView({ behavior: "smooth" });
}

// ===== DISPLAY: RESULTS TABLE =====
function displayResults(projections) {
  const tbody = document.getElementById("proj-results-body");
  tbody.innerHTML = "";

  projections.forEach((proj) => {
    const multiple =
      proj.totalContributed > 0
        ? (proj.finalValue / proj.totalContributed).toFixed(2) + "x"
        : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${proj.color};margin-right:6px;vertical-align:middle;${proj.dash.length ? "border:2px dashed " + proj.color + ";background:transparent;" : ""}"></span>
        <strong>${proj.name}</strong>
      </td>
      <td style="color:${proj.color}">${proj.rate.toFixed(1)}%</td>
      <td style="font-weight:${proj.bold ? "700" : "400"};color:${proj.bold ? "var(--accent)" : "var(--text-primary)"}">${formatCurrency(proj.finalValue)}</td>
      <td>${formatCurrency(proj.totalContributed)}</td>
      <td style="color:var(--accent)">${formatCurrency(proj.growth)}</td>
      <td>${multiple}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== DISPLAY: CHART =====
function displayChart(projections, inputs, view) {
  const canvas = document.getElementById("proj-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => displayChart(projections, inputs, view));
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const horizon = inputs.horizon;
  const inflation = inputs.inflation / 100;

  // Adjust data for inflation if needed
  const adjustedProjections = projections.map((proj) => {
    let adjustedRate = proj.rate;
    if (view === "real") {
      adjustedRate = ((1 + proj.rate / 100) / (1 + inflation) - 1) * 100;
      if (proj.isBenchmark) {
        adjustedRate = SP500_REAL;
      }
    }

    if (view === "real") {
      const data = projectPortfolio(
        inputs.portfolio,
        inputs.monthly,
        inputs.contribIncrease,
        adjustedRate,
        horizon,
      );
      return { ...proj, adjustedData: data, adjustedRate: adjustedRate };
    }

    return { ...proj, adjustedData: proj.data, adjustedRate: proj.rate };
  });

  // Find max value
  const maxValue = Math.max(
    ...adjustedProjections.flatMap((p) => p.adjustedData.map((d) => d.balance)),
  );

  function toX(year) {
    return padding.left + (year / horizon) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / (maxValue * 1.1)) * chartHeight;
  }

  function fromX(x) {
    return ((x - padding.left) / chartWidth) * horizon;
  }

  function drawChart(highlightYear) {
    ctx.clearRect(0, 0, chart.width, chart.height);

    // Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = ((maxValue * 1.1) / ySteps) * i;
      const y = toY(value);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
    }

    // X-axis
    ctx.textAlign = "center";
    const xStep = Math.max(1, Math.ceil(horizon / 10));
    for (let year = 0; year <= horizon; year += xStep) {
      const x = toX(year);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Yr ${year}`, x, chart.height - padding.bottom + 20);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      view === "real" ? "Years (Inflation-Adjusted)" : "Years",
      chart.width / 2,
      chart.height - 5,
    );

    // Draw each projection line
    adjustedProjections.forEach((proj) => {
      ctx.strokeStyle = proj.color;
      ctx.lineWidth = proj.bold ? 3 : 2;
      ctx.setLineDash(proj.dash || []);

      ctx.beginPath();
      proj.adjustedData.forEach((point, i) => {
        const x = toX(point.year);
        const y = toY(point.balance);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Hover crosshair and tooltip
    if (
      highlightYear !== null &&
      highlightYear >= 0 &&
      highlightYear <= horizon
    ) {
      const yearIndex = Math.round(highlightYear);

      const hx = toX(yearIndex);

      // Crosshair
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots on each line
      const tooltipLines = [`Year ${yearIndex}`];

      adjustedProjections.forEach((proj) => {
        if (yearIndex < proj.adjustedData.length) {
          const point = proj.adjustedData[yearIndex];
          const hy = toY(point.balance);

          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fillStyle = proj.color;
          ctx.fill();
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          tooltipLines.push(`${proj.name}: ${formatCurrency(point.balance)}`);
        }
      });

      // Tooltip
      ctx.font = "12px sans-serif";
      const tooltipWidth =
        Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
      const tooltipHeight = tooltipLines.length * 20 + 12;

      let tx = hx + 15;
      let ty = padding.top + 10;

      if (tx + tooltipWidth > chart.width - padding.right) {
        tx = hx - tooltipWidth - 15;
      }

      // Background
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 1;

      const radius = 6;
      ctx.beginPath();
      ctx.moveTo(tx + radius, ty);
      ctx.lineTo(tx + tooltipWidth - radius, ty);
      ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius, radius);
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

      // Text
      ctx.textAlign = "left";
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(tooltipLines[0], tx + 12, ty + 18);

      ctx.font = "12px sans-serif";
      for (let i = 1; i < tooltipLines.length; i++) {
        const proj = adjustedProjections[i - 1];
        ctx.fillStyle = proj ? proj.color : "#e2e8f0";
        ctx.fillText(tooltipLines[i], tx + 12, ty + 18 + i * 20);
      }
    }
  }

  // Remove old listeners by replacing canvas
  if (projectionChartController) projectionChartController.abort();
  projectionChartController = new AbortController();
  const { signal } = projectionChartController;

  // Initial draw on the new canvas
  displayChartDirect(canvas, adjustedProjections, inputs, view, null);

  // Bind mouse events on new canvas
  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const year = fromX(mouseX);

    if (year >= 0 && year <= horizon) {
      canvas.style.cursor = "crosshair";
      displayChartDirect(canvas, adjustedProjections, inputs, view, year);
    } else {
      canvas.style.cursor = "default";
      displayChartDirect(canvas, adjustedProjections, inputs, view, null);
    }
  }, { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    displayChartDirect(canvas, adjustedProjections, inputs, view, null);
  }, { signal });

  // Build legend
  const legend = document.getElementById("proj-chart-legend");
  legend.innerHTML = adjustedProjections
    .map((proj) => {
      const style = proj.dash.length
        ? `border: 2px dashed ${proj.color}; background: transparent;`
        : `background-color: ${proj.color};`;
      const rateLabel =
        view === "real" ? proj.adjustedRate.toFixed(1) : proj.rate.toFixed(1);
      return `<span class="legend-item"><span class="legend-color" style="${style}"></span> ${proj.name} (${rateLabel}%)</span>`;
    })
    .join("");
}

// ===== DIRECT DRAW (for mouse events after canvas replacement) =====
function displayChartDirect(
  canvas,
  adjustedProjections,
  inputs,
  view,
  highlightYear,
) {
  const chart = createChartContext(
    canvas,
    canvas.clientWidth,
    canvas.clientHeight,
  );
  const ctx = chart.ctx;
  const horizon = inputs.horizon;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const maxValue = Math.max(
    ...adjustedProjections.flatMap((p) => p.adjustedData.map((d) => d.balance)),
  );

  function toX(year) {
    return padding.left + (year / horizon) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / (maxValue * 1.1)) * chartHeight;
  }

  ctx.clearRect(0, 0, chart.width, chart.height);

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
  ctx.lineWidth = 1;

  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const value = ((maxValue * 1.1) / ySteps) * i;
    const y = toY(value);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
  }

  // X-axis
  ctx.textAlign = "center";
  const xStep = Math.max(1, Math.ceil(horizon / 10));
  for (let year = 0; year <= horizon; year += xStep) {
    const x = toX(year);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Yr ${year}`, x, chart.height - padding.bottom + 20);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText(
    view === "real" ? "Years (Inflation-Adjusted)" : "Years",
    chart.width / 2,
    chart.height - 5,
  );

  // Lines
  adjustedProjections.forEach((proj) => {
    ctx.strokeStyle = proj.color;
    ctx.lineWidth = proj.bold ? 3 : 2;
    ctx.setLineDash(proj.dash || []);

    ctx.beginPath();
    proj.adjustedData.forEach((point, i) => {
      const x = toX(point.year);
      const y = toY(point.balance);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Hover
  if (
    highlightYear !== null &&
    highlightYear >= 0 &&
    highlightYear <= horizon
  ) {
    const yearIndex = Math.round(highlightYear);
    const hx = toX(yearIndex);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipLines = [`Year ${yearIndex}`];

    adjustedProjections.forEach((proj) => {
      if (yearIndex < proj.adjustedData.length) {
        const point = proj.adjustedData[yearIndex];
        const hy = toY(point.balance);

        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = proj.color;
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        tooltipLines.push(`${proj.name}: ${formatCurrency(point.balance)}`);
      }
    });

    ctx.font = "12px sans-serif";
    const tooltipWidth =
      Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;

    let tx = hx + 15;
    let ty = padding.top + 10;

    if (tx + tooltipWidth > chart.width - padding.right) {
      tx = hx - tooltipWidth - 15;
    }

    const radius = 6;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(tx + radius, ty);
    ctx.lineTo(tx + tooltipWidth - radius, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius, radius);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
    ctx.arcTo(
      tx + tooltipWidth,
      ty + tooltipHeight,
      tx + tooltipWidth - radius,
      ty + tooltipHeight,
      radius,
    );
    ctx.lineTo(tx + radius, ty + tooltipHeight);
    ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - radius, radius);
    ctx.lineTo(tx, ty + radius);
    ctx.arcTo(tx, ty, tx + radius, ty, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(tooltipLines[0], tx + 12, ty + 18);

    ctx.font = "12px sans-serif";
    for (let i = 1; i < tooltipLines.length; i++) {
      const proj = adjustedProjections[i - 1];
      ctx.fillStyle = proj ? proj.color : "#e2e8f0";
      ctx.fillText(tooltipLines[i], tx + 12, ty + 18 + i * 20);
    }
  }
}

// ===== DISPLAY: MILESTONES =====
function displayMilestones(projections, milestones) {
  const header = document.getElementById("proj-milestones-header");
  const body = document.getElementById("proj-milestones-body");

  header.innerHTML = "";
  body.innerHTML = "";

  // Header row
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = "<th>Scenario</th>";
  milestones.forEach((m) => {
    const th = document.createElement("th");
    th.textContent = formatCurrency(m);
    headerRow.appendChild(th);
  });
  header.appendChild(headerRow);

  // Data rows
  projections.forEach((proj) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${proj.color};margin-right:6px;vertical-align:middle;"></span><strong>${proj.name}</strong> (${proj.rate.toFixed(1)}%)`;
    tr.appendChild(tdName);

    milestones.forEach((m) => {
      const td = document.createElement("td");
      const year = findMilestoneYear(proj.data, m);
      if (year) {
        td.textContent = `Year ${year}`;
        td.style.color = "var(--accent)";
      } else {
        td.textContent = `Not in ${proj.data.length - 1} yrs`;
        td.style.color = "#f472b6";
      }
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

// ===== DISPLAY: BREAKDOWN =====
function displayBreakdown(projections) {
  const container = document.getElementById("proj-breakdown-bars");
  container.innerHTML = "";

  // Legend
  const legend = document.createElement("div");
  legend.className = "breakdown-legend";
  legend.innerHTML = `
    <span><span class="breakdown-legend-color" style="background: linear-gradient(90deg, #3b82f6, #60a5fa);"></span> Contributions</span>
    <span><span class="breakdown-legend-color" style="background: linear-gradient(90deg, #2dd4bf, #14b8a6);"></span> Investment Growth</span>
  `;
  container.appendChild(legend);

  projections.forEach((proj) => {
    const total = proj.finalValue;
    const contribPercent = (proj.totalContributed / total) * 100;
    const growthPercent = (proj.growth / total) * 100;

    const row = document.createElement("div");
    row.className = "breakdown-row";

    row.innerHTML = `
      <div class="breakdown-label">
        <span class="breakdown-label-name" style="color:${proj.color}">${proj.name} (${proj.rate.toFixed(1)}%)</span>
        <span class="breakdown-label-value">${formatCurrency(total)}</span>
      </div>
      <div class="breakdown-bar-track">
        <div class="breakdown-bar-contrib" style="width:${contribPercent}%">${contribPercent > 10 ? contribPercent.toFixed(0) + "%" : ""}</div>
        <div class="breakdown-bar-growth" style="width:${growthPercent}%">${growthPercent > 10 ? growthPercent.toFixed(0) + "%" : ""}</div>
      </div>
    `;

    container.appendChild(row);
  });
}
