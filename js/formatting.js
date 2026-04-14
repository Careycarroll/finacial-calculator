// ===================================================================
// SHARED FORMATTING UTILITIES
// ===================================================================

// Large number with $ prefix and sign — used by analyzer
export function formatLargeNumber(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Large number without $ prefix — used by valuator
export function formatLargeNumberRaw(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toFixed(2);
}

// Ratio with "x" suffix and optional decimal places — used by analyzer
export function formatRatio(value, decimals) {
  if (value === null || value === undefined) return "—";
  decimals = decimals !== undefined ? decimals : 2;
  return value.toFixed(decimals) + "x";
}

// Ratio without "x" suffix — used by valuator
export function formatRatioPlain(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  return num.toFixed(2);
}

// Percentage from decimal — used by analyzer (returns "—" for null)
export function formatPct(value) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

// Percentage from decimal — used by valuator (returns "N/A" for null)
export function formatPercent(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  return (num * 100).toFixed(1) + "%";
}

// Currency for large valuation numbers — used by valuator
export function formatValuationCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return "N/A";
  if (Math.abs(num) >= 1000) return "$" + formatLargeNumberRaw(num);
  return "$" + num.toFixed(2);
}

// Short currency with sign — used by analyzer
export function formatCurrencyShort(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Number with locale formatting — used by analyzer
export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US");
}

// Trend arrow — used by analyzer
export function trendArrow(current, previous) {
  if (current === null || previous === null) return "";
  if (current > previous * 1.01) return " ↑";
  if (current < previous * 0.99) return " ↓";
  return " →";
}

// Simple growth rates — used by valuator
export function calculateSimpleGrowthRates(incomeStatements) {
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
    netIncomeGrowth: cagr(latest.netIncome, oldest.netIncome, years - 1) || 0.05,
    epsGrowth: cagr(latest.eps, oldest.eps, years - 1) || 0.05,
  };
}
