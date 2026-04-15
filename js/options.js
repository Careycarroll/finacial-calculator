import {
  safeParseFloat, safeParseInt, formatCurrency,
  createChartContext, getChartDimensions, showChartLoading, hideChartLoading,
  rafThrottle, validateInputs, showFieldError
} from "./chart-utils.js";
import { getReferenceShape } from "./options-reference-shapes.js";

// ===================================================================
// OPTIONS STRATEGY LAB
// ===================================================================

// ===== TAB SWITCHING =====
const tabs = {
  payoff: {
    tab: document.getElementById("tab-payoff"),
    panel: document.getElementById("payoff-tab"),
  },
  blackscholes: {
    tab: document.getElementById("tab-blackscholes"),
    panel: document.getElementById("blackscholes-tab"),
  },
  greeks: {
    tab: document.getElementById("tab-greeks"),
    panel: document.getElementById("greeks-tab"),
  },
  pnl: {
    tab: document.getElementById("tab-pnl"),
    panel: document.getElementById("pnl-tab"),
  },
};

Object.keys(tabs).forEach((key) => {
  tabs[key].tab.addEventListener("click", () => {
    Object.keys(tabs).forEach((k) => {
      tabs[k].tab.classList.remove("active");
      tabs[k].panel.classList.add("hidden");
    });
    tabs[key].tab.classList.add("active");
    tabs[key].panel.classList.remove("hidden");
  });
});

// ===== FORMATTING =====
// formatCurrency is now provided by chart-utils.js
// Unified function auto-scales: <$1K → 2 decimals, $1K-$999K → whole, $1M+ → compact

let STRATEGIES = null;

async function loadStrategies() {
  if (STRATEGIES) return STRATEGIES;
  const res = await fetch("../data/strategies.json");
  STRATEGIES = await res.json();
  return STRATEGIES;
}

// ===================================================================
// BLACK-SCHOLES MATH
// ===================================================================

// Standard normal CDF approximation (Abramowitz & Stegun, formula 26.2.17)
// Maximum absolute error: ~1.5×10⁻⁷ — acceptable for educational/retail options pricing.
// Limitation: for deep ITM/OTM options where |d₁| > 6, result approaches exactly 0 or 1,
// which may cause call/put prices to display as exactly $0 or full intrinsic value.
function normCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Black-Scholes pricing
function blackScholes(S, K, T, r, sigma, q) {
  // S = stock price, K = strike, T = time in years
  // r = risk-free rate, sigma = volatility, q = dividend yield
  if (T <= 0) {
    return {
      callPrice: Math.max(0, S - K),
      putPrice: Math.max(0, K - S),
      d1: 0,
      d2: 0,
    };
  }

  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const callPrice =
    S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  const putPrice =
    K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);

  return { callPrice, putPrice, d1, d2 };
}

// Greeks calculation
function calculateGreeks(S, K, T, r, sigma, q) {
  if (T <= 0) {
    return {
      call: { delta: S > K ? 1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
      put: { delta: S > K ? 0 : -1, gamma: 0, theta: 0, vega: 0, rho: 0 },
    };
  }

  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const nd1 = normPDF(d1);
  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const Nnd1 = normCDF(-d1);
  const Nnd2 = normCDF(-d2);

  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);

  // Call Greeks
  const callDelta = eqT * Nd1;
  const callGamma = (eqT * nd1) / (S * sigma * Math.sqrt(T));
  const callTheta =
    (-(S * sigma * eqT * nd1) / (2 * Math.sqrt(T)) -
      r * K * erT * Nd2 +
      q * S * eqT * Nd1) /
    365;
  const callVega = (S * eqT * nd1 * Math.sqrt(T)) / 100;
  const callRho = (K * T * erT * Nd2) / 100;

  // Put Greeks
  const putDelta = -eqT * Nnd1;
  const putGamma = callGamma;
  const putTheta =
    (-(S * sigma * eqT * nd1) / (2 * Math.sqrt(T)) +
      r * K * erT * Nnd2 -
      q * S * eqT * Nnd1) /
    365;
  const putVega = callVega;
  const putRho = (-K * T * erT * Nnd2) / 100;

  return {
    call: {
      delta: callDelta,
      gamma: callGamma,
      theta: callTheta,
      vega: callVega,
      rho: callRho,
    },
    put: {
      delta: putDelta,
      gamma: putGamma,
      theta: putTheta,
      vega: putVega,
      rho: putRho,
    },
  };
}

// ===================================================================
// STRATEGY SELECTOR UI
// ===================================================================

let activeStrategy = null;

let payoffMode = "expiration";
let lastPayoffData = null;
let lastPayoffLegs = null;
let lastPayoffStockPrice = null;
let lastPayoffBreakevens = null;
let payoffChartController = null;
let payoffMouseController = null;
let multiCurveMouseController = null;

async function renderStrategyButtons() {
  const strategies = await loadStrategies();
  const tiers = {
    beginner: document.getElementById("strategies-beginner"),
    intermediate: document.getElementById("strategies-intermediate"),
    advanced: document.getElementById("strategies-advanced"),
    expert: document.getElementById("strategies-expert"),
  };

  // Clear
  Object.values(tiers).forEach((el) => (el.innerHTML = ""));

  strategies.forEach((strategy) => {
    const btn = document.createElement("button");
    btn.className = "strategy-btn";
    btn.textContent = strategy.name;
    btn.dataset.id = strategy.id;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".strategy-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectStrategy(strategy);
    });

    tiers[strategy.tier].appendChild(btn);
  });
}

function selectStrategy(strategy) {
  activeStrategy = strategy;
  // Show info card
  const section = document.getElementById("strategy-info-section");
  section.classList.remove("hidden");

  const card = document.getElementById("strategy-info-card");
  const tagsHTML = strategy.tags
    .map((tag) => `<span class="strategy-tag tag-${tag}">${tag}</span>`)
    .join("");

  card.innerHTML = `
    <div class="strategy-info-header">
      <span class="strategy-info-title">${strategy.name}</span>
      <div class="strategy-info-tags">${tagsHTML}</div>
    </div>
    <div class="strategy-info-description">${strategy.description}</div>
    <div class="strategy-info-details">
      <div class="strategy-detail">
        <span class="strategy-detail-label">Max Profit</span>
        <span class="strategy-detail-value detail-profit">${strategy.maxProfit}</span>
      </div>
      <div class="strategy-detail">
        <span class="strategy-detail-label">Max Loss</span>
        <span class="strategy-detail-value detail-loss">${strategy.maxLoss}</span>
      </div>
      <div class="strategy-detail">
        <span class="strategy-detail-label">Breakeven</span>
        <span class="strategy-detail-value detail-neutral">${strategy.breakeven}</span>
      </div>
      <div class="strategy-detail">
        <span class="strategy-detail-label">Ideal Condition</span>
        <span class="strategy-detail-value">${strategy.idealCondition}</span>
      </div>
    </div>
  `;

  // Show inputs and build legs
  document.getElementById("strategy-inputs-section").classList.remove("hidden");
  buildLegInputs(strategy);

  // Scroll to info
  section.scrollIntoView({ behavior: "smooth" });

  // Draw reference diagram
  drawReferenceChart(strategy);
}

// ===================================================================
// REFERENCE PAYOFF DIAGRAM
// ===================================================================

