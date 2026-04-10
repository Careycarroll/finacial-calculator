// ===================================================================
// 10-K ANALYZER UI — Rendering, Charts, Tables, Interactions
// ===================================================================

let currentAnalysis = null;
let currentChartType = "revenue-income";
let chartVisible = false;
let chartHoverIndex = null;

// ===================================================================
// TICKER AUTOCOMPLETE
// ===================================================================

let tickerData = null;
let tickerList = [];
let dropdownIndex = -1;

async function loadTickerData() {
  try {
    const response = await fetch("../js/company_tickers.json");
    if (!response.ok) return;
    const data = await response.json();
    tickerList = Object.values(data).map((entry) => ({
      ticker: entry.ticker.toUpperCase(),
      name: entry.title,
      cik: entry.cik_str,
    }));
    // Sort by ticker alphabetically
    tickerList.sort((a, b) => a.ticker.localeCompare(b.ticker));
    console.log(`Loaded ${tickerList.length} tickers for search`);
  } catch (e) {
    console.warn("Could not load ticker data for autocomplete:", e.message);
  }
}

function searchTickers(query) {
  if (!query || query.length < 1 || tickerList.length === 0) return [];

  const q = query.toUpperCase().trim();

  // Exact ticker match first
  const exact = tickerList.filter((t) => t.ticker === q);

  // Ticker starts with query
  const tickerStarts = tickerList.filter(
    (t) => t.ticker !== q && t.ticker.startsWith(q),
  );

  // Company name contains query
  const nameMatch = tickerList.filter(
    (t) => !t.ticker.startsWith(q) && t.name.toUpperCase().includes(q),
  );

  return [...exact, ...tickerStarts, ...nameMatch].slice(0, 12);
}

function initTickerSearch() {
  const input = document.getElementById("analyzer-ticker");
  const dropdown = document.getElementById("ticker-dropdown");
  if (!input || !dropdown) return;

  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim();
      if (query.length < 1) {
        dropdown.classList.add("hidden");
        dropdownIndex = -1;
        return;
      }

      const results = searchTickers(query);
      if (results.length === 0) {
        dropdown.innerHTML =
          '<div class="ticker-no-results">No matches found</div>';
        dropdown.classList.remove("hidden");
        dropdownIndex = -1;
        return;
      }

      dropdown.innerHTML = results
        .map(
          (r, i) => `
          <div class="ticker-item" data-ticker="${r.ticker}" data-index="${i}">
            <span class="ticker-item-symbol">${highlightMatch(r.ticker, query)}</span>
            <span class="ticker-item-name">${highlightMatch(r.name, query)}</span>
          </div>`,
        )
        .join("");

      dropdown.classList.remove("hidden");
      dropdownIndex = -1;

      // Click handlers
      dropdown.querySelectorAll(".ticker-item").forEach((item) => {
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          input.value = item.dataset.ticker;
          dropdown.classList.add("hidden");
          dropdownIndex = -1;
        });
      });
    }, 100);
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".ticker-item");
    if (items.length === 0 || dropdown.classList.contains("hidden")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      dropdownIndex = Math.min(dropdownIndex + 1, items.length - 1);
      updateDropdownHighlight(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dropdownIndex = Math.max(dropdownIndex - 1, 0);
      updateDropdownHighlight(items);
    } else if (e.key === "Enter" && dropdownIndex >= 0) {
      e.preventDefault();
      input.value = items[dropdownIndex].dataset.ticker;
      dropdown.classList.add("hidden");
      dropdownIndex = -1;
    } else if (e.key === "Escape") {
      dropdown.classList.add("hidden");
      dropdownIndex = -1;
    }
  });

  // Close on blur
  input.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.classList.add("hidden");
      dropdownIndex = -1;
    }, 150);
  });

  // Close on focus if empty
  input.addEventListener("focus", () => {
    const query = input.value.trim();
    if (query.length >= 1) {
      const results = searchTickers(query);
      if (results.length > 0) {
        dropdown.classList.remove("hidden");
      }
    }
  });
}

function updateDropdownHighlight(items) {
  items.forEach((item, i) => {
    item.classList.toggle("active", i === dropdownIndex);
    if (i === dropdownIndex) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

function highlightMatch(text, query) {
  const q = query.toUpperCase();
  const idx = text.toUpperCase().indexOf(q);
  if (idx === -1) return text;
  const before = text.substring(0, idx);
  const match = text.substring(idx, idx + query.length);
  const after = text.substring(idx + query.length);
  return `${before}<strong style="color:var(--text-primary)">${match}</strong>${after}`;
}

// Load ticker data on page load
loadTickerData();
initTickerSearch();

// ===================================================================
// INITIALIZATION
// ===================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Analyze button
  document
    .getElementById("analyzer-btn")
    .addEventListener("click", runAnalysis);

  // Enter key on ticker input
  document
    .getElementById("analyzer-ticker")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAnalysis();
    });

  // Statement tabs
  document.querySelectorAll(".analyzer-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".analyzer-tab[data-tab]")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document
        .querySelectorAll(".analyzer-tab-content")
        .forEach((c) => c.classList.add("hidden"));
      document
        .getElementById(`${tab.dataset.tab}-tab`)
        .classList.remove("hidden");
    });
  });

  // Ratio tabs
  document.querySelectorAll(".analyzer-ratio-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".analyzer-ratio-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (currentAnalysis) renderRatios(currentAnalysis, tab.dataset.ratio);
    });
  });

  // Chart tabs
  document.querySelectorAll(".analyzer-chart-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".analyzer-chart-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentChartType = tab.dataset.chart;
      if (currentAnalysis) renderChart(currentAnalysis, currentChartType);
    });
  });
});

