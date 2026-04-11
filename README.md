You can access the github pages through: https://careycarroll.github.io/financial-calculator/

Copy/paste into Terminal to compress and share. Sharing is caring!
cd ~/path-to-project
zip -r financial-calculator.zip. -x "_.git_" "node_modules/\*" ".DS_Store"

To-Do:

- Add tool tip to all raios to better understand what they represent. Same for all other financial terms on the page.
- css cleanup

===========================================================================

# Common code to pull information from shell

Use this in zsh to dump all js,css,html files into codbase.txt file

```
for f in **/*.(js|css|html); do
  [[ "$f" == *.min.js || "$f" == *.min.css ]] && continue
  echo "========== $f =========="
  cat "$f"
  echo "\n"
done > codebase.txt

```

Kill and restart local python server in vscode

```
pkill -f "python.*http" && python3 -m http.server 8000
```

===========================================================================

# 🛠️ Development Roadmap

> A prioritized plan for bug fixes, performance improvements, architecture refactoring, and UX polish.
> Each phase builds on the previous — later phases assume earlier fixes are in place.

---

## Phase 1: Critical Bug Fixes

> **Goal:** Fix issues that are actively producing incorrect output or degrading performance.

- [ ] **1a. Unify `formatCurrency` into a single configurable function**
  - `formatCurrency` is redefined three times in global scope (0 decimals, 2 decimals, and compact/abbreviated). The last definition silently overwrites the others, causing incorrect display in the FIRE calculator and Options lab.
  - **Fix:** Replace all three with a single function accepting an options parameter:
    ```
    formatCurrency(value, { decimals, compact })
    ```

- [ ] **1b. Fix event listener accumulation on FIRE/Coast charts**
  - New `mousemove` and `mouseleave` listeners are added to the canvas on every recalculation but never removed. After multiple recalculations, dozens of redundant handlers fire simultaneously, causing progressive performance degradation.
  - **Fix:** Use an `AbortController` per chart instance. Call `controller.abort()` before each redraw and create a new controller.

- [ ] **1c. Replace canvas clone-and-replace pattern**
  - The payoff chart clones the canvas node to clear listeners (`canvas.cloneNode(true)`), but any code holding a reference to the old canvas gets a stale reference. This is a latent crash / race condition.
  - **Fix:** Stop cloning canvases. Use the `AbortController` approach from 1b to manage listeners on a single stable canvas reference per chart.

- [ ] **1d. Add `NaN` guard at the input parsing layer**
  - If any input field is empty or non-numeric, `parseFloat` returns `NaN`, which silently propagates through all calculations and canvas draw calls. The user sees a blank or corrupted chart with no error message.
  - **Fix:** Create a `safeParseFloat(value, fallback)` utility and route all input parsing through it.

---

## Phase 2: Input Safety & Correctness

> **Goal:** Prevent bad input from reaching calculation logic.

- [ ] **2a. Comprehensive input validation with bounds checking**
  - Currently, a user can enter negative volatility, a 0% withdrawal rate (division by zero), an age of 500, etc. Some edge cases are caught, many are not.
  - **Fix:** Define a validation schema per tool with min/max bounds. Create a single reusable `validateInputs(schema, values)` function.

- [ ] **2b. Replace `alert()` with inline validation UI**
  - `alert()` blocks the UI thread and is jarring. Replace with inline error messages (red border + message below the input) using reusable `showFieldError()` / `clearFieldErrors()` helpers that match the app's dark theme.

- [ ] **2c. Scope Enter key handlers to their own tool containers**
  - Enter key listeners are bound to all `.calc-form input` elements globally, causing the wrong calculator to trigger depending on which tool is active.
  - **Fix:** Bind Enter handlers to tool-specific containers (`#fire-tool input`, `#options-tool input`, `#projections-tool input`).

- [ ] **2d. Pass dividend yield through to Greeks calculation**
  - The Black-Scholes tab accepts a dividend yield input, but the Greeks sensitivity charts hardcode `0` for dividend yield. This produces inconsistent results within the same tool.
  - **Fix:** Thread the user's dividend yield input value through to `calculateGreeks()`.

---

## Phase 3: Performance Optimization