function drawReferenceChart(strategy) {
  const canvas = document.getElementById("reference-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawReferenceChart(strategy));
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 40, right: 40, bottom: 50, left: 40 };
  const w = chart.width - padding.left - padding.right;
  const h = chart.height - padding.top - padding.bottom;

  // Center point
  const cx = padding.left + w / 2;
  const cy = padding.top + h / 2;

  function toX(pct) {
    return padding.left + pct * w;
  }

  function toY(pct) {
    return padding.top + (1 - pct) * h;
  }

  chart.clear();

  // Background
  ctx.fillStyle = "var(--bg-primary)";
  ctx.fillRect(0, 0, chart.width, chart.height);

  // Profit zone (top half)
  ctx.fillStyle = "rgba(74, 222, 128, 0.05)";
  ctx.fillRect(padding.left, padding.top, w, h / 2);

  // Loss zone (bottom half)
  ctx.fillStyle = "rgba(244, 114, 182, 0.05)";
  ctx.fillRect(padding.left, cy, w, h / 2);

  // Zero line
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, cy);
  ctx.lineTo(padding.left + w, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PROFIT", padding.left + 5, padding.top + 16);

  ctx.fillStyle = "#f472b6";
  ctx.fillText("LOSS", padding.left + 5, padding.top + h - 6);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Stock Price →", padding.left + w / 2, chart.height - 8);

  // Title
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(strategy.name, chart.width / 2, 22);

  // Get the payoff shape for this strategy
  const shape = getReferenceShape(strategy.id);

  if (!shape) return;

  // Draw ITM/OTM zones
  if (shape.zones) {
    shape.zones.forEach((zone) => {
      const x1 = toX(zone.from);
      const x2 = toX(zone.to);
      ctx.fillStyle = zone.color;
      ctx.fillRect(x1, padding.top, x2 - x1, h);

      ctx.fillStyle = zone.textColor;
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.8;
      ctx.fillText(zone.label, (x1 + x2) / 2, padding.top + h - 8);
      ctx.globalAlpha = 1.0;
    });
  }

  // Draw strike lines
  if (shape.strikes) {
    shape.strikes.forEach((strike) => {
      const sx = toX(strike.at);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, padding.top);
      ctx.lineTo(sx, padding.top + h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(strike.label, sx, padding.top - 6);
    });
  }

  // Draw breakeven markers
  if (shape.breakevens) {
    shape.breakevens.forEach((be) => {
      const bx = toX(be.at);
      ctx.beginPath();
      ctx.arc(bx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(be.label, bx, cy + 16);
    });
  }

  // Draw the payoff line
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();

  shape.line.forEach((point, i) => {
    const x = toX(point.x);
    const y = toY(point.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Arrow at the end of the line if it extends
  if (shape.arrows) {
    shape.arrows.forEach((arrow) => {
      const ax = toX(arrow.x);
      const ay = toY(arrow.y);
      const size = 8;

      ctx.fillStyle = "#2dd4bf";
      ctx.beginPath();
      if (arrow.dir === "up-right") {
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - size, ay + size / 2);
        ctx.lineTo(ax - size / 2, ay + size);
      } else if (arrow.dir === "down-right") {
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - size, ay - size / 2);
        ctx.lineTo(ax - size / 2, ay - size);
      } else if (arrow.dir === "down-left") {
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + size, ay - size / 2);
        ctx.lineTo(ax + size / 2, ay - size);
      } else if (arrow.dir === "up-left") {
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + size, ay + size / 2);
        ctx.lineTo(ax + size / 2, ay + size);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  // Annotations
  if (shape.annotations) {
    shape.annotations.forEach((ann) => {
      const ax = toX(ann.x);
      const ay = toY(ann.y);
      ctx.fillStyle = ann.color || "#e2e8f0";
      ctx.font = ann.bold ? "bold 10px sans-serif" : "10px sans-serif";
      ctx.textAlign = ann.align || "center";
      ctx.fillText(ann.text, ax, ay);
    });
  }
}

function buildLegInputs(strategy) {
  const container = document.getElementById("legs-container");
  container.innerHTML = "";

  strategy.legs.forEach((leg, index) => {
    const row = document.createElement("div");
    row.className = "leg-row";

    const labelClass =
      leg.action === "buy"
        ? "leg-buy"
        : leg.action === "sell"
          ? "leg-sell"
          : "leg-stock";
    const qty = leg.qty || 1;

    let inputsHTML = "";

    if (leg.type === "stock") {
      inputsHTML = `
        <div class="form-group">
          <label>Purchase Price ($)</label>
          <input type="number" class="leg-strike" placeholder="Same as stock price" min="0" step="any">
        </div>
      `;
    } else {
      inputsHTML = `
        <div class="form-group">
          <label>Strike Price ($)</label>
          <input type="number" class="leg-strike" placeholder="e.g. 100" min="0" step="any">
        </div>
        <div class="leg-premium-wrapper">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Premium ($)</label>
            <input type="number" class="leg-premium" placeholder="e.g. 3.50" min="0" step="any">
          </div>
          <span class="leg-premium-suggestion" data-leg-index="${index}"></span>
        </div>
      `;
    }

    row.innerHTML = `
      <span class="leg-label ${labelClass}">${leg.action === "buy" ? "BUY" : "SELL"}${qty > 1 ? " " + qty + "x" : ""}</span>
      <span class="leg-label" style="color: var(--text-primary); min-width: auto;">${leg.type === "stock" ? "📈 Stock" : leg.type === "call" ? "📞 Call" : "📉 Put"}</span>
      ${inputsHTML}
    `;

    row.dataset.legIndex = index;
    row.dataset.legType = leg.type;
    row.dataset.legAction = leg.action;
    row.dataset.legQty = qty;

    container.appendChild(row);
  });
}

// ===================================================================
// PREMIUM SUGGESTION
// ===================================================================

document
  .getElementById("suggest-premiums-btn")
  .addEventListener("click", suggestPremiums);
// Payoff time mode toggles
document
  .getElementById("payoff-expiration-btn")
  .addEventListener("click", () => {
    payoffMode = "expiration";
    document.getElementById("payoff-expiration-btn").classList.add("active");
    document.getElementById("payoff-before-btn").classList.remove("active");
    document.getElementById("payoff-slider-container").classList.add("hidden");
    document.getElementById("payoff-time-explainer").classList.add("hidden");

    if (lastPayoffData) {
      redrawPayoffChart();
    }
  });

document.getElementById("payoff-before-btn").addEventListener("click", () => {
  payoffMode = "before";
  document.getElementById("payoff-before-btn").classList.add("active");
  document.getElementById("payoff-expiration-btn").classList.remove("active");
  document.getElementById("payoff-slider-container").classList.remove("hidden");

  if (lastPayoffData) {
    redrawPayoffChart();
  }
});

document.getElementById("payoff-days-slider").addEventListener("input", (e) => {
  const days = safeParseInt(e.target.value);
  const label =
    days === 0 ? "Expiration (0)" : days === 1 ? "1 day" : `${days} days`;
  document.getElementById("payoff-days-display").textContent = label;

  if (lastPayoffData) {
    redrawPayoffChart();
  }
});
function suggestPremiums() {
  const stockPrice = safeParseFloat(
    document.getElementById("opt-stock-price").value
    );
  const days = safeParseFloat(document.getElementById("opt-days").value);
  const iv = safeParseFloat(document.getElementById("opt-iv").value) / 100;
  const rfr = safeParseFloat(document.getElementById("opt-rfr").value) / 100;

  const valid = validateInputs([
    { id: "opt-stock-price", label: "Stock Price",          required: true, min: 0.01          },
    { id: "opt-days",        label: "Days to Expiration",   required: true, min: 1,   max: 2000, integer: true },
    { id: "opt-iv",          label: "Implied Volatility",   required: true, min: 0.1, max: 500  },
    { id: "opt-rfr",         label: "Risk-Free Rate",       required: false, min: 0,  max: 30   },
  ], ".calc-form");
  if (!valid) return;

  const T = days / 365;
  const rows = document.querySelectorAll(".leg-row");

  rows.forEach((row, index) => {
    const type = row.dataset.legType;
    if (type === "stock") return;

    const strikeInput = row.querySelector(".leg-strike");
    const premiumInput = row.querySelector(".leg-premium");
    const suggestion = row.querySelector(".leg-premium-suggestion");

    const strike = safeParseFloat(strikeInput?.value);

    if (!strike || strike <= 0) {
      if (suggestion) {
        suggestion.textContent = "↑ Enter strike first";
        suggestion.style.color = "#f59e0b";
        suggestion.onclick = null;
      }
      return;
    }

    const result = blackScholes(stockPrice, strike, T, rfr, iv, 0);
    const price = type === "call" ? result.callPrice : result.putPrice;
    const rounded = Math.round(price * 100) / 100;

    // Moneyness
    let moneyness = "";
    if (type === "call") {
      if (stockPrice > strike) moneyness = " (ITM)";
      else if (stockPrice < strike) moneyness = " (OTM)";
      else moneyness = " (ATM)";
    } else {
      if (stockPrice < strike) moneyness = " (ITM)";
      else if (stockPrice > strike) moneyness = " (OTM)";
      else moneyness = " (ATM)";
    }

    if (suggestion) {
      suggestion.textContent = `💡 Fair value: $${rounded.toFixed(2)}${moneyness} — click to use`;
      suggestion.style.color = "";
      suggestion.onclick = () => {
        premiumInput.value = rounded.toFixed(2);
        suggestion.textContent = `✅ Set to $${rounded.toFixed(2)}${moneyness}`;
        suggestion.style.color = "#4ade80";
      };
    }
  });
}

// Auto-suggest when strike changes
document.getElementById("legs-container").addEventListener("input", (e) => {
  if (e.target.classList.contains("leg-strike")) {
    // Debounce
    clearTimeout(e.target._suggestTimeout);
    e.target._suggestTimeout = setTimeout(() => {
      const stockPrice = safeParseFloat(
        document.getElementById("opt-stock-price").value
        );
      if (stockPrice > 0) {
        suggestSingleLeg(e.target);
      }
    }, 500);
  }
});

function suggestSingleLeg(strikeInput) {
  const stockPrice = safeParseFloat(
    document.getElementById("opt-stock-price").value
    );
  const days = safeParseFloat(document.getElementById("opt-days").value);
  const iv = safeParseFloat(document.getElementById("opt-iv").value) / 100;
  const rfr = safeParseFloat(document.getElementById("opt-rfr").value) / 100;

  if (!stockPrice || !days || !iv) return;

  const row = strikeInput.closest(".leg-row");
  const type = row.dataset.legType;
  if (type === "stock") return;

  const strike = safeParseFloat(strikeInput.value);
  const suggestion = row.querySelector(".leg-premium-suggestion");
  const premiumInput = row.querySelector(".leg-premium");

  if (!strike || strike <= 0) {
    if (suggestion) {
      suggestion.textContent = "";
      suggestion.onclick = null;
    }
    return;
  }

  const T = days / 365;
  const result = blackScholes(stockPrice, strike, T, rfr, iv, 0);
  const price = type === "call" ? result.callPrice : result.putPrice;
  const rounded = Math.round(price * 100) / 100;

  let moneyness = "";
  if (type === "call") {
    if (stockPrice > strike) moneyness = " (ITM)";
    else if (stockPrice < strike) moneyness = " (OTM)";
    else moneyness = " (ATM)";
  } else {
    if (stockPrice < strike) moneyness = " (ITM)";
    else if (stockPrice > strike) moneyness = " (OTM)";
    else moneyness = " (ATM)";
  }

  if (suggestion) {
    suggestion.textContent = `💡 Fair value: $${rounded.toFixed(2)}${moneyness} — click to use`;
    suggestion.style.color = "";
    suggestion.onclick = () => {
      premiumInput.value = rounded.toFixed(2);
      suggestion.textContent = `✅ Set to $${rounded.toFixed(2)}${moneyness}`;
      suggestion.style.color = "#4ade80";
    };
  }
}

// ===================================================================
// P&L BEFORE EXPIRATION (using Black-Scholes)
// ===================================================================

function calculatePayoffBeforeExpiration(
  stockPrice,
  legs,
  daysRemaining,
  iv,
  rfr,
) {
  const T = daysRemaining / 365;
  let totalPnL = 0;

  legs.forEach((leg) => {
    const qty = leg.qty || 1;
    const multiplier = leg.action === "buy" ? 1 : -1;

    if (leg.type === "stock") {
      totalPnL += (stockPrice - leg.strike) * multiplier * qty * 100;
    } else {
      // Use Black-Scholes to get current theoretical value
      let currentValue;
      if (daysRemaining <= 0) {
        // At expiration — intrinsic only
        if (leg.type === "call") {
          currentValue = Math.max(0, stockPrice - leg.strike);
        } else {
          currentValue = Math.max(0, leg.strike - stockPrice);
        }
      } else {
        const result = blackScholes(stockPrice, leg.strike, T, rfr, iv, 0);
        currentValue = leg.type === "call" ? result.callPrice : result.putPrice;
      }

      // P&L = (current value - premium paid) × direction × quantity × 100
      totalPnL += (currentValue - leg.premium) * multiplier * qty * 100;
    }
  });

  return totalPnL;
}

function redrawPayoffChart() {
  if (!lastPayoffData || !lastPayoffLegs || !lastPayoffStockPrice) return;

  const stockPrice = lastPayoffStockPrice;
  const legs = lastPayoffLegs;
  const breakevens = lastPayoffBreakevens;

  const iv = safeParseFloat(document.getElementById("opt-iv").value) / 100 || 0.25;
  const rfr =
    safeParseFloat(document.getElementById("opt-rfr").value) / 100 || 0.05;
  const totalDays = safeParseFloat(document.getElementById("opt-days").value, 30);

  if (payoffMode === "expiration") {
    // Just redraw the standard expiration chart
    const canvas = document.getElementById("payoff-chart-canvas");
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    createChartContext(canvas, rect.width, rect.height);

    const pnlValues = lastPayoffData.map((d) => d.pnl);
    const pnlMin = Math.min(...pnlValues);
    const pnlMax = Math.max(...pnlValues);
    const pnlPadding = Math.max(Math.abs(pnlMax), Math.abs(pnlMin)) * 0.15;

    drawPayoffDirect(
      canvas,
      lastPayoffData,
      stockPrice,
      breakevens,
      legs,
      lastPayoffData[0].price,
      lastPayoffData[lastPayoffData.length - 1].price,
      Math.min(pnlMin - pnlPadding, -pnlPadding),
      Math.max(pnlMax + pnlPadding, pnlPadding),
      null,
    );

    // Rebind mouse events
    bindPayoffMouse(canvas, lastPayoffData, stockPrice, breakevens, legs);

    // Update legend
    document.getElementById("payoff-chart-legend").innerHTML = "";
    return;
  }

  // Before expiration mode — draw multiple curves
  const daysRemaining = safeParseInt(
    document.getElementById("payoff-days-slider").value
    );
  const priceMin = lastPayoffData[0].price;
  const priceMax = lastPayoffData[lastPayoffData.length - 1].price;
  const steps = lastPayoffData.length - 1;
  const stepSize = (priceMax - priceMin) / steps;

  // Generate curves for: selected day, a few intermediate days, and expiration
  const curveDays = [];

  // Always include expiration
  curveDays.push(0);

  // Add intermediate curves
  if (daysRemaining > 0) {
    const intervals = Math.min(3, daysRemaining);
    for (let i = 1; i <= intervals; i++) {
      const d = Math.round((daysRemaining / (intervals + 1)) * i);
      if (d > 0 && !curveDays.includes(d)) {
        curveDays.push(d);
      }
    }
    // Always include the selected day
    if (!curveDays.includes(daysRemaining)) {
      curveDays.push(daysRemaining);
    }
  }

  curveDays.sort((a, b) => a - b);

  // Colors for curves (expiration to today)
  const curveColors = [
    "#f472b6", // expiration — pink
    "#f59e0b", // intermediate — amber
    "#60a5fa", // intermediate — blue
    "#a855f7", // intermediate — purple
    "#2dd4bf", // today/selected — teal (always last/brightest)
  ];

  // Build all curve data
  const curves = curveDays.map((days, idx) => {
    const data = [];
    for (let i = 0; i <= steps; i++) {
      const price = priceMin + i * stepSize;
      const pnl =
        days === 0
          ? calculatePayoff(price, legs)
          : calculatePayoffBeforeExpiration(price, legs, days, iv, rfr);
      data.push({ price, pnl });
    }

    // Assign color — expiration gets first, selected day gets last
    const colorIdx = Math.round(
      (idx / Math.max(1, curveDays.length - 1)) * (curveColors.length - 1),
    );

    return {
      days,
      data,
      color: curveDays.length === 1 ? "#2dd4bf" : curveColors[colorIdx],
      lineWidth: days === daysRemaining ? 3 : days === 0 ? 2 : 1.5,
      dash: days === 0 ? [6, 4] : [],
      label:
        days === 0
          ? "At Expiration"
          : days === 1
            ? "1 day left"
            : `${days} days left`,
    };
  });

  // Find global min/max across all curves
  let globalMin = Infinity;
  let globalMax = -Infinity;
  curves.forEach((curve) => {
    curve.data.forEach((d) => {
      if (d.pnl < globalMin) globalMin = d.pnl;
      if (d.pnl > globalMax) globalMax = d.pnl;
    });
  });

  const pnlPadding = Math.max(Math.abs(globalMax), Math.abs(globalMin)) * 0.15;
  const yMin = Math.min(globalMin - pnlPadding, -pnlPadding);
  const yMax = Math.max(globalMax + pnlPadding, pnlPadding);

  // Draw
  const canvas = document.getElementById("payoff-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  createChartContext(canvas, rect.width, rect.height);

  drawMultiCurvePayoff(
    canvas,
    curves,
    stockPrice,
    breakevens,
    legs,
    priceMin,
    priceMax,
    yMin,
    yMax,
    null,
  );
  bindMultiCurveMouse(
    canvas,
    curves,
    stockPrice,
    breakevens,
    legs,
    priceMin,
    priceMax,
    yMin,
    yMax,
  );

  // Legend
  const legend = document.getElementById("payoff-chart-legend");
  legend.innerHTML = `<div class="payoff-time-legend">${curves
    .map(
      (c) => `
    <span class="payoff-time-legend-item">
      <span class="payoff-time-legend-line" style="background:${c.color};${c.dash.length ? "background: repeating-linear-gradient(90deg, " + c.color + " 0px, " + c.color + " 6px, transparent 6px, transparent 10px);" : ""}"></span>
      ${c.label}
    </span>
  `,
    )
    .join("")}</div>`;
  // Update explainer
  updateTimeExplainer(daysRemaining, curves, legs);
}

function updateTimeExplainer(daysRemaining, curves, legs) {
  const explainer = document.getElementById("payoff-time-explainer");
  explainer.classList.remove("hidden");

  const stockPrice = lastPayoffStockPrice;
  const iv = safeParseFloat(document.getElementById("opt-iv").value, 25);
  const totalDays = safeParseInt(document.getElementById("opt-days").value, 30);

  // Calculate P&L at current stock price for today vs expiration
  const todayCurve = curves.find((c) => c.days === daysRemaining);
  const expirationCurve = curves.find((c) => c.days === 0);

  let pnlToday = 0;
  let pnlExpiration = 0;

  if (todayCurve && expirationCurve) {
    // Find the data point closest to current stock price
    const idx = todayCurve.data.reduce((best, point, i) => {
      return Math.abs(point.price - stockPrice) <
        Math.abs(todayCurve.data[best].price - stockPrice)
        ? i
        : best;
    }, 0);
    pnlToday = todayCurve.data[idx].pnl;
    pnlExpiration = expirationCurve.data[idx].pnl;
  }

  const timeValue = pnlToday - pnlExpiration;

  // Determine strategy type for context
  const isLong = legs.some((l) => l.action === "buy" && l.type !== "stock");
  const isSell = legs.some((l) => l.action === "sell" && l.type !== "stock");
  const isSpread = legs.filter((l) => l.type !== "stock").length > 1;

  let explanation = "";

  if (daysRemaining === 0) {
    explanation = `
      <div class="explainer-title">📍 At Expiration — No Time Value Left</div>
      <p>All curves have collapsed into the same line. This is the <strong>intrinsic value only</strong> — 
      the sharp, angular payoff you see in textbooks. The option is worth only what it would be worth 
      if exercised right now: the difference between the stock price and strike (or zero).</p>
      <p>This is why options are called "wasting assets" — all time value eventually reaches zero.</p>
    `;
  } else if (daysRemaining === totalDays) {
    explanation = `
      <div class="explainer-title">📍 Today — Maximum Time Value</div>
      <p>The <span class="explainer-highlight">teal curve (today)</span> shows what your position is worth 
      <strong>right now</strong>, if you sold/closed it at various stock prices. It's smoother and higher than 
      the expiration line because the option still has <strong>${daysRemaining} days</strong> of time value.</p>
      <p><strong>Why is the curve above the expiration line?</strong> Because there's still a chance the stock 
      could move favorably. The market prices in that possibility. With ${iv}% implied volatility and 
      ${daysRemaining} days left, there's meaningful uncertainty — and uncertainty has value${isLong ? " (for buyers)" : ""}.</p>
      <p>The <span style="color: #f472b6;">pink dashed line</span> shows what happens at expiration — 
      the sharp "hockey stick" shape. Drag the slider left to watch the curves collapse toward it.</p>
      <div class="explainer-comparison">
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">P&L if closed today (at current price)</span>
          <span class="explainer-comparison-value" style="color: ${pnlToday >= 0 ? "#4ade80" : "#f472b6"}">${formatCurrency(pnlToday)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">P&L if held to expiration (at current price)</span>
          <span class="explainer-comparison-value" style="color: ${pnlExpiration >= 0 ? "#4ade80" : "#f472b6"}">${formatCurrency(pnlExpiration)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">Time value remaining</span>
          <span class="explainer-comparison-value" style="color: ${timeValue >= 0 ? "#2dd4bf" : "#f472b6"}">${formatCurrency(timeValue)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">What this means</span>
          <span class="explainer-comparison-value" style="color: var(--text-secondary); font-size: 0.8rem; font-weight: 400;">
            ${
              timeValue > 0
                ? "Closing now captures time value that would decay if held"
                : timeValue < 0
                  ? "Time value is working in your favor (short position)"
                  : "No time value difference at current price"
            }
          </span>
        </div>
      </div>
    `;
  } else {
    const pctTimeElapsed = (
      ((totalDays - daysRemaining) / totalDays) *
      100
    ).toFixed(0);
    const pctTimeRemaining = ((daysRemaining / totalDays) * 100).toFixed(0);

    explanation = `
      <div class="explainer-title">📍 ${daysRemaining} Day${daysRemaining > 1 ? "s" : ""} Remaining — ${pctTimeRemaining}% of Time Left</div>
      <p>The <span class="explainer-highlight">teal curve</span> shows your P&L with <strong>${daysRemaining} days</strong> 
      until expiration. Compare it to the <span style="color: #f472b6;">pink dashed line</span> (expiration) — 
      the gap between them is the <strong>time value</strong> that still exists in the option.</p>
      ${
        daysRemaining <= 7
          ? `<p>⚡ <strong>Theta acceleration zone!</strong> With only ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} left, 
           time decay is at its fastest. Options lose more value per day in the final week than at any other time. 
           This is why many traders close positions before the last week.</p>`
          : daysRemaining <= 14
            ? `<p>⏰ <strong>Entering the acceleration zone.</strong> Time decay (theta) is picking up speed. 
             Notice how the curves are getting closer together — each day costs more time value than the last.</p>`
            : `<p>The curves are still well-separated, meaning time decay is relatively gradual at this point. 
             As you drag the slider further left, watch how the curves start bunching together near expiration — 
             that's theta acceleration.</p>`
      }
      <div class="explainer-comparison">
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">P&L if closed at ${daysRemaining}d (at current price)</span>
          <span class="explainer-comparison-value" style="color: ${pnlToday >= 0 ? "#4ade80" : "#f472b6"}">${formatCurrency(pnlToday)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">P&L at expiration (at current price)</span>
          <span class="explainer-comparison-value" style="color: ${pnlExpiration >= 0 ? "#4ade80" : "#f472b6"}">${formatCurrency(pnlExpiration)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">Time value remaining</span>
          <span class="explainer-comparison-value" style="color: ${timeValue >= 0 ? "#2dd4bf" : "#f472b6"}">${formatCurrency(timeValue)}</span>
        </div>
        <div class="explainer-comparison-item">
          <span class="explainer-comparison-label">Time elapsed</span>
          <span class="explainer-comparison-value" style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 400;">
            ${pctTimeElapsed}% of time has passed (${totalDays - daysRemaining} of ${totalDays} days)
          </span>
        </div>
      </div>
    `;
  }

  explainer.innerHTML = explanation;
}

// ===================================================================
// MULTI-CURVE PAYOFF CHART
// ===================================================================

function drawMultiCurvePayoff(
  canvas,
  curves,
  stockPrice,
  breakevens,
  legs,
  priceMin,
  priceMax,
  yMin,
  yMax,
  highlightPrice,
) {
  const dim = getChartDimensions(canvas);
  const chart = createChartContext(canvas, dim.width, dim.height);
  const ctx = chart.ctx;
  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  function toX(price) {
    return (
      padding.left + ((price - priceMin) / (priceMax - priceMin)) * chartWidth
    );
  }

  function toY(pnl) {
    return (
      padding.top + chartHeight - ((pnl - yMin) / (yMax - yMin)) * chartHeight
    );
  }

  chart.clear();

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
  ctx.lineWidth = 1;
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) {
    const value = yMin + ((yMax - yMin) / ySteps) * i;
    const y = toY(value);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
  }

  ctx.textAlign = "center";
  const xSteps = 8;
  for (let i = 0; i <= xSteps; i++) {
    const price = priceMin + ((priceMax - priceMin) / xSteps) * i;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      "$" + price.toFixed(0),
      toX(price),
      chart.height - padding.bottom + 20,
    );
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText("Stock Price", chart.width / 2, chart.height - 5);

  // Zero line
  const zeroY = toY(0);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(chart.width - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stock price line
  const stockX = toX(stockPrice);
  ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(stockX, padding.top);
  ctx.lineTo(stockX, padding.top + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#60a5fa";
  ctx.font = "10px sans-serif";
  ctx.fillText("Current: $" + stockPrice.toFixed(0), stockX, padding.top - 8);

  // Draw each curve
  curves.forEach((curve) => {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = curve.lineWidth;
    ctx.setLineDash(curve.dash);

    ctx.beginPath();
    curve.data.forEach((point, i) => {
      const x = toX(point.price);
      const y = toY(point.pnl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Breakevens on expiration curve
  const expirationCurve = curves.find((c) => c.days === 0);
  if (expirationCurve) {
    breakevens.forEach((be) => {
      const bx = toX(be);
      ctx.beginPath();
      ctx.arc(bx, zeroY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // Hover tooltip
  if (highlightPrice !== null) {
    const hx = toX(highlightPrice);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots on each curve
    const tooltipLines = [`Stock: $${highlightPrice.toFixed(2)}`];

    curves.forEach((curve) => {
      // Find closest data point
      const idx = Math.round(
        ((highlightPrice - priceMin) / (priceMax - priceMin)) *
          (curve.data.length - 1),
      );
      const clampedIdx = Math.max(0, Math.min(curve.data.length - 1, idx));
      const pnl = curve.data[clampedIdx].pnl;
      const hy = toY(pnl);

      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = curve.color;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      tooltipLines.push(`${curve.label}: ${formatCurrency(pnl)}`);
    });

    // Tooltip box
    ctx.font = "12px sans-serif";
    const tooltipWidth =
      Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;

    let tx = hx + 15;
    let ty = padding.top + 10;
    if (tx + tooltipWidth > chart.width - padding.right)
      tx = hx - tooltipWidth - 15;

    const radius = 6;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + radius, ty);
    ctx.lineTo(tx + tooltipWidth - radius, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius, radius);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
    ctx.arcTo(
      tx + tooltipWidth,
      ty + tooltipHeight,
      tx + tooltipWidth - radius,
      ty + tooltipHeight,
      radius,
    );
    ctx.lineTo(tx + radius, ty + tooltipHeight);
    ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - radius, radius);
    ctx.lineTo(tx, ty + radius);
    ctx.arcTo(tx, ty, tx + radius, ty, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(tooltipLines[0], tx + 12, ty + 18);

    ctx.font = "12px sans-serif";
    for (let i = 1; i < tooltipLines.length; i++) {
      ctx.fillStyle = curves[i - 1].color;
      ctx.fillText(tooltipLines[i], tx + 12, ty + 18 + i * 20);
    }
  }
}

function bindPayoffMouse(canvas, payoffData, stockPrice, breakevens, legs) {
  const priceMin = payoffData[0].price;
  const priceMax = payoffData[payoffData.length - 1].price;
  const pnlValues = payoffData.map((d) => d.pnl);
  const pnlMin = Math.min(...pnlValues);
  const pnlMax = Math.max(...pnlValues);
  const pnlPadding = Math.max(Math.abs(pnlMax), Math.abs(pnlMin)) * 0.15;
  const yMin = Math.min(pnlMin - pnlPadding, -pnlPadding);
  const yMax = Math.max(pnlMax + pnlPadding, pnlPadding);

  const padding = { left: 80 };
  const dim = getChartDimensions(canvas);
  const chartWidth = dim.width - padding.left - 30;

  function fromX(x) {
    return priceMin + ((x - padding.left) / chartWidth) * (priceMax - priceMin);
  }

  if (payoffChartController) payoffChartController.abort();
  payoffChartController = new AbortController();
  const { signal } = payoffChartController;

  // Redraw initial state on new canvas
  drawPayoffDirect(
    canvas,
    payoffData,
    stockPrice,
    breakevens,
    legs,
    priceMin,
    priceMax,
    yMin,
    yMax,
    null,
  );

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const price = fromX(mouseX);

    if (price >= priceMin && price <= priceMax) {
      canvas.style.cursor = "crosshair";
      drawPayoffDirect(
        canvas,
        payoffData,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        price,
      );
    } else {
      canvas.style.cursor = "default";
      drawPayoffDirect(
        canvas,
        payoffData,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        null,
      );
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawPayoffDirect(
        canvas,
      payoffData,
      stockPrice,
      breakevens,
      legs,
      priceMin,
      priceMax,
      yMin,
      yMax,
      null,
    );
  }, { signal });
}

function bindMultiCurveMouse(
  canvas,
  curves,
  stockPrice,
  breakevens,
  legs,
  priceMin,
  priceMax,
  yMin,
  yMax,
) {
  const padding = { left: 80 };
  const dim2 = getChartDimensions(canvas);
  const chartWidth = dim2.width - padding.left - 30;

  function fromX(x) {
    return priceMin + ((x - padding.left) / chartWidth) * (priceMax - priceMin);
  }

  if (multiCurveMouseController) multiCurveMouseController.abort();
  multiCurveMouseController = new AbortController();
  const { signal } = multiCurveMouseController;

  drawMultiCurvePayoff(
    canvas,
    curves,
    stockPrice,
    breakevens,
    legs,
    priceMin,
    priceMax,
    yMin,
    yMax,
    null,
  );

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const price = fromX(mouseX);

    if (price >= priceMin && price <= priceMax) {
      canvas.style.cursor = "crosshair";
      drawMultiCurvePayoff(
        canvas,
        curves,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        price,
      );
    } else {
      canvas.style.cursor = "default";
      drawMultiCurvePayoff(
        canvas,
        curves,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        null,
      );
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawMultiCurvePayoff(
        canvas,
      curves,
      stockPrice,
      breakevens,
      legs,
      priceMin,
      priceMax,
      yMin,
      yMax,
      null,
    );
  }, { signal });
}
// ===================================================================
// PAYOFF CALCULATION
// ===================================================================

function calculatePayoff(stockPrice, legs) {
  let totalPnL = 0;

  legs.forEach((leg) => {
    const qty = leg.qty || 1;
    const multiplier = leg.action === "buy" ? 1 : -1;

    if (leg.type === "stock") {
      totalPnL += (stockPrice - leg.strike) * multiplier * qty * 100;
    } else if (leg.type === "call") {
      const intrinsic = Math.max(0, stockPrice - leg.strike);
      totalPnL += (intrinsic - leg.premium) * multiplier * qty * 100;
    } else if (leg.type === "put") {
      const intrinsic = Math.max(0, leg.strike - stockPrice);
      totalPnL += (intrinsic - leg.premium) * multiplier * qty * 100;
    }
  });

  return totalPnL;
}

function getLegsFromInputs() {
  const rows = document.querySelectorAll(".leg-row");
  const contracts =
    safeParseInt(document.getElementById("opt-contracts").value, 1);
  const legs = [];

  rows.forEach((row) => {
    const type = row.dataset.legType;
    const action = row.dataset.legAction;
    const qty = safeParseInt(row.dataset.legQty, 1);
    const strikeInput = row.querySelector(".leg-strike");
    const premiumInput = row.querySelector(".leg-premium");

    const strike = safeParseFloat(strikeInput?.value, 0);
    const premium = safeParseFloat(premiumInput?.value, 0);

    legs.push({
      type,
      action,
      strike,
      premium,
      qty: qty * contracts,
    });
  });

  return legs;
}

// ===================================================================
// PAYOFF CHART
// ===================================================================

document
  .getElementById("payoff-calculate-btn")
  .addEventListener("click", handlePayoffCalculate);

function handlePayoffCalculate() {
  const stockPrice = safeParseFloat(
    document.getElementById("opt-stock-price").value
    );
  const legs = getLegsFromInputs();

  const valid = validateInputs([
    { id: "opt-stock-price", label: "Stock Price",        required: true, min: 0.01          },
    { id: "opt-days",        label: "Days to Expiration", required: true, min: 1,   max: 2000, integer: true },
    { id: "opt-iv",          label: "Implied Volatility", required: true, min: 0.1, max: 500  },
  ], ".calc-form");
  if (!valid) return;
  for (const leg of legs) {
    if (leg.type !== "stock" && leg.strike <= 0) {
      showFieldError("opt-stock-price", "Please enter strike prices for all legs.");
      return;
    }
  }

  // Set stock leg strike to stock price if not set
  legs.forEach((leg) => {
    if (leg.type === "stock" && leg.strike === 0) {
      leg.strike = stockPrice;
    }
  });

  // Calculate net premium (cost to enter)
  let netPremium = 0;
  legs.forEach((leg) => {
    if (leg.type !== "stock") {
      const mult = leg.action === "buy" ? -1 : 1;
      netPremium += mult * leg.premium * leg.qty * 100;
    }
  });

  // Generate payoff data across price range
  const allStrikes = legs.map((l) => l.strike).filter((s) => s > 0);
  const minStrike = Math.min(...allStrikes, stockPrice);
  const maxStrike = Math.max(...allStrikes, stockPrice);
  const range = maxStrike - minStrike;
  const padding = Math.max(range * 0.5, stockPrice * 0.2);

  const priceMin = Math.max(0, minStrike - padding);
  const priceMax = maxStrike + padding;
  const steps = 200;
  const stepSize = (priceMax - priceMin) / steps;

  const payoffData = [];
  let maxProfit = -Infinity;
  let maxLoss = Infinity;

  for (let i = 0; i <= steps; i++) {
    const price = priceMin + i * stepSize;
    const pnl = calculatePayoff(price, legs);
    payoffData.push({ price, pnl });
    if (pnl > maxProfit) maxProfit = pnl;
    if (pnl < maxLoss) maxLoss = pnl;
  }

  // Find breakevens
  const breakevens = [];
  for (let i = 1; i < payoffData.length; i++) {
    if (
      (payoffData[i - 1].pnl < 0 && payoffData[i].pnl >= 0) ||
      (payoffData[i - 1].pnl >= 0 && payoffData[i].pnl < 0)
    ) {
      // Interpolate
      const p1 = payoffData[i - 1];
      const p2 = payoffData[i];
      const ratio = Math.abs(p1.pnl) / (Math.abs(p1.pnl) + Math.abs(p2.pnl));
      const bePrice = p1.price + ratio * (p2.price - p1.price);
      breakevens.push(bePrice);
    }
  }

  // Show sections
  document.getElementById("payoff-chart-section").classList.remove("hidden");
  document.getElementById("payoff-summary-section").classList.remove("hidden");

  // Store for mode switching
  lastPayoffData = payoffData;
  lastPayoffLegs = legs;
  lastPayoffStockPrice = stockPrice;
  lastPayoffBreakevens = breakevens;

  // Set slider max to days input
  const totalDays = safeParseInt(document.getElementById("opt-days").value, 30);
  const slider = document.getElementById("payoff-days-slider");
  slider.max = totalDays;
  slider.value = totalDays;
  document.getElementById("payoff-days-display").textContent =
    `${totalDays} days`;
  document.getElementById("payoff-slider-max-label").textContent =
    `Today (${totalDays})`;

  // Reset to expiration mode
  payoffMode = "expiration";
  document.getElementById("payoff-expiration-btn").classList.add("active");
  document.getElementById("payoff-before-btn").classList.remove("active");
  document.getElementById("payoff-slider-container").classList.add("hidden");
  // Draw chart
  showChartLoading("payoff-chart-canvas");
  requestAnimationFrame(() => {
    drawPayoffChart(payoffData, stockPrice, breakevens, legs);
    hideChartLoading("payoff-chart-canvas");
  });

  // Summary
  const pnlAtCurrent = calculatePayoff(stockPrice, legs);
  const summary = document.getElementById("payoff-summary");
  summary.innerHTML = `
    <div class="result-item">
      <span class="result-label">Net Premium</span>
      <span class="result-value ${netPremium >= 0 ? "positive" : "negative"}">${netPremium >= 0 ? "Credit " : "Debit "}${formatCurrency(Math.abs(netPremium))}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Max Profit</span>
      <span class="result-value positive">${maxProfit > 1000000 ? "Unlimited" : formatCurrency(maxProfit)}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Max Loss</span>
      <span class="result-value negative">${maxLoss < -1000000 ? "Unlimited" : formatCurrency(maxLoss)}</span>
    </div>
    <div class="result-item">
      <span class="result-label">P&L at Current Price</span>
      <span class="result-value ${pnlAtCurrent >= 0 ? "positive" : "negative"}">${formatCurrency(pnlAtCurrent)}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Breakeven${breakevens.length > 1 ? "s" : ""}</span>
      <span class="result-value">${breakevens.length > 0 ? breakevens.map((b) => "$" + b.toFixed(2)).join(", ") : "None"}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Risk/Reward Ratio</span>
      <span class="result-value">${Math.abs(maxLoss) > 0 && maxProfit < 1000000 ? (maxProfit / Math.abs(maxLoss)).toFixed(2) + ":1" : "N/A"}</span>
    </div>
  `;

  document
    .getElementById("payoff-chart-section")
    .scrollIntoView({ behavior: "smooth" });
}

function drawPayoffChart(payoffData, stockPrice, breakevens, legs) {
  const canvas = document.getElementById("payoff-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() =>
      drawPayoffChart(payoffData, stockPrice, breakevens, legs),
    );
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const priceMin = payoffData[0].price;
  const priceMax = payoffData[payoffData.length - 1].price;
  const pnlValues = payoffData.map((d) => d.pnl);
  const pnlMin = Math.min(...pnlValues);
  const pnlMax = Math.max(...pnlValues);
  const pnlPadding = Math.max(Math.abs(pnlMax), Math.abs(pnlMin)) * 0.15;
  const yMin = Math.min(pnlMin - pnlPadding, -pnlPadding);
  const yMax = Math.max(pnlMax + pnlPadding, pnlPadding);

  function toX(price) {
    return (
      padding.left + ((price - priceMin) / (priceMax - priceMin)) * chartWidth
    );
  }

  function toY(pnl) {
    return (
      padding.top + chartHeight - ((pnl - yMin) / (yMax - yMin)) * chartHeight
    );
  }

  function fromX(x) {
    return priceMin + ((x - padding.left) / chartWidth) * (priceMax - priceMin);
  }

  function draw(highlightPrice) {
    chart.clear();

    // Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;

    const ySteps = 6;
    for (let i = 0; i <= ySteps; i++) {
      const value = yMin + ((yMax - yMin) / ySteps) * i;
      const y = toY(value);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
    }

    // X-axis labels
    ctx.textAlign = "center";
    const xSteps = 8;
    for (let i = 0; i <= xSteps; i++) {
      const price = priceMin + ((priceMax - priceMin) / xSteps) * i;
      const x = toX(price);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(
        "$" + price.toFixed(0),
        x,
        chart.height - padding.bottom + 20,
      );
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      "Stock Price at Expiration",
      chart.width / 2,
      chart.height - 5,
    );

    // Zero line (breakeven reference)
    const zeroY = toY(0);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(chart.width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current stock price line
    const stockX = toX(stockPrice);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(stockX, padding.top);
    ctx.lineTo(stockX, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#60a5fa";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Current: $" + stockPrice.toFixed(0), stockX, padding.top - 8);

    // Profit zone (green fill above zero)
    ctx.beginPath();
    for (let i = 0; i < payoffData.length; i++) {
      const x = toX(payoffData[i].price);
      const y = toY(Math.max(0, payoffData[i].pnl));

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Close along zero line
    for (let i = payoffData.length - 1; i >= 0; i--) {
      const x = toX(payoffData[i].price);
      if (payoffData[i].pnl > 0) {
        ctx.lineTo(x, zeroY);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(74, 222, 128, 0.08)";
    ctx.fill();

    // Loss zone (red fill below zero)
    ctx.beginPath();
    for (let i = 0; i < payoffData.length; i++) {
      const x = toX(payoffData[i].price);
      const y = toY(Math.min(0, payoffData[i].pnl));

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = payoffData.length - 1; i >= 0; i--) {
      const x = toX(payoffData[i].price);
      if (payoffData[i].pnl < 0) {
        ctx.lineTo(x, zeroY);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(244, 114, 182, 0.08)";
    ctx.fill();

    // Payoff line
    ctx.beginPath();
    payoffData.forEach((point, i) => {
      const x = toX(point.price);
      const y = toY(point.pnl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Breakeven dots
    breakevens.forEach((be) => {
      const bx = toX(be);
      const by = toY(0);
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BE: $" + be.toFixed(2), bx, by - 12);
    });

    // Hover
    if (highlightPrice !== null) {
      const hx = toX(highlightPrice);
      const pnl = calculatePayoff(highlightPrice, legs);
      const hy = toY(pnl);

      // Crosshair
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = pnl >= 0 ? "#4ade80" : "#f472b6";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tooltip
      const tooltipLines = [
        `Stock: $${highlightPrice.toFixed(2)}`,
        `P&L: ${formatCurrency(pnl)}`,
        pnl >= 0 ? "✅ Profit" : "❌ Loss",
      ];

      ctx.font = "12px sans-serif";
      const tooltipWidth =
        Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
      const tooltipHeight = tooltipLines.length * 20 + 12;

      let tx = hx + 15;
      let ty = hy - tooltipHeight / 2;

      if (tx + tooltipWidth > chart.width - padding.right)
        tx = hx - tooltipWidth - 15;
      if (ty < padding.top) ty = padding.top;
      if (ty + tooltipHeight > padding.top + chartHeight)
        ty = padding.top + chartHeight - tooltipHeight;

      const radius = 6;
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(tx + radius, ty);
      ctx.lineTo(tx + tooltipWidth - radius, ty);
      ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius, radius);
      ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
      ctx.arcTo(
        tx + tooltipWidth,
        ty + tooltipHeight,
        tx + tooltipWidth - radius,
        ty + tooltipHeight,
        radius,
      );
      ctx.lineTo(tx + radius, ty + tooltipHeight);
      ctx.arcTo(
        tx,
        ty + tooltipHeight,
        tx,
        ty + tooltipHeight - radius,
        radius,
      );
      ctx.lineTo(tx, ty + radius);
      ctx.arcTo(tx, ty, tx + radius, ty, radius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(tooltipLines[0], tx + 12, ty + 18);

      ctx.font = "12px sans-serif";
      ctx.fillStyle = pnl >= 0 ? "#4ade80" : "#f472b6";
      ctx.fillText(tooltipLines[1], tx + 12, ty + 38);
      ctx.fillText(tooltipLines[2], tx + 12, ty + 58);
    }
  }

  // Initial draw
  draw(null);

  // Mouse events — clone canvas to remove old listeners
  if (payoffMouseController) payoffMouseController.abort();
  payoffMouseController = new AbortController();
  const { signal } = payoffMouseController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const price = fromX(mouseX);

    if (price >= priceMin && price <= priceMax) {
      canvas.style.cursor = "crosshair";
      drawPayoffDirect(
        canvas,
        payoffData,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        price,
      );
    } else {
      canvas.style.cursor = "default";
      drawPayoffDirect(
        canvas,
        payoffData,
        stockPrice,
        breakevens,
        legs,
        priceMin,
        priceMax,
        yMin,
        yMax,
        null,
      );
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawPayoffDirect(
        canvas,
      payoffData,
      stockPrice,
      breakevens,
      legs,
      priceMin,
      priceMax,
      yMin,
      yMax,
      null,
    );
  }, { signal });
}

// Direct draw function for mouse events (avoids closure issues with canvas replacement)
function drawPayoffDirect(
  canvas,
  payoffData,
  stockPrice,
  breakevens,
  legs,
  priceMin,
  priceMax,
  yMin,
  yMax,
  highlightPrice,
) {
  const dim = getChartDimensions(canvas);
  const chart = createChartContext(canvas, dim.width, dim.height);
  const ctx = chart.ctx;
  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  function toX(price) {
    return (
      padding.left + ((price - priceMin) / (priceMax - priceMin)) * chartWidth
    );
  }

  function toY(pnl) {
    return (
      padding.top + chartHeight - ((pnl - yMin) / (yMax - yMin)) * chartHeight
    );
  }

  chart.clear();

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
  ctx.lineWidth = 1;
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) {
    const value = yMin + ((yMax - yMin) / ySteps) * i;
    const y = toY(value);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(value), padding.left - 10, y + 4);
  }

  ctx.textAlign = "center";
  const xSteps = 8;
  for (let i = 0; i <= xSteps; i++) {
    const price = priceMin + ((priceMax - priceMin) / xSteps) * i;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      "$" + price.toFixed(0),
      toX(price),
      chart.height - padding.bottom + 20,
    );
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText("Stock Price at Expiration", chart.width / 2, chart.height - 5);

  // Zero line
  const zeroY = toY(0);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(chart.width - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stock price line
  const stockX = toX(stockPrice);
  ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(stockX, padding.top);
  ctx.lineTo(stockX, padding.top + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#60a5fa";
  ctx.font = "10px sans-serif";
  ctx.fillText("Current: $" + stockPrice.toFixed(0), stockX, padding.top - 8);

  // Profit fill
  ctx.beginPath();
  for (let i = 0; i < payoffData.length; i++) {
    const x = toX(payoffData[i].price);
    const y = toY(Math.max(0, payoffData[i].pnl));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = payoffData.length - 1; i >= 0; i--) {
    if (payoffData[i].pnl > 0) ctx.lineTo(toX(payoffData[i].price), zeroY);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(74, 222, 128, 0.08)";
  ctx.fill();

  // Loss fill
  ctx.beginPath();
  for (let i = 0; i < payoffData.length; i++) {
    const x = toX(payoffData[i].price);
    const y = toY(Math.min(0, payoffData[i].pnl));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = payoffData.length - 1; i >= 0; i--) {
    if (payoffData[i].pnl < 0) ctx.lineTo(toX(payoffData[i].price), zeroY);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(244, 114, 182, 0.08)";
  ctx.fill();

  // Payoff line
  ctx.beginPath();
  payoffData.forEach((point, i) => {
    const x = toX(point.price);
    const y = toY(point.pnl);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Breakevens
  breakevens.forEach((be) => {
    const bx = toX(be);
    ctx.beginPath();
    ctx.arc(bx, zeroY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f59e0b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BE: $" + be.toFixed(2), bx, zeroY - 12);
  });

  // Hover
  if (highlightPrice !== null) {
    const hx = toX(highlightPrice);
    const pnl = calculatePayoff(highlightPrice, legs);
    const hy = toY(pnl);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = pnl >= 0 ? "#4ade80" : "#f472b6";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    const tooltipLines = [
      `Stock: $${highlightPrice.toFixed(2)}`,
      `P&L: ${formatCurrency(pnl)}`,
      pnl >= 0 ? "✅ Profit" : "❌ Loss",
    ];

    ctx.font = "12px sans-serif";
    const tooltipWidth =
      Math.max(...tooltipLines.map((l) => ctx.measureText(l).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;

    let tx = hx + 15;
    let ty = hy - tooltipHeight / 2;
    if (tx + tooltipWidth > chart.width - padding.right)
      tx = hx - tooltipWidth - 15;
    if (ty < padding.top) ty = padding.top;
    if (ty + tooltipHeight > padding.top + chartHeight)
      ty = padding.top + chartHeight - tooltipHeight;

    const radius = 6;
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + radius, ty);
    ctx.lineTo(tx + tooltipWidth - radius, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + radius, radius);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - radius);
    ctx.arcTo(
      tx + tooltipWidth,
      ty + tooltipHeight,
      tx + tooltipWidth - radius,
      ty + tooltipHeight,
      radius,
    );
    ctx.lineTo(tx + radius, ty + tooltipHeight);
    ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - radius, radius);
    ctx.lineTo(tx, ty + radius);
    ctx.arcTo(tx, ty, tx + radius, ty, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(tooltipLines[0], tx + 12, ty + 18);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = pnl >= 0 ? "#4ade80" : "#f472b6";
    ctx.fillText(tooltipLines[1], tx + 12, ty + 38);
    ctx.fillText(tooltipLines[2], tx + 12, ty + 58);
  }
}

// ===================================================================
// BLACK-SCHOLES TAB
// ===================================================================

document
  .getElementById("bs-calculate-btn")
  .addEventListener("click", handleBSCalculate);

function handleBSCalculate() {
  const S = safeParseFloat(document.getElementById("bs-stock").value);
  const K = safeParseFloat(document.getElementById("bs-strike").value);
  const days = safeParseFloat(document.getElementById("bs-time").value);
  const sigma =
    safeParseFloat(document.getElementById("bs-volatility").value) / 100;
  const r = safeParseFloat(document.getElementById("bs-rate").value) / 100;
  const q = safeParseFloat(document.getElementById("bs-dividend").value) / 100;

  const valid = validateInputs([
    { id: "bs-stock",      label: "Stock Price",  required: true, min: 0.01          },
    { id: "bs-strike",     label: "Strike Price", required: true, min: 0.01          },
    { id: "bs-time",       label: "Days",         required: true, min: 1,   max: 2000 },
    { id: "bs-volatility", label: "Volatility",   required: true, min: 0.1, max: 500  },
    { id: "bs-rate",       label: "Rate",         required: false, min: 0,  max: 30   },
    { id: "bs-dividend",   label: "Dividend",     required: false, min: 0,  max: 30   },
  ], ".calc-form");
  if (!valid) return;

  const T = days / 365;
  const result = blackScholes(S, K, T, r, sigma, q);
  const greeks = calculateGreeks(S, K, T, r, sigma, q);

  // Moneyness
  const moneyness =
    S > K ? "In the Money" : S < K ? "Out of the Money" : "At the Money";
  const putMoneyness =
    S < K ? "In the Money" : S > K ? "Out of the Money" : "At the Money";

  document.getElementById("bs-call-price").textContent = formatCurrency(
    result.callPrice,
  );
  document.getElementById("bs-call-moneyness").textContent =
    `Call is ${moneyness}`;
  document.getElementById("bs-put-price").textContent = formatCurrency(
    result.putPrice,
  );
  document.getElementById("bs-put-moneyness").textContent =
    `Put is ${putMoneyness}`;

  // Greeks display
  const greeksGrid = document.getElementById("bs-greeks-grid");
  greeksGrid.innerHTML = renderGreeksCards(greeks.call, greeks.put);

  document.getElementById("bs-results-section").classList.remove("hidden");
  document
    .getElementById("bs-results-section")
    .scrollIntoView({ behavior: "smooth" });
}

// ===================================================================
// GREEKS TAB
// ===================================================================

document
  .getElementById("gk-calculate-btn")
  .addEventListener("click", handleGreeksCalculate);

let greeksChartData = null;

function handleGreeksCalculate() {
  const S = safeParseFloat(document.getElementById("gk-stock").value);
  const K = safeParseFloat(document.getElementById("gk-strike").value);
  const days = safeParseFloat(document.getElementById("gk-time").value);
  const sigma =
    safeParseFloat(document.getElementById("gk-volatility").value) / 100;
  const r = safeParseFloat(document.getElementById("gk-rate").value) / 100;
  const q = safeParseFloat(document.getElementById("gk-dividend").value) / 100;
  const optionType = document.getElementById("gk-type").value;

  const valid = validateInputs([
    { id: "gk-stock",      label: "Stock Price",  required: true, min: 0.01          },
    { id: "gk-strike",     label: "Strike Price", required: true, min: 0.01          },
    { id: "gk-time",       label: "Days",         required: true, min: 1,   max: 2000 },
    { id: "gk-volatility", label: "Volatility",   required: true, min: 0.1, max: 500  },
    { id: "gk-rate",       label: "Rate",         required: false, min: 0,  max: 30   },
    { id: "gk-dividend",   label: "Dividend",     required: false, min: 0,  max: 30   },
  ], ".calc-form");
  if (!valid) return;

  const T = days / 365;
  const greeks = calculateGreeks(S, K, T, r, sigma, q);
  const g = optionType === "call" ? greeks.call : greeks.put;

  // Display cards
  const grid = document.getElementById("gk-greeks-grid");
  grid.innerHTML = renderGreeksSingle(g, optionType);

  // Build sensitivity data
  const range = S * 0.3;
  const steps = 100;
  greeksChartData = { S, K, T, r, sigma, q, optionType, range, steps };

  document.getElementById("gk-results-section").classList.remove("hidden");
  document.getElementById("gk-chart-section").classList.remove("hidden");
  showChartLoading("gk-chart-canvas");

  drawGreeksSensitivity("delta");

  document
    .getElementById("gk-results-section")
    .scrollIntoView({ behavior: "smooth" });
}

// Greeks chart toggle buttons
["delta", "gamma", "theta", "vega"].forEach((greek) => {
  document.getElementById(`gk-${greek}-btn`).addEventListener("click", () => {
    document
      .querySelectorAll(".proj-chart-controls.btn-toggle")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById(`gk-${greek}-btn`).classList.add("active");
    if (greeksChartData) drawGreeksSensitivity(greek);
  });
});

function drawGreeksSensitivity(greek) {
  const { S, K, T, r, sigma, q, optionType, range, steps } = greeksChartData;

  const canvas = document.getElementById("gk-chart-canvas");
  hideChartLoading("gk-chart-canvas");

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawGreeksSensitivity(greek));
    return;
  }
  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;

  const padding = { top: 30, right: 30, bottom: 50, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  // Generate data
  const priceMin = Math.max(1, S - range);
  const priceMax = S + range;
  const stepSize = (priceMax - priceMin) / steps;
  const data = [];

  for (let i = 0; i <= steps; i++) {
    const price = priceMin + i * stepSize;
    const g = calculateGreeks(price, K, T, r, sigma, q);
    const val = optionType === "call" ? g.call[greek] : g.put[greek];
    data.push({ price, value: val });
  }

  const values = data.map((d) => d.value);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vPad = (vMax - vMin) * 0.1 || 0.1;

  function toX(price) {
    return (
      padding.left + ((price - priceMin) / (priceMax - priceMin)) * chartWidth
    );
  }

  function toY(val) {
    return (
      padding.top +
      chartHeight -
      ((val - (vMin - vPad)) / (vMax + vPad - (vMin - vPad))) * chartHeight
    );
  }

  chart.clear();

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const val = vMin - vPad + ((vMax + vPad - (vMin - vPad)) / 5) * i;
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chart.width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(val.toFixed(4), padding.left - 10, y + 4);
  }

  // X-axis
  ctx.textAlign = "center";
  for (let i = 0; i <= 8; i++) {
    const price = priceMin + ((priceMax - priceMin) / 8) * i;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      "$" + price.toFixed(0),
      toX(price),
      chart.height - padding.bottom + 20,
    );
  }
  ctx.fillText("Stock Price", chart.width / 2, chart.height - 5);

  // Current stock price line
  ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(toX(S), padding.top);
  ctx.lineTo(toX(S), padding.top + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Zero line if applicable
  if (vMin < 0 && vMax > 0) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(0));
    ctx.lineTo(chart.width - padding.right, toY(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Line
  const colors = {
    delta: "#2dd4bf",
    gamma: "#f59e0b",
    theta: "#f472b6",
    vega: "#60a5fa",
  };
  ctx.strokeStyle = colors[greek] || "#2dd4bf";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.forEach((point, i) => {
    const x = toX(point.price);
    const y = toY(point.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Title
  const greekNames = {
    delta: "Delta (Δ)",
    gamma: "Gamma (Γ)",
    theta: "Theta (Θ)",
    vega: "Vega (ν)",
  };
  ctx.fillStyle = colors[greek];
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    `${greekNames[greek]} vs Stock Price — ${optionType.toUpperCase()}`,
    padding.left,
    padding.top - 10,
  );
}

// ===================================================================
// GREEKS CARD RENDERERS
// ===================================================================

function renderGreeksCards(callGreeks, putGreeks) {
  const greekDefs = [
    {
      key: "delta",
      symbol: "Δ",
      name: "Delta",
      desc: "How much the option price moves for a $1 change in stock price. A delta of 0.50 means the option gains $0.50 when the stock rises $1.",
    },
    {
      key: "gamma",
      symbol: "Γ",
      name: "Gamma",
      desc: "How fast delta changes. High gamma means delta is sensitive to stock price moves. Highest for ATM options near expiration.",
    },
    {
      key: "theta",
      symbol: "Θ",
      name: "Theta",
      desc: "Time decay — how much value the option loses each day. Negative for long options (time works against you), positive for short options.",
    },
    {
      key: "vega",
      symbol: "ν",
      name: "Vega",
      desc: "Sensitivity to volatility. How much the option price changes for a 1% change in implied volatility. Higher for longer-dated options.",
    },
    {
      key: "rho",
      symbol: "ρ",
      name: "Rho",
      desc: "Sensitivity to interest rates. How much the option price changes for a 1% change in the risk-free rate. Usually the least impactful Greek.",
    },
  ];

  return greekDefs
    .map(
      (g) => `
    <div class="greek-card">
      <div class="greek-card-header">
        <span class="greek-symbol">${g.symbol}</span>
        <div style="text-align: right;">
          <div style="font-size: 0.7rem; color: var(--text-secondary);">Call / Put</div>
          <span class="greek-value">${callGreeks[g.key].toFixed(4)} / ${putGreeks[g.key].toFixed(4)}</span>
        </div>
      </div>
      <span class="greek-name">${g.name}</span>
      <span class="greek-description">${g.desc}</span>
    </div>
  `,
    )
    .join("");
}

function renderGreeksSingle(greeks, type) {
  const greekDefs = [
    {
      key: "delta",
      symbol: "Δ",
      name: "Delta",
      desc: "How much the option price moves for a $1 change in stock price.",
    },
    {
      key: "gamma",
      symbol: "Γ",
      name: "Gamma",
      desc: "How fast delta changes as the stock price moves.",
    },
    {
      key: "theta",
      symbol: "Θ",
      name: "Theta",
      desc: "How much value the option loses each day (time decay).",
    },
    {
      key: "vega",
      symbol: "ν",
      name: "Vega",
      desc: "How much the option price changes for a 1% change in implied volatility.",
    },
    {
      key: "rho",
      symbol: "ρ",
      name: "Rho",
      desc: "How much the option price changes for a 1% change in interest rates.",
    },
  ];

  return greekDefs
    .map(
      (g) => `
    <div class="greek-card">
      <div class="greek-card-header">
        <span class="greek-symbol">${g.symbol}</span>
        <span class="greek-value">${greeks[g.key].toFixed(4)}</span>
      </div>
      <span class="greek-name">${g.name} (${type})</span>
      <span class="greek-description">${g.desc}</span>
    </div>
  `,
    )
    .join("");
}

// ===================================================================
// P&L CALCULATOR TAB
// ===================================================================

document
  .getElementById("pnl-calculate-btn")
  .addEventListener("click", handlePnLCalculate);

function handlePnLCalculate() {
  const type = document.getElementById("pnl-type").value;
  const contracts =
    safeParseInt(document.getElementById("pnl-contracts").value, 1);
  const strike = safeParseFloat(document.getElementById("pnl-strike").value);
  const premium = safeParseFloat(document.getElementById("pnl-premium").value);
  const currentStock = safeParseFloat(
    document.getElementById("pnl-current-stock").value
    );
  const currentPremium = safeParseFloat(
    document.getElementById("pnl-current-premium").value
    );

  const valid = validateInputs([
    { id: "pnl-strike",        label: "Strike Price",   required: true, min: 0.01 },
    { id: "pnl-premium",       label: "Premium",        required: true, min: 0.01 },
    { id: "pnl-current-stock", label: "Current Stock",  required: true, min: 0.01 },
  ], ".calc-form");
  if (!valid) return;

  const shares = contracts * 100;
  const isLong = type.startsWith("long");
  const isCall = type.includes("call");

  // Current P&L (if closing now)
  let pnlClose = 0;
  if (currentPremium) {
    pnlClose = isLong
      ? (currentPremium - premium) * shares
      : (premium - currentPremium) * shares;
  }

  // P&L at expiration at current stock price
  let intrinsic = 0;
  if (isCall) {
    intrinsic = Math.max(0, currentStock - strike);
  } else {
    intrinsic = Math.max(0, strike - currentStock);
  }

  const pnlExpiration = isLong
    ? (intrinsic - premium) * shares
    : (premium - intrinsic) * shares;

  // Breakeven
  const breakeven = isCall
    ? strike + (isLong ? premium : -premium)
    : strike - (isLong ? premium : -premium);

  // Max profit / loss
  let maxProfit, maxLoss;
  if (type === "long-call") {
    maxProfit = "Unlimited";
    maxLoss = formatCurrency(premium * shares);
  } else if (type === "long-put") {
    maxProfit = formatCurrency((strike - premium) * shares);
    maxLoss = formatCurrency(premium * shares);
  } else if (type === "short-call") {
    maxProfit = formatCurrency(premium * shares);
    maxLoss = "Unlimited";
  } else if (type === "short-put") {
    maxProfit = formatCurrency(premium * shares);
    maxLoss = formatCurrency((strike - premium) * shares);
  }

  // Return on investment
  const costBasis = premium * shares;
  const roi =
    costBasis > 0 ? ((pnlClose || pnlExpiration) / costBasis) * 100 : 0;

  // Display
  const results = document.getElementById("pnl-results");
  results.innerHTML = `
    <div class="result-item">
      <span class="result-label">P&L if Closed Now</span>
      <span class="result-value ${pnlClose >= 0 ? "positive" : "negative"}">${currentPremium ? formatCurrency(pnlClose) : "Enter current option price"}</span>
    </div>
    <div class="result-item">
      <span class="result-label">P&L at Expiration</span>
      <span class="result-value ${pnlExpiration >= 0 ? "positive" : "negative"}">${formatCurrency(pnlExpiration)}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Breakeven</span>
      <span class="result-value">${formatCurrency(breakeven)}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Max Profit</span>
      <span class="result-value positive">${maxProfit}</span>
    </div>
    <div class="result-item">
      <span class="result-label">Max Loss</span>
      <span class="result-value negative">${maxLoss}</span>
    </div>
    <div class="result-item">
      <span class="result-label">ROI</span>
      <span class="result-value ${roi >= 0 ? "positive" : "negative"}">${roi.toFixed(1)}%</span>
    </div>
  `;

  // Draw P&L chart
  const legs = [
    {
      type: isCall ? "call" : "put",
      action: isLong ? "buy" : "sell",
      strike: strike,
      premium: premium,
      qty: contracts,
    },
  ];

  const range = strike * 0.3;
  const pMin = Math.max(0, strike - range);
  const pMax = strike + range;
  const stepSize = (pMax - pMin) / 200;
  const payoffData = [];

  for (let i = 0; i <= 200; i++) {
    const price = pMin + i * stepSize;
    const pnl = calculatePayoff(price, legs);
    payoffData.push({ price, pnl });
  }

  const pnlValues = payoffData.map((d) => d.pnl);
  const yMinVal = Math.min(...pnlValues);
  const yMaxVal = Math.max(...pnlValues);
  const yPad = Math.max(Math.abs(yMaxVal), Math.abs(yMinVal)) * 0.15;

  document.getElementById("pnl-results-section").classList.remove("hidden");
  document.getElementById("pnl-chart-section").classList.remove("hidden");
  showChartLoading("pnl-chart-canvas");

  // Use the direct draw function
  const canvas = document.getElementById("pnl-chart-canvas");
  hideChartLoading("pnl-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  createChartContext(canvas, rect.width, rect.height);

  drawPayoffDirect(
    canvas,
    payoffData,
    currentStock,
    [breakeven],
    legs,
    pMin,
    pMax,
    Math.min(yMinVal - yPad, -yPad),
    Math.max(yMaxVal + yPad, yPad),
    null,
  );

  document
    .getElementById("pnl-results-section")
    .scrollIntoView({ behavior: "smooth" });
}

// ===================================================================
// INITIALIZE
// ===================================================================

renderStrategyButtons();