// ===================================================================
// MAIN ANALYSIS RUNNER
// ===================================================================

async function runAnalysis() {
  const ticker = document.getElementById("analyzer-ticker").value.trim();
  if (!ticker) {
    showError("Please enter a ticker symbol.");
    return;
  }

  const years = parseInt(document.getElementById("analyzer-years").value);
  const formType = document.getElementById("analyzer-form-type").value;

  // Show loading
  document.getElementById("analyzer-results").classList.add("hidden");
  document.getElementById("analyzer-error").classList.add("hidden");
  document.getElementById("analyzer-loading").classList.remove("hidden");
  document.getElementById("analyzer-loading-text").textContent =
    "Fetching SEC data...";

  try {
    // Step 1: Fetch SEC data
    document.getElementById("analyzer-loading-text").textContent =
      `Looking up ${ticker.toUpperCase()}...`;
    const secData = await fetchSECData(ticker, years, formType);

    // Step 2: Analyze
    document.getElementById("analyzer-loading-text").textContent =
      "Crunching numbers...";
    const analysis = analyzeFinancials(secData);
    currentAnalysis = analysis;

    // Step 3: Render
    document.getElementById("analyzer-loading-text").textContent =
      "Building report...";
    await renderAll(analysis);

    // Show results
    document.getElementById("analyzer-loading").classList.add("hidden");
    document.getElementById("analyzer-results").classList.remove("hidden");
    document
      .getElementById("analyzer-results")
      .scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    document.getElementById("analyzer-loading").classList.add("hidden");
    showError(error.message);
    console.error("Analysis error:", error);
  }
}

function showError(message) {
  const el = document.getElementById("analyzer-error");
  document.getElementById("analyzer-error-text").textContent = message;
  el.classList.remove("hidden");
}

// ===================================================================
// RENDER ALL SECTIONS
// ===================================================================

async function renderAll(analysis) {
  renderOverview(analysis);
  renderScorecard(analysis);
  renderIncomeStatement(analysis);
  renderBalanceSheet(analysis);
  renderCashFlow(analysis);
  renderRatios(analysis, "profitability");
  renderChart(analysis, "revenue-income");
  renderFlags(analysis);
}

// ===================================================================
// COMPANY OVERVIEW
// ===================================================================

function renderOverview(analysis) {
  const { statements, growth, ratios } = analysis;
  const latestIncome = statements.incomeStatements[0];
  const latestBalance = statements.balanceSheets[0];
  const latestCF = statements.cashFlows[0];

  const el = document.getElementById("analyzer-overview");
  el.innerHTML = `
    <div class="analyzer-overview-left">
      <h2>${analysis.name} <span class="ticker-badge">${analysis.ticker}</span></h2>
      <div class="analyzer-overview-meta">
        <span>CIK: <strong>${analysis.cik}</strong></span>
        <span>Filing: <strong>${analysis.formType}</strong></span>
        <span>Latest: <strong>FY ${latestIncome?.fy || "—"}</strong></span>
        <span>Period End: <strong>${latestIncome?.end || "—"}</strong></span>
      </div>
    </div>
    <div class="analyzer-overview-right">
      <div class="overview-stat">
        <div class="overview-stat-label">Revenue</div>
        <div class="overview-stat-value">${formatCurrencyShort(latestIncome?.revenue)}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-label">Net Income</div>
        <div class="overview-stat-value">${formatCurrencyShort(latestIncome?.netIncome)}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-label">FCF</div>
        <div class="overview-stat-value">${formatCurrencyShort(latestCF?.freeCashFlow)}</div>
      </div>
      <div class="overview-stat">
        <div class="overview-stat-label">Total Assets</div>
        <div class="overview-stat-value">${formatCurrencyShort(latestBalance?.totalAssets)}</div>
      </div>
    </div>
  `;
}

// ===================================================================
// HEALTH SCORECARD
// ===================================================================

function renderScorecard(analysis) {
  const { healthScore } = analysis;
  const el = document.getElementById("analyzer-scorecard");

  function scoreColor(score) {
    if (score === null) return "var(--text-secondary)";
    if (score >= 8) return "#4ade80";
    if (score >= 6) return "#2dd4bf";
    if (score >= 4) return "#f59e0b";
    return "#f472b6";
  }

  function scoreLabel(score) {
    if (score === null) return "N/A";
    if (score >= 8) return "Excellent";
    if (score >= 6) return "Good";
    if (score >= 4) return "Fair";
    return "Poor";
  }

  const overallColor = scoreColor(healthScore.overall);

  let barsHTML = "";
  Object.values(healthScore.categories).forEach((cat) => {
    const color = scoreColor(cat.score);
    const width = cat.score !== null ? cat.score * 10 : 0;
    barsHTML += `
      <div class="scorecard-item">
        <span class="scorecard-label">${cat.label}</span>
        <div class="scorecard-bar-track">
          <div class="scorecard-bar-fill" style="width: ${width}%; background-color: ${color};"></div>
        </div>
        <span class="scorecard-value" style="color: ${color};">
          ${cat.score !== null ? cat.score.toFixed(1) : "N/A"} — ${scoreLabel(cat.score)}
        </span>
      </div>
    `;
  });

  el.innerHTML = `
    <div class="scorecard-header">
      <h2>Financial Health Scorecard</h2>
      <span class="scorecard-overall" style="color: ${overallColor};">
        ${healthScore.overall.toFixed(1)} / 10
      </span>
    </div>
    <div class="scorecard-bars">
      ${barsHTML}
    </div>
  `;
}

