import {
  formatCurrency, createChartContext, autoScrollTables, rafThrottle
} from "./chart-utils.js";
import {
  formatLargeNumber, formatRatio, formatPct, formatCurrencyShort
} from "./formatting.js";
import { getTermDefinition } from "./financial-terms.js";
import { fetchSECData } from "./sec-api.js";
import { analyzeFinancials } from "./analyzer.js";

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

// ===================================================================
// TOOLTIP WRAPPER
// ===================================================================

function tt(label, termKey) {
  const term = getTermDefinition(termKey);
  if (!term) return label;
  return `<span class="term-tooltip" data-tooltip="${term.definition}">${label}</span>`;
}

// formatLargeNumber imported from formatting.js

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
  autoScrollTables();
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

  const categoryTermKeys = {
    "Revenue Growth": "revenueGrowthScore",
    Profitability: "profitabilityScore",
    "Debt Health": "debtHealthScore",
    "Cash Generation": "cashGenerationScore",
    "Earnings Quality": "earningsQualityScore",
    Liquidity: "liquidityScore",
  };

  const overallColor = scoreColor(healthScore.overall);

  let barsHTML = "";
  Object.values(healthScore.categories).forEach((cat) => {
    const color = scoreColor(cat.score);
    const width = cat.score !== null ? cat.score * 10 : 0;
    const termKey = categoryTermKeys[cat.label];
    const displayLabel = termKey ? tt(cat.label, termKey) : cat.label;

    barsHTML += `
      <div class="scorecard-item">
        <span class="scorecard-label">${displayLabel}</span>
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

function buildTableRow(label, periods, field, options = {}) {
  const { format = "currency", termKey = null } = options;
  const displayLabel = termKey ? tt(label, termKey) : label;

  let cells = `<td>${displayLabel}</td>`;

  periods.forEach((period, i) => {
    const val = period[field];
    const prev = periods[i + 1] ? periods[i + 1][field] : null;

    let formatted = "";
    let growth = "";

    if (val !== null && val !== undefined) {
      if (format === "currency") {
        formatted = formatLargeNumber(val);
      } else if (format === "shares") {
        formatted = formatLargeNumber(val);
      } else if (format === "dollar") {
        formatted = `$${val.toFixed(2)}`;
      } else if (format === "percent") {
        formatted = `${(val * 100).toFixed(1)}%`;
      } else {
        formatted = val.toLocaleString();
      }

      if (
        prev !== null &&
        prev !== undefined &&
        prev !== 0 &&
        format !== "percent"
      ) {
        const pctChange = ((val - prev) / Math.abs(prev)) * 100;
        const color = pctChange >= 0 ? "#2dd4bf" : "#f472b6";
        const sign = pctChange >= 0 ? "+" : "";
        growth = ` <span style="font-size:0.75rem;color:${color}">${sign}${pctChange.toFixed(1)}%</span>`;
      }
    } else {
      formatted = "—";
    }

    cells += `<td>${formatted}${growth}</td>`;
  });

  // CAGR column
  const first = periods[periods.length - 1]?.[field];
  const last = periods[0]?.[field];
  const years = periods.length - 1;
  let cagr = "—";
  if (first && last && years > 0 && first > 0 && last > 0) {
    const rate = (Math.pow(last / first, 1 / years) - 1) * 100;
    cagr = `${rate.toFixed(1)}%`;
  }
  cells += `<td>${cagr}</td>`;

  return `<tr>${cells}</tr>`;
}

function buildMarginRow(label, periods, field, termKey) {
  const displayLabel = termKey ? tt(label, termKey) : label;
  let cells = `<td>${displayLabel}</td>`;

  periods.forEach((period) => {
    const pathParts = field.split(".");
    let val = period;
    for (const part of pathParts) {
      val = val?.[part];
    }
    if (val !== null && val !== undefined) {
      cells += `<td>${(val * 100).toFixed(1)}%</td>`;
    } else {
      cells += `<td>—</td>`;
    }
  });

  cells += `<td></td>`;
  return `<tr>${cells}</tr>`;
}

function renderIncomeStatement(analysis) {
  const periods = analysis.statements.incomeStatements;
  const thead = document.getElementById("income-thead");
  const tbody = document.getElementById("income-tbody");
  if (!thead || !tbody) return;

  const header = buildTableHeader(periods);

  const rows = [
    buildTableRow("Revenue", periods, "revenue", { termKey: "revenue" }),
    buildTableRow("Cost of Revenue", periods, "costOfRevenue", {
      termKey: "costOfRevenue",
    }),
    buildTableRow("Gross Profit", periods, "grossProfit", {
      termKey: "grossProfit",
    }),
    buildMarginRow(
      "Gross Margin",
      analysis.ratios,
      "margins.grossMargin",
      "grossMargin",
    ),
    buildTableRow("R&D Expense", periods, "researchAndDevelopment", {
      termKey: "researchAndDevelopment",
    }),
    buildTableRow("SG&A Expense", periods, "sellingGeneralAndAdmin", {
      termKey: "sellingGeneralAndAdmin",
    }),
    buildTableRow("EBITDA", periods, "ebitda", { termKey: "ebitda" }),
    buildMarginRow(
      "EBITDA Margin",
      analysis.ratios,
      "margins.ebitdaMargin",
      "ebitdaMargin",
    ),

    buildTableRow("Depreciation & Amortization", periods, "depreciation", {
      termKey: "depreciation",
    }),
    buildTableRow("EBIT / Operating Income", periods, "operatingIncome", {
      termKey: "operatingIncome",
    }),
    buildMarginRow(
      "Operating Margin",
      analysis.ratios,
      "margins.operatingMargin",
      "operatingMargin",
    ),

    buildTableRow("Interest Expense", periods, "interestExpense", {
      termKey: "interestExpense",
    }),
    buildTableRow("Pre-Tax Income", periods, "ebt", { termKey: "ebt" }),
    buildTableRow("Tax Expense", periods, "taxExpense", {
      termKey: "taxExpense",
    }),
    buildTableRow("Net Income", periods, "netIncome", { termKey: "netIncome" }),
    buildMarginRow(
      "Net Margin",
      analysis.ratios,
      "margins.netMargin",
      "netMargin",
    ),

    buildTableRow("EPS (Basic)", periods, "epsBasic", {
      format: "dollar",
      termKey: "epsBasic",
    }),
    buildTableRow("EPS (Diluted)", periods, "epsDiluted", {
      format: "dollar",
      termKey: "epsDiluted",
    }),
  ];

  thead.innerHTML = header;
  tbody.innerHTML = rows.join("");
}

function renderBalanceSheet(analysis) {
  const periods = analysis.statements.balanceSheets;
  const thead = document.getElementById("balance-thead");
  const tbody = document.getElementById("balance-tbody");
  if (!thead || !tbody) return;

  const header = buildTableHeader(periods);

  const rows = [
    buildTableRow("Total Assets", periods, "totalAssets", {
      termKey: "totalAssets",
    }),
    buildTableRow("Current Assets", periods, "currentAssets", {
      termKey: "currentAssets",
    }),
    buildTableRow("Cash & Equivalents", periods, "cash", { termKey: "cash" }),
    buildTableRow("Short-Term Investments", periods, "shortTermInvestments", {
      termKey: "shortTermInvestments",
    }),
    buildTableRow("Accounts Receivable", periods, "accountsReceivable", {
      termKey: "accountsReceivable",
    }),
    buildTableRow("Inventory", periods, "inventory", { termKey: "inventory" }),
    buildTableRow("PP&E", periods, "propertyPlantEquipment", {
      termKey: "propertyPlantEquipment",
    }),
    buildTableRow("Goodwill", periods, "goodwill", { termKey: "goodwill" }),
    buildTableRow("Intangible Assets", periods, "intangibleAssets", {
      termKey: "intangibleAssets",
    }),
    buildTableRow("Total Liabilities", periods, "totalLiabilities", {
      termKey: "totalLiabilities",
    }),
    buildTableRow("Current Liabilities", periods, "currentLiabilities", {
      termKey: "currentLiabilities",
    }),
    buildTableRow("Accounts Payable", periods, "accountsPayable", {
      termKey: "accountsPayable",
    }),
    buildTableRow("Short-Term Debt", periods, "shortTermDebt", {
      termKey: "shortTermDebt",
    }),
    buildTableRow("Long-Term Debt", periods, "longTermDebt", {
      termKey: "longTermDebt",
    }),
    buildTableRow("Total Debt", periods, "totalDebt", { termKey: "totalDebt" }),
    buildTableRow("Net Debt", periods, "netDebt", { termKey: "netDebt" }),
    buildTableRow("Total Equity", periods, "totalEquity", {
      termKey: "totalEquity",
    }),
    buildTableRow("Retained Earnings", periods, "retainedEarnings", {
      termKey: "retainedEarnings",
    }),
    buildTableRow("Treasury Stock", periods, "treasuryStock", {
      termKey: "treasuryStock",
    }),
    buildTableRow("Shares Outstanding", periods, "sharesOutstanding", {
      format: "shares",
      termKey: "sharesOutstanding",
    }),
  ];

  thead.innerHTML = header;
  tbody.innerHTML = rows.join("");
}

function renderCashFlow(analysis) {
  const periods = analysis.statements.cashFlows;
  const thead = document.getElementById("cashflow-thead");
  const tbody = document.getElementById("cashflow-tbody");
  if (!thead || !tbody) return;

  const header = buildTableHeader(periods);

  const rows = [
    buildTableRow("Operating Cash Flow", periods, "operatingCashFlow", {
      termKey: "operatingCashFlow",
    }),
    buildTableRow("Investing Cash Flow", periods, "investingCashFlow", {
      termKey: "investingCashFlow",
    }),
    buildTableRow("Financing Cash Flow", periods, "financingCashFlow", {
      termKey: "financingCashFlow",
    }),
    buildTableRow("Capital Expenditures", periods, "capitalExpenditures", {
      termKey: "capitalExpenditures",
    }),
    buildTableRow("Free Cash Flow", periods, "freeCashFlow", {
      termKey: "freeCashFlow",
    }),
    buildTableRow("Depreciation & Amortization", periods, "depreciation", {
      termKey: "depreciation",
    }),
    buildTableRow("Dividends Paid", periods, "dividendsPaid", {
      termKey: "dividendsPaid",
    }),
    buildTableRow("Share Buybacks", periods, "shareBuybacks", {
      termKey: "shareBuybacks",
    }),
  ];

  thead.innerHTML = header;
  tbody.innerHTML = rows.join("");
}

// ===================================================================
// RATIO CARDS
// ===================================================================

function renderRatios(analysis, category) {
  const el = document.getElementById("analyzer-ratios-content");
  const ratios = analysis.ratios;

  const configs = {
    profitability: [
      {
        label: "Gross Margin",
        path: "margins.grossMargin",
        format: formatPct,
        termKey: "grossMargin",
      },
      {
        label: "EBITDA Margin",
        path: "margins.ebitdaMargin",
        format: formatPct,
        termKey: "ebitdaMargin",
      },
      {
        label: "Operating Margin",
        path: "margins.operatingMargin",
        format: formatPct,
        termKey: "operatingMargin",
      },
      {
        label: "Net Margin",
        path: "margins.netMargin",
        format: formatPct,
        termKey: "netMargin",
      },
      {
        label: "Effective Tax Rate",
        path: "margins.effectiveTaxRate",
        format: formatPct,
        termKey: "effectiveTaxRate",
      },
      {
        label: "Return on Equity",
        path: "profitability.roe",
        format: formatPct,
        termKey: "returnOnEquity",
      },
      {
        label: "Return on Assets",
        path: "profitability.roa",
        format: formatPct,
        termKey: "returnOnAssets",
      },
      {
        label: "Return on Invested Capital",
        path: "profitability.roic",
        format: formatPct,
        termKey: "roic",
      },
    ],
    liquidity: [
      {
        label: "Current Ratio",
        path: "liquidity.currentRatio",
        format: formatRatio,
        termKey: "currentRatio",
      },
      {
        label: "Quick Ratio",
        path: "liquidity.quickRatio",
        format: formatRatio,
        termKey: "quickRatio",
      },
      {
        label: "Cash Ratio",
        path: "liquidity.cashRatio",
        format: formatRatio,
        termKey: "cashRatio",
      },
    ],
    leverage: [
      {
        label: "Debt to Equity",
        path: "leverage.debtToEquity",
        format: formatRatio,
        termKey: "debtToEquity",
      },
      {
        label: "Debt to Assets",
        path: "leverage.debtToAssets",
        format: formatRatio,
        termKey: "debtToAssets",
      },
      {
        label: "Interest Coverage",
        path: "leverage.interestCoverage",
        format: formatRatio,
        termKey: "interestCoverage",
      },
      {
        label: "Debt / EBITDA",
        path: "leverage.debtToEbitda",
        format: formatRatio,
        termKey: "debtToEbitda",
      },
      {
        label: "Net Debt / EBITDA",
        path: "leverage.netDebtToEbitda",
        format: formatRatio,
        termKey: "netDebtToEbitda",
      },
      {
        label: "Equity Multiplier",
        path: "leverage.equityMultiplier",
        format: formatRatio,
        termKey: "equityMultiplier",
      },
    ],
    efficiency: [
      {
        label: "Asset Turnover",
        path: "efficiency.assetTurnover",
        format: formatRatio,
        termKey: "assetTurnover",
      },
      {
        label: "Inventory Turnover",
        path: "efficiency.inventoryTurnover",
        format: formatRatio,
        termKey: "inventoryTurnover",
      },
      {
        label: "Receivables Turnover",
        path: "efficiency.receivablesTurnover",
        format: formatRatio,
        termKey: "receivablesTurnover",
      },
      {
        label: "Days Inventory",
        path: "efficiency.daysInventory",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
        termKey: "daysInventory",
      },
      {
        label: "Days Sales Outstanding",
        path: "efficiency.daysSalesOutstanding",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
        termKey: "daysSalesOutstanding",
      },
      {
        label: "Cash Conversion Cycle",
        path: "efficiency.cashConversionCycle",
        format: (v) => (v !== null ? `${v.toFixed(0)} days` : "—"),
        termKey: "cashConversionCycle",
      },
    ],
    pershare: [
      {
        label: "EPS (Basic)",
        path: "perShare.epsBasic",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "epsBasic",
      },
      {
        label: "EPS (Diluted)",
        path: "perShare.epsDiluted",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "epsDiluted",
      },
      {
        label: "Book Value / Share",
        path: "perShare.bookValuePerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "bookValuePerShare",
      },
      {
        label: "FCF / Share",
        path: "perShare.fcfPerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "fcfPerShare",
      },
      {
        label: "Revenue / Share",
        path: "perShare.revenuePerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "revenuePerShare",
      },
      {
        label: "Dividends / Share",
        path: "perShare.dividendsPerShare",
        format: (v) => (v !== null ? `$${v.toFixed(2)}` : "—"),
        termKey: "dividendsPerShare",
      },
      {
        label: "Payout Ratio",
        path: "perShare.payoutRatio",
        format: formatPct,
        termKey: "payoutRatio",
      },
    ],
    cashquality: [
      {
        label: "OCF / Net Income",
        path: "cashFlowQuality.ocfToNetIncome",
        format: formatRatio,
        termKey: "ocfToNetIncome",
      },
      {
        label: "FCF / Net Income",
        path: "cashFlowQuality.fcfToNetIncome",
        format: formatRatio,
        termKey: "fcfToNetIncome",
      },
      {
        label: "CapEx / Revenue",
        path: "cashFlowQuality.capexToRevenue",
        format: formatPct,
        termKey: "capexToRevenue",
      },
      {
        label: "CapEx / OCF",
        path: "cashFlowQuality.capexToOcf",
        format: formatPct,
        termKey: "capexToOcf",
      },
      {
        label: "FCF Margin",
        path: "cashFlowQuality.fcfToRevenue",
        format: formatPct,
        termKey: "fcfMargin",
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
    const reversedRatios = [...ratios].reverse();
    reversedValues.forEach((v, i) => {
      const year = reversedRatios[i]?.fy || "";
      const formattedVal = v !== null ? item.format(v) : "—";
      if (v === null) {
        barsHTML += `
          <div class="ratio-bar-wrapper" data-year="${year}" data-val="—">
            <div class="ratio-bar" style="height: 2px; background-color: var(--border);"></div>
          </div>`;
      } else {
        const height = Math.max((Math.abs(v) / maxVal) * 100, 4);
        const color = v >= 0 ? "var(--accent)" : "#f472b6";
        barsHTML += `
          <div class="ratio-bar-wrapper" data-year="${year}" data-val="${formattedVal}">
            <div class="ratio-bar" style="height: ${height}%; background-color: ${color};"></div>
          </div>`;
      }
    });

    // Year labels
    const firstYear = ratios[ratios.length - 1]?.fy || "";
    const lastYear = ratios[0]?.fy || "";

    const displayLabel = item.termKey
      ? tt(item.label, item.termKey)
      : item.label;

    html += `
      <div class="ratio-card">
        <div class="ratio-card-header">
          <span class="ratio-card-name">${displayLabel}</span>
          <span class="ratio-card-value">${item.format(latestVal)}</span>
        </div>
        <div class="ratio-card-hover-info"> </div>
        <div class="ratio-card-trend">${barsHTML}</div>
        <div class="ratio-card-years">
          <span>${firstYear}</span>
          <span>${lastYear}</span>
        </div>
      </div>
    `;
  });

  el.innerHTML = html;

  // Bind hover events for ratio bars
  el.querySelectorAll(".ratio-card").forEach((card) => {
    const hoverInfo = card.querySelector(".ratio-card-hover-info");
    const valueEl = card.querySelector(".ratio-card-value");
    const originalValue = valueEl.textContent;

    card.querySelectorAll(".ratio-bar-wrapper").forEach((bar) => {
      bar.addEventListener("mouseenter", () => {
        const year = bar.dataset.year;
        const val = bar.dataset.val;
        hoverInfo.textContent = `FY ${year}`;
        valueEl.textContent = val;
        valueEl.style.color = "var(--accent)";
      });

      bar.addEventListener("mouseleave", () => {
        hoverInfo.innerHTML = " ";
        valueEl.textContent = originalValue;
        valueEl.style.color = "";
      });
    });
  });
}

// ===================================================================
// RED FLAGS
// ===================================================================

function renderFlags(analysis) {
  const container = document.getElementById("analyzer-flags");
  if (!container) return;

  const flags = analysis.redFlags || [];

  if (flags.length === 0) {
    container.innerHTML = `
      <div style="color: var(--accent); font-size: 0.95rem;">
        ✅ No red flags detected
      </div>`;
    return;
  }

  const negatives = flags.filter(f => f.type === "negative");
  const warnings = flags.filter(f => f.type === "warning");
  const positives = flags.filter(f => f.type === "positive");

  function renderGroup(title, items, icon) {
    if (items.length === 0) return "";
    return `<h3 style="font-size: 0.95rem; font-weight: 700; margin: 1.25rem 0 0.75rem; color: var(--text-primary);">${icon} ${title} (${items.length})</h3>` +
      items.map(flag => `
        <div class="flag-item flag-${flag.type}">
          <span class="flag-icon">${flag.type === "negative" ? "🔴" : flag.type === "warning" ? "🟡" : "🟢"}</span>
          <div class="flag-content">
            <div class="flag-header">
              <span class="flag-message">${flag.message}</span>
              <span class="flag-category">${flag.category}</span>
            </div>
            <div class="flag-detail">${flag.detail}</div>
          </div>
        </div>`).join("");
  }

  container.innerHTML =
    renderGroup("Red Flags", negatives, "🚩") +
    renderGroup("Warnings", warnings, "⚠️") +
    renderGroup("Highlights", positives, "✅");
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

const chartSection = document.querySelector(".canvas-chart");
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

  const chart = createChartContext(canvas, rect.width, rect.height);
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
  if (canvas._analyzerController) canvas._analyzerController.abort();
  canvas._analyzerController = new AbortController();
  const { signal: analyzerSignal } = canvas._analyzerController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
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
  }), { signal: analyzerSignal });

  canvas.addEventListener("mouseleave", () => {
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
  }, { signal: analyzerSignal });
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
