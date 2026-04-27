# 🔥 Financial Calculator

A collection of interactive financial calculators built with vanilla JavaScript and Canvas API. No dependencies, no frameworks, no build step.

**Live:** https://careycarroll.github.io/financial-calculator/

---

## Calculators

| Tool                           | Description                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 🔥 FIRE Dashboard              | FIRE number, Coast FIRE, retirement lifecycle projection                                                                      |
| 📈 Portfolio Projections       | Multi-scenario growth with inflation adjustment                                                                               |
| 🏦 Loan Calculator             | Amortization, payoff schedule, interest breakdown                                                                             |
| 🏦 Advanced Loan               | Extra payments, recurring ranges, one-time payments                                                                           |
| 💰 Present Value               | Lump sum, annuity, lump sum vs annuity comparison                                                                             |
| 📊 NPV / IRR                   | Net present value, internal rate of return, investment comparison                                                             |
| ⚙️ Options Lab                 | Payoff diagrams, Black-Scholes pricing, Greeks sensitivity, P&L                                                               |
| 🔍 Stock Evaluator             | Multi-method fundamental analysis: DCF, Graham Number, enterprise value, multiples                                            |
| 📑 10-K Analyzer               | SEC EDGAR filing parser with ratio analysis, health scoring, and red flag detection                                           |
| 📰 News Feed                   | RSS reader with OPML import, category filtering, bookmarks, and search                                                        |
| 📊 CM Analysis                 | Contribution margin, gross profit, breakeven, multi-product mix, capacity constraints, operating leverage                     |
| 📉 Supply & Demand             | Linear supply/demand equilibrium, multi-variable equations, curve shifters, interactive graphs                                |
| 📐 Consumer Theory             | Price elasticity (4 modes), arbitrary equation parser, shift analysis, cross-price elasticity, expected utility, risk premium |
| 🏗️ Cost Structure & Allocation | Cost structure comparison, overhead allocation, fixed/variable cost classifier, unit cost trap                                |

---

## Running Locally

    # Clone
    git clone https://github.com/careycarroll/financial-calculator.git
    cd financial-calculator

    # Terminal 1 -- static file server
    python3 -m http.server 8000
    # then open http://localhost:8000

    # Terminal 2 -- SEC EDGAR proxy (required for 10-K Analyzer)
    node proxy.js
    # Proxy runs at http://localhost:3001
    # Keep this terminal open while using the 10-K Analyzer

No npm, no build step, no dependencies.

### Why the proxy is required

SEC EDGAR requires HTTP/2 and a valid `User-Agent` header on all requests. Browsers block custom `User-Agent` headers on `fetch()` calls as a security restriction, so a local proxy is necessary to relay requests correctly. The proxy only allows requests to `data.sec.gov`, `www.sec.gov`, and `efts.sec.gov`.

> **Planned:** Replace the local proxy with a hosted Cloudflare Worker so the live GitHub Pages site works without any local setup required.

---

## Project Structure

    financial-calculator/
    ├── index.html              # Calculator index / landing page
    ├── pages/                  # One HTML file per tool
    │   ├── fire.html
    │   ├── projections.html
    │   ├── loan.html
    │   ├── loan-advanced.html
    │   ├── pv.html
    │   ├── npv-irr.html
    │   ├── options.html
    │   ├── analyzer.html
    │   ├── valuator.html
    │   ├── news.html
    │   ├── cm-analysis.html
    │   ├── micro-econ.html
    │   ├── consumer-theory.html
    │   └── cost-structure.html
    ├── js/
    │   ├── chart-utils.js           # Shared canvas, validation, chart utilities (ES module)
    │   ├── formatting.js            # Shared formatting functions (ES module)
    │   ├── financial-terms.js       # Financial term definitions for tooltips
    │   ├── fire.js
    │   ├── projections.js
    │   ├── loan.js
    │   ├── loan-advanced.js
    │   ├── pv.js
    │   ├── npv-irr.js
    │   ├── options.js
    │   ├── options-reference-shapes.js
    │   ├── analyzer.js              # SEC ratio calculations and health scoring
    │   ├── analyzer-ui.js           # 10-K Analyzer UI entry point
    │   ├── valuator.js              # Multi-method stock valuation engine
    │   ├── valuator-ui.js           # Stock Evaluator UI entry point
    │   ├── api-manager.js           # Multi-provider API key management + IndexedDB cache
    │   ├── sec-api.js               # SEC EDGAR data fetcher
    │   ├── news.js                  # RSS news feed reader
    │   ├── cm-analysis.js           # Contribution margin analysis entry point
    │   ├── micro-econ.js            # Supply & demand microeconomics entry point
    │   ├── consumer-theory.js       # Consumer theory: elasticity, expected utility, risk premium
    │   ├── cost-structure.js        # Cost structure & allocation entry point
    │   ├── font-scale.js            # Persistent font scale toggle (plain script, not module)
    │   └── prefetch.js              # Quicklink prefetching (plain script, not module)
    ├── proxy.js                     # Local HTTP/2 CORS proxy for SEC EDGAR
    ├──.vscode/
    │   └── tasks.json               # VS Code task: Cmd+Shift+B starts all servers
    └── css/
        ├── base.css                 # Global reset and variables
        ├── common-calculator.css    # Shared form, result, chart, table styles
        ├── fire.css
        ├── analyzer.css
        ├── news.css
        ├── npv-irr.css
        ├── options.css
        ├── projections.css
        ├── valuator.css
        ├── cm-analysis.css
        ├── micro-econ.css
        ├── consumer-theory.css
        └── cost-structure.css

---

## Technical Notes