> **Goal:** Ensure smooth interaction on all devices, including low-end mobile.

- [ ] **3a. Throttle `mousemove` handlers with `requestAnimationFrame`**
  - Every `mousemove` event triggers a full chart redraw including all calculations. Combined with listener accumulation (Phase 1b), this can freeze low-end devices.
  - **Fix:** Wrap all chart `mousemove` handlers in a `requestAnimationFrame` gate — only schedule a new frame if the previous one has completed.

- [ ] **3b. Cache static chart layers on an offscreen canvas**
  - Grid lines, axes, data series, and labels are redrawn on every mouse interaction even though they don't change.
  - **Fix:** Draw static elements once to an offscreen canvas. On `mousemove`, composite the cached layer and only redraw the tooltip/crosshair overlay.

---

## Phase 4: Architecture & DRY Refactor

> **Goal:** Reduce code duplication, improve maintainability, and clean up dead code.

- [ ] **4a. Extract shared chart drawing utilities**
  - Grid drawing, axis labeling, and tooltip rendering logic is duplicated across 6+ chart functions (~150 lines repeated per chart).
  - **Fix:** Create shared utilities:
    ```
    drawChartFrame(ctx, dims, options)
    drawGridLines(ctx, dims, options)
    drawTooltip(ctx, lines, x, y, bounds)
    drawAxisLabels(ctx, dims, labels, format)
    ```

- [ ] **4b. Replace magic numbers with named constants**
  - Hardcoded values like `1200` (months), `10.5` (S&P nominal return), `7.0` (S&P real return), and various padding multipliers are scattered throughout.
  - **Fix:** Consolidate into a top-level config object:
    ```
    const CONFIG = {
      MAX_PROJECTION_MONTHS: 1200,
      SP500_NOMINAL_RETURN: 10.5,
      SP500_REAL_RETURN: 7.0,...
    }
    ```

- [ ] **4c. Remove dead code**
  - `getMoneyZones()` — defined inside `handlePayoffCalculate` but never called (incomplete ITM/OTM zone shading feature).
  - `realReturn` variable — computed in `handleFireCalculate` but never used. The math is actually correct without it (nominal growth vs. nominal target), so the variable is just misleading.

- [ ] **4d. Document or inline `createChartContext` / `getChartDimensions`**
  - These functions are called throughout the chart code but are not defined in the main file. They presumably live in a shared utility file, but this dependency is undocumented.
  - **Fix:** Either inline the definitions or add clear documentation/import references.

- [ ] **4e. Clarify Coast FIRE timeframe calculation**
  - `coastTargetYears = Math.min(5, yearsToRetire / 2)` is an arbitrary heuristic with no explanation to the user, making the "extra monthly contribution needed" figure confusing.
  - **Fix:** Either expose this as a user-configurable input or add a clear explanation in the UI.

---

## Phase 5: UX Polish & Future-Proofing

> **Goal:** Improve user experience quality and long-term code health.

- [ ] **5a. Add loading states for chart calculations**
  - Complex calculations (especially multi-curve payoff with Black-Scholes) can cause a visible delay on slower devices with no feedback.
  - **Fix:** Show a CSS spinner overlay on chart containers during calculation; hide on draw complete.

- [ ] **5b. Document `normCDF` approximation precision**
  - The Abramowitz & Stegun approximation has a maximum error of ~1.5×10⁻⁷. For deep ITM/OTM options (|d₁| > 6), prices may show as exactly 0 or full intrinsic value.
  - **Fix:** Add a doc comment noting the error bound. Acceptable for educational use.

- [ ] **5c. Wrap each tool in an IIFE or module**
  - Everything currently lives in a single file with global scope, which is the root cause of the `formatCurrency` collision (#1a) and Enter key conflicts (#2c).
  - **Fix:** As an intermediate step before full ES module refactoring, wrap each tool (FIRE, Options, Projections) in an IIFE to isolate scope.

- [ ] **5d. Accessibility pass**
  - Canvas-based charts are invisible to screen readers. Interactive elements may lack proper ARIA labels and keyboard navigation.
  - **Fix:** Add ARIA labels to all interactive elements, provide tabular data fallbacks for charts, and ensure full keyboard navigability.

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
