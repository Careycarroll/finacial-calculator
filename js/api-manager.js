// ===================================================================
// API MANAGER — Multi-Provider Financial Data with Rotation
// ===================================================================

const API_USAGE_KEY = "api_usage";
const API_KEYS_KEY = "api_keys";

const API_PROVIDERS = {
  fmp: {
    name: "Financial Modeling Prep",
    baseUrl: "https://financialmodelingprep.com/stable",
    dailyLimit: 250,
    priority: 1,
    requiresKey: true,
    endpoints: {
      profile: "/profile?symbol={symbol}&apikey={key}",
      income:
        "/income-statement?symbol={symbol}&period=annual&limit=5&apikey={key}",
      balance:
        "/balance-sheet-statement?symbol={symbol}&period=annual&limit=5&apikey={key}",
      cashflow:
        "/cash-flow-statement?symbol={symbol}&period=annual&limit=5&apikey={key}",
      ratios: "/ratios?symbol={symbol}&period=annual&limit=5&apikey={key}",
      dcf: "/discounted-cash-flow?symbol={symbol}&apikey={key}",
      peers: "/stock_peers?symbol={symbol}&apikey={key}",
      quote: "/quote?symbol={symbol}&apikey={key}",
    },
  },
  finnhub: {
    name: "Finnhub",
    baseUrl: "https://finnhub.io/api/v1",
    dailyLimit: 1000,
    priority: 2,
    requiresKey: true,
    endpoints: {
      profile: "/stock/profile2?symbol={symbol}&token={key}",
      income:
        "/stock/financials-reported?symbol={symbol}&token={key}&freq=annual",
      balance:
        "/stock/financials-reported?symbol={symbol}&token={key}&freq=annual",
      cashflow:
        "/stock/financials-reported?symbol={symbol}&token={key}&freq=annual",
      quote: "/quote?symbol={symbol}&token={key}",
      ratios: "/stock/metric?symbol={symbol}&metric=all&token={key}",
      peers: "/stock/peers?symbol={symbol}&token={key}",
    },
  },
  alphavantage: {
    name: "Alpha Vantage",
    baseUrl: "https://www.alphavantage.co/query",
    dailyLimit: 25,
    priority: 3,
    requiresKey: true,
    endpoints: {
      profile: "?function=OVERVIEW&symbol={symbol}&apikey={key}",
      income: "?function=INCOME_STATEMENT&symbol={symbol}&apikey={key}",
      balance: "?function=BALANCE_SHEET&symbol={symbol}&apikey={key}",
      cashflow: "?function=CASH_FLOW&symbol={symbol}&apikey={key}",
      quote: "?function=GLOBAL_QUOTE&symbol={symbol}&apikey={key}",
    },
  },
  yahoo: {
    name: "Yahoo Finance",
    baseUrl: "https://yahoo-finance15.p.rapidapi.com/api/v1/markets",
    dailyLimit: 500,
    priority: 4,
    requiresKey: true,
    needsProxy: false,
    useHeaders: true,
    headerKey: "X-RapidAPI-Key",
    headerHost: "yahoo-finance15.p.rapidapi.com",
    endpoints: {
      profile:
        "/stock/modules?ticker={symbol}&module=asset-profile,financial-data,default-key-statistics,summary-detail,price",
      income: "/stock/modules?ticker={symbol}&module=income-statement",
      balance: "/stock/modules?ticker={symbol}&module=balance-sheet",
      cashflow: "/stock/modules?ticker={symbol}&module=cashflow-statement",
      quote: "/stock/modules?ticker={symbol}&module=price",
    },
  },
  iex: {
    name: "IEX Cloud",
    baseUrl: "https://cloud.iexapis.com/stable",
    dailyLimit: 1600, // ~50K messages/month ÷ 31 days
    priority: 5,
    requiresKey: true,
    endpoints: {
      profile: "/stock/{symbol}/company?token={key}",
      income: "/stock/{symbol}/income?period=annual&last=5&token={key}",
      balance: "/stock/{symbol}/balance-sheet?period=annual&last=5&token={key}",
      cashflow: "/stock/{symbol}/cash-flow?period=annual&last=5&token={key}",
      quote: "/stock/{symbol}/quote?token={key}",
      ratios: "/stock/{symbol}/advanced-stats?token={key}",
      peers: "/stock/{symbol}/peers?token={key}",
    },
  },
};

