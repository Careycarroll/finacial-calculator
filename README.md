You can access the github pages through: https://careycarroll.github.io/financial-calculator/

To-Do:
Roi calculator
Fix stock analyzer

===========================================================================

# Common code to pull information from shell

Copy/paste into Terminal to compress and share. Sharing is caring!
cd ~/path-to-project
zip -r financial-calculator.zip. -x "_.git_" "node_modules/\*" ".DS_Store"

Use this in zsh to dump all js,css,html files into codbase.txt file

```
for f in **/*.(js|css|html); do
  [[ "$f" == *.min.js || "$f" == *.min.css ]] && continue
  echo "========== $f =========="
  cat "$f"
  echo "\n"
done > audit.txt

```

Launch the script from anywhere

```
zsh ~/Github\ Projects/financial-calculator/scripts/

```

Kill and restart local python server in vscode

```

pkill -f "python.\*http" && python3 -m http.server 8000

```

===========================================================================

# 🛠️ Development Roadmap

> A prioritized plan for bug fixes, performance improvements, architecture refactoring, and UX polish.
> Each phase builds on the previous — later phases assume earlier fixes are in place.

---

## Phase 1: Critical Bug Fixes

> **Goal:** Fix issues that are actively producing incorrect output or degrading performance.

- [x] **1a. Unify `formatCurrency` into a single configurable function**
  - `formatCurrency` is redefined three times in global scope (0 decimals, 2 decimals, and compact/abbreviated). The last definition silently overwrites the others, causing incorrect display in the FIRE calculator and Options lab.
  - **Fix:** Replace all three with a single function accepting an options parameter:
    ```
    formatCurrency(value, { decimals, compact })
    ```

- [x] **1b. Fix event listener accumulation on FIRE/Coast charts**
  - New `mousemove` and `mouseleave` listeners are added to the canvas on every recalculation but never removed. After multiple recalculations, dozens of redundant handlers fire simultaneously, causing progressive performance degradation.
  - **Fix:** Use an `AbortController` per chart instance. Call `controller.abort()` before each redraw and create a new controller.

- [x] **1c. Replace canvas clone-and-replace pattern**
  - The payoff chart clones the canvas node to clear listeners (`canvas.cloneNode(true)`), but any code holding a reference to the old canvas gets a stale reference. This is a latent crash / race condition.
  - **Fix:** Replaced all `cloneNode(true)` + `replaceChild` patterns in `projections.js` and `options.js` with `AbortController` per canvas. One controller per chart function, aborted and reissued on each redraw. Canvas references are now stable throughout.

- [x] **1d. Add `NaN` guard at the input parsing layer**
  - If any input field is empty or non-numeric, `parseFloat` returns `NaN`, which silently propagates through all calculations and canvas draw calls. The user sees a blank or corrupted chart with no error message.
  - **Fix:** Added `safeParseFloat(value, fallback = 0)` and `safeParseInt(value, fallback = 0)` to `chart-utils.js`. All DOM input parsing across `fire.js`, `projections.js`, `pv.js`, `loan.js`, `loan-advanced.js`, `npv-irr.js`, and `options.js` now routes through these utilities.

---

## Phase 2: Input Safety & Correctness

> **Goal:** Prevent bad input from reaching calculation logic.

- [x] **2a. Comprehensive input validation with bounds checking**
  - **Fix:** Added `validateInputs(schema, containerSelector)` to `chart-utils.js`. Schemas defined per tool with `required`, `min`, `max`, and `integer` constraints. All 13 calculate handlers now route through `validateInputs` with specific bound error messages.

- [x] **2b. Replace `alert()` with inline validation UI**
  - **Fix:** Added `showFieldError(id, message)`, `clearFieldError(id)`, and `clearAllErrors(containerSelector)` to `chart-utils.js`. Added `.input-error` and `.field-error-msg` CSS to `common-calculator.css`. All `alert()` calls replaced across `fire.js`, `loan.js`, `loan-advanced.js`, `projections.js`, `pv.js`, `npv-irr.js`, and `options.js`. `news.js` alerts left intact (system-level messages, not form validation).

- [x] **2c. Scope Enter key handlers to their own tool containers**
  - **Fix:** Updated `bindFormEnter` to accept an optional `containerSelector` parameter. Defaults to `document` for backward compatibility. Future tools can scope to a specific container.

- [x] **2d. Pass dividend yield through to Greeks calculation**
  - **Fix:** Added `gk-dividend` input to Greeks tab in `options.html`. Wired `q` from `gk-dividend` through `handleGreeksCalculate` and both `calculateGreeks` calls including the sensitivity chart loop.

---

## Phase 3: Performance Optimization

> **Goal:** Ensure smooth interaction on all devices, including low-end mobile.

- [x] **3a. Throttle `mousemove` handlers with `requestAnimationFrame`**
  - **Fix:** Added `rafThrottle(fn)` utility to `chart-utils.js`. Wraps any callback so it only fires once per animation frame, synced to the screen refresh rate (60/120/144hz). Applied to all 9 canvas `mousemove` handlers across `chart-utils.js`, `fire.js`, `projections.js`, and `options.js`. Also added `AbortController` to FIRE projection and Coast charts which were missing it.

