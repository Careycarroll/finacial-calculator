// ===================================================================
// STOCK VALUATOR — Multi-Method Valuation Engine
// ===================================================================

function evaluateStock(data) {
  const results = {
    symbol: data.symbol,
    provider: data.provider,
    profile: data.profile,
    valuations: {},
    multiples: {},
    enterprise: {},
    verdict: null,
  };

  const profile = data.profile;
  const income = data.income[0]; // Most recent year
  const balance = data.balance[0];
  const cashflow = data.cashflow[0];
  const prevIncome = data.income.length > 1 ? data.income : [];

  if (!profile || !income || !balance) {
    results.error = "Insufficient data for valuation";
    return results;
  }

  const price = profile.price;
  const shares = profile.sharesOutstanding || income.weightedAvgShares || 1;

  // =================================================================
  // ASSET-BASED VALUATION
  // =================================================================

  // Book Value
  const bookValue = balance.totalEquity;
  const bookValuePerShare = bookValue / shares;

  // Tangible Book Value
  const tangibleBook =
    bookValue - (balance.goodwill || 0) - (balance.intangibleAssets || 0);
  const tangibleBookPerShare = tangibleBook / shares;

  // Liquidation Value (conservative: current assets at 50%, fixed at 20%, minus all liabilities)
  const liquidationValue =
    (balance.totalCurrentAssets || 0) * 0.5 +
    (balance.propertyPlantEquipment || 0) * 0.2 +
    (balance.cashAndEquivalents || 0) * 1.0 -
    (balance.totalLiabilities || 0);
  const liquidationPerShare = liquidationValue / shares;

  // Net-Net (Graham's net current asset value)
  const ncav =
    (balance.totalCurrentAssets || 0) - (balance.totalLiabilities || 0);
  const ncavPerShare = ncav / shares;

  // Tobin's Q (Market Value / Replacement Cost approximation)
  const replacementCost =
    balance.totalAssets -
    (balance.goodwill || 0) -
    (balance.intangibleAssets || 0);
  const tobinsQ =
    replacementCost > 0 ? profile.marketCap / replacementCost : null;

  results.valuations.assetBased = {
    bookValue,
    bookValuePerShare,
    tangibleBook,
    tangibleBookPerShare,
    liquidationValue,
    liquidationPerShare,
    ncav,
    ncavPerShare,
    tobinsQ,
    replacementCost,
  };

  // =================================================================
  // INCOME-BASED VALUATION
  // =================================================================

  // WACC Calculation
  const totalDebt = balance.totalDebt || 0;
  const equity = profile.marketCap;
  const totalCapital = equity + totalDebt;
  const interestExpense =
    Math.abs(income.operatingIncome - income.ebitda) || totalDebt * 0.05;
  const costOfDebt = totalDebt > 0 ? interestExpense / totalDebt : 0.05;
  const taxRate =
    income.netIncome > 0 && income.operatingIncome > 0
      ? 1 - income.netIncome / income.operatingIncome
      : 0.21;
  const beta = profile.beta || 1.0;
  const riskFreeRate = 0.043; // ~10yr Treasury
  const marketReturn = 0.1; // Historical S&P avg
  const costOfEquity = riskFreeRate + beta * (marketReturn - riskFreeRate);
  const wacc =
    totalCapital > 0
      ? (equity / totalCapital) * costOfEquity +
        (totalDebt / totalCapital) * costOfDebt * (1 - taxRate)
      : costOfEquity;

  // DCF Valuation
  const fcf = cashflow ? cashflow.freeCashFlow : income.netIncome * 0.8;
  const growthRates = calculateGrowthRates(data.income);
  const revenueGrowth = growthRates.revenueGrowth || 0.05;
  const fcfGrowth = Math.min(revenueGrowth, 0.15); // Cap at 15%
  const terminalGrowth = 0.025; // Long-term GDP growth

  let dcfValue = 0;
  let projectedFCF = fcf;
  for (let t = 1; t <= 10; t++) {
    projectedFCF *= 1 + (t <= 5 ? fcfGrowth : fcfGrowth * 0.5);
    dcfValue += projectedFCF / Math.pow(1 + wacc, t);
  }
  // Terminal value
  const terminalValue =
    (projectedFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  dcfValue += terminalValue / Math.pow(1 + wacc, 10);
  // Subtract debt, add cash
  dcfValue = dcfValue - totalDebt + (balance.cashAndEquivalents || 0);
  const dcfPerShare = dcfValue / shares;

  // Graham Number
  const eps = income.eps || income.netIncome / shares;
  const grahamNumber =
    eps > 0 && bookValuePerShare > 0
      ? Math.sqrt(22.5 * eps * bookValuePerShare)
      : null;

  // Earnings Power Value (no growth assumed)
  const adjustedEarnings = income.ebitda
    ? income.ebitda * (1 - taxRate)
    : income.netIncome;
  const epv = wacc > 0 ? adjustedEarnings / wacc : null;
  const epvPerShare = epv
    ? (epv - totalDebt + (balance.cashAndEquivalents || 0)) / shares
    : null;

  // Peter Lynch Fair Value (PEG-based)
  const earningsGrowth =
    growthRates.epsGrowth || growthRates.netIncomeGrowth || 0.05;
  const lynchFairPE = Math.max(earningsGrowth * 100, 5); // Growth rate as fair P/E
  const lynchFairValue = eps > 0 ? eps * lynchFairPE : null;

  // Dividend Discount Model
  const dividendsPaid = cashflow ? Math.abs(cashflow.dividendsPaid || 0) : 0;
  const dividendPerShare = dividendsPaid / shares;
  const dividendGrowth = Math.min(earningsGrowth, 0.08);
  const ddmValue =
    dividendPerShare > 0 && costOfEquity > dividendGrowth
      ? (dividendPerShare * (1 + dividendGrowth)) /
        (costOfEquity - dividendGrowth)
      : null;

  results.valuations.incomeBased = {
    wacc,
    costOfEquity,
    costOfDebt,
    taxRate,
    dcfValue,
    dcfPerShare,
    fcfGrowth,
    terminalGrowth,
    grahamNumber,
    epv,
    epvPerShare,
    lynchFairValue,
    lynchFairPE,
    ddmValue,
    dividendPerShare,
  };

  // =================================================================
  // MARKET MULTIPLES
  // =================================================================

  const peRatio = eps > 0 ? price / eps : null;
  const forwardPE =
    earningsGrowth > 0 && eps > 0 ? price / (eps * (1 + earningsGrowth)) : null;
  const pegRatio =
    peRatio && earningsGrowth > 0 ? peRatio / (earningsGrowth * 100) : null;
  const priceToBook = bookValuePerShare > 0 ? price / bookValuePerShare : null;
  const priceToTangibleBook =
    tangibleBookPerShare > 0 ? price / tangibleBookPerShare : null;
  const priceToSales =
    income.revenue > 0 ? profile.marketCap / income.revenue : null;
  const priceToFCF = fcf > 0 ? profile.marketCap / fcf : null;
  const dividendYield = dividendPerShare > 0 ? dividendPerShare / price : 0;

  results.multiples = {
    peRatio,
    forwardPE,
    pegRatio,
    priceToBook,
    priceToTangibleBook,
    priceToSales,
    priceToFCF,
    dividendYield,
    earningsGrowth,
  };

  // =================================================================
  // ENTERPRISE VALUE
  // =================================================================

  const enterpriseValue =
    profile.marketCap + totalDebt - (balance.cashAndEquivalents || 0);
  const evToEbitda = income.ebitda > 0 ? enterpriseValue / income.ebitda : null;
  const evToRevenue =
    income.revenue > 0 ? enterpriseValue / income.revenue : null;
  const evToFcf = fcf > 0 ? enterpriseValue / fcf : null;
  const investedCapital =
    balance.totalEquity + totalDebt - (balance.cashAndEquivalents || 0);
  const evToInvestedCapital =
    investedCapital > 0 ? enterpriseValue / investedCapital : null;
  const roic =
    investedCapital > 0
      ? (income.operatingIncome * (1 - taxRate)) / investedCapital
      : null;

  results.enterprise = {
    enterpriseValue,
    evToEbitda,
    evToRevenue,
    evToFcf,
    evToInvestedCapital,
    investedCapital,
    roic,
  };

  // =================================================================
  // VERDICT
  // =================================================================

  results.verdict = calculateVerdict(price, results);

  return results;
}

// ===================================================================
// GROWTH RATE CALCULATIONS
// ===================================================================

function calculateGrowthRates(incomeStatements) {
  if (!incomeStatements || incomeStatements.length < 2) {
    return { revenueGrowth: 0.05, netIncomeGrowth: 0.05, epsGrowth: 0.05 };
  }

  const years = incomeStatements.length;
  const latest = incomeStatements[0];
  const oldest = incomeStatements[years - 1];

  const cagr = (current, past, periods) => {
    if (!past || past <= 0 || !current || current <= 0) return null;
    return Math.pow(current / past, 1 / periods) - 1;
  };

  return {
    revenueGrowth: cagr(latest.revenue, oldest.revenue, years - 1) || 0.05,
    netIncomeGrowth:
      cagr(latest.netIncome, oldest.netIncome, years - 1) || 0.05,
    epsGrowth: cagr(latest.eps, oldest.eps, years - 1) || 0.05,
  };
}

// ===================================================================
// VERDICT ENGINE
// ===================================================================

function calculateVerdict(price, results) {
  const valuations = [];

  // Collect all per-share valuations
  const ab = results.valuations.assetBased;
  const ib = results.valuations.incomeBased;

  if (ab.bookValuePerShare > 0)
    valuations.push({
      method: "Book Value",
      value: ab.bookValuePerShare,
      weight: 0.5,
    });
  if (ab.tangibleBookPerShare > 0)
    valuations.push({
      method: "Tangible Book",
      value: ab.tangibleBookPerShare,
      weight: 0.5,
    });
  if (ab.liquidationPerShare)
    valuations.push({
      method: "Liquidation Value",
      value: ab.liquidationPerShare,
      weight: 0.3,
    });
  if (ab.ncavPerShare > 0)
    valuations.push({
      method: "Net-Net (NCAV)",
      value: ab.ncavPerShare,
      weight: 0.3,
    });
  if (ib.dcfPerShare > 0)
    valuations.push({ method: "DCF", value: ib.dcfPerShare, weight: 1.5 });
  if (ib.grahamNumber > 0)
    valuations.push({
      method: "Graham Number",
      value: ib.grahamNumber,
      weight: 1.0,
    });
  if (ib.epvPerShare > 0)
    valuations.push({
      method: "Earnings Power Value",
      value: ib.epvPerShare,
      weight: 1.0,
    });
  if (ib.lynchFairValue > 0)
    valuations.push({
      method: "Lynch Fair Value",
      value: ib.lynchFairValue,
      weight: 0.8,
    });
  if (ib.ddmValue > 0)
    valuations.push({
      method: "Dividend Discount",
      value: ib.ddmValue,
      weight: 0.6,
    });

  if (valuations.length === 0) {
    return {
      rating: "Insufficient Data",
      score: 50,
      fairValue: null,
      range: null,
      valuations: [],
    };
  }

  // Weighted average fair value
  const totalWeight = valuations.reduce((sum, v) => sum + v.weight, 0);
  const weightedFairValue =
    valuations.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;

  // Fair value range (25th to 75th percentile of estimates)
  const sorted = valuations.map((v) => v.value).sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.25)];
  const high = sorted[Math.floor(sorted.length * 0.75)];

  // Score: 0 = extremely overvalued, 50 = fair, 100 = extremely undervalued
  const ratio = weightedFairValue / price;
  const score = Math.max(0, Math.min(100, Math.round(ratio * 50)));

  let rating;
  if (score >= 75) rating = "Significantly Undervalued";
  else if (score >= 60) rating = "Undervalued";
  else if (score >= 45) rating = "Fairly Valued";
  else if (score >= 30) rating = "Overvalued";
  else rating = "Significantly Overvalued";

  return {
    rating,
    score,
    fairValue: weightedFairValue,
    range: { low, high },
    valuations,
  };
}

// ===================================================================
// FORMATTING HELPERS
// ===================================================================

function formatLargeNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toFixed(2);
}

function formatRatio(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  return num.toFixed(2);
}

function formatPercent(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  return (num * 100).toFixed(1) + "%";
}

function formatValuationCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  if (Math.abs(num) >= 1000) return "$" + formatLargeNumber(num);
  return "$" + num.toFixed(2);
}
