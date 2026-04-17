import {
  formatLargeNumberRaw, formatRatio, formatRatioPlain, formatPercent, formatValuationCurrency
} from "./formatting.js";
import { evaluateStock } from "./valuator.js";
import {
  fetchStockData, getApiKeys, saveApiKey, removeApiKey,
  getUsageSummary, getRemainingCalls
} from "./api-manager.js";

// ===================================================================
// STOCK EVALUATOR — UI Controller
// ===================================================================

function initValuator() {
  // Load saved API keys into fields
  loadKeysIntoForm();
  renderUsageBar();
  updateValuatorMode();

  const apiToggle = document.getElementById("val-use-api-toggle");
  if (apiToggle) {
    apiToggle.checked = getApiEnabled();
    apiToggle.addEventListener("change", () =>
      setApiEnabled(apiToggle.checked),
    );
  }

  const apiModeBtn = document.getElementById("val-mode-api-btn");
  const manualModeBtn = document.getElementById("val-mode-manual-btn");

  if (apiModeBtn) {
    apiModeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setValuatorMode("api");
    });
  }

  if (manualModeBtn) {
    manualModeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setValuatorMode("manual");
    });
  }

  // Evaluate button
  document
    .getElementById("val-evaluate-btn")
    .addEventListener("click", runEvaluation);

  const manualEvaluateBtn = document.getElementById("val-manual-evaluate-btn");
  if (manualEvaluateBtn) {
    manualEvaluateBtn.addEventListener("click", (event) => {
      event.preventDefault();
      runManualEvaluation();
    });
  }

  // Enter key on ticker input
  document.getElementById("val-ticker").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runEvaluation();
  });

  document
    .getElementById("val-manual-ticker")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") runManualEvaluation();
    });

  // Settings toggle
  document.getElementById("val-settings-btn").addEventListener("click", () => {
    document.getElementById("val-settings-panel").classList.toggle("hidden");
  });

  // Save keys
  document
    .getElementById("val-save-keys-btn")
    .addEventListener("click", saveKeysFromForm);
}

// ===================================================================
// API KEY MANAGEMENT UI
// ===================================================================

const VALUATOR_API_ENABLED_KEY = "valuator_api_enabled";
const VALUATOR_MODE_KEY = "valuator_mode";

function getApiEnabled() {
  const stored = localStorage.getItem(VALUATOR_API_ENABLED_KEY);
  return stored === null || stored === "true";
}

function setApiEnabled(enabled) {
  localStorage.setItem(VALUATOR_API_ENABLED_KEY, enabled ? "true" : "false");
}

function getValuatorMode() {
  const stored = localStorage.getItem(VALUATOR_MODE_KEY);
  return stored === "manual" ? "manual" : "api";
}

function setValuatorMode(mode) {
  localStorage.setItem(VALUATOR_MODE_KEY, mode === "manual" ? "manual" : "api");
  updateValuatorMode();
}

function updateValuatorMode() {
  const mode = getValuatorMode();
  const apiButton = document.getElementById("val-mode-api-btn");
  const manualButton = document.getElementById("val-mode-manual-btn");
  const apiTile = document.getElementById("tile-search");
  const manualTile = document.getElementById("tile-manual-inputs");

  if (apiButton) apiButton.classList.toggle("active", mode === "api");
  if (manualButton) manualButton.classList.toggle("active", mode === "manual");
  if (apiTile) apiTile.classList.toggle("hidden", mode !== "api");
  if (manualTile) manualTile.classList.toggle("hidden", mode !== "manual");
}

function loadKeysIntoForm() {
  const keys = getApiKeys();
  const fields = {
    fmp: "val-key-fmp",
    finnhub: "val-key-finnhub",
    alphavantage: "val-key-alphavantage",
    yahoo: "val-key-yahoo",
    iex: "val-key-iex",
  };

  Object.entries(fields).forEach(([provider, fieldId]) => {
    const el = document.getElementById(fieldId);
    if (el && keys[provider]) {
      el.value = keys[provider];
    }
  });
}

function saveKeysFromForm() {
  const fields = {
    fmp: "val-key-fmp",
    finnhub: "val-key-finnhub",
    alphavantage: "val-key-alphavantage",
    yahoo: "val-key-yahoo",
    iex: "val-key-iex",
  };

  Object.entries(fields).forEach(([provider, fieldId]) => {
    const el = document.getElementById(fieldId);
    if (el) {
      const val = el.value.trim();
      if (val) {
        saveApiKey(provider, val);
      } else {
        removeApiKey(provider);
      }
    }
  });

  renderUsageBar();
  document.getElementById("val-settings-panel").classList.add("hidden");
}