- [x] **3b. Cache static chart layers on an offscreen canvas**
  - **Fix:** Added offscreen canvas caching to `drawBarChart`, `drawLineChart` (chart-utils.js), FIRE projection chart, Coast FIRE chart (fire.js), and Projections chart (projections.js). Static elements (grid, axes, series, labels, annotations, crossing points) are drawn once to an offscreen canvas. On `mousemove`, `ctx.drawImage(offscreen, 0, 0)` composites the cached layer then only the crosshair/tooltip is drawn on top. Removed dead `displayChartDirect` function from projections.js. Options charts left with rafThrottle only — full offscreen refactor deferred given complexity vs marginal gain.

---

## Phase 4: Architecture & DRY Refactor

> **Goal:** Reduce code duplication, improve maintainability, and clean up dead code.

- [x] **4a. Extract shared chart drawing utilities**
  - **Fix:** Added `drawTooltip(ctx, lines, x, y, bounds)` to `chart-utils.js`. Replaces all inline rounded-rect tooltip drawing blocks in `drawBarChart` and `drawLineChart`. Accepts plain strings or `{ text, color, bold }` objects for colored tooltip lines. `drawBarChart`, `drawLineChart`, `rafThrottle`, `validateInputs`, `showFieldError`, `createChartContext`, `getChartDimensions` were already extracted in Phase 1-3.

- [x] **4b. Replace magic numbers with named constants**
  - **Fix:** Added `CONFIG` object to `chart-utils.js` with `MAX_PROJECTION_MONTHS`, `SP500_NOMINAL_RETURN`, `SP500_REAL_RETURN`, `DEFAULT_INFLATION`, `DEFAULT_WITHDRAWAL_RATE`, `CHART_PADDING`. Added `MAX_PROJECTION_MONTHS` constant to `fire.js`. Updated `projections.js` to reference `CONFIG.SP500_NOMINAL_RETURN` and `CONFIG.SP500_REAL_RETURN`.

- [x] **4c. Remove dead code**
  - `getMoneyZones()` — already removed prior to this session.
  - `realReturn` variable — removed from `handleFireCalculate` in `fire.js`. Was computed but never used.

- [x] **4d. Document or inline `createChartContext` / `getChartDimensions`**
  - **Fix:** Added doc comments to both functions in `chart-utils.js` explaining purpose, DPR scaling behavior, and when to use each.

- [x] **4e. Clarify Coast FIRE timeframe calculation**
  - **Fix:** Added inline code comment explaining the `Math.min(5, yearsToRetire / 2)` heuristic. Added UI hint below "Extra Monthly to Coast by Target" result explaining the 5-year / half-retirement-time logic to the user.

---

## Phase 5: UX Polish & Future-Proofing

> **Goal:** Improve user experience quality and long-term code health.

- [x] **5a. Add loading states for chart calculations**
  - **Fix:** Added `.chart-loading` spinner overlay CSS to `common-calculator.css` with a teal spinning ring animation. Added `showChartLoading(canvasId)` and `hideChartLoading(canvasId)` utilities to `chart-utils.js`. Wired into all calculate handlers across `fire.js`, `loan.js`, `loan-advanced.js`, `projections.js`, `pv.js`, `npv-irr.js`, and `options.js`. Spinner is shown before calculation, hidden after chart draw completes via `requestAnimationFrame`.

- [x] **5b. Document `normCDF` approximation precision**
  - **Fix:** Added doc comment to `normCDF` in `options.js` noting the Abramowitz & Stegun formula reference (26.2.17), maximum absolute error of ~1.5×10⁻⁷, and the deep ITM/OTM limitation where |d₁| > 6.

- [ ] **5c. Wrap each tool in an IIFE or module**
  - **Deferred** — The original motivations (formatCurrency collision, Enter key conflicts) were resolved in Phases 1a and 2c. Current single-page-per-tool architecture means collision risk is low. Full ES module migration (`import/export`) is the correct long-term solution and preferable over IIFEs as an intermediate step. Revisit when undertaking a module refactor.

- [x] **5d. Accessibility pass**
  - **Fix:** Added 70 ARIA attributes across all 7 calculator pages. Changes include:
    - `role="img"` + descriptive `aria-label` on all 15 canvas chart elements
    - `aria-label` on all calculate buttons, tab buttons, toggle buttons, and add buttons
    - `aria-live="polite"` on all results panels so screen readers announce when results appear
    - `aria-required="true"` on all required form inputs
    - Full keyboard navigability preserved via existing button/input focus order
    - Canvas keyboard navigation deferred — requires tabular data fallbacks (future work)

---

## Priority Reference

| Severity    | Issues                                                                                          | Phase       |
| ----------- | ----------------------------------------------------------------------------------------------- | ----------- |
| 🔴 Critical | `formatCurrency` collision, event listener leak, canvas stale references, `NaN` propagation     | Phase 1     |
| 🟡 High     | Division by zero, Enter key conflicts, Greeks dividend yield mismatch, input validation         | Phase 2     |
| 🟠 Medium   | `mousemove` performance, chart duplication, magic numbers, dead code, undocumented dependencies | Phase 3–4   |
| 🔵 Low      | `alert()` UX, loading states, module separation, accessibility, `normCDF` docs                  | Phase 2b, 5 |

---

> **Note:** The underlying financial math (Black-Scholes, FIRE calculations, projection models) is solid. The issues above are primarily architectural and stem from the codebase being a single monolithic file where naming collisions and scope leakage create subtle bugs. Modularizing the tools will resolve most critical issues organically.
