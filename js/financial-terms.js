// ===================================================================
// FINANCIAL TERMS — Definitions for tooltips
// ===================================================================

export const FINANCIAL_TERMS = {
  // ===== INCOME STATEMENT =====
  revenue: {
    term: "Revenue",
    definition:
      'Total money earned from selling goods or services before any expenses are deducted. Also called "top line" or sales.',
  },
  costOfRevenue: {
    term: "Cost of Revenue",
    definition:
      "Direct costs of producing goods or services sold — materials, labor, manufacturing. Subtracted from revenue to get gross profit.",
  },
  grossProfit: {
    term: "Gross Profit",
    definition:
      "Revenue minus cost of revenue. Shows how much money is left after paying for the direct cost of products/services.",
  },
  grossMargin: {
    term: "Gross Margin",
    definition:
      "Gross profit as a percentage of revenue. Higher is better — means the company keeps more of each dollar of sales. Above 40% is generally strong.",
  },
  researchAndDevelopment: {
    term: "R&D Expense",
    definition:
      "Money spent on researching and developing new products, services, or technologies. High R&D can signal innovation but reduces short-term profits.",
  },
  sellingGeneralAndAdmin: {
    term: "SG&A Expense",
    definition:
      "Costs of running the business that aren't directly tied to production — marketing, salaries, rent, utilities, legal fees.",
  },
  ebitda: {
    term: "EBITDA",
    definition:
      "Earnings Before Interest, Taxes, Depreciation & Amortization. A measure of operating profitability that strips out financing and accounting decisions. Useful for comparing companies.",
  },
  ebitdaMargin: {
    term: "EBITDA Margin",
    definition:
      "EBITDA as a percentage of revenue. Shows operational efficiency before non-cash charges and financing. Above 20% is generally healthy.",
  },
  operatingIncome: {
    term: "EBIT / Operating Income",
    definition:
      "Earnings Before Interest and Taxes. Revenue minus all operating expenses. Shows how profitable the core business is before financing costs.",
  },
  operatingMargin: {
    term: "Operating Margin",
    definition:
      "Operating income as a percentage of revenue. Measures how efficiently the company converts sales into profit from operations. Above 15% is generally good.",
  },
  interestExpense: {
    term: "Interest Expense",
    definition:
      "Cost of borrowing money — interest paid on debt, bonds, and credit facilities. High interest expense relative to income signals heavy debt burden.",
  },
  ebt: {
    term: "Pre-Tax Income",
    definition:
      "Earnings before income taxes. Operating income minus interest and other non-operating items. Shows profitability before government takes its share.",
  },
  taxExpense: {
    term: "Tax Expense",
    definition:
      "Income taxes owed to federal, state, and foreign governments. The effective tax rate (tax/pre-tax income) varies by company and jurisdiction.",
  },
  netIncome: {
    term: "Net Income",
    definition:
      'The "bottom line" — total profit after all expenses, interest, and taxes. This is what\'s available to shareholders.',
  },
  netMargin: {
    term: "Net Margin",
    definition:
      "Net income as a percentage of revenue. The ultimate measure of profitability — how many cents of profit from each dollar of sales. Above 10% is generally good.",
  },
  depreciation: {
    term: "Depreciation & Amortization",
    definition:
      "Non-cash expense that spreads the cost of assets (buildings, equipment, patents) over their useful life. Reduces reported earnings but doesn't use cash.",
  },
  epsBasic: {
    term: "EPS (Basic)",
    definition:
      "Earnings Per Share — net income divided by shares outstanding. Shows how much profit is attributable to each share of stock.",
  },
  epsDiluted: {
    term: "EPS (Diluted)",
    definition:
      "Earnings per share assuming all stock options, warrants, and convertible securities are exercised. More conservative than basic EPS.",
  },

  // ===== BALANCE SHEET =====
  totalAssets: {
    term: "Total Assets",
    definition:
      "Everything the company owns — cash, investments, property, equipment, patents, receivables. The left side of the balance sheet equation: Assets = Liabilities + Equity.",
  },
  currentAssets: {
    term: "Current Assets",
    definition:
      "Assets expected to be converted to cash within one year — cash, short-term investments, accounts receivable, inventory.",
  },
  cash: {
    term: "Cash & Equivalents",
    definition:
      "Money in the bank plus highly liquid short-term investments (T-bills, money market funds). The most liquid asset a company has.",
  },
  shortTermInvestments: {
    term: "Short-Term Investments",
    definition:
      "Investments the company plans to sell within a year — marketable securities, short-term bonds. More liquid than long-term investments but less than cash.",
  },
  accountsReceivable: {
    term: "Accounts Receivable",
    definition:
      "Money owed to the company by customers for goods/services already delivered. High receivables relative to revenue may signal collection problems.",
  },
  inventory: {
    term: "Inventory",
    definition:
      "Goods available for sale or raw materials for production. Rising inventory faster than sales can signal weak demand or overproduction.",
  },
  propertyPlantEquipment: {
    term: "Property, Plant & Equipment",
    definition:
      "Physical assets used in operations — buildings, factories, machinery, vehicles, land. Reported net of accumulated depreciation.",
  },
  goodwill: {
    term: "Goodwill",
    definition:
      "The premium paid above fair value when acquiring another company. Represents intangible value like brand, customer relationships. Can be written down if overpaid.",
  },
  intangibleAssets: {
    term: "Intangible Assets",
    definition:
      "Non-physical assets with value — patents, trademarks, copyrights, licenses, software. Amortized over their useful life.",
  },
  totalLiabilities: {
    term: "Total Liabilities",
    definition:
      "Everything the company owes — debt, accounts payable, deferred revenue, lease obligations. Must be paid before shareholders get anything.",
  },
  currentLiabilities: {
    term: "Current Liabilities",
    definition:
      "Obligations due within one year — accounts payable, short-term debt, accrued expenses, current portion of long-term debt.",
  },
  accountsPayable: {
    term: "Accounts Payable",
    definition:
      "Money the company owes to suppliers for goods/services received but not yet paid for. A form of short-term, interest-free financing.",
  },
  shortTermDebt: {
    term: "Short-Term Debt",
    definition:
      "Borrowings due within one year — credit lines, commercial paper, current portion of long-term loans.",
  },
  longTermDebt: {
    term: "Long-Term Debt",
    definition:
      "Borrowings due after one year — bonds, term loans, mortgages. The main source of financial leverage.",
  },
  totalDebt: {
    term: "Total Debt",
    definition:
      "Short-term plus long-term debt. The total amount the company has borrowed. Compare to equity and cash to assess financial risk.",
  },
  netDebt: {
    term: "Net Debt",
    definition:
      "Total debt minus cash. Shows how much debt would remain if all cash were used to pay it down. Negative net debt means more cash than debt — a strong position.",
  },
  totalEquity: {
    term: "Total Equity",
    definition:
      "Assets minus liabilities — the shareholders' ownership stake. Also called book value or net worth. Can be negative if losses exceed invested capital.",
  },
  retainedEarnings: {
    term: "Retained Earnings",
    definition:
      "Cumulative profits kept in the business rather than paid as dividends. Negative retained earnings mean the company has accumulated more losses than profits over its lifetime.",
  },
  treasuryStock: {
    term: "Treasury Stock",
    definition:
      "Shares the company has bought back from the market. Reduces shares outstanding and is recorded as negative equity.",
  },
  sharesOutstanding: {
    term: "Shares Outstanding",
    definition:
      "Total shares of stock currently held by all shareholders. Used to calculate per-share metrics like EPS and book value per share.",
  },

  // ===== CASH FLOW =====
  operatingCashFlow: {
    term: "Operating Cash Flow",
    definition:
      "Cash generated from core business operations. Starts with net income and adjusts for non-cash items and working capital changes. The lifeblood of the business.",
  },
  investingCashFlow: {
    term: "Investing Cash Flow",
    definition:
      "Cash spent on or received from investments — buying/selling equipment, property, acquisitions, or securities. Usually negative for growing companies.",
  },
  financingCashFlow: {
    term: "Financing Cash Flow",
    definition:
      "Cash from borrowing, repaying debt, issuing stock, or paying dividends. Shows how the company funds itself and returns capital to shareholders.",
  },
  capitalExpenditures: {
    term: "Capital Expenditures (CapEx)",
    definition:
      "Money spent on acquiring or maintaining physical assets — buildings, equipment, technology. Required to sustain and grow the business.",
  },
  freeCashFlow: {
    term: "Free Cash Flow",
    definition:
      "Operating cash flow minus capital expenditures. The cash truly available for dividends, buybacks, debt repayment, or acquisitions. Many investors consider this the most important metric.",
  },
  dividendsPaid: {
    term: "Dividends Paid",
    definition:
      "Cash distributed to shareholders as a return on their investment. A sign of financial maturity and confidence in future earnings.",
  },
  shareBuybacks: {
    term: "Share Buybacks",
    definition:
      "Cash spent repurchasing the company's own stock. Reduces shares outstanding, increasing EPS and ownership percentage for remaining shareholders.",
  },

  // ===== RATIOS =====
  currentRatio: {
    term: "Current Ratio",
    definition:
      "Current assets ÷ current liabilities. Measures ability to pay short-term obligations. Above 1.5 is healthy; below 1.0 signals potential liquidity problems.",
  },
  quickRatio: {
    term: "Quick Ratio",
    definition:
      "Like current ratio but excludes inventory (which may be hard to sell quickly). A stricter test of short-term liquidity. Above 1.0 is generally safe.",
  },
  debtToEquity: {
    term: "Debt-to-Equity Ratio",
    definition:
      "Total debt ÷ total equity. Measures financial leverage. Below 1.0 means more equity than debt financing. Above 2.0 is considered highly leveraged.",
  },
  debtToAssets: {
    term: "Debt-to-Assets Ratio",
    definition:
      "Total liabilities ÷ total assets. Shows what percentage of the company is financed by debt. Below 0.5 (50%) is generally conservative.",
  },
  interestCoverage: {
    term: "Interest Coverage Ratio",
    definition:
      "EBIT ÷ interest expense. How many times over the company can pay its interest charges. Below 2x is risky; above 5x is comfortable.",
  },
  returnOnEquity: {
    term: "Return on Equity (ROE)",
    definition:
      "Net income ÷ shareholders' equity. How efficiently the company generates profit from shareholders' investment. Above 15% is generally excellent.",
  },
  returnOnAssets: {
    term: "Return on Assets (ROA)",
    definition:
      "Net income ÷ total assets. How efficiently the company uses all its assets to generate profit. Above 5% is generally good; varies by industry.",
  },
  assetTurnover: {
    term: "Asset Turnover",
    definition:
      "Revenue ÷ total assets. How efficiently the company uses assets to generate sales. Higher means more revenue per dollar of assets.",
  },
  inventoryTurnover: {
    term: "Inventory Turnover",
    definition:
      "Cost of revenue ÷ inventory. How many times inventory is sold and replaced per year. Higher is better — means products sell quickly.",
  },
  receivablesTurnover: {
    term: "Receivables Turnover",
    definition:
      "Revenue ÷ accounts receivable. How quickly the company collects payments from customers. Higher means faster collection.",
  },
  fcfPerShare: {
    term: "FCF Per Share",
    definition:
      "Free cash flow ÷ shares outstanding. How much free cash each share generates. Compare to stock price for a cash-based valuation metric.",
  },
  fcfYield: {
    term: "FCF Yield",
    definition:
      "Free cash flow per share ÷ stock price. Higher yield means you're paying less for each dollar of free cash flow. Above 5% is generally attractive.",
  },
  payoutRatio: {
    term: "Payout Ratio",
    definition:
      "Dividends ÷ net income. What percentage of earnings is paid out as dividends. Below 60% is sustainable; above 100% means paying more than earned.",
  },
  revenueGrowth: {
    term: "Revenue Growth",
    definition:
      "Year-over-year percentage change in revenue. Shows how fast the company is growing its top line. Consistent double-digit growth is a strong signal.",
  },
  netIncomeGrowth: {
    term: "Net Income Growth",
    definition:
      "Year-over-year percentage change in net income. Growing faster than revenue signals improving efficiency; slower signals margin compression.",
  },
  fcfGrowth: {
    term: "FCF Growth",
    definition:
      "Year-over-year percentage change in free cash flow. More reliable than earnings growth since cash is harder to manipulate than accounting profits.",
  },
  cagr: {
    term: "CAGR",
    definition:
      "Compound Annual Growth Rate — the smoothed annual growth rate over a multi-year period. Eliminates year-to-year volatility to show the underlying trend.",
  },

  // ===== SCORECARD =====
  revenueGrowthScore: {
    term: "Revenue Growth Score",
    definition:
      "Rates the company's revenue growth trend. Considers both the rate and consistency of growth over the analysis period.",
  },
  profitabilityScore: {
    term: "Profitability Score",
    definition:
      "Rates margins and returns — gross margin, operating margin, net margin, ROE, and ROA. Higher margins mean more efficient conversion of revenue to profit.",
  },
  debtHealthScore: {
    term: "Debt Health Score",
    definition:
      "Rates the company's debt levels and ability to service them. Considers debt-to-equity, interest coverage, and net debt position.",
  },
  cashGenerationScore: {
    term: "Cash Generation Score",
    definition:
      "Rates the quality and consistency of cash flow generation. Strong operating cash flow and free cash flow relative to net income signal high earnings quality.",
  },
  earningsQualityScore: {
    term: "Earnings Quality Score",
    definition:
      "Compares cash flow to reported earnings. When operating cash flow exceeds net income, earnings are backed by real cash — not just accounting entries.",
  },
  liquidityScore: {
    term: "Liquidity Score",
    definition:
      "Rates the company's ability to meet short-term obligations. Based on current ratio and quick ratio. Higher scores mean less risk of a cash crunch.",
  },
  effectiveTaxRate: {
    term: "Effective Tax Rate",
    definition:
      "Actual percentage of pre-tax income paid in taxes. Calculated as tax expense ÷ pre-tax income. Can differ from statutory rate due to deductions, credits, and international operations.",
  },
  cashRatio: {
    term: "Cash Ratio",
    definition:
      "Cash & equivalents ÷ current liabilities. The most conservative liquidity measure — can the company pay all short-term obligations with cash on hand? Above 0.5 is generally comfortable.",
  },
  debtToEbitda: {
    term: "Debt / EBITDA",
    definition:
      "Total debt ÷ EBITDA. Estimates how many years it would take to pay off all debt using operating earnings. Below 2x is conservative; above 4x is highly leveraged.",
  },
  netDebtToEbitda: {
    term: "Net Debt / EBITDA",
    definition:
      "Net debt ÷ EBITDA. Like Debt/EBITDA but accounts for cash on hand. Negative means the company has more cash than debt. Below 1x is very healthy.",
  },
  equityMultiplier: {
    term: "Equity Multiplier",
    definition:
      "Total assets ÷ total equity. Measures financial leverage — how much of the company is funded by debt vs equity. Higher means more leverage. A multiplier of 2x means half the assets are debt-financed.",
  },
  daysInventory: {
    term: "Days Inventory",
    definition:
      "Average number of days it takes to sell inventory. Calculated as 365 ÷ inventory turnover. Lower is better — means products move quickly. Rising days may signal slowing demand.",
  },
  daysSalesOutstanding: {
    term: "Days Sales Outstanding",
    definition:
      "Average number of days to collect payment after a sale. Calculated as 365 ÷ receivables turnover. Lower means faster collection. Rising DSO may signal customer payment problems.",
  },
  cashConversionCycle: {
    term: "Cash Conversion Cycle",
    definition:
      "Days inventory + days sales outstanding − days payable outstanding. Measures how long cash is tied up in operations before being collected. Shorter (or negative) is better.",
  },
  bookValuePerShare: {
    term: "Book Value Per Share",
    definition:
      "Total equity ÷ shares outstanding. The accounting value of each share. Compare to stock price — if price is below book value, the stock may be undervalued (or the company has problems).",
  },
  revenuePerShare: {
    term: "Revenue Per Share",
    definition:
      "Total revenue ÷ shares outstanding. Shows how much sales each share represents. Useful for comparing companies of different sizes or tracking the impact of share buybacks.",
  },
  dividendsPerShare: {
    term: "Dividends Per Share",
    definition:
      "Total dividends paid ÷ shares outstanding. The actual cash payment each share receives per year. Multiply by shares owned to calculate your dividend income.",
  },
  roic: {
    term: "Return on Invested Capital",
    definition:
      "NOPAT ÷ invested capital. Measures how efficiently the company generates returns on all capital invested (debt + equity). Above 15% is excellent. Compare to cost of capital — ROIC > WACC creates value.",
  },
  ocfToNetIncome: {
    term: "OCF / Net Income",
    definition:
      "Operating cash flow ÷ net income. Should be above 1.0 — meaning the company generates more cash than it reports in earnings. Below 1.0 may signal aggressive accounting or poor cash collection.",
  },
  fcfToNetIncome: {
    term: "FCF / Net Income",
    definition:
      "Free cash flow ÷ net income. Shows what percentage of reported earnings converts to actual free cash. Consistently above 0.8 signals high-quality earnings.",
  },
  capexToRevenue: {
    term: "CapEx / Revenue",
    definition:
      "Capital expenditures as a percentage of revenue. Shows how capital-intensive the business is. Asset-light businesses (software) may be under 5%; heavy industry can exceed 20%.",
  },
  capexToOcf: {
    term: "CapEx / OCF",
    definition:
      "Capital expenditures as a percentage of operating cash flow. Shows how much cash from operations is reinvested in the business. Below 50% leaves healthy free cash flow.",
  },
  fcfMargin: {
    term: "FCF Margin",
    definition:
      "Free cash flow ÷ revenue. The percentage of each sales dollar that becomes free cash. Above 15% is strong; above 25% is exceptional. More reliable than net margin since cash is harder to manipulate.",
  },
};

export function getTermDefinition(key) {
  return FINANCIAL_TERMS[key] || null;
}
