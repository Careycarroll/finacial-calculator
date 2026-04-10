// ===================================================================
// SEC EDGAR API — 10-K/10-Q Financial Data Fetcher
// ===================================================================

const SEC_BASE_URL = "https://data.sec.gov";
const SEC_WWW_URL = "https://www.sec.gov";
const CORS_PROXY = "http://localhost:3001/?url=";
const SEC_TICKERS_LOCAL = "../js/company_tickers.json";
const SEC_TICKER_CACHE_KEY = "sec_tickers";
const SEC_FACTS_DB_NAME = "sec_facts_cache";
const SEC_FACTS_DB_VERSION = 1;
const SEC_FACTS_STORE = "company_facts";
const SEC_CACHE_EXPIRY_DAYS = 7;

// ===================================================================
// INDEXEDDB CACHE — Stores large CompanyFacts JSON locally
// ===================================================================

function openFactsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SEC_FACTS_DB_NAME, SEC_FACTS_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SEC_FACTS_STORE)) {
        db.createObjectStore(SEC_FACTS_STORE, { keyPath: "cik" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedFacts(cik) {
  try {
    const db = await openFactsDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SEC_FACTS_STORE, "readonly");
      const store = tx.objectStore(SEC_FACTS_STORE);
      const request = store.get(cik);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) return resolve(null);

        // Check expiry
        const age = Date.now() - result.timestamp;
        const maxAge = SEC_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (age > maxAge) {
          resolve(null);
        } else {
          console.log(
            `Cache hit for CIK ${cik} (${((Date.now() - result.timestamp) / 3600000).toFixed(1)}h old)`,
          );
          resolve(result.data);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedFacts(cik, data) {
  try {
    const db = await openFactsDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SEC_FACTS_STORE, "readwrite");
      const store = tx.objectStore(SEC_FACTS_STORE);
      store.put({
        cik,
        data,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => {
        console.log(`Cached SEC data for CIK ${cik}`);
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch {
    // silently fail
  }
}
// ===================================================================
// CONCEPT MAPPING — Priority-ordered fallbacks for each line item
// ===================================================================

const CONCEPT_MAP = {
  // =============== INCOME STATEMENT ===============
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
    "RevenueNet",
    "TotalRevenuesAndOtherIncome",
  ],
  costOfRevenue: [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
    "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
  ],
  grossProfit: ["GrossProfit"],
  researchAndDevelopment: [
    "ResearchAndDevelopmentExpense",
    "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    "ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost",
  ],
  sellingGeneralAndAdmin: [
    "SellingGeneralAndAdministrativeExpense",
    "SellingAndMarketingExpense",
    "GeneralAndAdministrativeExpense",
  ],
  operatingExpenses: ["OperatingExpenses", "CostsAndExpenses"],
  operatingIncome: [
    "OperatingIncomeLoss",
    "IncomeLossFromContinuingOperations",
  ],
  interestExpense: [
    "InterestExpense",
    "InterestExpenseDebt",
    "InterestPaid",
    "InterestIncomeExpenseNet",
  ],
  taxExpense: [
    "IncomeTaxExpenseBenefit",
    "IncomeTaxesPaid",
    "IncomeTaxExpenseBenefitContinuingOperations",
  ],
  ebt: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  netIncome: [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
    "NetIncomeLossAvailableToCommonStockholdersDiluted",
  ],
  epsBasic: ["EarningsPerShareBasic"],
  epsDiluted: ["EarningsPerShareDiluted"],
  sharesBasic: [
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "CommonStockSharesOutstanding",
  ],
  sharesDiluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  depreciation: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "Depreciation",
    "DepreciationAmortizationAndAccretionNet",
  ],

  // =============== BALANCE SHEET ===============
  totalAssets: ["Assets"],
  currentAssets: ["AssetsCurrent"],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsAndShortTermInvestments",
    "Cash",
  ],
  shortTermInvestments: [
    "ShortTermInvestments",
    "AvailableForSaleSecuritiesCurrent",
    "MarketableSecuritiesCurrent",
    "ShortTermInvestmentsAndTradingAssets",
  ],
  accountsReceivable: [
    "AccountsReceivableNetCurrent",
    "AccountsReceivableNet",
    "ReceivablesNetCurrent",
    "TradeAndOtherReceivablesNetCurrent",
  ],
  inventory: [
    "InventoryNet",
    "InventoryFinishedGoods",
    "InventoryRawMaterials",
  ],
  propertyPlantEquipment: [
    "PropertyPlantAndEquipmentNet",
    "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
  ],
  goodwill: ["Goodwill"],
  intangibleAssets: [
    "IntangibleAssetsNetExcludingGoodwill",
    "IntangibleAssetsNetIncludingGoodwill",
    "FiniteLivedIntangibleAssetsNet",
  ],
  totalLiabilities: ["Liabilities"],
  currentLiabilities: ["LiabilitiesCurrent"],
  accountsPayable: [
    "AccountsPayableCurrent",
    "AccountsPayable",
    "AccountsPayableAndAccruedLiabilitiesCurrent",
  ],
  shortTermDebt: [
    "ShortTermBorrowings",
    "DebtCurrent",
    "LongTermDebtCurrent",
    "CommercialPaper",
  ],
  longTermDebt: [
    "LongTermDebtNoncurrent",
    "LongTermDebt",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
  ],
  totalEquity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  retainedEarnings: ["RetainedEarningsAccumulatedDeficit"],
  treasuryStock: ["TreasuryStockValue", "TreasuryStockCommonValue"],
  sharesOutstanding: [
    "CommonStockSharesOutstanding",
    "EntityCommonStockSharesOutstanding",
  ],

  // =============== CASH FLOW ===============
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  investingCashFlow: [
    "NetCashProvidedByUsedInInvestingActivities",
    "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
  ],
  financingCashFlow: [
    "NetCashProvidedByUsedInFinancingActivities",
    "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
  ],
  capitalExpenditures: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PaymentsForCapitalImprovements",
  ],
  dividendsPaid: [
    "PaymentsOfDividendsCommonStock",
    "PaymentsOfDividends",
    "PaymentsOfOrdinaryDividends",
  ],
  shareBuybacks: [
    "PaymentsForRepurchaseOfCommonStock",
    "PaymentsForRepurchaseOfEquity",
  ],
  debtIssued: [
    "ProceedsFromIssuanceOfLongTermDebt",
    "ProceedsFromDebtNetOfIssuanceCosts",
    "ProceedsFromIssuanceOfDebt",
  ],
  debtRepaid: [
    "RepaymentsOfLongTermDebt",
    "RepaymentsOfDebt",
    "RepaymentsOfLongTermDebtAndCapitalSecurities",
  ],
};

// ===================================================================
// TICKER → CIK LOOKUP
// ===================================================================

async function loadTickerMap() {
  const cached = sessionStorage.getItem(SEC_TICKER_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  let data;

  // Try local file first
  try {
    const localResponse = await fetch(SEC_TICKERS_LOCAL);
    if (localResponse.ok) {
      const text = await localResponse.text();
      if (text.length > 10000) {
        data = JSON.parse(text);
      }
    }
  } catch (e) {
    console.warn("Local ticker file not available:", e.message);
  }

  // Fall back to proxy
  if (!data) {
    try {
      const url = `${CORS_PROXY}${SEC_WWW_URL}/files/company_tickers.json`;
      const response = await fetch(url);
      if (response.ok) {
        data = await response.json();
      }
    } catch (e) {
      console.warn("Proxy ticker fetch failed:", e.message);
    }
  }

  if (!data) {
    throw new Error(
      "Could not load SEC ticker data. Please check your connection and try again.",
    );
  }

  const tickerMap = {};
  Object.values(data).forEach((entry) => {
    tickerMap[entry.ticker.toUpperCase()] = {
      cik: entry.cik_str,
      name: entry.title,
    };
  });

  sessionStorage.setItem(SEC_TICKER_CACHE_KEY, JSON.stringify(tickerMap));
  return tickerMap;
}

async function lookupCIK(ticker) {
  const tickerMap = await loadTickerMap();
  const entry = tickerMap[ticker.toUpperCase().trim()];

  if (!entry) {
    throw new Error(
      `Ticker "${ticker}" not found in SEC database. Check the symbol and try again.`,
    );
  }

  return entry;
}

// ===================================================================
// COMPANY FACTS FETCHER
// ===================================================================

async function fetchCompanyFacts(cik) {
  const paddedCIK = String(cik).padStart(10, "0");

  // Check IndexedDB cache first
  const cached = await getCachedFacts(paddedCIK);
  if (cached) {
    return cached;
  }

  const url = `${CORS_PROXY}${encodeURIComponent(SEC_BASE_URL + "/api/xbrl/companyfacts/CIK" + paddedCIK + ".json")}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `No XBRL data found for CIK ${paddedCIK}. This company may not file electronically.`,
      );
    }
    throw new Error(`SEC API returned HTTP ${response.status}`);
  }

  const data = await response.json();

  // Cache to IndexedDB
  await setCachedFacts(paddedCIK, data);

  return data;
}

// ===================================================================
// DATA EXTRACTION — Pull values for a concept from raw SEC data
// ===================================================================

function extractConcept(facts, conceptKey, unit) {
  unit = unit || "USD";
  const concepts = CONCEPT_MAP[conceptKey];
  if (!concepts) return [];

  const usGaap = facts.facts["us-gaap"] || {};
  const dei = facts.facts["dei"] || {};

  let bestResult = [];
  let bestLatestDate = "";

  for (const concept of concepts) {
    const source = usGaap[concept] || dei[concept];
    if (!source) continue;

    const unitData = source.units[unit];
    if (!unitData || unitData.length === 0) continue;

    // Find the most recent end date in this concept's data
    const latestDate = unitData.reduce((max, d) => {
      return d.end > max ? d.end : max;
    }, "");

    // Prefer the concept with the most recent data
    if (latestDate > bestLatestDate) {
      bestLatestDate = latestDate;
      bestResult = unitData;
    }
  }

  return bestResult;
}

function findConceptName(facts, conceptKey, unit) {
  unit = unit || "USD";
  const concepts = CONCEPT_MAP[conceptKey];
  if (!concepts) return null;

  const usGaap = facts.facts["us-gaap"] || {};
  const dei = facts.facts["dei"] || {};

  for (const concept of concepts) {
    const source = usGaap[concept] || dei[concept];
    if (!source) continue;
    if (source.units[unit] && source.units[unit].length > 0) {
      return concept;
    }
  }

  return null;
}

// ===================================================================
// DATA FILTERING — Annual (10-K) or Quarterly (10-Q)
// ===================================================================

function filterAnnualData(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) return [];

  let annual = dataPoints.filter(
    (d) => d.form === "10-K" || d.form === "10-K/A",
  );

  if (annual.length === 0) return [];

  const hasStart = annual.some((d) => d.start);
  if (hasStart) {
    annual = annual.filter((d) => {
      if (!d.start) return false;
      const start = new Date(d.start);
      const end = new Date(d.end);
      const days = (end - start) / (1000 * 60 * 60 * 24);
      return days > 300 && days < 400;
    });
  }

  // Deduplicate by end date — keep the most recently filed version
  const byEnd = {};
  annual.forEach((d) => {
    const key = d.end;
    if (!byEnd[key] || new Date(d.filed) > new Date(byEnd[key].filed)) {
      byEnd[key] = d;
    }
  });

  // Derive display year from end date and override fy
  Object.values(byEnd).forEach((d) => {
    const endDate = new Date(d.end);
    const month = endDate.getMonth(); // 0-indexed
    // If fiscal year ends in Jan-May, the fiscal year is the same calendar year
    // If it ends Jun-Dec, the fiscal year is that calendar year
    // Apple ends in Sept -> FY is that year (FY2024 ends Sept 2024)
    d.displayYear = endDate.getFullYear();
  });

  return Object.values(byEnd).sort((a, b) => new Date(b.end) - new Date(a.end));
}

function filterQuarterlyData(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) return [];

  let quarterly = dataPoints.filter(
    (d) => d.form === "10-Q" || d.form === "10-Q/A",
  );

  if (quarterly.length === 0) return [];

  // For period items, only keep ~3 month periods
  const hasStart = quarterly.some((d) => d.start);
  if (hasStart) {
    quarterly = quarterly.filter((d) => {
      if (!d.start) return false;
      const start = new Date(d.start);
      const end = new Date(d.end);
      const days = (end - start) / (1000 * 60 * 60 * 24);
      return days > 60 && days < 120; // ~3 months
    });
  }

  // Deduplicate by end date
  const byEnd = {};
  quarterly.forEach((d) => {
    const key = d.end;
    if (!byEnd[key] || new Date(d.filed) > new Date(byEnd[key].filed)) {
      byEnd[key] = d;
    }
  });

  return Object.values(byEnd).sort((a, b) => new Date(b.end) - new Date(a.end));
}

// ===================================================================
// FINANCIAL STATEMENT BUILDER — Assemble normalized statements
// ===================================================================

function buildFinancialStatements(facts, years, formType) {
  const filterFn = formType === "10-Q" ? filterQuarterlyData : filterAnnualData;
  const limit = years || 5;

  function getValues(conceptKey, unit) {
    const raw = extractConcept(facts, conceptKey, unit);
    const filtered = filterFn(raw);
    return filtered.slice(0, formType === "10-Q" ? limit * 4 : limit);
  }

  // Determine available periods from revenue (most reliable)
  let periods = getValues("revenue").map((d) => ({
    key: d.end,
    fy: d.displayYear || new Date(d.end).getFullYear(),
    fp: d.fp,
    end: d.end,
    filed: d.filed,
  }));

  // Fallback to net income if no revenue
  if (periods.length === 0) {
    periods = getValues("netIncome").map((d) => ({
      key: d.end,
      fy: d.displayYear || new Date(d.end).getFullYear(),
      fp: d.fp,
      end: d.end,
      filed: d.filed,
    }));
  }

  // Limit periods
  periods = periods.slice(0, formType === "10-Q" ? limit * 4 : limit);

  // Build value maps keyed by end date
  function toMap(values) {
    const map = {};
    values.forEach((d) => {
      map[d.end] = d;
    });
    return map;
  }

  const maps = {};
  Object.keys(CONCEPT_MAP).forEach((conceptKey) => {
    const unit = ["epsBasic", "epsDiluted"].includes(conceptKey)
      ? "USD/shares"
      : ["sharesBasic", "sharesDiluted", "sharesOutstanding"].includes(
            conceptKey,
          )
        ? "shares"
        : "USD";

    const raw = extractConcept(facts, conceptKey, unit);
    const filtered = filterFn(raw);
    maps[conceptKey] = toMap(filtered);
  });

  // For balance sheet items (no start date), we need a different filter
  // They're point-in-time, so filter by form and deduplicate by end date
  function getBalanceSheetMap(conceptKey) {
    const raw = extractConcept(facts, conceptKey, "USD");
    if (!raw || raw.length === 0) return {};

    let items = raw.filter(
      (d) =>
        (formType === "10-Q"
          ? d.form === "10-Q" || d.form === "10-Q/A"
          : d.form === "10-K" || d.form === "10-K/A") && !d.start, // Balance sheet items typically don't have start
    );

    // If no items without start, try all items for this form type
    if (items.length === 0) {
      items = raw.filter((d) =>
        formType === "10-Q"
          ? d.form === "10-Q" || d.form === "10-Q/A"
          : d.form === "10-K" || d.form === "10-K/A",
      );
    }

    const byEnd = {};
    items.forEach((d) => {
      if (!byEnd[d.end] || new Date(d.filed) > new Date(byEnd[d.end].filed)) {
        byEnd[d.end] = d;
      }
    });

    return byEnd;
  }

  // Override balance sheet concept maps
  const bsConcepts = [
    "totalAssets",
    "currentAssets",
    "cash",
    "shortTermInvestments",
    "accountsReceivable",
    "inventory",
    "propertyPlantEquipment",
    "goodwill",
    "intangibleAssets",
    "totalLiabilities",
    "currentLiabilities",
    "accountsPayable",
    "shortTermDebt",
    "longTermDebt",
    "totalEquity",
    "retainedEarnings",
    "treasuryStock",
    "sharesOutstanding",
  ];

  bsConcepts.forEach((key) => {
    maps[key] = getBalanceSheetMap(key);
  });

  // Also get shares from dei namespace for sharesOutstanding
  if (Object.keys(maps.sharesOutstanding).length === 0) {
    const deiShares =
      facts.facts["dei"]?.["EntityCommonStockSharesOutstanding"];
    if (deiShares?.units?.shares) {
      const items = deiShares.units.shares.filter(
        (d) => d.form === "10-K" || d.form === "10-K/A",
      );
      const byEnd = {};
      items.forEach((d) => {
        if (!byEnd[d.end] || new Date(d.filed) > new Date(byEnd[d.end].filed)) {
          byEnd[d.end] = d;
        }
      });
      maps.sharesOutstanding = byEnd;
    }
  }

  function val(conceptKey, periodEnd) {
    const entry = maps[conceptKey]?.[periodEnd];
    return entry ? entry.val : null;
  }

  // =============== BUILD INCOME STATEMENTS ===============
  const incomeStatements = periods.map((period) => {
    const revenue = val("revenue", period.end);
    const costOfRevenue = val("costOfRevenue", period.end);
    const grossProfit =
      val("grossProfit", period.end) ||
      (revenue && costOfRevenue ? revenue - costOfRevenue : null);
    const rd = val("researchAndDevelopment", period.end);
    const sga = val("sellingGeneralAndAdmin", period.end);
    const operatingIncome = val("operatingIncome", period.end);
    const interestExpense = val("interestExpense", period.end);
    const taxExpense = val("taxExpense", period.end);
    const netIncome = val("netIncome", period.end);
    const da = val("depreciation", period.end);
    const ebt =
      val("ebt", period.end) ||
      (netIncome !== null && taxExpense !== null
        ? netIncome + taxExpense
        : null);
    const ebit =
      operatingIncome ||
      (ebt !== null && interestExpense !== null
        ? ebt + Math.abs(interestExpense)
        : null);
    const ebitda = ebit !== null && da !== null ? ebit + Math.abs(da) : null;

    return {
      period: period.key,
      fy: period.fy,
      fp: period.fp,
      end: period.end,
      filed: period.filed,
      revenue,
      costOfRevenue,
      grossProfit,
      researchAndDevelopment: rd,
      sellingGeneralAndAdmin: sga,
      operatingIncome,
      ebitda,
      ebit,
      interestExpense,
      ebt,
      taxExpense,
      netIncome,
      depreciation: da,
      epsBasic: val("epsBasic", period.end),
      epsDiluted: val("epsDiluted", period.end),
      sharesBasic: val("sharesBasic", period.end),
      sharesDiluted: val("sharesDiluted", period.end),
    };
  });

  // =============== BUILD BALANCE SHEETS ===============
  const balanceSheets = periods.map((period) => {
    const totalAssets = val("totalAssets", period.end);
    const currentAssets = val("currentAssets", period.end);
    const cashVal = val("cash", period.end);
    const shortTermInvestments = val("shortTermInvestments", period.end);
    const accountsReceivable = val("accountsReceivable", period.end);
    const inventoryVal = val("inventory", period.end);
    const ppe = val("propertyPlantEquipment", period.end);
    const goodwill = val("goodwill", period.end);
    const intangibles = val("intangibleAssets", period.end);
    const totalLiabilities = val("totalLiabilities", period.end);
    const currentLiabilities = val("currentLiabilities", period.end);
    const accountsPayable = val("accountsPayable", period.end);
    const shortTermDebt = val("shortTermDebt", period.end);
    const longTermDebt = val("longTermDebt", period.end);
    const totalEquity = val("totalEquity", period.end);
    const retainedEarnings = val("retainedEarnings", period.end);
    const treasuryStock = val("treasuryStock", period.end);
    const sharesOut = val("sharesOutstanding", period.end);

    const totalDebt =
      shortTermDebt !== null || longTermDebt !== null
        ? (shortTermDebt || 0) + (longTermDebt || 0)
        : null;
    const netDebt =
      totalDebt !== null && cashVal !== null ? totalDebt - cashVal : null;

    return {
      period: period.key,
      fy: period.fy,
      fp: period.fp,
      end: period.end,
      filed: period.filed,
      totalAssets,
      currentAssets,
      cash: cashVal,
      shortTermInvestments,
      accountsReceivable,
      inventory: inventoryVal,
      propertyPlantEquipment: ppe,
      goodwill,
      intangibleAssets: intangibles,
      totalLiabilities,
      currentLiabilities,
      accountsPayable,
      shortTermDebt,
      longTermDebt,
      totalDebt,
      netDebt,
      totalEquity,
      retainedEarnings,
      treasuryStock,
      sharesOutstanding: sharesOut,
    };
  });

  // =============== BUILD CASH FLOW STATEMENTS ===============
  const cashFlows = periods.map((period) => {
    const operatingCF = val("operatingCashFlow", period.end);
    const investingCF = val("investingCashFlow", period.end);
    const financingCF = val("financingCashFlow", period.end);
    const capex = val("capitalExpenditures", period.end);
    const da = val("depreciation", period.end);
    const dividends = val("dividendsPaid", period.end);
    const buybacks = val("shareBuybacks", period.end);
    const debtIssuedVal = val("debtIssued", period.end);
    const debtRepaidVal = val("debtRepaid", period.end);

    const freeCashFlow =
      operatingCF !== null && capex !== null
        ? operatingCF - Math.abs(capex)
        : operatingCF;

    return {
      period: period.key,
      fy: period.fy,
      fp: period.fp,
      end: period.end,
      filed: period.filed,
      operatingCashFlow: operatingCF,
      investingCashFlow: investingCF,
      financingCashFlow: financingCF,
      capitalExpenditures: capex,
      freeCashFlow,
      depreciation: da,
      dividendsPaid: dividends,
      shareBuybacks: buybacks,
      debtIssued: debtIssuedVal,
      debtRepaid: debtRepaidVal,
    };
  });

  return {
    incomeStatements,
    balanceSheets,
    cashFlows,
  };
}

// ===================================================================
// MAIN ENTRY POINT — Fetch and build everything
// ===================================================================

async function fetchSECData(ticker, years, formType) {
  years = years || 5;
  formType = formType || "10-K";

  // Step 1: Lookup CIK
  const company = await lookupCIK(ticker);

  // Step 2: Fetch all company facts
  const facts = await fetchCompanyFacts(company.cik);

  // Step 3: Build normalized financial statements
  const statements = buildFinancialStatements(facts, years, formType);

  return {
    ticker: ticker.toUpperCase().trim(),
    name: company.name || facts.entityName || ticker,
    cik: company.cik,
    formType,
    years,
    ...statements,
    _raw: facts, // Keep raw data for debugging or advanced use
  };
}