- **ES Modules** — all JS files use native `import`/`export`, no bundler required
- **No dependencies** — vanilla JS, HTML5 Canvas, CSS custom properties
- **Charts** — all charts are Canvas 2D with DPI scaling, offscreen caching, and RAF-throttled mousemove
- **Validation** — `validateInputs(schema)` in `chart-utils.js` handles all form validation with inline errors
- **Shared utilities** — `chart-utils.js` exports canvas, validation, and chart functions; `formatting.js` exports `formatCurrency`, `formatLargeNumber`, `formatRatio`, `formatPct`, `formatPercent`, `formatValuationCurrency`, `formatCurrencyShort`, and growth rate helpers
- **Storage** — inputs auto-saved to `localStorage` per tool, restored on page load
- **Caching** — Stock Evaluator caches API responses in IndexedDB with a 24h TTL (`stock_data_cache`); 10-K Analyzer caches SEC EDGAR facts in IndexedDB with a 7-day TTL (`sec_facts_cache`)
- **Accessibility** — ARIA labels on all interactive elements, `aria-live` on result panels, `role="img"` on all canvas charts

---

## Development History

This project went through a structured 5-phase development process covering bug fixes, input safety, performance optimization, architecture refactoring, and UX polish. Full detail is in the git log:

    git log --oneline

Key phases:

- **Phase 1** — Critical bug fixes: `formatCurrency` unification, AbortController pattern, `safeParseFloat`, canvas standardization
- **Phase 2** — Input safety: inline validation UI, bounds checking, `alert()` removal, Greeks dividend yield fix
- **Phase 3** — Performance: `rafThrottle` mousemove throttling, offscreen canvas caching
- **Phase 4** — Architecture: `drawTooltip` utility, `CONFIG` constants, dead code removal, documentation
- **Phase 5** — UX polish: loading spinners, `normCDF` documentation, accessibility pass
- **Phase 6** — Stock Evaluator: IndexedDB cache for API responses (24h TTL), `formatRatio` import fix
- **Phase 7** — Economics expansion: Consumer Theory page (price elasticity 4 modes, cross-price elasticity, expected utility, risk premium); font scale toggle (A⁻/A/A⁺) with canvas font scaling across all chart files
- **Phase 8** — Consumer Theory expansion (April 2026): Arbitrary linear equation parser with scalar, shift variables, and parse confirmation display; Shift Analysis panel with live Scenario 2 comparison, D₂/S₂ dashed curve overlay, E₁/E₂ equilibrium dots, axis directional arrows; elasticity reference panel with highlighted classification row, formulas, and intuitions; stacked demand/supply elasticity result cards; market power explainer (curve shape → price vs. quantity power)

---

## Consumer Theory — From Equation Mode

The price elasticity tab supports arbitrary linear demand/supply equations:

    20*(750 - 2*p + p_hotel + 450*e)   <- scalar, shift variables, own-price
    10*(2*p - p_listing)                <- supply with shift variable
    16 - 2*p                            <- simple linear, no scalar

**Parser handles:** leading scalars (`20*(...)`), implicit multiply (`20(...)`), named shift variables, bare variables (coef=1), negated variables, scientific notation coefficients.

**Own-price detection:** exact match on `p` or `P` defaults to own-price. If ambiguous, a dropdown appears. Shift variables get inline value fields that update the collapsed form live.

**Shift Analysis:** after calculating, enter Scenario 2 values (blank = inherit Scenario 1). Chart overlays D₂/S₂ as dashed curves only when they differ from baseline. Axis arrows show direction of P* and Q* movement. Interpretation panel explains ΔP*, ΔQ*, Δεd, Δεs in plain economic language.

---

## Utilities Quick Reference

    // chart-utils.js -- canvas, validation, charts
    import {
      formatCurrency, safeParseFloat, safeParseInt,
      createChartContext, drawBarChart, drawLineChart, drawTooltip,
      rafThrottle, validateInputs, showFieldError, clearAllErrors,
      showChartLoading, hideChartLoading, bindFormEnter, CONFIG,
    } from './chart-utils.js';

    // formatting.js -- shared formatting utilities
    import {
      formatLargeNumber, formatLargeNumberRaw, formatRatio, formatRatioPlain,
      formatPct, formatPercent, formatValuationCurrency, formatCurrencyShort,
      formatNumber, trendArrow, calculateSimpleGrowthRates,
    } from './formatting.js';

    // financial-terms.js
    import { getTermDefinition } from './financial-terms.js';

    // sec-api.js
    import { fetchSECData } from './sec-api.js';

    // api-manager.js
    import {
      fetchStockData, getApiKeys, saveApiKey, removeApiKey,
      getUsageSummary, getRemainingCalls,
    } from './api-manager.js';

---

## Useful Dev Commands

    # Kill and restart local server
    pkill -f 'python.*http' && python3 -m http.server 8000

    # Start SEC EDGAR proxy (required for 10-K Analyzer)
    node proxy.js

    # Check JS file sizes (to plan audit splits -- max 500KB per upload)
    ls -R ~/Github\ Projects/financial-calculator/js/ | grep '\.js$' \
      | sed 's|^|/Users/careycarroll/Github Projects/financial-calculator/js/|' \
      | xargs -I {} wc -c '{}'

    # Dump all source files to a single audit file
    for f in **/*.(js|css|html); do
      [[ "$f" == *.min.js || "$f" == *.min.css ]] && continue
      echo "========== $f =========="
      cat "$f"
    done > audit.txt

---

## Future / Planned

- **Cloudflare Worker proxy** — replace `proxy.js` with a hosted edge function so the 10-K Analyzer works on the live GitHub Pages site without any local setup required

---