// ===================================================================
// USAGE TRACKING
// ===================================================================

function getUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(API_USAGE_KEY) || "{}");
    const today = new Date().toISOString().split("T")[0];

    // Reset if it's a new day
    if (data.date !== today) {
      return { date: today, providers: {} };
    }
    return data;
  } catch {
    return { date: new Date().toISOString().split("T")[0], providers: {} };
  }
}

function recordUsage(provider) {
  const usage = getUsage();
  if (!usage.providers[provider]) {
    usage.providers[provider] = 0;
  }
  usage.providers[provider]++;
  localStorage.setItem(API_USAGE_KEY, JSON.stringify(usage));
}

function getProviderUsage(provider) {
  const usage = getUsage();
  return usage.providers[provider] || 0;
}

function getRemainingCalls(provider) {
  const config = API_PROVIDERS[provider];
  if (!config) return 0;
  return config.dailyLimit - getProviderUsage(provider);
}

function getUsageSummary() {
  const usage = getUsage();
  const summary = {};
  Object.keys(API_PROVIDERS).forEach((provider) => {
    const config = API_PROVIDERS[provider];
    const used = usage.providers[provider] || 0;
    summary[provider] = {
      name: config.name,
      used: used,
      limit: config.dailyLimit,
      remaining: config.dailyLimit - used,
      pct: Math.round((used / config.dailyLimit) * 100),
    };
  });
  return summary;
}

// ===================================================================
// API KEY MANAGEMENT
// ===================================================================