function renderUsageBar() {
  const container = document.getElementById("val-usage-indicators");
  const summary = getUsageSummary();
  const keys = getApiKeys();

  container.innerHTML = Object.entries(summary)
    .map(([id, info]) => {
      let dotClass = "no-key";
      if (id === "yahoo") {
        dotClass = info.remaining > 0 ? "active" : "exhausted";
      } else if (keys[id]) {
        dotClass = info.remaining > 0 ? "active" : "exhausted";
      }

      return `
      <div class="val-usage-item">
        <span class="val-usage-dot ${dotClass}"></span>
        <span>${info.name}</span>
        <span class="val-usage-count">${info.used}/${info.limit}</span>
      </div>
    `;
    })
    .join("");
}

// ===================================================================
// EVALUATION
// ===================================================================

async function runEvaluation() {
  const ticker = document
    .getElementById("val-ticker")
    .value.trim()
    .toUpperCase();
  if (!ticker) return;

  // Show loading
  showTile("tile-loading");
  hideTile("tile-verdict");
  hideTile("tile-asset");
  hideTile("tile-income");
  hideTile("tile-multiples");
  hideTile("tile-enterprise");
  hideTile("tile-equity");
  hideTile("tile-wacc");
  hideTile("tile-summary-chart");
  hideTile("tile-links");
  hideTile("tile-dcf-sensitivity");

  document.getElementById("val-loading-text").textContent =
    `Fetching data for ${ticker}...`;

  if (getValuatorMode() === "manual") {
    hideTile("tile-loading");
    runManualEvaluation();
    return;
  }

  if (!getApiEnabled()) {
    hideTile("tile-loading");
    renderResearchLinks(
      ticker,
      `API usage is disabled. Use these research links while you preserve calls for later.`,
    );
    return;
  }

  try {
    const data = await fetchStockData(ticker);

    document.getElementById("val-loading-text").textContent =
      "Calculating valuations...";

    const results = evaluateStock(data);

    if (results.error) {
      document.getElementById("val-loading-text").textContent =
        `Error: ${results.error}`;
      renderResearchLinks(
        ticker,
        `Data incomplete from the API. Use these research links while you update keys or wait for rate limits to reset.`,
      );
      return;
    }

    renderResults(results);
    renderUsageBar();
  } catch (err) {
    document.getElementById("val-loading-text").textContent =
      `Error: ${err.message}`;
    console.error("Evaluation failed:", err);
    renderResearchLinks(
      ticker,
      `API access failed: ${err.message}. Use these research links until the provider becomes available.`,
    );
  }
}

function runManualEvaluation() {
  const ticker = document
    .getElementById("val-manual-ticker")
    .value.trim()
    .toUpperCase();
  const company = document.getElementById("val-manual-company").value.trim();
  const profile = {
    provider: "Manual",
    symbol: ticker || "MANUAL",
    name: company || "Manual Entry",
    price: parseManualNumber("val-manual-price"),
    marketCap: parseManualNumber("val-manual-marketcap"),
    sector: document.getElementById("val-manual-sector").value.trim(),
    industry: document.getElementById("val-manual-industry").value.trim(),
    exchange: document.getElementById("val-manual-exchange").value.trim(),
    sharesOutstanding: parseManualNumber("val-manual-shares"),
  };

  const income = [
    {
      revenue: parseManualNumber("val-manual-revenue"),
      operatingIncome: parseManualNumber("val-manual-operating-income"),
      netIncome: parseManualNumber("val-manual-net-income"),
      ebitda: parseManualNumber("val-manual-ebitda"),
      eps: parseManualNumber("val-manual-eps"),
      weightedAvgShares: profile.sharesOutstanding,
    },
  ];

  const balance = [
    {
      totalEquity: parseManualNumber("val-manual-total-equity"),
      totalDebt: parseManualNumber("val-manual-total-debt"),
      cashAndEquivalents: parseManualNumber("val-manual-cash"),
      totalAssets: parseManualNumber("val-manual-total-assets"),
      totalCurrentAssets: parseManualNumber("val-manual-current-assets"),
      totalCurrentLiabilities: parseManualNumber(
        "val-manual-current-liabilities",
      ),
      propertyPlantEquipment: parseManualNumber("val-manual-ppe"),
      goodwill: parseManualNumber("val-manual-goodwill"),
      intangibleAssets: parseManualNumber("val-manual-intangibles"),
    },
  ];

  const cashflow = [
    {
      freeCashFlow: parseManualNumber("val-manual-fcf"),
      dividendsPaid: parseManualNumber("val-manual-dividends"),
    },
  ];

  if (!profile.price || !income[0].netIncome || !balance[0].totalEquity) {
    document.getElementById("val-loading-text").textContent =
      "Enter at least price, net income, and total equity for manual evaluation.";
    showTile("tile-loading");
    return;
  }

  if (!profile.sharesOutstanding && profile.marketCap && profile.price) {
    profile.sharesOutstanding = profile.marketCap / profile.price;
  }

  const data = {
    provider: "Manual",
    symbol: profile.symbol,
    profile,
    income,
    balance,
    cashflow,
    ratios: null,
    quote: null,
    dcf: null,
  };

  document.getElementById("val-loading-text").textContent =
    "Evaluating manual inputs...";
  showTile("tile-loading");
  hideTile("tile-links");
  hideTile("tile-verdict");
  hideTile("tile-asset");
  hideTile("tile-income");
  hideTile("tile-multiples");
  hideTile("tile-enterprise");
  hideTile("tile-equity");
  hideTile("tile-wacc");
  hideTile("tile-summary-chart");
  hideTile("tile-dcf-sensitivity");

  const results = evaluateStock(data);
  if (results.error) {
    document.getElementById("val-loading-text").textContent =
      `Manual evaluation failed: ${results.error}`;
    return;
  }

  renderResults(results);
}

