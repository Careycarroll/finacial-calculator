import { formatCurrencyShort, formatPct, formatRatio, formatNumber, trendArrow } from "./formatting.js";

// ===================================================================
// 10-K ANALYZER — Ratios, Scoring, Red Flags, Growth Calculations
// ===================================================================

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function safeDiv(numerator, denominator) {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function avg(a, b) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

function pctChange(current, previous) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function cagr(endValue, startValue, years) {
  if (
    endValue === null ||
    startValue === null ||
    startValue <= 0 ||
    endValue <= 0 ||
    years <= 0
  ) {
    return null;
  }
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

// ===================================================================
// MARGIN CALCULATIONS
// ===================================================================

export function calculateMargins(incomeStatement) {
  const rev = incomeStatement.revenue;

  return {
    grossMargin: safeDiv(incomeStatement.grossProfit, rev),
    operatingMargin: safeDiv(incomeStatement.operatingIncome, rev),
    ebitdaMargin: safeDiv(incomeStatement.ebitda, rev),
    ebitMargin: safeDiv(incomeStatement.ebit, rev),
    preTaxMargin: safeDiv(incomeStatement.ebt, rev),
    netMargin: safeDiv(incomeStatement.netIncome, rev),
    effectiveTaxRate: safeDiv(incomeStatement.taxExpense, incomeStatement.ebt),
    rdToRevenue: safeDiv(incomeStatement.researchAndDevelopment, rev),
    sgaToRevenue: safeDiv(incomeStatement.sellingGeneralAndAdmin, rev),
  };
}

// ===================================================================
// PROFITABILITY RATIOS
// ===================================================================

export function calculateProfitability(income, balance, prevBalance) {
  const avgEquity = avg(
    balance.totalEquity,
    prevBalance ? prevBalance.totalEquity : null,
  );
  const avgAssets = avg(
    balance.totalAssets,
    prevBalance ? prevBalance.totalAssets : null,
  );

  // NOPAT = Operating Income * (1 - Tax Rate)
  const taxRate = safeDiv(income.taxExpense, income.ebt);
  const nopat =
    income.operatingIncome !== null && taxRate !== null
      ? income.operatingIncome * (1 - taxRate)
      : null;

  // Invested Capital = Total Debt + Equity - Cash
  const investedCapital =
    balance.totalDebt !== null &&
    balance.totalEquity !== null &&
    balance.cash !== null
      ? balance.totalDebt + balance.totalEquity - balance.cash
      : null;

  return {
    roe: safeDiv(income.netIncome, avgEquity),
    roa: safeDiv(income.netIncome, avgAssets),
    roic: safeDiv(nopat, investedCapital),
    nopat,
    investedCapital,
  };
}

// ===================================================================
// LIQUIDITY RATIOS
// ===================================================================

export function calculateLiquidity(balance) {
  const quickAssets =
    balance.currentAssets !== null && balance.inventory !== null
      ? balance.currentAssets - balance.inventory
      : balance.currentAssets;

  return {
    currentRatio: safeDiv(balance.currentAssets, balance.currentLiabilities),
    quickRatio: safeDiv(quickAssets, balance.currentLiabilities),
    cashRatio: safeDiv(balance.cash, balance.currentLiabilities),
  };
}

// ===================================================================
// LEVERAGE RATIOS
// ===================================================================

export function calculateLeverage(income, balance) {
  return {
    debtToEquity: safeDiv(balance.totalDebt, balance.totalEquity),
    debtToAssets: safeDiv(balance.totalLiabilities, balance.totalAssets),
    interestCoverage: safeDiv(
      income.ebit || income.operatingIncome,
      income.interestExpense
        ? Math.abs(income.interestExpense)
        : income.interestExpense,
    ),
    debtToEbitda: safeDiv(balance.totalDebt, income.ebitda),
    netDebtToEbitda: safeDiv(balance.netDebt, income.ebitda),
    equityMultiplier: safeDiv(balance.totalAssets, balance.totalEquity),
  };
}

// ===================================================================
// EFFICIENCY RATIOS
// ===================================================================

export function calculateEfficiency(income, balance, prevBalance) {
  const avgAssets = avg(
    balance.totalAssets,
    prevBalance ? prevBalance.totalAssets : null,
  );
  const avgInventory = avg(
    balance.inventory,
    prevBalance ? prevBalance.inventory : null,
  );
  const avgReceivables = avg(
    balance.accountsReceivable,
    prevBalance ? prevBalance.accountsReceivable : null,
  );
  const avgPayables = avg(
    balance.accountsPayable,
    prevBalance ? prevBalance.accountsPayable : null,
  );

  const inventoryTurnover = safeDiv(income.costOfRevenue, avgInventory);
  const receivablesTurnover = safeDiv(income.revenue, avgReceivables);
  const payablesTurnover = safeDiv(income.costOfRevenue, avgPayables);

  return {
    assetTurnover: safeDiv(income.revenue, avgAssets),
    inventoryTurnover,
    receivablesTurnover,
    payablesTurnover,
    daysInventory: inventoryTurnover ? 365 / inventoryTurnover : null,
    daysSalesOutstanding: receivablesTurnover
      ? 365 / receivablesTurnover
      : null,
    daysPayable: payablesTurnover ? 365 / payablesTurnover : null,
    cashConversionCycle:
      inventoryTurnover && receivablesTurnover && payablesTurnover
        ? 365 / inventoryTurnover +
          365 / receivablesTurnover -
          365 / payablesTurnover
        : null,
  };
}

// ===================================================================
// PER SHARE METRICS
// ===================================================================

export function calculatePerShare(income, balance, cashFlow) {
  const shares = income.sharesDiluted || income.sharesBasic;

  return {
    epsBasic: income.epsBasic,
    epsDiluted: income.epsDiluted,
    bookValuePerShare: safeDiv(balance.totalEquity, shares),
    fcfPerShare: safeDiv(cashFlow.freeCashFlow, shares),
    revenuePerShare: safeDiv(income.revenue, shares),
    dividendsPerShare: cashFlow.dividendsPaid
      ? safeDiv(Math.abs(cashFlow.dividendsPaid), shares)
      : null,
    payoutRatio: safeDiv(
      cashFlow.dividendsPaid ? Math.abs(cashFlow.dividendsPaid) : null,
      income.netIncome,
    ),
  };
}

// ===================================================================
// CASH FLOW QUALITY
// ===================================================================

export function calculateCashFlowQuality(income, cashFlow) {
  return {
    ocfToNetIncome: safeDiv(cashFlow.operatingCashFlow, income.netIncome),
    fcfToNetIncome: safeDiv(cashFlow.freeCashFlow, income.netIncome),
    capexToRevenue: safeDiv(
      cashFlow.capitalExpenditures
        ? Math.abs(cashFlow.capitalExpenditures)
        : null,
      income.revenue,
    ),
    capexToOcf: safeDiv(
      cashFlow.capitalExpenditures
        ? Math.abs(cashFlow.capitalExpenditures)
        : null,
      cashFlow.operatingCashFlow,
    ),
    fcfToRevenue: safeDiv(cashFlow.freeCashFlow, income.revenue),
    buybackYield: safeDiv(
      cashFlow.shareBuybacks ? Math.abs(cashFlow.shareBuybacks) : null,
      income.revenue,
    ),
  };
}

// ===================================================================
// GROWTH CALCULATIONS
// ===================================================================

export function calculateGrowthRates(statements) {
  const { incomeStatements, balanceSheets, cashFlows } = statements;

  // Statements are sorted newest first — reverse for chronological order
  const incChron = [...incomeStatements].reverse();
  const bsChron = [...balanceSheets].reverse();
  const cfChron = [...cashFlows].reverse();

  // Year-over-year growth
  function yoyGrowth(arr, field) {
    const results = [];
    for (let i = 1; i < arr.length; i++) {
      const current = arr[i][field];
      const previous = arr[i - 1][field];
      results.push({
        period: arr[i].period,
        fy: arr[i].fy,
        growth: pctChange(current, previous),
      });
    }
    return results;
  }

  // CAGR between first and last available values
  function calcCAGR(arr, field) {
    const values = arr.filter((d) => d[field] !== null && d[field] > 0);
    if (values.length < 2) return null;
    const years = values.length - 1;
    return cagr(values[values.length - 1][field], values[0][field], years);
  }

  return {
    yoy: {
      revenue: yoyGrowth(incChron, "revenue"),
      grossProfit: yoyGrowth(incChron, "grossProfit"),
      operatingIncome: yoyGrowth(incChron, "operatingIncome"),
      ebitda: yoyGrowth(incChron, "ebitda"),
      ebit: yoyGrowth(incChron, "ebit"),
      netIncome: yoyGrowth(incChron, "netIncome"),
      eps: yoyGrowth(incChron, "epsDiluted"),
      operatingCashFlow: yoyGrowth(cfChron, "operatingCashFlow"),
      freeCashFlow: yoyGrowth(cfChron, "freeCashFlow"),
      totalAssets: yoyGrowth(bsChron, "totalAssets"),
      totalDebt: yoyGrowth(bsChron, "totalDebt"),
      totalEquity: yoyGrowth(bsChron, "totalEquity"),
    },
    cagr: {
      revenue: calcCAGR(incChron, "revenue"),
      grossProfit: calcCAGR(incChron, "grossProfit"),
      operatingIncome: calcCAGR(incChron, "operatingIncome"),
      ebitda: calcCAGR(incChron, "ebitda"),
      netIncome: calcCAGR(incChron, "netIncome"),
      epsDiluted: calcCAGR(incChron, "epsDiluted"),
      operatingCashFlow: calcCAGR(cfChron, "operatingCashFlow"),
      freeCashFlow: calcCAGR(cfChron, "freeCashFlow"),
      totalAssets: calcCAGR(bsChron, "totalAssets"),
    },
  };
}

// ===================================================================
// FULL RATIO ANALYSIS — One ratio set per period
// ===================================================================

export function calculateAllRatios(statements) {
  const { incomeStatements, balanceSheets, cashFlows } = statements;
  const ratios = [];

  for (let i = 0; i < incomeStatements.length; i++) {
    const income = incomeStatements[i];
    const balance = balanceSheets[i] || {};
    const cashFlow = cashFlows[i] || {};
    const prevBalance = balanceSheets[i + 1] || null;

    ratios.push({
      period: income.period,
      fy: income.fy,
      fp: income.fp,
      end: income.end,
      margins: calculateMargins(income),
      profitability: calculateProfitability(income, balance, prevBalance),
      liquidity: calculateLiquidity(balance),
      leverage: calculateLeverage(income, balance),
      efficiency: calculateEfficiency(income, balance, prevBalance),
      perShare: calculatePerShare(income, balance, cashFlow),
      cashFlowQuality: calculateCashFlowQuality(income, cashFlow),
    });
  }

  return ratios;
}

// ===================================================================
// FINANCIAL HEALTH SCORECARD — 0 to 10 rating
// ===================================================================

export function calculateHealthScore(ratios, growth) {
  const latest = ratios[0];
  if (!latest) return { overall: 0, categories: {} };

  function score(value, thresholds) {
    // thresholds: { excellent: x, good: x, fair: x, poor: x }
    // Returns 0-10
    if (value === null) return null;
    if (value >= thresholds.excellent) return 10;
    if (value >= thresholds.good) return 8;
    if (value >= thresholds.fair) return 6;
    if (value >= thresholds.poor) return 4;
    return 2;
  }

  function scoreInverse(value, thresholds) {
    // Lower is better (e.g., debt ratios)
    if (value === null) return null;
    if (value <= thresholds.excellent) return 10;
    if (value <= thresholds.good) return 8;
    if (value <= thresholds.fair) return 6;
    if (value <= thresholds.poor) return 4;
    return 2;
  }

  // Revenue Growth
  const revenueGrowthScore = score(growth.cagr.revenue, {
    excellent: 0.15,
    good: 0.08,
    fair: 0.03,
    poor: 0,
  });

  // Profitability
  const netMarginScore = score(latest.margins.netMargin, {
    excellent: 0.2,
    good: 0.1,
    fair: 0.05,
    poor: 0,
  });
  const roeScore = score(latest.profitability.roe, {
    excellent: 0.2,
    good: 0.12,
    fair: 0.08,
    poor: 0,
  });
  const roicScore = score(latest.profitability.roic, {
    excellent: 0.15,
    good: 0.1,
    fair: 0.06,
    poor: 0,
  });
  const profitabilityScores = [netMarginScore, roeScore, roicScore].filter(
    (s) => s !== null,
  );
  const profitabilityScore =
    profitabilityScores.length > 0
      ? profitabilityScores.reduce((a, b) => a + b, 0) /
        profitabilityScores.length
      : null;

  // Debt Health
  const debtToEquityScore = scoreInverse(latest.leverage.debtToEquity, {
    excellent: 0.5,
    good: 1.0,
    fair: 2.0,
    poor: 3.0,
  });
  const interestCoverageScore = score(latest.leverage.interestCoverage, {
    excellent: 10,
    good: 5,
    fair: 3,
    poor: 1.5,
  });
  const debtToEbitdaScore = scoreInverse(latest.leverage.debtToEbitda, {
    excellent: 1,
    good: 2,
    fair: 3,
    poor: 4,
  });
  const debtScores = [
    debtToEquityScore,
    interestCoverageScore,
    debtToEbitdaScore,
  ].filter((s) => s !== null);
  const debtScore =
    debtScores.length > 0
      ? debtScores.reduce((a, b) => a + b, 0) / debtScores.length
      : null;

  // Cash Generation
  const fcfMarginScore = score(latest.cashFlowQuality.fcfToRevenue, {
    excellent: 0.2,
    good: 0.1,
    fair: 0.05,
    poor: 0,
  });
  const ocfQualityScore = score(latest.cashFlowQuality.ocfToNetIncome, {
    excellent: 1.3,
    good: 1.0,
    fair: 0.8,
    poor: 0.5,
  });
  const cashScores = [fcfMarginScore, ocfQualityScore].filter(
    (s) => s !== null,
  );
  const cashScore =
    cashScores.length > 0
      ? cashScores.reduce((a, b) => a + b, 0) / cashScores.length
      : null;

  // Earnings Quality
  const earningsQualityScore = score(latest.cashFlowQuality.ocfToNetIncome, {
    excellent: 1.2,
    good: 1.0,
    fair: 0.7,
    poor: 0.4,
  });

  // Liquidity
  const currentRatioScore = score(latest.liquidity.currentRatio, {
    excellent: 2.0,
    good: 1.5,
    fair: 1.0,
    poor: 0.7,
  });

  // Aggregate
  const categories = {
    revenueGrowth: {
      score: revenueGrowthScore,
      label: "Revenue Growth",
      value: growth.cagr.revenue,
    },
    profitability: {
      score: profitabilityScore,
      label: "Profitability",
      value: latest.margins.netMargin,
    },
    debtHealth: {
      score: debtScore,
      label: "Debt Health",
      value: latest.leverage.debtToEquity,
    },
    cashGeneration: {
      score: cashScore,
      label: "Cash Generation",
      value: latest.cashFlowQuality.fcfToRevenue,
    },
    earningsQuality: {
      score: earningsQualityScore,
      label: "Earnings Quality",
      value: latest.cashFlowQuality.ocfToNetIncome,
    },
    liquidity: {
      score: currentRatioScore,
      label: "Liquidity",
      value: latest.liquidity.currentRatio,
    },
  };

  const allScores = Object.values(categories)
    .map((c) => c.score)
    .filter((s) => s !== null);
  const overall =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

  return { overall, categories };
}

// ===================================================================
// RED FLAG & HIGHLIGHT DETECTION
// ===================================================================

export function detectRedFlags(statements, ratios, growth) {
  const flags = [];
  const { incomeStatements, balanceSheets, cashFlows } = statements;

  // Need at least 2 years of data
  if (incomeStatements.length < 2) return flags;

  const latest = ratios[0];
  const incChron = [...incomeStatements].reverse();
  const bsChron = [...balanceSheets].reverse();
  const cfChron = [...cashFlows].reverse();

  // =============== REVENUE FLAGS ===============

  // Revenue declined year-over-year
  const revGrowth = growth.yoy.revenue;
  const consecutiveDeclines = countConsecutiveEnd(
    revGrowth,
    (g) => g.growth !== null && g.growth < 0,
  );
  if (consecutiveDeclines >= 2) {
    flags.push({
      type: "negative",
      severity: "high",
      category: "Revenue",
      message: `Revenue declined ${consecutiveDeclines} consecutive years`,
      detail:
        "Sustained revenue decline signals weakening demand or market share loss.",
    });
  } else if (consecutiveDeclines === 1) {
    flags.push({
      type: "warning",
      severity: "medium",
      category: "Revenue",
      message: "Revenue declined in the most recent year",
      detail:
        "Monitor whether this is a one-time event or the start of a trend.",
    });
  }

  // Revenue grew every year
  const allRevenueGrew = revGrowth.every(
    (g) => g.growth !== null && g.growth > 0,
  );
  if (allRevenueGrew && revGrowth.length >= 3) {
    flags.push({
      type: "positive",
      severity: "high",
      category: "Revenue",
      message: `Revenue grew every year for ${revGrowth.length} years`,
      detail: `${revGrowth.length}-year CAGR: ${formatPct(growth.cagr.revenue)}`,
    });
  }

  // =============== MARGIN FLAGS ===============

  // Gross margin declining
  const grossMargins = ratios
    .map((r) => r.margins.grossMargin)
    .filter((m) => m !== null)
    .reverse();
  const gmDeclines = countConsecutiveEnd(
    grossMargins
      .map((m, i) => (i > 0 ? { diff: m - grossMargins[i - 1] } : null))
      .filter(Boolean),
    (d) => d.diff < -0.005,
  );
  if (gmDeclines >= 3) {
    flags.push({
      type: "negative",
      severity: "medium",
      category: "Margins",
      message: `Gross margin declined ${gmDeclines} consecutive years`,
      detail: `Current: ${formatPct(latest.margins.grossMargin)}. Pricing power or cost structure may be deteriorating.`,
    });
  }

  // Net margin declining
  const netMargins = ratios
    .map((r) => r.margins.netMargin)
    .filter((m) => m !== null)
    .reverse();
  const nmDeclines = countConsecutiveEnd(
    netMargins
      .map((m, i) => (i > 0 ? { diff: m - netMargins[i - 1] } : null))
      .filter(Boolean),
    (d) => d.diff < -0.005,
  );
  if (nmDeclines >= 3) {
    flags.push({
      type: "negative",
      severity: "medium",
      category: "Margins",
      message: `Net margin declined ${nmDeclines} consecutive years`,
      detail: `Current: ${formatPct(latest.margins.netMargin)}.`,
    });
  }

  // Margins expanding
  if (
    grossMargins.length >= 3 &&
    grossMargins[grossMargins.length - 1] >
      grossMargins[grossMargins.length - 3] + 0.01
  ) {
    flags.push({
      type: "positive",
      severity: "medium",
      category: "Margins",
      message: "Gross margin expanding over the past 3 years",
      detail: `Current: ${formatPct(latest.margins.grossMargin)}. Indicates improving pricing power or cost efficiency.`,
    });
  }

  // =============== DEBT FLAGS ===============

  if (
    latest.leverage.debtToEquity !== null &&
    latest.leverage.debtToEquity > 2
  ) {
    flags.push({
      type: "negative",
      severity: "medium",
      category: "Debt",
      message: `Debt-to-equity ratio is ${latest.leverage.debtToEquity.toFixed(2)}x`,
      detail:
        "Above 2.0x indicates heavy leverage. Check if the industry norm supports this.",
    });
  }

  if (
    latest.leverage.interestCoverage !== null &&
    latest.leverage.interestCoverage < 3
  ) {
    flags.push({
      type: "negative",
      severity: "high",
      category: "Debt",
      message: `Interest coverage is only ${latest.leverage.interestCoverage.toFixed(1)}x`,
      detail:
        "Below 3x means the company may struggle to service debt in a downturn.",
    });
  }

  if (
    latest.leverage.debtToEbitda !== null &&
    latest.leverage.debtToEbitda > 4
  ) {
    flags.push({
      type: "negative",
      severity: "high",
      category: "Debt",
      message: `Debt/EBITDA is ${latest.leverage.debtToEbitda.toFixed(1)}x`,
      detail:
        "Above 4x is considered highly leveraged by credit rating agencies.",
    });
  }

  // Debt growing faster than revenue
  if (growth.cagr.revenue !== null) {
    const debtGrowth = growth.yoy.totalDebt;
    if (debtGrowth.length >= 2) {
      const avgDebtGrowth =
        debtGrowth
          .filter((d) => d.growth !== null)
          .reduce((sum, d) => sum + d.growth, 0) /
        debtGrowth.filter((d) => d.growth !== null).length;
      if (avgDebtGrowth > growth.cagr.revenue + 0.05) {
        flags.push({
          type: "warning",
          severity: "medium",
          category: "Debt",
          message: "Long-term debt growing faster than revenue",
          detail: `Avg debt growth: ${formatPct(avgDebtGrowth)} vs revenue CAGR: ${formatPct(growth.cagr.revenue)}.`,
        });
      }
    }
  }

  // Low debt — positive
  if (
    latest.leverage.debtToEquity !== null &&
    latest.leverage.debtToEquity < 0.5 &&
    latest.leverage.debtToEquity >= 0
  ) {
    flags.push({
      type: "positive",
      severity: "medium",
      category: "Debt",
      message: `Low debt-to-equity ratio (${latest.leverage.debtToEquity.toFixed(2)}x)`,
      detail: "Conservative balance sheet with minimal leverage.",
    });
  }

  // =============== EARNINGS QUALITY FLAGS ===============

  // Net income exceeds operating cash flow (aggressive accounting)
  const niExceedsOcf = cfChron.filter((cf, i) => {
    const ni = incChron[i]?.netIncome;
    return (
      ni !== null &&
      cf.operatingCashFlow !== null &&
      ni > cf.operatingCashFlow &&
      ni > 0
    );
  });
  if (niExceedsOcf.length >= 2) {
    flags.push({
      type: "negative",
      severity: "high",
      category: "Earnings Quality",
      message: `Net income exceeded operating cash flow in ${niExceedsOcf.length} of ${cfChron.length} years`,
      detail:
        "When earnings consistently exceed cash flow, it may indicate aggressive revenue recognition or accrual manipulation.",
    });
  }

  // OCF consistently exceeds net income — positive
  const ocfExceedsNi = cfChron.filter((cf, i) => {
    const ni = incChron[i]?.netIncome;
    return (
      ni !== null &&
      ni > 0 &&
      cf.operatingCashFlow !== null &&
      cf.operatingCashFlow > ni
    );
  });
  if (ocfExceedsNi.length >= Math.max(cfChron.length - 1, 3)) {
    flags.push({
      type: "positive",
      severity: "high",
      category: "Earnings Quality",
      message: "Operating cash flow consistently exceeds net income",
      detail: "High-quality earnings backed by real cash generation.",
    });
  }

  // =============== CASH FLOW FLAGS ===============

  // FCF positive every year
  const allFcfPositive = cfChron.every(
    (cf) => cf.freeCashFlow !== null && cf.freeCashFlow > 0,
  );
  if (allFcfPositive && cfChron.length >= 3) {
    flags.push({
      type: "positive",
      severity: "high",
      category: "Cash Flow",
      message: `Free cash flow positive every year for ${cfChron.length} years`,
      detail: "Consistent FCF generation indicates a durable business model.",
    });
  }

  // FCF negative
  const latestCF = cashFlows[0];
  if (latestCF && latestCF.freeCashFlow !== null && latestCF.freeCashFlow < 0) {
    flags.push({
      type: "negative",
      severity: "medium",
      category: "Cash Flow",
      message: "Free cash flow is negative in the most recent year",
      detail: `FCF: ${formatCurrencyShort(latestCF.freeCashFlow)}. The company is spending more than it generates.`,
    });
  }

  // =============== SHARE COUNT FLAGS ===============

  const sharesChron = incChron
    .map((inc) => inc.sharesBasic || inc.sharesDiluted)
    .filter((s) => s !== null);
  if (sharesChron.length >= 3) {
    const sharesDecreasing =
      sharesChron[sharesChron.length - 1] < sharesChron[0];
    const shareChange =
      (sharesChron[sharesChron.length - 1] - sharesChron[0]) / sharesChron[0];

    if (sharesDecreasing && shareChange < -0.02) {
      flags.push({
        type: "positive",
        severity: "medium",
        category: "Shareholder Returns",
        message: `Share count reduced by ${formatPct(Math.abs(shareChange))} over ${sharesChron.length} years`,
        detail: "Buybacks are reducing the float, increasing per-share value.",
      });
    } else if (!sharesDecreasing && shareChange > 0.05) {
      flags.push({
        type: "warning",
        severity: "medium",
        category: "Shareholder Returns",
        message: `Share count increased by ${formatPct(shareChange)} over ${sharesChron.length} years`,
        detail: "Dilution from stock-based compensation or equity issuance.",
      });
    }
  }

  // =============== RECEIVABLES FLAG ===============

  if (growth.cagr.revenue !== null) {
    const arChron = bsChron
      .map((bs) => bs.accountsReceivable)
      .filter((ar) => ar !== null);
    if (arChron.length >= 3) {
      const arCAGR = cagr(
        arChron[arChron.length - 1],
        arChron[0],
        arChron.length - 1,
      );
      if (arCAGR !== null && arCAGR > growth.cagr.revenue + 0.05) {
        flags.push({
          type: "warning",
          severity: "medium",
          category: "Earnings Quality",
          message: "Accounts receivable growing faster than revenue",
          detail: `AR CAGR: ${formatPct(arCAGR)} vs Revenue CAGR: ${formatPct(growth.cagr.revenue)}. May indicate difficulty collecting or channel stuffing.`,
        });
      }
    }
  }

  // =============== LIQUIDITY FLAG ===============

  if (
    latest.liquidity.currentRatio !== null &&
    latest.liquidity.currentRatio < 1.0
  ) {
    flags.push({
      type: "negative",
      severity: "high",
      category: "Liquidity",
      message: `Current ratio is ${latest.liquidity.currentRatio.toFixed(2)}x (below 1.0)`,
      detail:
        "Current liabilities exceed current assets. The company may struggle to meet short-term obligations.",
    });
  }

  // Sort: negatives first, then warnings, then positives
  const typeOrder = { negative: 0, warning: 1, positive: 2 };
  const severityOrder = { high: 0, medium: 1, low: 2 };
  flags.sort((a, b) => {
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return flags;
}

// ===================================================================
// HELPER — Count consecutive matching items from the end of an array
// ===================================================================

function countConsecutiveEnd(arr, predicate) {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ===================================================================
// FORMATTING HELPERS
// ===================================================================

// Formatting functions imported from formatting.js

// ===================================================================
// MAIN ANALYSIS ENTRY POINT
// ===================================================================

export function analyzeFinancials(secData) {
  const statements = {
    incomeStatements: secData.incomeStatements,
    balanceSheets: secData.balanceSheets,
    cashFlows: secData.cashFlows,
  };

  const ratios = calculateAllRatios(statements);
  const growth = calculateGrowthRates(statements);
  const healthScore = calculateHealthScore(ratios, growth);
  const redFlags = detectRedFlags(statements, ratios, growth);

  return {
    ticker: secData.ticker,
    name: secData.name,
    cik: secData.cik,
    formType: secData.formType,
    years: secData.years,
    statements,
    ratios,
    growth,
    healthScore,
    redFlags,
  };
}