// ===================================================================
// FINANCIAL STATEMENT TABLES
// ===================================================================

function buildTableHeader(periods) {
  let html = "<tr><th>Line Item</th>";
  periods.forEach((p) => {
    html += `<th>FY ${p.fy}</th>`;
  });
  html += "<th>CAGR</th></tr>";
  return html;
}

function buildTableRow(label, periods, field, options) {
  options = options || {};
  const cssClass = options.class || "";
  const indent = options.indent ? " row-indent" : "";
  const formatter = options.format || formatCurrencyShort;

  let html = `<tr class="${cssClass}"><td class="${indent}">${label}</td>`;

  const values = periods.map((p) => p[field]);

  periods.forEach((p, i) => {
    const val = p[field];
    let cellClass = "";
    if (options.colorize && val !== null) {
      cellClass = val >= 0 ? "val-positive" : "val-negative";
    }

    let growth = "";
    if (i < periods.length - 1 && !options.noGrowth) {
      const prev = periods[i + 1]?.[field];
      const change = pctChange(val, prev);
      if (change !== null) {
        const growthClass = change >= 0 ? "positive" : "negative";
        growth = ` <span class="growth-badge ${growthClass}">${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%</span>`;
      }
    }

    html += `<td class="${cellClass}">${formatter(val)}${growth}</td>`;
  });

  // CAGR column
  const validValues = values.filter((v) => v !== null && v > 0);
  let cagrVal = null;
  if (validValues.length >= 2) {
    // periods are newest first, so first = end, last = start
    const endVal = values.find((v) => v !== null && v > 0);
    const startVal = [...values].reverse().find((v) => v !== null && v > 0);
    const yrs = validValues.length - 1;
    if (endVal && startVal && yrs > 0) {
      cagrVal = cagr(endVal, startVal, yrs);
    }
  }
  const cagrClass =
    cagrVal !== null ? (cagrVal >= 0 ? "val-positive" : "val-negative") : "";
  html += `<td class="${cagrClass}">${cagrVal !== null ? formatPct(cagrVal) : "—"}</td>`;

  html += "</tr>";
  return html;
}

function buildMarginRow(label, periods, field) {
  let html = `<tr class="row-indent"><td class="row-indent val-muted">${label}</td>`;
  periods.forEach((p) => {
    const margin = p[field];
    html += `<td class="val-muted">${formatPct(margin)}</td>`;
  });
  html += "<td></td></tr>";
  return html;
}