function parseManualNumber(id) {
  const input = document.getElementById(id);
  if (!input) return null;
  const value = input.value.trim().replace(/,/g, "");
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// ===================================================================
// RESEARCH LINKS
// ===================================================================

function renderResearchLinks(symbol, message = null) {
  const container = document.getElementById("val-research-links");
  const messageEl = document.getElementById("val-research-message");
  if (!container || !messageEl) return;

  messageEl.textContent =
    message ||
    `If API access is unavailable or rate limits are reached, use these research sources to continue your analysis.`;

  const groups = [
    {
      label: "📋 Financial Statements",
      desc: "Best sources for revenue, income, balance sheet, and cash flow data needed for manual entry.",
      links: [
        { icon: "📊", site: "Macrotrends", desc: "Historical financials, ratios, and charts going back 10+ years", url: `https://www.macrotrends.net/stocks/charts/${symbol}/${symbol}/revenue` },
        { icon: "📋", site: "Stock Analysis", desc: "Clean income, balance sheet, and cash flow statements", url: `https://stockanalysis.com/stocks/${symbol.toLowerCase()}/financials/` },
        { icon: "📈", site: "Yahoo Finance", desc: "Financials, key statistics, and holders", url: `https://finance.yahoo.com/quote/${symbol}/financials/` },
        { icon: "🏛️", site: "MarketWatch", desc: "Income statement, balance sheet, cash flow", url: `https://www.marketwatch.com/investing/stock/${symbol.toLowerCase()}/financials` },
        { icon: "💹", site: "Wisesheets", desc: "Structured financial data and ratios", url: `https://wisesheets.io/quote/${symbol}` },
        { icon: "📱", site: "TIKR", desc: "Institutional-grade financials, free tier available", url: `https://tikr.com/stocks/${symbol}` },
      ],
    },
    {
      label: "🏦 Official Filings",
      desc: "Primary source documents — use these to verify numbers before manual entry.",
      links: [
        { icon: "🏦", site: "SEC EDGAR", desc: "10-K, 10-Q, and all official SEC filings", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=10-K&dateb=&owner=include&count=10` },
        { icon: "🔎", site: "SEC Full-Text Search", desc: "Search within filings for specific line items", url: `https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&dateRange=custom&startdt=2020-01-01&forms=10-K` },
      ],
    },
    {
      label: "🧮 Valuation Tools",
      desc: "Pre-built DCF models, fair value estimates, and valuation multiples.",
      links: [
        { icon: "🧮", site: "GuruFocus", desc: "DCF calculator, Graham Number, intrinsic value", url: `https://www.gurufocus.com/stock/${symbol}/dcf` },
        { icon: "📊", site: "Morningstar", desc: "Analyst fair value estimate and moat rating", url: `https://www.morningstar.com/stocks/xnas/${symbol.toLowerCase()}/quote` },
        { icon: "🔍", site: "Simply Wall St", desc: "Visual valuation snowflake and DCF", url: `https://simplywall.st/stocks/us/${symbol}` },
        { icon: "📉", site: "Finviz", desc: "Screener, ratios, and valuation metrics", url: `https://finviz.com/quote.ashx?t=${symbol}` },
        { icon: "🌐", site: "OpenBB", desc: "Open-source terminal with fundamentals and DCF", url: `https://openbb.co/stocks/${symbol}` },
      ],
    },
    {
      label: "📰 News & Analysis",
      desc: "Qualitative context, earnings coverage, and analyst opinions.",
      links: [
        { icon: "📰", site: "Seeking Alpha", desc: "In-depth analysis, earnings transcripts, news", url: `https://seekingalpha.com/symbol/${symbol}` },
        { icon: "🌐", site: "Google Finance", desc: "Quick overview, recent news, and related stocks", url: `https://www.google.com/finance/quote/${symbol}:NASDAQ` },
      ],
    },
  ];

  container.innerHTML = groups.map(group => `
    <div class="val-link-group">
      <div class="val-link-group-header">
        <span class="val-link-group-title">${group.label}</span>
        <span class="val-link-group-desc">${group.desc}</span>
      </div>
      <div class="val-links-grid">
        ${group.links.map(link => `
          <a href="${link.url}" target="_blank" rel="noopener" class="val-link-card">
            <span class="val-link-icon">${link.icon}</span>
            <div class="val-link-info">
              <span class="val-link-site">${link.site}</span>
              <span class="val-link-desc">${link.desc}</span>
            </div>
          </a>
        `).join("")}
      </div>
    </div>
  `).join("");

  showTile("tile-links");
}

// ===================================================================
// RENDERING
// ===================================================================

function renderResults(results) {
  hideTile("tile-loading");

  renderVerdict(results);
  renderAssetBased(results);
  renderIncomeBased(results);
  renderMultiples(results);
  renderEnterprise(results);
  renderEquityMultiples(results);
  renderWACC(results);
  renderSummaryChart(results);
  renderDCFSensitivity(results);
}

function renderVerdict(results) {
  const profile = results.profile;
  const verdict = results.verdict;

  document.getElementById("val-company-name").textContent =
    `${profile.name} (${results.symbol})`;
  document.getElementById("val-company-meta").textContent =
    `${profile.sector || "—"} · ${profile.industry || "—"} · ${profile.exchange || "—"}`;
  document.getElementById("val-current-price").textContent =
    `$${profile.price.toFixed(2)}`;

  const badge = document.getElementById("val-verdict-badge");
  badge.textContent = verdict.rating;
  badge.className = "val-verdict-badge";
  if (verdict.score >= 60) badge.classList.add("undervalued");
  else if (verdict.score <= 40) badge.classList.add("overvalued");
  else badge.classList.add("fair");

  document.getElementById("val-fair-value").textContent = verdict.fairValue
    ? `$${verdict.fairValue.toFixed(2)}`
    : "N/A";
  document.getElementById("val-fair-range").textContent = verdict.range
    ? `$${verdict.range.low.toFixed(2)} — $${verdict.range.high.toFixed(2)}`
    : "N/A";

  // Meter
  const markerPos = Math.max(5, Math.min(95, verdict.score));
  document.getElementById("val-meter-marker").style.left = `${markerPos}%`;

  document.getElementById("val-data-provider").textContent =
    `Data from ${results.provider}`;

  showTile("tile-verdict");
}

function renderAssetBased(results) {
  const ab = results.valuations.assetBased;
  if (!ab) return;

  const metrics = [
    ["Book Value / Share", formatValuationCurrency(ab.bookValuePerShare)],
    ["Tangible Book / Share", formatValuationCurrency(ab.tangibleBookPerShare)],
    [
      "Liquidation Value / Share",
      formatValuationCurrency(ab.liquidationPerShare),
    ],
    ["Net-Net (NCAV) / Share", formatValuationCurrency(ab.ncavPerShare)],
    ["Tobin's Q", ab.tobinsQ ? formatRatio(ab.tobinsQ) : "N/A"],
    ["Replacement Cost", formatValuationCurrency(ab.replacementCost)],
  ];

  renderMetricList("val-asset-metrics", metrics);
  showTile("tile-asset");
}

function renderIncomeBased(results) {
  const ib = results.valuations.incomeBased;
  if (!ib) return;

  const metrics = [
    [
      "DCF Fair Value",
      formatValuationCurrency(ib.dcfPerShare),
      ib.dcfPerShare > 0,
    ],
    ["Graham Number", formatValuationCurrency(ib.grahamNumber)],
    ["Earnings Power Value", formatValuationCurrency(ib.epvPerShare)],
    ["Lynch Fair Value", formatValuationCurrency(ib.lynchFairValue)],
    ["Dividend Discount Model", formatValuationCurrency(ib.ddmValue)],
    ["FCF Growth Rate", formatPercent(ib.fcfGrowth)],
    ["Terminal Growth", formatPercent(ib.terminalGrowth)],
  ];

  renderMetricList("val-income-metrics", metrics);
  showTile("tile-income");
}

function renderMultiples(results) {
  const m = results.multiples;
  if (!m) return;

  const metrics = [
    ["P/E Ratio", formatRatio(m.peRatio)],
    ["Forward P/E", formatRatio(m.forwardPE)],
    [
      "PEG Ratio",
      formatRatio(m.pegRatio),
      m.pegRatio !== null ? m.pegRatio < 1 : null,
    ],
    ["Price / Sales", formatRatio(m.priceToSales)],
    ["Price / FCF", formatRatio(m.priceToFCF)],
    ["Earnings Growth", formatPercent(m.earningsGrowth)],
    ["Dividend Yield", formatPercent(m.dividendYield)],
  ];

  renderMetricList("val-multiples-metrics", metrics);
  showTile("tile-multiples");
}

function renderEnterprise(results) {
  const ev = results.enterprise;
  if (!ev) return;

  const metrics = [
    ["Enterprise Value", formatValuationCurrency(ev.enterpriseValue)],
    ["EV / EBITDA", formatRatio(ev.evToEbitda)],
    ["EV / Revenue", formatRatio(ev.evToRevenue)],
    ["EV / FCF", formatRatio(ev.evToFcf)],
    ["EV / Invested Capital", formatRatio(ev.evToInvestedCapital)],
    ["Invested Capital", formatValuationCurrency(ev.investedCapital)],
    ["ROIC", formatPercent(ev.roic)],
  ];

  renderMetricList("val-enterprise-metrics", metrics);
  showTile("tile-enterprise");
}

function renderEquityMultiples(results) {
  const m = results.multiples;
  const ab = results.valuations.assetBased;
  if (!m || !ab) return;

  const metrics = [
    ["Price / Book", formatRatio(m.priceToBook)],
    ["Price / Tangible Book", formatRatio(m.priceToTangibleBook)],
    [
      "Book Value Multiple",
      m.priceToBook ? formatRatio(m.priceToBook) + "x" : "N/A",
    ],
    ["Dividend Yield", formatPercent(m.dividendYield)],
    ["P/E Ratio", formatRatio(m.peRatio)],
    ["PEG Ratio", formatRatio(m.pegRatio)],
  ];

  renderMetricList("val-equity-metrics", metrics);
  showTile("tile-equity");
}

function renderWACC(results) {
  const ib = results.valuations.incomeBased;
  if (!ib) return;

  const metrics = [
    ["WACC", formatPercent(ib.wacc)],
    ["Cost of Equity", formatPercent(ib.costOfEquity)],
    [
      "Cost of Debt (after tax)",
      formatPercent(ib.costOfDebt * (1 - ib.taxRate)),
    ],
    ["Effective Tax Rate", formatPercent(ib.taxRate)],
    ["Risk-Free Rate", "4.3%"],
    ["Equity Risk Premium", "5.7%"],
    ["Dividend / Share", formatValuationCurrency(ib.dividendPerShare)],
  ];

  renderMetricList("val-wacc-metrics", metrics);
  showTile("tile-wacc");
}

function renderMetricList(containerId, metrics) {
  const container = document.getElementById(containerId);
  container.innerHTML = metrics
    .map(([label, value, isPositive]) => {
      let valueClass = "";
      if (isPositive === true) valueClass = "positive";
      else if (isPositive === false) valueClass = "negative";

      return `
      <div class="val-metric-row">
        <span class="val-metric-label">${label}</span>
        <span class="val-metric-value ${valueClass}">${value}</span>
      </div>
    `;
    })
    .join("");
}

// ===================================================================
// SUMMARY CHART
// ===================================================================

function renderSummaryChart(results) {
  const container = document.getElementById("val-summary-chart");
  const price = results.profile.price;
  const valuations = results.verdict.valuations;

  if (!valuations || valuations.length === 0) return;

  // Find the range for scaling
  const allValues = valuations.map((v) => v.value).concat([price]);
  const maxVal = Math.max(...allValues) * 1.2;

  const pricePercent = (price / maxVal) * 100;

  container.innerHTML = valuations
    .sort((a, b) => a.value - b.value)
    .map((v) => {
      const barPercent = Math.max(1, (v.value / maxVal) * 100);
      let barClass = "fair";
      if (v.value < price * 0.9) barClass = "over";
      else if (v.value > price * 1.1) barClass = "under";

      return `
        <div class="val-summary-row">
          <span class="val-summary-method">${v.method}</span>
          <div class="val-summary-bar-wrap">
            <div class="val-summary-bar ${barClass}" style="width: ${barPercent}%"></div>
            <div class="val-summary-price-line" style="left: ${pricePercent}%">
              <span class="val-summary-price-label">$${price.toFixed(0)}</span>
            </div>
          </div>
          <span class="val-summary-value">${formatValuationCurrency(v.value)}</span>
        </div>
      `;
    })
    .join("");

  showTile("tile-summary-chart");
}

// ===================================================================
// DCF SENSITIVITY TABLE
// ===================================================================

function renderDCFSensitivity(results) {
  const ib = results.valuations.incomeBased;
  const profile = results.profile;
  if (!ib || !ib.dcfPerShare || ib.dcfPerShare <= 0) return;

  const baseWACC = ib.wacc;
  const baseGrowth = ib.fcfGrowth;
  const shares = profile.sharesOutstanding;
  const balance = results.balance || [];
  const cashflow = results.cashflow || [];

  // Get base FCF and balance data
  const fcf = cashflow[0] ? cashflow[0].freeCashFlow : 0;
  const totalDebt = balance[0] ? balance[0].totalDebt : 0;
  const cash = balance[0] ? balance[0].cashAndEquivalents : 0;

  if (!fcf || !shares) return;

  // WACC variations: -2% to +2%
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  // Growth variations: -2% to +2%
  const growthSteps = [-0.02, -0.01, 0, 0.01, 0.02];

  const header = document.getElementById("val-dcf-sensitivity-header");
  const body = document.getElementById("val-dcf-sensitivity-body");

  // Header row
  header.innerHTML = `
    <tr>
      <th>WACC \\ Growth</th>
      ${growthSteps
        .map((gs) => {
          const g = baseGrowth + gs;
          const isCurrent = gs === 0;
          return `<th class="${isCurrent ? "current-col" : ""}">${(g * 100).toFixed(1)}%</th>`;
        })
        .join("")}
    </tr>
  `;

  // Body rows
  body.innerHTML = waccSteps
    .map((ws) => {
      const w = baseWACC + ws;
      const isCurrentRow = ws === 0;

      const cells = growthSteps
        .map((gs) => {
          const g = baseGrowth + gs;
          const isCurrentCol = gs === 0;
          const isCurrentCell = isCurrentRow && isCurrentCol;

          // Mini DCF calculation
          let dcfVal = 0;
          let projFCF = fcf;
          const termGrowth = 0.025;

          for (let t = 1; t <= 10; t++) {
            projFCF *= 1 + (t <= 5 ? g : g * 0.5);
            dcfVal += projFCF / Math.pow(1 + w, t);
          }

          if (w > termGrowth) {
            const tv = (projFCF * (1 + termGrowth)) / (w - termGrowth);
            dcfVal += tv / Math.pow(1 + w, 10);
          }

          dcfVal = (dcfVal - totalDebt + cash) / shares;

          let cellClass = "";
          if (isCurrentCell) cellClass = "current-cell";
          else if (isCurrentCol) cellClass = "current-col";
          else if (isCurrentRow) cellClass = "current-row";

          return `<td class="${cellClass}">${dcfVal > 0 ? "$" + dcfVal.toFixed(2) : "N/A"}</td>`;
        })
        .join("");

      return `
      <tr>
        <td class="${isCurrentRow ? "current-row" : ""}" style="font-weight: 600;">${(w * 100).toFixed(1)}%</td>
        ${cells}
      </tr>
    `;
    })
    .join("");

  showTile("tile-dcf-sensitivity");
}

// ===================================================================
// TILE VISIBILITY HELPERS
// ===================================================================

function showTile(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function hideTile(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}
// ===================================================================
// INIT
// ===================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initValuator);
} else {
  initValuator();
}