function getApiKeys() {
  try {
    return JSON.parse(localStorage.getItem(API_KEYS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveApiKey(provider, key) {
  const keys = getApiKeys();
  keys[provider] = key;
  localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

function removeApiKey(provider) {
  const keys = getApiKeys();
  delete keys[provider];
  localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

function hasApiKey(provider) {
  const keys = getApiKeys();
  return !!keys[provider];
}

// ===================================================================
// PROVIDER SELECTION
// ===================================================================

function selectProvider(endpoint) {
  const keys = getApiKeys();

  // Sort providers by priority
  const sorted = Object.entries(API_PROVIDERS)
    .filter(([id, config]) => {
      // Must have the endpoint we need
      if (!config.endpoints[endpoint]) return false;
      // Must have an API key if required
      if (config.requiresKey && !keys[id]) return false;
      // Must have remaining calls
      if (getRemainingCalls(id) <= 0) return false;
      return true;
    })
    .sort((a, b) => a[1].priority - b[1].priority);

  if (sorted.length === 0) return null;

  return sorted[0][0]; // Return provider ID
}

function selectProviderForEvaluation() {
  // A full evaluation needs: profile, income, balance, cashflow, ratios
  const required = ["profile", "income", "balance", "cashflow"];
  const keys = getApiKeys();

  const sorted = Object.entries(API_PROVIDERS)
    .filter(([id, config]) => {
      if (config.requiresKey && !keys[id]) return false;
      // Check if provider has all required endpoints
      const hasAll = required.every((ep) => config.endpoints[ep]);
      if (!hasAll) return false;
      // Need at least 5 calls remaining
      if (getRemainingCalls(id) < 5) return false;
      return true;
    })
    .sort((a, b) => a[1].priority - b[1].priority);

  if (sorted.length === 0) return null;

  return sorted[0][0];
}

// ===================================================================
// API FETCHING
// ===================================================================

const CORS_PROXY = "https://corsproxy.io/?url=";

async function apiFetch(provider, endpoint, symbol) {
  const config = API_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const keys = getApiKeys();
  const key = keys[provider] || "";

  let urlTemplate = config.endpoints[endpoint];
  if (!urlTemplate) throw new Error(`${provider} doesn't support ${endpoint}`);

  let url =
    config.baseUrl +
    urlTemplate
      .replace("{symbol}", encodeURIComponent(symbol))
      .replace("{key}", encodeURIComponent(key));

  // Build fetch options
  const fetchOptions = {
    signal: AbortSignal.timeout(15000),
  };

  // Some APIs use header-based auth (e.g. RapidAPI)
  if (config.useHeaders && key) {
    fetchOptions.headers = {
      [config.headerKey]: key,
      "X-RapidAPI-Host": config.headerHost,
    };
  }

  // CORS proxy for APIs that need it
  if (config.needsProxy) {
    url = CORS_PROXY + encodeURIComponent(url);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`${config.name} returned HTTP ${response.status}`);
  }

  const data = await response.json();

  // Record usage
  recordUsage(provider);

  return data;
}

// ===================================================================
// UNIFIED DATA FETCHING — Normalize across providers
// ===================================================================

async function fetchStockData(symbol) {
  symbol = symbol.toUpperCase().trim();

  const provider = selectProviderForEvaluation();

  if (!provider) {
    throw new Error(
      "No API provider available. Please add at least one API key in settings, or wait until tomorrow for rate limits to reset.",
    );
  }

  const config = API_PROVIDERS[provider];
  const result = {
    provider: config.name,
    symbol: symbol,
    profile: null,
    income: [],
    balance: [],
    cashflow: [],
    ratios: null,
    quote: null,
    dcf: null,
  };

  // Determine which endpoints to fetch
  const endpoints = ["profile", "income", "balance", "cashflow"];
  if (config.endpoints.ratios) endpoints.push("ratios");
  if (config.endpoints.quote) endpoints.push("quote");
  if (config.endpoints.dcf) endpoints.push("dcf");

  // For Finnhub, income/balance/cashflow all come from the same endpoint
  // so we only need to fetch it once
  const fetchEndpoints =
    provider === "finnhub"
      ? [
          ...new Set(
            endpoints.map((ep) =>
              ["income", "balance", "cashflow"].includes(ep) ? "income" : ep,
            ),
          ),
        ]
      : endpoints;

  const results = await Promise.allSettled(
    fetchEndpoints.map(async (ep) => {
      const data = await apiFetch(provider, ep, symbol);
      return { endpoint: ep, data };
    }),
  );

  const fetches = {};
  results.forEach((r) => {
    if (r.status === "fulfilled") {
      fetches[r.value.endpoint] = r.value.data;
    }
  });

  // Normalize based on provider
  switch (provider) {
    case "fmp":
      result.profile = normalizeFMPProfile(fetches.profile);
      result.income = normalizeFMPIncome(fetches.income);
      result.balance = normalizeFMPBalance(fetches.balance);
      result.cashflow = normalizeFMPCashflow(fetches.cashflow);
      result.ratios = fetches.ratios;
      result.quote = fetches.quote;
      result.dcf = fetches.dcf;
      break;

    case "finnhub":
      result.profile = normalizeFinnhubProfile(fetches.profile, fetches.quote);
      result.income = normalizeFinnhubFinancials(fetches.income, "income");
      result.balance = normalizeFinnhubFinancials(fetches.income, "balance");
      result.cashflow = normalizeFinnhubFinancials(fetches.income, "cashflow");
      result.ratios = fetches.ratios;
      result.quote = fetches.quote;
      break;

    case "alphavantage":
      result.profile = normalizeAVProfile(fetches.profile);
      result.income = normalizeAVIncome(fetches.income);
      result.balance = normalizeAVBalance(fetches.balance);
      result.cashflow = normalizeAVCashflow(fetches.cashflow);
      break;

    case "iex":
      result.profile = normalizeIEXProfile(fetches.profile, fetches.quote);
      result.income = normalizeIEXIncome(fetches.income);
      result.balance = normalizeIEXBalance(fetches.balance);
      result.cashflow = normalizeIEXCashflow(fetches.cashflow);
      result.ratios = fetches.ratios;
      break;
  }

  // If primary provider failed to get price, try a quick quote from another
  if (result.profile && !result.profile.price && provider !== "finnhub") {
    try {
      const quoteProvider = selectProvider("quote");
      if (quoteProvider && quoteProvider !== provider) {
        const quoteData = await apiFetch(quoteProvider, "quote", symbol);
        if (quoteProvider === "finnhub" && quoteData) {
          result.profile.price = quoteData.c;
        } else if (quoteProvider === "fmp" && quoteData && quoteData[0]) {
          result.profile.price = quoteData[0].price;
        }
      }
    } catch (e) {
      console.warn("Fallback quote fetch failed:", e.message);
    }
  }

  return result;
}

// ===================================================================
// DATA NORMALIZERS — FMP
// ===================================================================

function normalizeFMPProfile(data) {
  if (!data || !data[0]) return null;
  const d = data[0];
  return {
    name: d.companyName,
    symbol: d.symbol,
    price: d.price,
    marketCap: d.mktCap,
    sector: d.sector,
    industry: d.industry,
    exchange: d.exchangeShortName,
    description: d.description,
    beta: d.beta,
    dividendYield: d.lastDiv / d.price,
    sharesOutstanding: d.mktCap / d.price,
  };
}

function normalizeFMPIncome(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    grossProfit: d.grossProfit,
    operatingIncome: d.operatingIncome,
    netIncome: d.netIncome,
    eps: d.eps,
    ebitda: d.ebitda,
    weightedAvgShares: d.weightedAverageShsOut,
  }));
}

function normalizeFMPBalance(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map((d) => ({
    date: d.date,
    totalAssets: d.totalAssets,
    totalLiabilities: d.totalLiabilities,
    totalEquity: d.totalStockholdersEquity,
    totalDebt: d.totalDebt,
    netDebt: d.netDebt,
    cashAndEquivalents: d.cashAndCashEquivalents,
    shortTermInvestments: d.shortTermInvestments,
    goodwill: d.goodwill,
    intangibleAssets: d.intangibleAssets,
    totalCurrentAssets: d.totalCurrentAssets,
    totalCurrentLiabilities: d.totalCurrentLiabilities,
    inventory: d.inventory,
    propertyPlantEquipment: d.propertyPlantEquipmentNet,
  }));
}

function normalizeFMPCashflow(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map((d) => ({
    date: d.date,
    operatingCashFlow: d.operatingCashFlow,
    capitalExpenditure: d.capitalExpenditure,
    freeCashFlow: d.freeCashFlow,
    dividendsPaid: d.dividendsPaid,
    shareRepurchase: d.commonStockRepurchased,
  }));
}
// ===================================================================
// DATA NORMALIZERS — Finnhub
// ===================================================================

function normalizeFinnhubProfile(profile, quote) {
  if (!profile) return null;
  return {
    name: profile.name,
    symbol: profile.ticker,
    price: quote ? quote.c : 0,
    marketCap: profile.marketCapitalization * 1000000,
    sector: profile.finnhubIndustry,
    industry: profile.finnhubIndustry,
    exchange: profile.exchange,
    description: "",
    sharesOutstanding: profile.shareOutstanding * 1000000,
    beta: null,
    dividendYield: null,
  };
}

function normalizeFinnhubFinancials(data, statementType) {
  if (!data || !data.data || !Array.isArray(data.data)) return [];

  return data.data.slice(0, 5).map((filing) => {
    const report = filing.report || {};
    const bs = report.bs || [];
    const ic = report.ic || [];
    const cf = report.cf || [];

    const findValue = (arr, concept) => {
      const item = arr.find(
        (i) =>
          i.concept && i.concept.toLowerCase().includes(concept.toLowerCase()),
      );
      return item ? item.value : 0;
    };

    if (statementType === "income") {
      return {
        date: filing.year + "-01-01",
        revenue: findValue(ic, "Revenue") || findValue(ic, "Sales"),
        grossProfit: findValue(ic, "GrossProfit"),
        operatingIncome: findValue(ic, "OperatingIncome"),
        netIncome: findValue(ic, "NetIncome"),
        eps:
          findValue(ic, "EarningsPerShare") ||
          findValue(ic, "EarningsPerShareBasic"),
        ebitda: findValue(ic, "EBITDA"),
      };
    } else if (statementType === "balance") {
      return {
        date: filing.year + "-01-01",
        totalAssets: findValue(bs, "Assets"),
        totalLiabilities: findValue(bs, "Liabilities"),
        totalEquity:
          findValue(bs, "StockholdersEquity") || findValue(bs, "Equity"),
        totalDebt:
          findValue(bs, "LongTermDebt") + findValue(bs, "ShortTermDebt"),
        cashAndEquivalents: findValue(bs, "CashAndCashEquivalents"),
        shortTermInvestments: findValue(bs, "ShortTermInvestments"),
        goodwill: findValue(bs, "Goodwill"),
        intangibleAssets: findValue(bs, "IntangibleAssets"),
        totalCurrentAssets: findValue(bs, "CurrentAssets"),
        totalCurrentLiabilities: findValue(bs, "CurrentLiabilities"),
        inventory: findValue(bs, "Inventory"),
        propertyPlantEquipment: findValue(bs, "PropertyPlantAndEquipment"),
      };
    } else if (statementType === "cashflow") {
      const opCF =
        findValue(cf, "OperatingCashFlow") ||
        findValue(cf, "NetCashFromOperating");
      const capex = Math.abs(
        findValue(cf, "CapitalExpenditure") ||
          findValue(cf, "PurchaseOfPropertyPlant"),
      );
      return {
        date: filing.year + "-01-01",
        operatingCashFlow: opCF,
        capitalExpenditure: -capex,
        freeCashFlow: opCF - capex,
        dividendsPaid:
          findValue(cf, "DividendsPaid") || findValue(cf, "PaymentOfDividends"),
        shareRepurchase: findValue(cf, "RepurchaseOfCommonStock"),
      };
    }

    return {};
  });
}

// ===================================================================
// DATA NORMALIZERS — Yahoo Finance
// ===================================================================

function normalizeYahooProfile(data) {
  if (!data || !data.quoteSummary || !data.quoteSummary.result) return null;
  const modules = {};
  data.quoteSummary.result[0] &&
    Object.assign(modules, data.quoteSummary.result[0]);

  const price = modules.price || {};
  const stats = modules.defaultKeyStatistics || {};
  const financial = modules.financialData || {};
  const summary = modules.summaryDetail || {};
  const profile = modules.summaryProfile || {};

  const rawVal = (obj) => (obj && obj.raw !== undefined ? obj.raw : null);

  return {
    name: price.shortName || price.longName || "",
    symbol: price.symbol || "",
    price: rawVal(price.regularMarketPrice) || 0,
    marketCap: rawVal(price.marketCap) || 0,
    sector: profile.sector || "",
    industry: profile.industry || "",
    exchange: price.exchangeName || "",
    description: profile.longBusinessSummary || "",
    beta: rawVal(stats.beta) || 1.0,
    dividendYield: rawVal(summary.dividendYield) || 0,
    sharesOutstanding: rawVal(stats.sharesOutstanding) || 0,
    bookValue: rawVal(stats.bookValue) || 0,
    priceToBook: rawVal(stats.priceToBook) || 0,
    trailingPE: rawVal(summary.trailingPE) || 0,
    forwardPE: rawVal(stats.forwardPE) || 0,
    pegRatio: rawVal(stats.pegRatio) || 0,
    enterpriseValue: rawVal(stats.enterpriseValue) || 0,
    evToRevenue: rawVal(stats.enterpriseToRevenue) || 0,
    evToEbitda: rawVal(stats.enterpriseToEbitda) || 0,
    profitMargin: rawVal(financial.profitMargins) || 0,
    revenueGrowth: rawVal(financial.revenueGrowth) || 0,
    earningsGrowth: rawVal(financial.earningsGrowth) || 0,
  };
}

function normalizeYahooIncome(data) {
  if (!data || !data.quoteSummary || !data.quoteSummary.result) return [];
  const history =
    data.quoteSummary.result[0]?.incomeStatementHistory?.incomeStatementHistory;
  if (!history) return [];

  const rawVal = (obj) => (obj && obj.raw !== undefined ? obj.raw : 0);

  return history.map((d) => ({
    date: d.endDate?.fmt || "",
    revenue: rawVal(d.totalRevenue),
    grossProfit: rawVal(d.grossProfit),
    operatingIncome: rawVal(d.operatingIncome),
    netIncome: rawVal(d.netIncome),
    eps:
      rawVal(d.netIncome) /
      (rawVal(d.dilutedEPS) > 0
        ? rawVal(d.netIncome) / rawVal(d.dilutedEPS)
        : 1),
    ebitda: rawVal(d.ebit) + rawVal(d.depreciation),
  }));
}

function normalizeYahooBalance(data) {
  if (!data || !data.quoteSummary || !data.quoteSummary.result) return [];
  const history =
    data.quoteSummary.result[0]?.balanceSheetHistory?.balanceSheetStatements;
  if (!history) return [];

  const rawVal = (obj) => (obj && obj.raw !== undefined ? obj.raw : 0);

  return history.map((d) => ({
    date: d.endDate?.fmt || "",
    totalAssets: rawVal(d.totalAssets),
    totalLiabilities: rawVal(d.totalLiab),
    totalEquity: rawVal(d.totalStockholderEquity),
    totalDebt: rawVal(d.longTermDebt) + rawVal(d.shortLongTermDebt),
    cashAndEquivalents: rawVal(d.cash),
    shortTermInvestments: rawVal(d.shortTermInvestments),
    goodwill: rawVal(d.goodWill),
    intangibleAssets: rawVal(d.intangibleAssets),
    totalCurrentAssets: rawVal(d.totalCurrentAssets),
    totalCurrentLiabilities: rawVal(d.totalCurrentLiabilities),
    inventory: rawVal(d.inventory),
    propertyPlantEquipment: rawVal(d.propertyPlantEquipment),
  }));
}

function normalizeYahooCashflow(data) {
  if (!data || !data.quoteSummary || !data.quoteSummary.result) return [];
  const history =
    data.quoteSummary.result[0]?.cashflowStatementHistory?.cashflowStatements;
  if (!history) return [];

  const rawVal = (obj) => (obj && obj.raw !== undefined ? obj.raw : 0);

  return history.map((d) => ({
    date: d.endDate?.fmt || "",
    operatingCashFlow: rawVal(d.totalCashFromOperatingActivities),
    capitalExpenditure: rawVal(d.capitalExpenditures),
    freeCashFlow:
      rawVal(d.totalCashFromOperatingActivities) -
      Math.abs(rawVal(d.capitalExpenditures)),
    dividendsPaid: rawVal(d.dividendsPaid),
    shareRepurchase: rawVal(d.repurchaseOfStock),
  }));
}

// ===================================================================
// DATA NORMALIZERS — IEX Cloud
// ===================================================================

function normalizeIEXProfile(data, quote) {
  if (!data) return null;
  return {
    name: data.companyName,
    symbol: data.symbol,
    price: quote ? quote.latestPrice : 0,
    marketCap: quote ? quote.marketCap : 0,
    sector: data.sector,
    industry: data.industry,
    exchange: data.exchange,
    description: data.description,
    beta: quote ? quote.beta : null,
    dividendYield: null,
    sharesOutstanding: quote ? quote.sharesOutstanding : null,
  };
}

function normalizeIEXIncome(data) {
  if (!data || !data.income) return [];
  return data.income.map((d) => ({
    date: d.fiscalDate || d.reportDate || "",
    revenue: d.totalRevenue || 0,
    grossProfit: d.grossProfit || 0,
    operatingIncome: d.operatingIncome || 0,
    netIncome: d.netIncome || 0,
    eps: d.dilutedEPS || 0,
    ebitda: (d.operatingIncome || 0) + (d.depreciation || 0),
  }));
}

function normalizeIEXBalance(data) {
  if (!data || !data.balancesheet) return [];
  return data.balancesheet.map((d) => ({
    date: d.fiscalDate || d.reportDate || "",
    totalAssets: d.totalAssets || 0,
    totalLiabilities: d.totalLiabilities || 0,
    totalEquity: d.shareholderEquity || 0,
    totalDebt: (d.longTermDebt || 0) + (d.currentLongTermDebt || 0),
    cashAndEquivalents: d.currentCash || 0,
    shortTermInvestments: d.shortTermInvestments || 0,
    goodwill: d.goodwill || 0,
    intangibleAssets: d.intangibleAssets || 0,
    totalCurrentAssets: d.totalCurrentAssets || 0,
    totalCurrentLiabilities: d.totalCurrentLiabilities || 0,
    inventory: d.inventory || 0,
    propertyPlantEquipment: d.propertyPlantEquipment || 0,
  }));
}

function normalizeIEXCashflow(data) {
  if (!data || !data.cashflow) return [];
  return data.cashflow.map((d) => ({
    date: d.fiscalDate || d.reportDate || "",
    operatingCashFlow: d.cashFlow || 0,
    capitalExpenditure: d.capitalExpenditures
      ? -Math.abs(d.capitalExpenditures)
      : 0,
    freeCashFlow: (d.cashFlow || 0) - Math.abs(d.capitalExpenditures || 0),
    dividendsPaid: d.dividendsPaid || 0,
    shareRepurchase: d.cashFlowFinancing || 0,
  }));
}