function renderIncomeStatement(analysis) {
  const periods = analysis.statements.incomeStatements;
  const ratios = analysis.ratios;

  document.getElementById("income-thead").innerHTML = buildTableHeader(periods);

  // Merge margins into periods for easy access
  const merged = periods.map((p, i) => ({
    ...p,
    grossMargin: ratios[i]?.margins.grossMargin,
    ebitdaMargin: ratios[i]?.margins.ebitdaMargin,
    ebitMargin: ratios[i]?.margins.ebitMargin,
    preTaxMargin: ratios[i]?.margins.preTaxMargin,
    netMargin: ratios[i]?.margins.netMargin,
    effectiveTaxRate: ratios[i]?.margins.effectiveTaxRate,
  }));

  let html = "";
  html += buildTableRow("Revenue", merged, "revenue", { class: "row-header" });
  html += buildTableRow("Cost of Revenue", merged, "costOfRevenue", {
    indent: true,
  });
  html += buildTableRow("Gross Profit", merged, "grossProfit", {
    class: "row-subtotal",
  });
  html += buildMarginRow("Gross Margin", merged, "grossMargin");
  html += buildTableRow("R&D Expense", merged, "researchAndDevelopment", {
    indent: true,
  });
  html += buildTableRow("SG&A Expense", merged, "sellingGeneralAndAdmin", {
    indent: true,
  });
  html += buildTableRow("EBITDA", merged, "ebitda", {
    class: "row-subtotal",
  });
  html += buildMarginRow("EBITDA Margin", merged, "ebitdaMargin");
  html += buildTableRow("Depreciation & Amortization", merged, "depreciation", {
    indent: true,
  });
  html += buildTableRow("EBIT / Operating Income", merged, "ebit", {
    class: "row-subtotal",
  });
  html += buildMarginRow("Operating Margin", merged, "ebitMargin");
  html += buildTableRow("Interest Expense", merged, "interestExpense", {
    indent: true,
  });
  html += buildTableRow("EBT (Pre-Tax Income)", merged, "ebt", {
    class: "row-subtotal",
  });
  html += buildMarginRow("Pre-Tax Margin", merged, "preTaxMargin");
  html += buildTableRow("Tax Expense", merged, "taxExpense", { indent: true });
  html += buildMarginRow("Effective Tax Rate", merged, "effectiveTaxRate");
  html += buildTableRow("Net Income", merged, "netIncome", {
    class: "row-subtotal",
  });
  html += buildMarginRow("Net Margin", merged, "netMargin");

  // Per share
  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Per Share Data</td></tr>`;
  html += buildTableRow("EPS (Basic)", merged, "epsBasic", {
    format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
    noGrowth: true,
  });
  html += buildTableRow("EPS (Diluted)", merged, "epsDiluted", {
    format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
  });
  html += buildTableRow("Shares Outstanding (Basic)", merged, "sharesBasic", {
    format: (v) =>
      v !== null
        ? v >= 1e9
          ? `${(v / 1e9).toFixed(2)}B`
          : `${(v / 1e6).toFixed(0)}M`
        : "—",
  });

  document.getElementById("income-tbody").innerHTML = html;
}

function renderBalanceSheet(analysis) {
  const periods = analysis.statements.balanceSheets;

  document.getElementById("balance-thead").innerHTML =
    buildTableHeader(periods);

  let html = "";

  // Assets
  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Assets</td></tr>`;
  html += buildTableRow("Cash & Equivalents", periods, "cash", {
    indent: true,
  });
  html += buildTableRow(
    "Short-Term Investments",
    periods,
    "shortTermInvestments",
    {
      indent: true,
    },
  );
  html += buildTableRow("Accounts Receivable", periods, "accountsReceivable", {
    indent: true,
  });
  html += buildTableRow("Inventory", periods, "inventory", { indent: true });
  html += buildTableRow("Current Assets", periods, "currentAssets", {
    class: "row-subtotal",
  });
  html += buildTableRow("PP&E", periods, "propertyPlantEquipment", {
    indent: true,
  });
  html += buildTableRow("Goodwill", periods, "goodwill", { indent: true });
  html += buildTableRow("Intangible Assets", periods, "intangibleAssets", {
    indent: true,
  });
  html += buildTableRow("Total Assets", periods, "totalAssets", {
    class: "row-subtotal",
  });

  // Liabilities
  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Liabilities</td></tr>`;
  html += buildTableRow("Accounts Payable", periods, "accountsPayable", {
    indent: true,
  });
  html += buildTableRow("Short-Term Debt", periods, "shortTermDebt", {
    indent: true,
  });
  html += buildTableRow("Current Liabilities", periods, "currentLiabilities", {
    class: "row-subtotal",
  });
  html += buildTableRow("Long-Term Debt", periods, "longTermDebt", {
    indent: true,
  });
  html += buildTableRow("Total Liabilities", periods, "totalLiabilities", {
    class: "row-subtotal",
  });

  // Equity
  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Equity</td></tr>`;
  html += buildTableRow("Retained Earnings", periods, "retainedEarnings", {
    indent: true,
    colorize: true,
  });
  html += buildTableRow("Treasury Stock", periods, "treasuryStock", {
    indent: true,
  });
  html += buildTableRow("Total Equity", periods, "totalEquity", {
    class: "row-subtotal",
    colorize: true,
  });

  // Calculated
  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Calculated</td></tr>`;
  html += buildTableRow("Total Debt", periods, "totalDebt");
  html += buildTableRow("Net Debt", periods, "netDebt", { colorize: true });

  document.getElementById("balance-tbody").innerHTML = html;
}

function renderCashFlow(analysis) {
  const periods = analysis.statements.cashFlows;

  document.getElementById("cashflow-thead").innerHTML =
    buildTableHeader(periods);

  let html = "";
  html += buildTableRow("Operating Cash Flow", periods, "operatingCashFlow", {
    class: "row-header",
    colorize: true,
  });
  html += buildTableRow(
    "Capital Expenditures",
    periods,
    "capitalExpenditures",
    {
      indent: true,
    },
  );
  html += buildTableRow("Free Cash Flow", periods, "freeCashFlow", {
    class: "row-subtotal",
    colorize: true,
  });
  html += buildTableRow(
    "Depreciation & Amortization",
    periods,
    "depreciation",
    {
      indent: true,
    },
  );
  html += buildTableRow("Investing Cash Flow", periods, "investingCashFlow", {
    colorize: true,
  });
  html += buildTableRow("Financing Cash Flow", periods, "financingCashFlow", {
    colorize: true,
  });

  html += `<tr class="row-section-header"><td colspan="${periods.length + 2}">Capital Allocation</td></tr>`;
  html += buildTableRow("Dividends Paid", periods, "dividendsPaid", {
    indent: true,
  });
  html += buildTableRow("Share Buybacks", periods, "shareBuybacks", {
    indent: true,
  });
  html += buildTableRow("Debt Issued", periods, "debtIssued", {
    indent: true,
  });
  html += buildTableRow("Debt Repaid", periods, "debtRepaid", {
    indent: true,
  });

  document.getElementById("cashflow-tbody").innerHTML = html;
}

// ===================================================================
// RATIO CARDS
// ===================================================================

function renderRatios(analysis, category) {
  const el = document.getElementById("analyzer-ratios-content");
  const ratios = analysis.ratios;

  const configs = {
    profitability: [
      { label: "Gross Margin", path: "margins.grossMargin", format: formatPct },
      {
        label: "EBITDA Margin",
        path: "margins.ebitdaMargin",
        format: formatPct,
      },
      {
        label: "Operating Margin",
        path: "margins.operatingMargin",
        format: formatPct,
      },
      { label: "Net Margin", path: "margins.netMargin", format: formatPct },
      {
        label: "Effective Tax Rate",
        path: "margins.effectiveTaxRate",
        format: formatPct,
      },
      {
        label: "Return on Equity",
        path: "profitability.roe",
        format: formatPct,
      },
      {
        label: "Return on Assets",
        path: "profitability.roa",
        format: formatPct,
      },
      {
        label: "Return on Invested Capital",
        path: "profitability.roic",
        format: formatPct,
      },
    ],
    liquidity: [
      {
        label: "Current Ratio",
        path: "liquidity.currentRatio",
        format: formatRatio,
      },
      {
        label: "Quick Ratio",
        path: "liquidity.quickRatio",
        format: formatRatio,
      },
      { label: "Cash Ratio", path: "liquidity.cashRatio", format: formatRatio },
    ],
    leverage: [
      {
        label: "Debt to Equity",
        path: "leverage.debtToEquity",
        format: formatRatio,
      },
      {
        label: "Debt to Assets",
        path: "leverage.debtToAssets",
        format: formatRatio,
      },
      {
        label: "Interest Coverage",
        path: "leverage.interestCoverage",
        format: formatRatio,
      },
      {
        label: "Debt / EBITDA",
        path: "leverage.debtToEbitda",
        format: formatRatio,
      },
      {
        label: "Net Debt / EBITDA",
        path: "leverage.netDebtToEbitda",
        format: formatRatio,
      },
      {
        label: "Equity Multiplier",
        path: "leverage.equityMultiplier",
        format: formatRatio,
      },
    ],
    efficiency: [
      {
        label: "Asset Turnover",
        path: "efficiency.assetTurnover",
        format: formatRatio,
      },
      {
        label: "Inventory Turnover",
        path: "efficiency.inventoryTurnover",
        format: formatRatio,
      },
      {
        label: "Receivables Turnover",
        path: "efficiency.receivablesTurnover",
        format: formatRatio,
      },
      {
        label: "Days Inventory",
        path: "efficiency.daysInventory",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
      },
      {
        label: "Days Sales Outstanding",
        path: "efficiency.daysSalesOutstanding",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
      },
      {
        label: "Cash Conversion Cycle",
        path: "efficiency.cashConversionCycle",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
      },
    ],
    pershare: [
      {
        label: "EPS (Basic)",
        path: "perShare.epsBasic",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "EPS (Diluted)",
        path: "perShare.epsDiluted",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "Book Value / Share",
        path: "perShare.bookValuePerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "FCF / Share",
        path: "perShare.fcfPerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "Revenue / Share",
        path: "perShare.revenuePerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "Dividends / Share",
        path: "perShare.dividendsPerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
      },
      {
        label: "Payout Ratio",
        path: "perShare.payoutRatio",
        format: formatPct,
      },
    ],
    cashquality: [
      {
        label: "OCF / Net Income",
        path: "cashFlowQuality.ocfToNetIncome",
        format: formatRatio,
      },
      {
        label: "FCF / Net Income",
        path: "cashFlowQuality.fcfToNetIncome",
        format: formatRatio,
      },
      {
        label: "CapEx / Revenue",
        path: "cashFlowQuality.capexToRevenue",
        format: formatPct,
      },
      {
        label: "CapEx / OCF",
        path: "cashFlowQuality.capexToOcf",
        format: formatPct,
      },
      {
        label: "FCF Margin",
        path: "cashFlowQuality.fcfToRevenue",
        format: formatPct,
      },
    ],
  };

  const items = configs[category] || [];
  let html = "";

  items.forEach((item) => {
    const pathParts = item.path.split(".");
    const values = ratios.map((r) => {
      let val = r;
      for (const part of pathParts) {
        val = val?.[part];
      }
      return val;
    });

    const latestVal = values[0];
    const reversedValues = [...values].reverse();

    // Mini bar chart
    const validVals = reversedValues.filter((v) => v !== null);
    const maxVal = Math.max(...validVals.map((v) => Math.abs(v)), 0.001);

    let barsHTML = "";
    reversedValues.forEach((v) => {
      if (v === null) {
        barsHTML += `<div class="ratio-bar" style="height: 2px; background-color: var(--border);"></div>`;
      } else {
        const height = Math.max((Math.abs(v) / maxVal) * 100, 4);
        const color = v >= 0 ? "var(--accent)" : "#f472b6";
        barsHTML += `<div class="ratio-bar" style="height: ${height}%; background-color: ${color};"></div>`;
      }
    });

    // Year labels
    const firstYear = ratios[ratios.length - 1]?.fy || "";
    const lastYear = ratios[0]?.fy || "";

    html += `
      <div class="ratio-card">
        <div class="ratio-card-header">
          <span class="ratio-card-name">${item.label}</span>
          <span class="ratio-card-value">${item.format(latestVal)}</span>
        </div>
        <div class="ratio-card-trend">${barsHTML}</div>
        <div class="ratio-card-years">
          <span>${firstYear}</span>
          <span>${lastYear}</span>
        </div>
      </div>
    `;
  });

  el.innerHTML = html;
}

// ===================================================================
// RED FLAGS
// ===================================================================

function renderFlags(analysis) {
  const container = document.getElementById("analyzer-flags");
  if (!container) return;

  const flags = analysis.flags || [];

  if (flags.length === 0) {
    container.innerHTML = `
      <div style="color: var(--accent); font-size: 0.95rem;">
        ✅ No red flags detected
      </div>`;
    return;
  }

  container.innerHTML = flags
    .map((flag) => {
      const severity =
        flag.severity === "high"
          ? "🔴"
          : flag.severity === "medium"
            ? "🟡"
            : "🟢";
      return `
        <div style="display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border);">
          <span style="font-size: 1.1rem; flex-shrink: 0;">${severity}</span>
          <div>
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.2rem;">${flag.label}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${flag.detail}</div>
          </div>
        </div>`;
    })
    .join("");
}

// ===================================================================
// CHART — Intersection Observer (fix blank on first load)
// ===================================================================

const chartObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !chartVisible) {
        chartVisible = true;
        if (currentAnalysis) {
          renderChart(currentAnalysis, currentChartType);
        }
      }
    });
  },
  { threshold: 0.1 },
);

const chartSection = document.querySelector(".analyzer-chart-container");
if (chartSection) chartObserver.observe(chartSection);

// ===================================================================
// CHART — Render & Draw
// ===================================================================

function renderChart(analysis, chartType) {
  const canvas = document.getElementById("analyzer-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    // Not visible yet — will be triggered by observer
    chartVisible = false;
    return;
  }

  const chart = createChartContext(canvas, rect.width, 400);
  const ctx = chart.ctx;

  const inc = [...analysis.statements.incomeStatements].reverse();
  const bs = [...analysis.statements.balanceSheets].reverse();
  const cf = [...analysis.statements.cashFlows].reverse();
  const rats = [...analysis.ratios].reverse();

  const labels = inc.map((p) => {
    const year = new Date(p.end).getFullYear();
    return `${year}`;
  });

  let datasets = [];
  let title = "";
  let yAxisFormat = "currency";

  switch (chartType) {
    case "revenue-income":
      title = "Revenue & Net Income";
      datasets = [
        {
          label: "Revenue",
          data: inc.map((p) => p.revenue),
          color: "#2dd4bf",
          type: "bar",
        },
        {
          label: "Net Income",
          data: inc.map((p) => p.netIncome),
          color: "#f59e0b",
          type: "bar",
        },
        {
          label: "EBITDA",
          data: inc.map((p) => p.ebitda),
          color: "#8b5cf6",
          type: "bar",
        },
      ];
      break;
    case "margins":
      title = "Margin Trends";
      yAxisFormat = "percent";
      datasets = [
        {
          label: "Gross",
          data: rats.map((r) => r.margins.grossMargin),
          color: "#2dd4bf",
          type: "line",
        },
        {
          label: "EBITDA",
          data: rats.map((r) => r.margins.ebitdaMargin),
          color: "#8b5cf6",
          type: "line",
        },
        {
          label: "Operating",
          data: rats.map((r) => r.margins.operatingMargin),
          color: "#f59e0b",
          type: "line",
        },
        {
          label: "Net",
          data: rats.map((r) => r.margins.netMargin),
          color: "#f472b6",
          type: "line",
        },
      ];
      break;
    case "debt-cash":
      title = "Debt vs Cash";
      datasets = [
        {
          label: "Total Debt",
          data: bs.map((b) => b.totalDebt),
          color: "#f472b6",
          type: "bar",
        },
        {
          label: "Cash",
          data: bs.map((b) => b.cash),
          color: "#2dd4bf",
          type: "bar",
        },
        {
          label: "Net Debt",
          data: bs.map((b) => b.netDebt),
          color: "#f59e0b",
          type: "line",
        },
      ];
      break;
    case "cashflow":
      title = "Cash Flow";
      datasets = [
        {
          label: "Operating CF",
          data: cf.map((c) => c.operatingCashFlow),
          color: "#2dd4bf",
          type: "bar",
        },
        {
          label: "Free Cash Flow",
          data: cf.map((c) => c.freeCashFlow),
          color: "#f59e0b",
          type: "bar",
        },
        {
          label: "CapEx",
          data: cf.map((c) =>
            c.capitalExpenditures ? -Math.abs(c.capitalExpenditures) : null,
          ),
          color: "#f472b6",
          type: "bar",
        },
      ];
      break;
    case "eps":
      title = "Earnings Per Share";
      yAxisFormat = "dollar";
      datasets = [
        {
          label: "EPS (Diluted)",
          data: inc.map((p) => p.epsDiluted),
          color: "#2dd4bf",
          type: "bar",
        },
      ];
      break;
  }

  drawChart(ctx, chart, labels, datasets, title, yAxisFormat, chartHoverIndex);

  // Bind mouse events
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const padding = { top: 40, right: 30, bottom: 75, left: 90 };
    const chartWidth = chart.width - padding.left - padding.right;
    const step = chartWidth / labels.length;

    const index = Math.floor((mouseX - padding.left) / step);

    if (index >= 0 && index < labels.length && mouseX >= padding.left) {
      if (chartHoverIndex !== index) {
        chartHoverIndex = index;
        canvas.style.cursor = "crosshair";
        const newChart = createChartContext(canvas, chart.width, chart.height);
        drawChart(
          newChart.ctx,
          newChart,
          labels,
          datasets,
          title,
          yAxisFormat,
          chartHoverIndex,
        );
      }
    } else if (chartHoverIndex !== null) {
      chartHoverIndex = null;
      canvas.style.cursor = "default";
      const newChart = createChartContext(canvas, chart.width, chart.height);
      drawChart(
        newChart.ctx,
        newChart,
        labels,
        datasets,
        title,
        yAxisFormat,
        null,
      );
    }
  };

  canvas.onmouseleave = () => {
    if (chartHoverIndex !== null) {
      chartHoverIndex = null;
      canvas.style.cursor = "default";
      const newChart = createChartContext(canvas, chart.width, chart.height);
      drawChart(
        newChart.ctx,
        newChart,
        labels,
        datasets,
        title,
        yAxisFormat,
        null,
      );
    }
  };
}

function drawChart(
  ctx,
  chart,
  labels,
  datasets,
  title,
  yAxisFormat,
  hoverIndex,
) {
  const padding = { top: 40, right: 30, bottom: 75, left: 90 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  chart.clear();

  // Get all values for scale
  const allValues = datasets.flatMap((d) => d.data.filter((v) => v !== null));
  if (allValues.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "No data available for this chart",
      chart.width / 2,
      chart.height / 2,
    );
    return;
  }

  // Calculate nice scale
  let rawMax = Math.max(...allValues);
  let rawMin = Math.min(...allValues, 0);

  if (yAxisFormat === "percent") {
    rawMax = Math.min(rawMax * 1.15, 1);
    rawMin = Math.max(rawMin * 0.85, 0);
    if (rawMin > 0 && rawMin < 0.05) rawMin = 0;
  } else {
    const range = rawMax - rawMin;
    rawMax = rawMax + range * 0.15;
    rawMin = rawMin < 0 ? rawMin - range * 0.1 : 0;
  }

  const { maxVal, minVal, tickInterval, tickCount } = niceScale(
    rawMin,
    rawMax,
    yAxisFormat,
  );

  const valueRange = maxVal - minVal || 1;

  const step = chartWidth / labels.length;

  function toX(i) {
    return padding.left + step * i + step / 2;
  }

  function toY(val) {
    return (
      padding.top + chartHeight - ((val - minVal) / valueRange) * chartHeight
    );
  }

  // Title
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, padding.left, padding.top - 15);

  // Grid lines and Y-axis labels
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= tickCount; i++) {
    const val = minVal + tickInterval * i;
    if (val > maxVal + tickInterval * 0.01) break;
    const y = toY(val);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(formatYAxisLabel(val, yAxisFormat), padding.left - 10, y + 4);
  }

  // Zero line
  if (minVal < 0 && maxVal > 0) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(0));
    ctx.lineTo(chart.width - padding.right, toY(0));
    ctx.stroke();
  }

  // X-axis labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  labels.forEach((label, i) => {
    if (hoverIndex === i) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 11px sans-serif";
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
    }
    ctx.fillText(label, toX(i), chart.height - padding.bottom + 20);
  });

  // Hover highlight column
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < labels.length) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.06)";
    ctx.fillRect(
      padding.left + step * hoverIndex,
      padding.top,
      step,
      chartHeight,
    );
  }

  // Draw datasets
  const barDatasets = datasets.filter((d) => d.type === "bar");
  const lineDatasets = datasets.filter((d) => d.type === "line");

  // Bars
  if (barDatasets.length > 0) {
    const groupWidth = step * 0.7;
    const barWidth = groupWidth / barDatasets.length;
    const groupStart = -groupWidth / 2;

    barDatasets.forEach((dataset, di) => {
      dataset.data.forEach((val, i) => {
        if (val === null) return;
        const x = toX(i) + groupStart + barWidth * di;
        const y = toY(val);
        const zeroY = toY(0);
        const barHeight = Math.abs(y - zeroY);

        ctx.fillStyle = dataset.color;
        ctx.globalAlpha = hoverIndex !== null && hoverIndex !== i ? 0.4 : 0.85;
        ctx.beginPath();

        const radius = 3;
        if (val >= 0) {
          roundedRect(ctx, x, y, barWidth - 2, barHeight, radius, true);
        } else {
          roundedRect(ctx, x, zeroY, barWidth - 2, barHeight, radius, false);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }

  // Lines
  lineDatasets.forEach((dataset) => {
    ctx.strokeStyle = dataset.color;
    ctx.globalAlpha = hoverIndex !== null ? 0.5 : 1;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    dataset.data.forEach((val, i) => {
      if (val === null) return;
      const x = toX(i);
      const y = toY(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Dots
    dataset.data.forEach((val, i) => {
      if (val === null) return;
      const isHovered = hoverIndex === i;
      ctx.beginPath();
      ctx.arc(toX(i), toY(val), isHovered ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = dataset.color;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  // Hover tooltip
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < labels.length) {
    const tooltipLines = [labels[hoverIndex]];
    datasets.forEach((d) => {
      const val = d.data[hoverIndex];
      if (val === null) return;
      tooltipLines.push(`${d.label}: ${formatYAxisLabel(val, yAxisFormat)}`);
    });

    ctx.font = "12px sans-serif";
    const tooltipWidth =
      Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 28;
    const tooltipHeight = tooltipLines.length * 22 + 16;

    let tx = toX(hoverIndex) + 15;
    let ty = padding.top + 15;

    // Flip to left side if too close to right edge
    if (tx + tooltipWidth > chart.width - padding.right) {
      tx = toX(hoverIndex) - tooltipWidth - 15;
    }

    // Tooltip background
    const radius = 8;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + radius, ty);
    ctx.lineTo(tx + tooltipWidth - radius, ty);
    ctx.quadraticCurveTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
    ctx.quadraticCurveTo(
      tx + tooltipWidth,
      ty + tooltipHeight,
      tx + tooltipWidth - radius,
      ty + tooltipHeight,
    );
    ctx.lineTo(tx + radius, ty + tooltipHeight);
    ctx.quadraticCurveTo(
      tx,
      ty + tooltipHeight,
      tx,
      ty + tooltipHeight - radius,
    );
    ctx.lineTo(tx, ty + radius);
    ctx.quadraticCurveTo(tx, ty, tx + radius, ty);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tooltip text
    tooltipLines.forEach((line, i) => {
      if (i === 0) {
        // Header (year)
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 12px sans-serif";
      } else {
        // Find matching dataset for color
        const matchingDataset = datasets.find((d) => line.startsWith(d.label));
        ctx.fillStyle = matchingDataset ? matchingDataset.color : "#94a3b8";
        ctx.font = "12px sans-serif";
      }
      ctx.textAlign = "left";
      ctx.fillText(line, tx + 14, ty + 20 + i * 22);
    });
  }

  // Legend — draw at bottom center
  ctx.font = "11px sans-serif";
  ctx.globalAlpha = 1;
  const legendItems = datasets.map((d) => ({
    label: d.label,
    color: d.color,
    width: ctx.measureText(d.label).width + 24,
  }));
  const totalLegendWidth = legendItems.reduce(
    (sum, item) => sum + item.width + 16,
    -16,
  );
  let legendX = (chart.width - totalLegendWidth) / 2;
  const legendY = chart.height - 12;

  legendItems.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(legendX + 6, legendY - 3, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(item.label, legendX + 16, legendY + 1);
    legendX += item.width + 16;
  });
}

// ===================================================================
// NICE SCALE
// ===================================================================

function niceScale(rawMin, rawMax, format) {
  if (format === "percent") {
    const range = rawMax - rawMin;
    let tickInterval;
    if (range <= 0.1) tickInterval = 0.02;
    else if (range <= 0.2) tickInterval = 0.05;
    else if (range <= 0.5) tickInterval = 0.1;
    else tickInterval = 0.2;

    const minVal = Math.floor(rawMin / tickInterval) * tickInterval;
    const maxVal = Math.ceil(rawMax / tickInterval) * tickInterval;
    const tickCount = Math.round((maxVal - minVal) / tickInterval);

    return { minVal, maxVal, tickInterval, tickCount };
  }

  const range = rawMax - rawMin;
  if (range === 0) {
    return {
      minVal: rawMin - 1,
      maxVal: rawMax + 1,
      tickInterval: 1,
      tickCount: 2,
    };
  }

  const roughInterval = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
  const residual = roughInterval / magnitude;

  let niceInterval;
  if (residual <= 1.5) niceInterval = 1 * magnitude;
  else if (residual <= 3) niceInterval = 2 * magnitude;
  else if (residual <= 7) niceInterval = 5 * magnitude;
  else niceInterval = 10 * magnitude;

  const minVal = Math.floor(rawMin / niceInterval) * niceInterval;
  const maxVal = Math.ceil(rawMax / niceInterval) * niceInterval;
  const tickCount = Math.round((maxVal - minVal) / niceInterval);

  return {
    minVal,
    maxVal,
    tickInterval: niceInterval,
    tickCount: Math.min(tickCount, 10),
  };
}

// ===================================================================
// Y-AXIS LABEL FORMATTER
// ===================================================================

function formatYAxisLabel(value, format) {
  if (value === null || value === undefined) return "";

  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(0)}%`;
    case "dollar":
      return `$${value.toFixed(2)}`;
    case "currency":
    default: {
      const abs = Math.abs(value);
      const sign = value < 0 ? "-" : "";
      if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
      if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(0)}B`;
      if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
      if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
      return `${sign}$${abs.toFixed(0)}`;
    }
  }
}

// ===================================================================
// ROUNDED RECT HELPER
// ===================================================================

function roundedRect(ctx, x, y, width, height, radius, topRound) {
  if (topRound) {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y);
  }
}

// ===================================================================
// RESIZE HANDLER
// ===================================================================

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (currentAnalysis) {
      renderChart(currentAnalysis, currentChartType);
    }
  }, 250);
});
