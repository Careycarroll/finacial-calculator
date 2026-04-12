# 🔥 Financial Calculator

A collection of interactive financial calculators built with vanilla JavaScript and Canvas API. No dependencies, no frameworks, no build step.

**Live:** https://careycarroll.github.io/financial-calculator/

---

## Calculators

| Tool | Description |
|------|-------------|
| 🔥 FIRE Dashboard | FIRE number, Coast FIRE, retirement lifecycle projection |
| 📈 Portfolio Projections | Multi-scenario growth with inflation adjustment |
| 🏦 Loan Calculator | Amortization, payoff schedule, interest breakdown |
| 🏦 Advanced Loan | Extra payments, recurring ranges, one-time payments |
| 💰 Present Value | Lump sum, annuity, lump sum vs annuity comparison |
| 📊 NPV / IRR | Net present value, internal rate of return, investment comparison |
| ⚙️ Options Lab | Payoff diagrams, Black-Scholes pricing, Greeks sensitivity, P&L |

---

## Running Locally

```bash
# Clone
git clone https://github.com/careycarroll/financial-calculator.git
cd financial-calculator

# Serve (any static server works)
python3 -m http.server 8000
# then open http://localhost:8000
```

No npm, no build step, no dependencies.

---

## Project Structure

```
financial-calculator/
├── index.html              # Calculator index / landing page
├── pages/                  # One HTML file per tool
│   ├── fire.html
│   ├── projections.html
│   ├── loan.html
│   ├── loan-advanced.html
│   ├── pv.html
│   ├── npv-irr.html
│   └── options.html
├── js/
│   ├── chart-utils.js      # Shared utilities — formatting, canvas, validation, charts
│   ├── fire.js
│   ├── projections.js
│   ├── loan.js
│   ├── loan-advanced.js
│   ├── pv.js
│   ├── npv-irr.js
│   └── options.js
└── css/
    ├── base.css             # Global reset and variables
    ├── common-calculator.css # Shared form, result, chart, table styles
    └── fire.css             # Tool-specific overrides
```

---

## Technical Notes

- **No dependencies** — vanilla JS, HTML5 Canvas, CSS custom properties
- **Charts** — all charts are Canvas 2D with DPI scaling, offscreen caching, and RAF-throttled mousemove
- **Validation** — \`validateInputs(schema)\` in \`chart-utils.js\` handles all form validation with inline errors
- **Shared utilities** — \`chart-utils.js\` exports \`formatCurrency\`, \`safeParseFloat\`, \`createChartContext\`, \`drawBarChart\`, \`drawLineChart\`, \`drawTooltip\`, \`rafThrottle\`, \`validateInputs\`, \`showFieldError\`, \`showChartLoading\`
- **Storage** — inputs auto-saved to \`localStorage\` per tool, restored on page load
- **Accessibility** — ARIA labels on all interactive elements, \`aria-live\` on result panels, \`role="img"\` on all canvas charts

---

## Development History

This project went through a structured 5-phase development process covering bug fixes, input safety, performance optimization, architecture refactoring, and UX polish. Full detail is in the git log:

```bash
git log --oneline
```

Key phases:
- **Phase 1** — Critical bug fixes: \`formatCurrency\` unification, AbortController pattern, \`safeParseFloat\`, canvas standardization
- **Phase 2** — Input safety: inline validation UI, bounds checking, \`alert()\` removal, Greeks dividend yield fix
- **Phase 3** — Performance: \`rafThrottle\` mousemove throttling, offscreen canvas caching
- **Phase 4** — Architecture: \`drawTooltip\` utility, \`CONFIG\` constants, dead code removal, documentation
- **Phase 5** — UX polish: loading spinners, \`normCDF\` documentation, accessibility pass

---

## Utilities Quick Reference

```javascript
// Formatting
formatCurrency(value)                          // $1.25M, $450,000, -$3.45

// Input parsing
safeParseFloat(el.value, fallback)
safeParseInt(el.value, fallback)

// Validation
validateInputs(schema, containerSelector)      // returns bool, shows inline errors
showFieldError(fieldId, message)
clearAllErrors(containerSelector)

// Canvas
createChartContext(canvas, width, height)      // DPI-scaled context
drawBarChart(canvas, data, options)
drawLineChart(canvas, data, options)
drawTooltip(ctx, lines, x, y, bounds)

// Performance
rafThrottle(fn)                                // throttle to screen refresh rate

// Loading
showChartLoading(canvasId)
hideChartLoading(canvasId)
```

---

## Useful Dev Commands

``` bash
# Kill and restart local server
pkill -f "python.*http" && python3 -m http.server 8000

# Dump all source files to a single audit file
for f in **/*.(js|css|html); do
  [[ "$f" == *.min.js || "$f" == *.min.css ]] && continue
  echo "========== $f =========="
  cat "$f"
done > audit.txt
```

---

&copy; 2026 Financial Calculator
