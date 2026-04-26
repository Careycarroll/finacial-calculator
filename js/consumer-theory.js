import {
  safeParseFloat,
  createChartContext,
  rafThrottle,
  validateInputs,
  showFieldError,
  bindFormEnter,
  drawLabelWithBackground,
} from "./chart-utils.js";

// ===================================================================
// STATE
// ===================================================================

let euUtilityFn = "sqrt";
let rpUtilityFn = "sqrt";
let euOptionCount = 0;
let rpOutcomeCount = 0;
let lastElasData = null;
let lastCrossData = null;
let lastEUData = null;
let lastRPData = null;
let elasChartController = null;
let crossChartController = null;
let euChartController = null;
let rpChartController = null;

// ===================================================================
// TAB SWITCHING
// ===================================================================

const tabs = {
  elasticity: {
    tab: document.getElementById("tab-elasticity"),
    panel: document.getElementById("elasticity-tab"),
  },
  "cross-price": {
    tab: document.getElementById("tab-cross-price"),
    panel: document.getElementById("cross-price-tab"),
  },
  eu: {
    tab: document.getElementById("tab-eu"),
    panel: document.getElementById("eu-tab"),
  },
  "risk-premium": {
    tab: document.getElementById("tab-risk-premium"),
    panel: document.getElementById("risk-premium-tab"),
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

// ===================================================================
// EXPLAINER TOGGLES
// ===================================================================

function initExplainer(toggleId, bodyId) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!toggle || !body) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    body.classList.toggle("hidden", expanded);
  });
}

initExplainer("elas-explainer-toggle", "elas-explainer-body");
initExplainer("cross-explainer-toggle", "cross-explainer-body");
initExplainer("eu-explainer-toggle", "eu-explainer-body");
initExplainer("rp-explainer-toggle", "rp-explainer-body");
initExplainer("elas-steps-toggle", "elas-steps-body");
initExplainer("cross-steps-toggle", "cross-steps-body");
initExplainer("eu-steps-toggle", "eu-steps-body");
initExplainer("rp-steps-toggle", "rp-steps-body");

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function applyUtility(x, fn) {
  if (x <= 0 && (fn === "sqrt" || fn === "log")) return null;
  switch (fn) {
    case "sqrt":
      return Math.sqrt(x);
    case "log":
      return Math.log(x);
    case "linear":
      return x;
    case "square":
      return x * x;
    default:
      return x;
  }
}

function inverseUtility(u, fn) {
  switch (fn) {
    case "sqrt":
      return u * u;
    case "log":
      return Math.exp(u);
    case "linear":
      return u;
    case "square":
      return Math.sqrt(Math.max(0, u));
    default:
      return u;
  }
}

function utilityFnLabel(fn) {
  switch (fn) {
    case "sqrt":
      return "u(x) = √x";
    case "log":
      return "u(x) = ln(x)";
    case "linear":
      return "u(x) = x";
    case "square":
      return "u(x) = x²";
    default:
      return fn;
  }
}

// ===================================================================
// ELASTICITY MODE TOGGLE
// ===================================================================

let elasticityMode = "equation";
let elasticitySolveMode = "solveQ";

// ===== MODE BUTTONS =====
const elasModes = ["equation", "point", "solve", "arc"];
const elasPanels = {
  equation: "elas-equation-inputs",
  point: "elas-point-inputs",
  solve: "elas-solve-inputs",
  arc: "elas-arc-inputs",
};
const elasBtns = {
  equation: "elas-mode-equation",
  point: "elas-mode-point",
  solve: "elas-mode-solve",
  arc: "elas-mode-arc",
};

document.addEventListener("DOMContentLoaded", () => {
  elasModes.forEach((mode) => {
    document.getElementById(elasBtns[mode]).addEventListener("click", () => {
      elasticityMode = mode;
      elasModes.forEach((m) => {
        document
          .getElementById(elasBtns[m])
          .classList.toggle("active", m === mode);
        document
          .getElementById(elasPanels[m])
          .classList.toggle("hidden", m !== mode);
      });
    });
  });

  document.getElementById("elas-solve-q-btn").addEventListener("click", () => {
    elasticitySolveMode = "solveQ";
    document.getElementById("elas-solve-q-btn").classList.add("active");
    document.getElementById("elas-solve-p-btn").classList.remove("active");
    document.getElementById("elas-solve-p-group").classList.remove("hidden");
    document.getElementById("elas-solve-q-group").classList.add("hidden");
  });

  document.getElementById("elas-solve-p-btn").addEventListener("click", () => {
    elasticitySolveMode = "solveP";
    document.getElementById("elas-solve-p-btn").classList.add("active");
    document.getElementById("elas-solve-q-btn").classList.remove("active");
    document.getElementById("elas-solve-q-group").classList.remove("hidden");
    document.getElementById("elas-solve-p-group").classList.add("hidden");
  });

  [
    "elas-eq-d-const",
    "elas-eq-d-coef",
    "elas-eq-s-const",
    "elas-eq-s-coef",
  ].forEach((id) => {
    document
      .getElementById(id)
      .addEventListener("input", updateElasEquationPreviews);
  });
});

function updateElasEquationPreviews() {
  const dConst = document.getElementById("elas-eq-d-const").value;
  const dCoef = document.getElementById("elas-eq-d-coef").value;
  const sConst = document.getElementById("elas-eq-s-const").value;
  const sCoef = document.getElementById("elas-eq-s-coef").value;
  const dC = dConst !== "" ? dConst : "a";
  const dB = dCoef !== "" ? dCoef : "b";
  const sC = sConst !== "" ? sConst : "c";
  const sD = sCoef !== "" ? sCoef : "d";
  document.getElementById("elas-eq-demand-preview").textContent =
    "Q_d = " + dC + " + (" + dB + ")·P";
  document.getElementById("elas-eq-supply-preview").textContent =
    "Q_s = " + sC + " + (" + sD + ")·P";
}

// ===================================================================
// TAB 1 — PRICE ELASTICITY
// ===================================================================

document
  .getElementById("elas-calculate")
  .addEventListener("click", handleElasticityCalculate);
bindFormEnter(() => handleElasticityCalculate(), "#elasticity-tab");

function classifyElasticity(absEps) {
  if (absEps > 1.001) return "elastic";
  if (absEps < 0.999) return "inelastic";
  return "unit-elastic";
}

function applyRevenueImpact(el, classification, curveType, absEps) {
  if (curveType === "demand") {
    if (classification === "elastic") {
      el.className = "ct-revenue-impact down";
      el.textContent =
        "📉 Price increase → Revenue FALLS (elastic demand: quantity drops more than price rises)";
    } else if (classification === "inelastic") {
      el.className = "ct-revenue-impact up";
      el.textContent =
        "📈 Price increase → Revenue RISES (inelastic demand: quantity drops less than price rises)";
    } else {
      el.className = "ct-revenue-impact neutral";
      el.textContent =
        "➡️ Price increase → Revenue UNCHANGED (unit elastic: effects exactly cancel)";
    }
  } else {
    el.className = "ct-revenue-impact neutral";
    el.textContent =
      "Supply elasticity: " +
      absEps.toFixed(4) +
      ". " +
      (absEps > 1
        ? "Elastic supply — quantity responds strongly to price."
        : absEps < 1
          ? "Inelastic supply — quantity responds weakly to price."
          : "Unit elastic supply.");
  }
}

function handleElasticityCalculate() {
  let epsilon, p, q, curveType;

  if (elasticityMode === "equation") {
    const valid = validateInputs(
      [
        { id: "elas-eq-d-const", label: "Demand constant", required: true },
        {
          id: "elas-eq-d-coef",
          label: "Demand price coefficient",
          required: true,
        },
        { id: "elas-eq-s-const", label: "Supply constant", required: true },
        {
          id: "elas-eq-s-coef",
          label: "Supply price coefficient",
          required: true,
        },
      ],
      "#elasticity-tab",
    );
    if (!valid) return;

    const dA = safeParseFloat(document.getElementById("elas-eq-d-const").value);
    const dB = safeParseFloat(document.getElementById("elas-eq-d-coef").value);
    const sC = safeParseFloat(document.getElementById("elas-eq-s-const").value);
    const sD = safeParseFloat(document.getElementById("elas-eq-s-coef").value);

    const denom = dB - sD;
    if (Math.abs(denom) < 1e-10) {
      showFieldError(
        "elas-eq-d-coef",
        "Curves are parallel — no equilibrium exists.",
      );
      return;
    }

    const pStar = (sC - dA) / denom;
    const qStar = dA + dB * pStar;

    if (pStar <= 0 || qStar <= 0) {
      showFieldError(
        "elas-eq-d-const",
        "Equilibrium has non-positive P* or Q* — check your equations.",
      );
      return;
    }

    const epsilonD = dB * (pStar / qStar);
    const epsilonS = sD * (pStar / qStar);

    lastElasData = {
      mode: "equation",
      dA,
      dB,
      sC,
      sD,
      pStar,
      qStar,
      epsilonD,
      epsilonS,
    };

    const absD = Math.abs(epsilonD);
    const absS = Math.abs(epsilonS);
    const clsD = classifyElasticity(absD);
    const clsS = classifyElasticity(absS);
    const labels = {
      elastic: "Elastic",
      inelastic: "Inelastic",
      "unit-elastic": "Unit Elastic",
    };

    document.getElementById("elas-value").textContent =
      "εd = " + epsilonD.toFixed(4) + "  |  εs = " + epsilonS.toFixed(4);
    document.getElementById("elas-abs").textContent =
      "|εd| = " + absD.toFixed(4) + "  |  |εs| = " + absS.toFixed(4);
    document.getElementById("elas-badge").innerHTML =
      '<span class="ct-badge ' +
      clsD +
      '" style="margin-right:0.5rem;">Demand: ' +
      labels[clsD] +
      "</span>" +
      '<span class="ct-badge ' +
      clsS +
      '">Supply: ' +
      labels[clsS] +
      "</span>";

    applyRevenueImpact(
      document.getElementById("elas-revenue-impact"),
      clsD,
      "demand",
      absD,
    );
    renderElasticitySteps(lastElasData);
    document.getElementById("elas-results").classList.remove("hidden");
    document.getElementById("elas-steps-section").classList.remove("hidden");
    document.getElementById("elas-chart-section").classList.remove("hidden");
    requestAnimationFrame(() => drawElasticityChart(lastElasData));
    document
      .getElementById("elas-results")
      .scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (elasticityMode === "point") {
    const valid = validateInputs(
      [
        { id: "elas-dqdp", label: "∂q/∂p", required: true },
        { id: "elas-p", label: "Price", required: true, min: 0.001 },
        { id: "elas-q", label: "Quantity", required: true, min: 0.001 },
      ],
      "#elasticity-tab",
    );
    if (!valid) return;

    curveType = document.getElementById("elas-curve-type").value;
    const dqdp = safeParseFloat(document.getElementById("elas-dqdp").value);
    p = safeParseFloat(document.getElementById("elas-p").value);
    q = safeParseFloat(document.getElementById("elas-q").value);
    epsilon = dqdp * (p / q);
    lastElasData = { mode: "point", dqdp, p, q, epsilon, curveType };
  } else if (elasticityMode === "solve") {
    const baseIds = [
      { id: "elas-solve-eps", label: "Target Elasticity", required: true },
      { id: "elas-solve-dqdp", label: "∂q/∂p", required: true },
    ];
    if (elasticitySolveMode === "solveQ") {
      baseIds.push({
        id: "elas-solve-p",
        label: "Price",
        required: true,
        min: 0.001,
      });
    } else {
      baseIds.push({
        id: "elas-solve-q",
        label: "Quantity",
        required: true,
        min: 0.001,
      });
    }
    const valid = validateInputs(baseIds, "#elasticity-tab");
    if (!valid) return;

    curveType = document.getElementById("elas-solve-curve-type").value;
    const targetEps = safeParseFloat(
      document.getElementById("elas-solve-eps").value,
    );
    const dqdp = safeParseFloat(
      document.getElementById("elas-solve-dqdp").value,
    );

    if (elasticitySolveMode === "solveQ") {
      p = safeParseFloat(document.getElementById("elas-solve-p").value);
      if (Math.abs(targetEps) < 1e-10) {
        showFieldError(
          "elas-solve-eps",
          "Target elasticity cannot be zero when solving for Q.",
        );
        return;
      }
      q = (dqdp * p) / targetEps;
      epsilon = targetEps;
      lastElasData = {
        mode: "solve",
        solveFor: "Q",
        dqdp,
        p,
        q,
        epsilon,
        curveType,
        targetEps,
      };
    } else {
      q = safeParseFloat(document.getElementById("elas-solve-q").value);
      if (Math.abs(dqdp) < 1e-10) {
        showFieldError(
          "elas-solve-dqdp",
          "∂q/∂p cannot be zero when solving for P.",
        );
        return;
      }
      p = (targetEps * q) / dqdp;
      epsilon = targetEps;
      lastElasData = {
        mode: "solve",
        solveFor: "P",
        dqdp,
        p,
        q,
        epsilon,
        curveType,
        targetEps,
      };
    }
  } else {
    curveType = document.getElementById("elas-arc-curve-type").value;
    const valid = validateInputs(
      [
        { id: "elas-p1", label: "Price 1", required: true, min: 0.001 },
        { id: "elas-q1", label: "Quantity 1", required: true, min: 0.001 },
        { id: "elas-p2", label: "Price 2", required: true, min: 0.001 },
        { id: "elas-q2", label: "Quantity 2", required: true, min: 0.001 },
      ],
      "#elasticity-tab",
    );
    if (!valid) return;

    const p1 = safeParseFloat(document.getElementById("elas-p1").value);
    const q1 = safeParseFloat(document.getElementById("elas-q1").value);
    const p2 = safeParseFloat(document.getElementById("elas-p2").value);
    const q2 = safeParseFloat(document.getElementById("elas-q2").value);

    if (p1 === p2) {
      showFieldError("elas-p2", "Price 1 and Price 2 must be different.");
      return;
    }

    const deltaQ = q2 - q1;
    const deltaP = p2 - p1;
    const avgQ = (q1 + q2) / 2;
    const avgP = (p1 + p2) / 2;
    epsilon = deltaQ / avgQ / (deltaP / avgP);
    p = avgP;
    q = avgQ;
    lastElasData = {
      mode: "arc",
      p1,
      q1,
      p2,
      q2,
      avgP,
      avgQ,
      deltaQ,
      deltaP,
      epsilon,
      curveType,
    };
  }

  const absEps = Math.abs(epsilon);
  const classification = classifyElasticity(absEps);
  const labels = {
    elastic: "Elastic",
    inelastic: "Inelastic",
    "unit-elastic": "Unit Elastic",
  };

  document.getElementById("elas-value").textContent = epsilon.toFixed(4);
  document.getElementById("elas-abs").textContent = absEps.toFixed(4);
  document.getElementById("elas-badge").innerHTML =
    '<span class="ct-badge ' +
    classification +
    '">' +
    labels[classification] +
    "</span>";
  applyRevenueImpact(
    document.getElementById("elas-revenue-impact"),
    classification,
    curveType,
    absEps,
  );

  renderElasticitySteps(lastElasData);
  document.getElementById("elas-results").classList.remove("hidden");
  document.getElementById("elas-steps-section").classList.remove("hidden");
  document.getElementById("elas-chart-section").classList.remove("hidden");
  requestAnimationFrame(() => drawElasticityChart(lastElasData));
  document
    .getElementById("elas-results")
    .scrollIntoView({ behavior: "smooth" });
}

function renderElasticitySteps(data) {
  const container = document.getElementById("elas-steps-content");
  const { mode } = data;

  function sec(title, ...items) {
    return `<div class="ct-step-section"><div class="ct-step-section-title">${title}</div>${items.join("")}</div>`;
  }
  function step(text, cls2 = "") {
    return `<div class="ct-step ${cls2}">${text}</div>`;
  }

  const sections = [];
  const clsLabels = {
    elastic: "Elastic (|ε| > 1)",
    inelastic: "Inelastic (|ε| < 1)",
    "unit-elastic": "Unit Elastic (|ε| = 1)",
  };

  if (mode === "equation") {
    const { dA, dB, sC, sD, pStar, qStar, epsilonD, epsilonS } = data;
    const denom = dB - sD;
    const absD = Math.abs(epsilonD);
    const absS = Math.abs(epsilonS);
    const clsD = classifyElasticity(absD);
    const clsS = classifyElasticity(absS);

    sections.push(
      sec(
        "Step 1 — Full Equations",
        step(
          `<span style="color:#f472b6;">Demand: Q_d = ${dA} + (${dB})·P</span>`,
        ),
        step(
          `<span style="color:#2dd4bf;">Supply: Q_s = ${sC} + (${sD})·P</span>`,
        ),
      ),
    );

    sections.push(
      sec(
        "Step 2 — Solve for Equilibrium (Set Q_d = Q_s)",
        step(`${dA} + (${dB})·P = ${sC} + (${sD})·P`),
        step(`${dA} − ${sC} = (${sD})·P − (${dB})·P`),
        step(`${(dA - sC).toFixed(4)} = (${(sD - dB).toFixed(4)})·P`),
        step(`P* = ${(dA - sC).toFixed(4)} ÷ ${(sD - dB).toFixed(4)}`),
        step(`<strong>P* = ${pStar.toFixed(4)}</strong>`, "result"),
      ),
    );

    sections.push(
      sec(
        "Step 3 — Solve for Q*",
        step(`Q* = ${dA} + (${dB}) × ${pStar.toFixed(4)}`),
        step(`<strong>Q* = ${qStar.toFixed(4)}</strong>`, "result"),
      ),
    );

    sections.push(
      sec(
        "Step 4 — Demand Elasticity at Equilibrium",
        step("ε_d = (∂Q_d/∂P) × (P*/Q*)"),
        step(`= ${dB} × (${pStar.toFixed(4)} / ${qStar.toFixed(4)})`),
        step(`<strong>ε_d = ${epsilonD.toFixed(4)}</strong>`, "result"),
        step(
          `<strong>${clsLabels[clsD]}</strong>`,
          clsD === "elastic"
            ? "negative"
            : clsD === "inelastic"
              ? "positive"
              : "highlight",
        ),
      ),
    );

    sections.push(
      sec(
        "Step 5 — Supply Elasticity at Equilibrium",
        step("ε_s = (∂Q_s/∂P) × (P*/Q*)"),
        step(`= ${sD} × (${pStar.toFixed(4)} / ${qStar.toFixed(4)})`),
        step(`<strong>ε_s = ${epsilonS.toFixed(4)}</strong>`, "result"),
        step(
          `<strong>${clsLabels[clsS]}</strong>`,
          clsS === "elastic"
            ? "positive"
            : clsS === "inelastic"
              ? "highlight"
              : "highlight",
        ),
      ),
    );

    sections.push(
      sec(
        "Step 6 — Revenue Impact (Demand)",
        step("Revenue = Price × Quantity"),
        clsD === "elastic"
          ? step(
              "Elastic demand: a price ↑ causes a larger quantity ↓ → Revenue FALLS",
              "negative",
            )
          : clsD === "inelastic"
            ? step(
                "Inelastic demand: a price ↑ causes a smaller quantity ↓ → Revenue RISES",
                "positive",
              )
            : step(
                "Unit elastic: price ↑ and quantity ↓ exactly offset → Revenue UNCHANGED",
                "highlight",
              ),
      ),
    );
  } else if (mode === "point") {
    const { dqdp, p, q, epsilon, curveType } = data;
    const absEps = Math.abs(epsilon);
    const cls = classifyElasticity(absEps);

    sections.push(
      sec(
        "Formula",
        step("Point Price Elasticity = (∂q/∂p) × (p/q)"),
        step(`= ${dqdp} × (${p} / ${q})`),
        step(`= ${dqdp} × ${(p / q).toFixed(4)}`),
        step(`<strong>ε = ${epsilon.toFixed(4)}</strong>`, "result"),
      ),
    );

    sections.push(
      sec(
        "Classification",
        step(`|ε| = ${absEps.toFixed(4)}`),
        step(
          `<strong>${clsLabels[cls]}</strong>`,
          cls === "elastic"
            ? "negative"
            : cls === "inelastic"
              ? "positive"
              : "highlight",
        ),
      ),
    );

    if (curveType === "demand") {
      sections.push(
        sec(
          "Revenue Impact (Demand)",
          step("Revenue = Price × Quantity"),
          cls === "elastic"
            ? step("Elastic demand: price ↑ → Revenue FALLS", "negative")
            : cls === "inelastic"
              ? step("Inelastic demand: price ↑ → Revenue RISES", "positive")
              : step("Unit elastic: Revenue UNCHANGED", "highlight"),
        ),
      );
    }
  } else if (mode === "solve") {
    const { dqdp, p, q, epsilon, curveType, targetEps, solveFor } = data;
    const absEps = Math.abs(epsilon);
    const cls = classifyElasticity(absEps);

    if (solveFor === "Q") {
      sections.push(
        sec(
          "Solving for Q",
          step("ε = (∂q/∂p) × (P/Q)  →  rearrange for Q:"),
          step("Q = (∂q/∂p × P) / ε"),
          step(`Q = (${dqdp} × ${p}) / ${targetEps}`),
          step(`<strong>Q = ${q.toFixed(4)}</strong>`, "result"),
          step(
            `At price P = ${p}, elasticity ε = ${targetEps} holds when Q = ${q.toFixed(4)}.`,
          ),
        ),
      );
    } else {
      sections.push(
        sec(
          "Solving for P",
          step("ε = (∂q/∂p) × (P/Q)  →  rearrange for P:"),
          step("P = (ε × Q) / (∂q/∂p)"),
          step(`P = (${targetEps} × ${q}) / ${dqdp}`),
          step(`<strong>P = ${p.toFixed(4)}</strong>`, "result"),
          step(
            `At quantity Q = ${q}, elasticity ε = ${targetEps} holds when P = ${p.toFixed(4)}.`,
          ),
        ),
      );
    }

    sections.push(
      sec(
        "Verification",
        step(
          `ε = ${dqdp} × (${p.toFixed(4)} / ${q.toFixed(4)}) = ${epsilon.toFixed(4)} ✅`,
        ),
      ),
    );
  } else {
    const { p1, q1, p2, q2, avgP, avgQ, deltaQ, deltaP, epsilon, curveType } =
      data;
    const absEps = Math.abs(epsilon);
    const cls = classifyElasticity(absEps);

    sections.push(
      sec(
        "Arc Elasticity — Midpoint Formula",
        step("ε = (ΔQ / Q̄) ÷ (ΔP / P̄)"),
        step(`ΔQ = ${q2} − ${q1} = ${deltaQ.toFixed(4)}`),
        step(`ΔP = ${p2} − ${p1} = ${deltaP.toFixed(4)}`),
        step(`Q̄ = (${q1} + ${q2}) / 2 = ${avgQ.toFixed(4)}`),
        step(`P̄ = (${p1} + ${p2}) / 2 = ${avgP.toFixed(4)}`),
        step(
          `ε = (${deltaQ.toFixed(4)} / ${avgQ.toFixed(4)}) ÷ (${deltaP.toFixed(4)} / ${avgP.toFixed(4)})`,
        ),
        step(`= ${(deltaQ / avgQ).toFixed(4)} ÷ ${(deltaP / avgP).toFixed(4)}`),
        step(`<strong>ε = ${epsilon.toFixed(4)}</strong>`, "result"),
      ),
    );

    sections.push(
      sec(
        "Classification",
        step(`|ε| = ${absEps.toFixed(4)}`),
        step(
          `<strong>${clsLabels[cls]}</strong>`,
          cls === "elastic"
            ? "negative"
            : cls === "inelastic"
              ? "positive"
              : "highlight",
        ),
      ),
    );

    if (curveType === "demand") {
      sections.push(
        sec(
          "Revenue Impact (Demand)",
          step("Revenue = Price × Quantity"),
          cls === "elastic"
            ? step("Elastic demand: price ↑ → Revenue FALLS", "negative")
            : cls === "inelastic"
              ? step("Inelastic demand: price ↑ → Revenue RISES", "positive")
              : step("Unit elastic: Revenue UNCHANGED", "highlight"),
        ),
      );
    }
  }

  container.innerHTML = sections.join("");
  document
    .getElementById("elas-steps-toggle")
    .setAttribute("aria-expanded", "true");
  document.getElementById("elas-steps-body").classList.remove("hidden");
}

function drawElasticityChart(data) {
  const canvas = document.getElementById("elas-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawElasticityChart(data));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 60, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  // ── Resolve curves from data ──
  let refP, refQ, epsilon, curveType;
  let demandSlope, demandIntercept, supplySlope, supplyIntercept;
  const hasEquation = data.mode === "equation";

  if (hasEquation) {
    refP = data.pStar;
    refQ = data.qStar;
    epsilon = data.epsilonD;
    curveType = "demand";
    demandSlope = data.dB;
    demandIntercept = data.dA;
    supplySlope = data.sD;
    supplyIntercept = data.sC;
  } else if (data.mode === "point" || data.mode === "solve") {
    refP = data.p;
    refQ = data.q;
    epsilon = data.epsilon;
    curveType = data.curveType;
  } else {
    refP = data.avgP;
    refQ = data.avgQ;
    epsilon = data.epsilon;
    curveType = data.curveType;
  }

  // For non-equation modes, reconstruct a single curve from elasticity
  if (!hasEquation) {
    const s = curveType === "demand"
      ? -Math.abs(epsilon) * (refQ / refP)
      : Math.abs(epsilon) * (refQ / refP);
    const ic = refQ - s * refP;
    if (curveType === "demand") {
      demandSlope = s; demandIntercept = ic;
    } else {
      supplySlope = s; supplyIntercept = ic;
    }
  }

  // ── Axis bounds — same logic as micro-econ getChartBounds ──
  const pMin = 0;
  const qMin = 0;
  let qMax, pMax;

  if (hasEquation) {
    // Use intercepts and equilibrium to set natural bounds
    const dIntAbs = Math.abs(demandIntercept);
    const pZeroDemand = demandSlope !== 0 ? Math.abs(-demandIntercept / demandSlope) : 0;
    qMax = Math.max(dIntAbs, Math.abs(refQ) * 1.6, 1);
    pMax = Math.max(pZeroDemand, Math.abs(refP) * 1.8, 1);
  } else {
    // Single curve — use ref point to set bounds
    const slope = demandSlope !== undefined ? demandSlope : supplySlope;
    const intercept = demandSlope !== undefined ? demandIntercept : supplyIntercept;
    const pZero = slope !== 0 ? Math.abs(-intercept / slope) : refP * 2;
    qMax = Math.max(Math.abs(intercept), Math.abs(refQ) * 1.6, 1);
    pMax = Math.max(pZero, Math.abs(refP) * 1.8, 1);
  }

  function toX(q) { return padding.left + (q / qMax) * chartWidth; }
  function toY(p) { return padding.top + chartHeight - (p / pMax) * chartHeight; }
  function fromX(x) { return ((x - padding.left) / chartWidth) * qMax; }

  const absEps = Math.abs(epsilon);
  const cls = classifyElasticity(absEps);
  const clsColors = { elastic: "#f472b6", inelastic: "#2dd4bf", "unit-elastic": "#f59e0b" };

  // ── Offscreen static layer — must match DPR scaling of main canvas ──
  const dpr = window.devicePixelRatio || 1;
  const offscreen = document.createElement("canvas");
  offscreen.width = chart.width * dpr;
  offscreen.height = chart.height * dpr;
  offscreen.style.width = chart.width + "px";
  offscreen.style.height = chart.height + "px";
  const offCtx = offscreen.getContext("2d");
  offCtx.scale(dpr, dpr);

  function drawStatic() {
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    // Grid — 6 steps matching micro-econ style
    for (let i = 0; i <= 6; i++) {
      const p = (pMax / 6) * i;
      const y = toY(p);
      offCtx.strokeStyle = "rgba(148,163,184,0.12)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(padding.left, y);
      offCtx.lineTo(chart.width - padding.right, y);
      offCtx.stroke();
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.md;
      offCtx.textAlign = "right";
      offCtx.fillText(p.toFixed(2), padding.left - 8, y + 4);
    }
    for (let i = 0; i <= 6; i++) {
      const q = (qMax / 6) * i;
      const x = toX(q);
      offCtx.strokeStyle = "rgba(148,163,184,0.12)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(x, padding.top);
      offCtx.lineTo(x, padding.top + chartHeight);
      offCtx.stroke();
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = window.CHART_FONTS.md;
      offCtx.textAlign = "center";
      offCtx.fillText(q.toFixed(2), x, offscreen.height - padding.bottom + 18);
    }

    // Axis labels
    offCtx.fillStyle = "#94a3b8";
    offCtx.font = window.CHART_FONTS.md;
    offCtx.textAlign = "center";
    offCtx.fillText("Quantity (Q)", chart.width / 2, chart.height - 8);
    offCtx.save();
    offCtx.translate(14, chart.height / 2);
    offCtx.rotate(-Math.PI / 2);
    offCtx.fillText("Price (P)", 0, 0);
    offCtx.restore();

    // Axes
    offCtx.strokeStyle = "rgba(148,163,184,0.3)";
    offCtx.lineWidth = 1;
    offCtx.beginPath();
    offCtx.moveTo(padding.left, padding.top);
    offCtx.lineTo(padding.left, padding.top + chartHeight);
    offCtx.lineTo(chart.width - padding.right, padding.top + chartHeight);
    offCtx.stroke();

    // Demand curve
    if (demandSlope !== undefined) {
      offCtx.strokeStyle = "#f472b6";
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      let started = false;
      for (let p = pMin; p <= pMax; p += pMax / 300) {
        const q = demandIntercept + demandSlope * p;
        if (q < 0 || q > qMax * 1.02) continue;
        if (!started) { offCtx.moveTo(toX(q), toY(p)); started = true; }
        else offCtx.lineTo(toX(q), toY(p));
      }
      offCtx.stroke();
      // Label with background box
      const dLabelQ = qMax * 0.05;
      const dLabelP = (dLabelQ - demandIntercept) / demandSlope;
      if (dLabelP > 0 && dLabelP <= pMax) {
        const dLX = toX(dLabelQ) + 5;
        const dLY = toY(dLabelP) - 4;
        offCtx.font = window.CHART_FONTS.boldMd;
        const dLW = offCtx.measureText("Demand").width + 12;
        offCtx.fillStyle = "rgba(15,23,42,0.92)";
        offCtx.beginPath();
        offCtx.roundRect(dLX - 4, dLY - 14, dLW, 18, 3);
        offCtx.fill();
        offCtx.fillStyle = "#f472b6";
        offCtx.textAlign = "left";
        offCtx.fillText("Demand", dLX, dLY);
      }
    }

    // Supply curve
    if (supplySlope !== undefined) {
      offCtx.strokeStyle = "#2dd4bf";
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      let started = false;
      for (let p = pMin; p <= pMax; p += pMax / 300) {
        const q = supplyIntercept + supplySlope * p;
        if (q < 0 || q > qMax * 1.02) continue;
        if (!started) { offCtx.moveTo(toX(q), toY(p)); started = true; }
        else offCtx.lineTo(toX(q), toY(p));
      }
      offCtx.stroke();
      // Label — find a visible point in the upper-left region of the supply curve
      // Try several candidate Q positions and use the first one that fits in bounds
      const sCandidates = [qMax * 0.55, qMax * 0.45, qMax * 0.35, qMax * 0.65];
      for (const sLabelQ of sCandidates) {
        if (Math.abs(supplySlope) < 1e-10) break;
        const sLabelP = (sLabelQ - supplyIntercept) / supplySlope;
        if (sLabelP > pMax * 0.1 && sLabelP <= pMax * 0.85 && sLabelQ >= 0 && sLabelQ <= qMax) {
          const sLX = toX(sLabelQ) + 5;
          const sLY = toY(sLabelP) - 4;
          offCtx.font = window.CHART_FONTS.boldMd;
          const sLW = offCtx.measureText("Supply").width + 12;
          offCtx.fillStyle = "rgba(15,23,42,0.92)";
          offCtx.beginPath();
          offCtx.roundRect(sLX - 4, sLY - 14, sLW, 18, 3);
          offCtx.fill();
          offCtx.fillStyle = "#2dd4bf";
          offCtx.textAlign = "left";
          offCtx.fillText("Supply", sLX, sLY);
          break;
        }
      }
    }

    // Equilibrium point (equation mode)
    if (hasEquation) {
      const eqX = toX(refQ);
      const eqY = toY(refP);
      offCtx.strokeStyle = "rgba(245,158,11,0.5)";
      offCtx.lineWidth = 1;
      offCtx.setLineDash([4, 4]);
      offCtx.beginPath();
      offCtx.moveTo(eqX, padding.top + chartHeight);
      offCtx.lineTo(eqX, eqY);
      offCtx.moveTo(padding.left, eqY);
      offCtx.lineTo(eqX, eqY);
      offCtx.stroke();
      offCtx.setLineDash([]);
      offCtx.beginPath();
      offCtx.arc(eqX, eqY, 7, 0, Math.PI * 2);
      offCtx.fillStyle = "#f59e0b";
      offCtx.fill();
      offCtx.strokeStyle = "#0f172a";
      offCtx.lineWidth = 2;
      offCtx.stroke();
      // P* Q* labels with background boxes like micro-econ
      offCtx.fillStyle = "#f59e0b";
      offCtx.font = window.CHART_FONTS.boldSm;
      offCtx.textAlign = "right";
      offCtx.fillText("P*=" + refP.toFixed(3), padding.left - 4, eqY + 4);
      offCtx.textAlign = "center";
      offCtx.fillText("Q*=" + refQ.toFixed(3), eqX, padding.top + chartHeight + 32);
      // E label with smart positioning
      offCtx.font = window.CHART_FONTS.boldSm;
      const eqLabel = "E(" + refQ.toFixed(3) + ", " + refP.toFixed(3) + ")";
      const eqLabelW = offCtx.measureText(eqLabel).width;
      const eqLabelH = 14;
      const eqPad = 4;
      const eqInRight = eqX > padding.left + chartWidth * 0.6;
      const eqLabelX = eqInRight ? eqX - eqLabelW - 14 : eqX + 12;
      const eqNearTop = eqY < padding.top + chartHeight * 0.25;
      const eqLabelY = eqNearTop ? eqY + 20 : eqY - 10;
      offCtx.fillStyle = "rgba(15,23,42,0.85)";
      offCtx.beginPath();
      offCtx.roundRect(eqLabelX - eqPad, eqLabelY - eqLabelH, eqLabelW + eqPad * 2, eqLabelH + eqPad, 4);
      offCtx.fill();
      offCtx.fillStyle = "#f59e0b";
      offCtx.textAlign = "left";
      offCtx.fillText(eqLabel, eqLabelX, eqLabelY - 2);
    }

    // Arc mode: two observed points
    if (data.mode === "arc") {
      [[data.q1, data.p1], [data.q2, data.p2]].forEach(([q, p]) => {
        offCtx.beginPath();
        offCtx.arc(toX(q), toY(p), 5, 0, Math.PI * 2);
        offCtx.fillStyle = "#60a5fa";
        offCtx.fill();
      });
    }

    // Reference point for non-equation modes
    if (!hasEquation) {
      const refX = toX(refQ);
      const refY2 = toY(refP);
      offCtx.strokeStyle = "rgba(245,158,11,0.4)";
      offCtx.lineWidth = 1;
      offCtx.setLineDash([4, 4]);
      offCtx.beginPath();
      offCtx.moveTo(refX, padding.top + chartHeight);
      offCtx.lineTo(refX, refY2);
      offCtx.moveTo(padding.left, refY2);
      offCtx.lineTo(refX, refY2);
      offCtx.stroke();
      offCtx.setLineDash([]);
      offCtx.beginPath();
      offCtx.arc(refX, refY2, 7, 0, Math.PI * 2);
      offCtx.fillStyle = "#f59e0b";
      offCtx.fill();
      offCtx.strokeStyle = "#0f172a";
      offCtx.lineWidth = 2;
      offCtx.stroke();
      drawLabelWithBackground(offCtx, "ε = " + epsilon.toFixed(3), refX + 12, refY2 - 10,
        { color: clsColors[cls], font: window.CHART_FONTS.boldSm, align: "left" });
    }
  }

  drawStatic();

  // ── Interactive overlay ──
  function drawOverlay(hoverQ) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(offscreen, 0, 0, chart.width, chart.height);

    if (hoverQ === null || hoverQ < qMin || hoverQ > qMax) return;

    const hx = toX(hoverQ);

    // Crosshair
    ctx.strokeStyle = "rgba(148,163,184,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tooltipLines = [];

    // Demand hover
    if (demandSlope !== undefined) {
      const hP = (hoverQ - demandIntercept) / demandSlope;
      if (hP >= pMin && hP <= pMax) {
        const hEps = demandSlope * (hP / hoverQ);
        const hAbs = Math.abs(hEps);
        const hCls = classifyElasticity(hAbs);
        const hy = toY(hP);
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#f472b6";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        tooltipLines.push({ text: "Demand", color: "#f472b6", bold: true });
        tooltipLines.push({ text: "P = " + hP.toFixed(3), color: "#e2e8f0" });
        tooltipLines.push({ text: "Q = " + hoverQ.toFixed(3), color: "#e2e8f0" });
        tooltipLines.push({ text: "εd = " + hEps.toFixed(3), color: clsColors[hCls], bold: true });
        tooltipLines.push({ text: hCls === "elastic" ? "Elastic" : hCls === "inelastic" ? "Inelastic" : "Unit Elastic", color: clsColors[hCls] });
      }
    }

    // Supply hover
    if (supplySlope !== undefined) {
      const hP = (hoverQ - supplyIntercept) / supplySlope;
      if (hP >= pMin && hP <= pMax) {
        const hEps = supplySlope * (hP / hoverQ);
        const hAbs = Math.abs(hEps);
        const hCls = classifyElasticity(hAbs);
        const hy = toY(hP);
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#2dd4bf";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (tooltipLines.length > 0) tooltipLines.push({ text: "─────────", color: "#334155" });
        tooltipLines.push({ text: "Supply", color: "#2dd4bf", bold: true });
        tooltipLines.push({ text: "P = " + hP.toFixed(3), color: "#e2e8f0" });
        tooltipLines.push({ text: "Q = " + hoverQ.toFixed(3), color: "#e2e8f0" });
        tooltipLines.push({ text: "εs = " + hEps.toFixed(3), color: "#2dd4bf", bold: true });
        tooltipLines.push({ text: hCls === "elastic" ? "Elastic" : hCls === "inelastic" ? "Inelastic" : "Unit Elastic", color: clsColors[hCls] });
      }
    }

    if (tooltipLines.length === 0) return;

    // Tooltip box
    ctx.font = window.CHART_FONTS.md;
    const tooltipWidth = Math.max(...tooltipLines.map(l => ctx.measureText(l.text).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;
    let tx = hx + 15;
    let ty = padding.top + 10;
    if (tx + tooltipWidth > chart.width - padding.right) tx = hx - tooltipWidth - 15;
    if (ty + tooltipHeight > padding.top + chartHeight) ty = padding.top + chartHeight - tooltipHeight;

    const rad = 6;
    ctx.fillStyle = "rgba(15,23,42,0.95)";
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + rad, ty);
    ctx.lineTo(tx + tooltipWidth - rad, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + rad, rad);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - rad);
    ctx.arcTo(tx + tooltipWidth, ty + tooltipHeight, tx + tooltipWidth - rad, ty + tooltipHeight, rad);
    ctx.lineTo(tx + rad, ty + tooltipHeight);
    ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - rad, rad);
    ctx.lineTo(tx, ty + rad);
    ctx.arcTo(tx, ty, tx + rad, ty, rad);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    tooltipLines.forEach((line, i) => {
      ctx.fillStyle = line.color || "#e2e8f0";
      ctx.font = line.bold ? window.CHART_FONTS.boldMd : window.CHART_FONTS.md;
      ctx.fillText(line.text, tx + 12, ty + 18 + i * 20);
    });
  }

  drawOverlay(null);

  // Bind mouse events
  if (canvas._elasController) canvas._elasController.abort();
  canvas._elasController = new AbortController();
  const { signal } = canvas._elasController;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = chart.width / r.width;
    const hoverQ = fromX((e.clientX - r.left) * scaleX);
    if (hoverQ >= qMin && hoverQ <= qMax) {
      canvas.style.cursor = "crosshair";
      drawOverlay(hoverQ);
    } else {
      canvas.style.cursor = "default";
      drawOverlay(null);
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawOverlay(null);
  }, { signal });
}

// ===================================================================
// TAB 2 — CROSS-PRICE ELASTICITY
// ===================================================================

document
  .getElementById("cross-calculate")
  .addEventListener("click", handleCrossPriceCalculate);
bindFormEnter(() => handleCrossPriceCalculate(), "#cross-price-tab");

function handleCrossPriceCalculate() {
  const valid = validateInputs(
    [
      {
        id: "cross-pj1",
        label: "Price of Good j (Point 1)",
        required: true,
        min: 0.001,
      },
      {
        id: "cross-qi1",
        label: "Quantity of Good i (Point 1)",
        required: true,
        min: 0.001,
      },
      {
        id: "cross-pj2",
        label: "Price of Good j (Point 2)",
        required: true,
        min: 0.001,
      },
      {
        id: "cross-qi2",
        label: "Quantity of Good i (Point 2)",
        required: true,
        min: 0.001,
      },
    ],
    "#cross-price-tab",
  );
  if (!valid) return;

  const pj1 = safeParseFloat(document.getElementById("cross-pj1").value);
  const qi1 = safeParseFloat(document.getElementById("cross-qi1").value);
  const pj2 = safeParseFloat(document.getElementById("cross-pj2").value);
  const qi2 = safeParseFloat(document.getElementById("cross-qi2").value);
  const goodI =
    document.getElementById("cross-good-i").value.trim() || "Good i";
  const goodJ =
    document.getElementById("cross-good-j").value.trim() || "Good j";

  if (pj1 === pj2) {
    showFieldError("cross-pj2", "Price points must be different.");
    return;
  }

  const deltaQi = qi2 - qi1;
  const deltaPj = pj2 - pj1;
  const avgQi = (qi1 + qi2) / 2;
  const avgPj = (pj1 + pj2) / 2;
  const epsilon = deltaQi / avgQi / (deltaPj / avgPj);

  let classification, interpretation;
  if (epsilon > 0.05) {
    classification = "substitute";
    interpretation = `When ${goodJ} price rises, consumers buy more ${goodI} — they are substitutes.`;
  } else if (epsilon < -0.05) {
    classification = "complement";
    interpretation = `When ${goodJ} price rises, consumers buy less ${goodI} — they are complements.`;
  } else {
    classification = "independent";
    interpretation = `${goodI} and ${goodJ} appear to be independent goods.`;
  }

  lastCrossData = {
    pj1,
    qi1,
    pj2,
    qi2,
    avgQi,
    avgPj,
    deltaQi,
    deltaPj,
    epsilon,
    classification,
    goodI,
    goodJ,
  };

  document.getElementById("cross-value").textContent = epsilon.toFixed(4);
  const clsLabels = {
    substitute: "Substitutes",
    complement: "Complements",
    independent: "Independent",
  };
  document.getElementById("cross-badge").innerHTML =
    `<span class="ct-badge ${classification}">${clsLabels[classification]}</span>`;
  document.getElementById("cross-interpretation").textContent = interpretation;

  renderCrossPriceSteps(lastCrossData);

  document.getElementById("cross-results").classList.remove("hidden");
  document.getElementById("cross-steps-section").classList.remove("hidden");
  document.getElementById("cross-chart-section").classList.remove("hidden");

  requestAnimationFrame(() => drawCrossPriceChart(lastCrossData));
  document
    .getElementById("cross-results")
    .scrollIntoView({ behavior: "smooth" });
}

function renderCrossPriceSteps(data) {
  const {
    pj1,
    qi1,
    pj2,
    qi2,
    avgQi,
    avgPj,
    deltaQi,
    deltaPj,
    epsilon,
    classification,
    goodI,
    goodJ,
  } = data;
  const container = document.getElementById("cross-steps-content");

  function sec(title, ...items) {
    return `<div class="ct-step-section"><div class="ct-step-section-title">${title}</div>${items.join("")}</div>`;
  }
  function step(text, cls = "") {
    return `<div class="ct-step ${cls}">${text}</div>`;
  }

  const clsColor = {
    substitute: "positive",
    complement: "negative",
    independent: "highlight",
  };
  const clsLabel = {
    substitute: "Substitutes (ε > 0)",
    complement: "Complements (ε < 0)",
    independent: "Independent (ε ≈ 0)",
  };

  container.innerHTML = [
    sec(
      "Cross-Price Elasticity — Midpoint Formula",
      step(
        `ε(${goodI}, ${goodJ}) = (ΔQ${goodI} / Q̄${goodI}) ÷ (ΔP${goodJ} / P̄${goodJ})`,
      ),
      step(`ΔQ${goodI} = ${qi2} − ${qi1} = ${deltaQi.toFixed(4)}`),
      step(`ΔP${goodJ} = ${pj2} − ${pj1} = ${deltaPj.toFixed(4)}`),
      step(`Q̄${goodI} = (${qi1} + ${qi2}) / 2 = ${avgQi.toFixed(4)}`),
      step(`P̄${goodJ} = (${pj1} + ${pj2}) / 2 = ${avgPj.toFixed(4)}`),
      step(
        `ε = (${deltaQi.toFixed(4)} / ${avgQi.toFixed(4)}) ÷ (${deltaPj.toFixed(4)} / ${avgPj.toFixed(4)})`,
      ),
      step(`<strong>ε = ${epsilon.toFixed(4)}</strong>`, "result"),
    ),
    sec(
      "Classification",
      step(`ε = ${epsilon.toFixed(4)}`),
      step(
        `<strong>${clsLabel[classification]}</strong>`,
        clsColor[classification],
      ),
    ),
  ].join("");

  document
    .getElementById("cross-steps-toggle")
    .setAttribute("aria-expanded", "true");
  document.getElementById("cross-steps-body").classList.remove("hidden");
}

function drawCrossPriceChart(data) {
  const canvas = document.getElementById("cross-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawCrossPriceChart(data));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const { pj1, qi1, pj2, qi2, epsilon, classification, goodI, goodJ } = data;

  const pMin = Math.min(pj1, pj2) * 0.5;
  const pMax = Math.max(pj1, pj2) * 1.8;
  const slope = (qi2 - qi1) / (pj2 - pj1);
  const intercept = qi1 - slope * pj1;
  const qAtPMin = intercept + slope * pMin;
  const qAtPMax = intercept + slope * pMax;
  const qMin = Math.min(qAtPMin, qAtPMax, qi1, qi2) * 0.7;
  const qMax = Math.max(qAtPMin, qAtPMax, qi1, qi2) * 1.3;

  function toX(p) {
    return padding.left + ((p - pMin) / (pMax - pMin)) * chartWidth;
  }
  function toY(q) {
    return (
      padding.top + chartHeight - ((q - qMin) / (qMax - qMin)) * chartHeight
    );
  }

  chart.clear();

  for (let i = 0; i <= 5; i++) {
    const p = pMin + ((pMax - pMin) / 5) * i;
    const x = toX(p);
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "center";
    ctx.fillText(p.toFixed(2), x, chart.height - padding.bottom + 18);
  }
  for (let i = 0; i <= 5; i++) {
    const q = qMin + ((qMax - qMin) / 5) * i;
    const y = toY(q);
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(q.toFixed(1), padding.left - 8, y + 4);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = window.CHART_FONTS.md;
  ctx.textAlign = "center";
  ctx.fillText(`Price of ${goodJ}`, chart.width / 2, chart.height - 8);
  ctx.save();
  ctx.translate(14, chart.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`Quantity of ${goodI}`, 0, 0);
  ctx.restore();

  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  const lineColor =
    classification === "substitute"
      ? "#4ade80"
      : classification === "complement"
        ? "#f472b6"
        : "#94a3b8";
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(toX(pMin), toY(intercept + slope * pMin));
  ctx.lineTo(toX(pMax), toY(intercept + slope * pMax));
  ctx.stroke();

  [
    { p: pj1, q: qi1 },
    { p: pj2, q: qi2 },
  ].forEach(({ p, q }) => {
    ctx.beginPath();
    ctx.arc(toX(p), toY(q), 6, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  const clsLabels = {
    substitute: "Substitutes",
    complement: "Complements",
    independent: "Independent",
  };
  drawLabelWithBackground(
    ctx,
    `ε = ${epsilon.toFixed(3)} (${clsLabels[classification]})`,
    toX((pj1 + pj2) / 2),
    toY((qi1 + qi2) / 2) - 16,
    { color: lineColor, font: window.CHART_FONTS.boldSm, align: "center" },
  );
}

// ===================================================================
// TAB 3 — EXPECTED UTILITY
// ===================================================================

document
  .getElementById("eu-utility-selector")
  .addEventListener("click", (e) => {
    const btn = e.target.closest(".ct-utility-btn");
    if (!btn) return;
    document
      .getElementById("eu-utility-selector")
      .querySelectorAll(".ct-utility-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    euUtilityFn = btn.dataset.fn;
  });

document.getElementById("eu-add-option").addEventListener("click", () => {
  if (euOptionCount >= 3) return;
  addEUOption();
});

document
  .getElementById("eu-calculate")
  .addEventListener("click", handleEUCalculate);

function addEUOption(name = "") {
  euOptionCount++;
  const id = euOptionCount;
  const colors = ["var(--accent)", "#60a5fa", "#a855f7"];
  const color = colors[(id - 1) % 3];
  const defaultName = name || `Option ${id}`;

  const card = document.createElement("div");
  card.className = "ct-option-card";
  card.dataset.optionId = id;
  card.innerHTML = `
    <div class="ct-option-header">
      <span class="ct-option-title" style="color:${color};">${defaultName}</span>
      <button class="cost-remove eu-remove-option" aria-label="Remove option">✕ Remove</button>
    </div>
    <div class="ct-outcome-header">
      <span>Probability (0–1)</span>
      <span>Payoff ($K)</span>
      <span></span>
    </div>
    <div class="eu-outcomes-${id}"></div>
    <button class="btn-secondary eu-add-outcome" data-option="${id}" style="font-size:0.8rem; margin-top:0.5rem;">+ Add Outcome</button>
    <div class="eu-prob-status-${id}" style="margin-top:0.35rem;"></div>
  `;

  card.querySelector(".eu-remove-option").addEventListener("click", () => {
    card.remove();
    euOptionCount = Math.max(0, euOptionCount - 1);
  });

  card.querySelector(".eu-add-outcome").addEventListener("click", () => {
    addEUOutcomeRow(id);
  });

  document.getElementById("eu-options-list").appendChild(card);
  addEUOutcomeRow(id);
  addEUOutcomeRow(id);
}

function addEUOutcomeRow(optionId) {
  const container = document.querySelector(`.eu-outcomes-${optionId}`);
  if (!container) return;
  const row = document.createElement("div");
  row.className = "ct-outcome-row";
  row.innerHTML = `
    <input type="number" class="eu-prob" placeholder="e.g. 0.5" min="0" max="1" step="any" />
    <input type="number" class="eu-payoff" placeholder="e.g. 100" step="any" />
    <button class="ct-outcome-remove" aria-label="Remove outcome">✕</button>
  `;
  row.querySelector(".ct-outcome-remove").addEventListener("click", () => {
    row.remove();
    updateProbStatus(optionId);
  });
  row
    .querySelectorAll("input")
    .forEach((inp) =>
      inp.addEventListener("input", () => updateProbStatus(optionId)),
    );
  container.appendChild(row);
  updateProbStatus(optionId);
}

function updateProbStatus(optionId) {
  const container = document.querySelector(`.eu-outcomes-${optionId}`);
  const statusEl = document.querySelector(`.eu-prob-status-${optionId}`);
  if (!container || !statusEl) return;
  const probs = Array.from(container.querySelectorAll(".eu-prob")).map((i) =>
    safeParseFloat(i.value, 0),
  );
  const total = probs.reduce((s, p) => s + p, 0);
  if (Math.abs(total - 1) < 0.001) {
    statusEl.className = "ct-prob-ok";
    statusEl.textContent = "✅ Probabilities sum to 1.0";
  } else {
    statusEl.className = "ct-prob-warning";
    statusEl.textContent = `⚠️ Probabilities sum to ${total.toFixed(3)} — must equal 1.0`;
  }
}

function getEUOptionData(optionId) {
  const container = document.querySelector(`.eu-outcomes-${optionId}`);
  if (!container) return null;
  const rows = container.querySelectorAll(".ct-outcome-row");
  const outcomes = Array.from(rows)
    .map((row) => ({
      prob: safeParseFloat(row.querySelector(".eu-prob").value, 0),
      payoff: safeParseFloat(row.querySelector(".eu-payoff").value, 0),
    }))
    .filter((o) => o.prob > 0);
  if (outcomes.length === 0) return null;
  const totalProb = outcomes.reduce((s, o) => s + o.prob, 0);
  if (Math.abs(totalProb - 1) > 0.01) return null;
  return outcomes;
}

function handleEUCalculate() {
  const optionCards = document.querySelectorAll(
    "#eu-options-list.ct-option-card",
  );
  if (optionCards.length === 0) {
    return;
  }

  const results = [];
  let hasError = false;

  optionCards.forEach((card) => {
    const id = card.dataset.optionId;
    const outcomes = getEUOptionData(id);
    const title = card.querySelector(".ct-option-title").textContent;
    if (!outcomes) {
      hasError = true;
      return;
    }
    const expectedPayoff = outcomes.reduce((s, o) => s + o.prob * o.payoff, 0);
    const expectedUtility = outcomes.reduce((s, o) => {
      const u = applyUtility(o.payoff, euUtilityFn);
      return u !== null ? s + o.prob * u : s;
    }, 0);
    results.push({ id, title, outcomes, expectedPayoff, expectedUtility });
  });

  if (hasError || results.length === 0) {
    return;
  }

  const winner = results.reduce(
    (best, r) => (r.expectedUtility > best.expectedUtility ? r : best),
    results[0],
  );
  lastEUData = { results, winner, fn: euUtilityFn };

  const compEl = document.getElementById("eu-comparison");
  compEl.innerHTML = results
    .map(
      (r) => `
    <div class="ct-eu-col ${r.id === winner.id ? "winner" : ""}">
      <h3>${r.title}${r.id === winner.id ? " 🏆" : ""}</h3>
      <div class="result-item" style="margin-bottom:0.5rem;">
        <span class="result-label">Expected Payoff</span>
        <span class="result-value" style="font-size:1.1rem;">${r.expectedPayoff.toFixed(2)}</span>
      </div>
      <div class="result-item">
        <span class="result-label">Expected Utility</span>
        <span class="result-value accent" style="font-size:1.1rem;">${r.expectedUtility.toFixed(4)}</span>
      </div>
    </div>
  `,
    )
    .join("");

  document.getElementById("eu-winner").textContent = winner.title;
  document.getElementById("eu-fn-display").textContent =
    utilityFnLabel(euUtilityFn);

  renderEUSteps(lastEUData);

  document.getElementById("eu-results").classList.remove("hidden");
  document.getElementById("eu-steps-section").classList.remove("hidden");
  document.getElementById("eu-chart-section").classList.remove("hidden");

  requestAnimationFrame(() => drawUtilityCurveEU(lastEUData));
  document.getElementById("eu-results").scrollIntoView({ behavior: "smooth" });
}

function renderEUSteps(data) {
  const { results, winner, fn } = data;
  const container = document.getElementById("eu-steps-content");

  function sec(title, ...items) {
    return `<div class="ct-step-section"><div class="ct-step-section-title">${title}</div>${items.join("")}</div>`;
  }
  function step(text, cls = "") {
    return `<div class="ct-step ${cls}">${text}</div>`;
  }

  const sections = [];

  sections.push(
    sec(
      "Utility Function",
      step(`Selected: <strong>${utilityFnLabel(fn)}</strong>`, "highlight"),
      step(
        fn === "sqrt" || fn === "log"
          ? "Concave function → Risk-averse agent (diminishing marginal utility)"
          : fn === "linear"
            ? "Linear function → Risk-neutral agent"
            : "Convex function → Risk-seeking agent (increasing marginal utility)",
      ),
    ),
  );

  results.forEach((r, idx) => {
    const outcomeLines = r.outcomes.map((o) => {
      const u = applyUtility(o.payoff, fn);
      return step(
        `p=${o.prob} × u(${o.payoff}) = ${o.prob} × ${u !== null ? u.toFixed(4) : "N/A"} = ${u !== null ? (o.prob * u).toFixed(4) : "N/A"}`,
      );
    });
    sections.push(
      sec(
        `${r.title} — Expected Utility`,
        step(
          `E[Payoff] = ${r.outcomes.map((o) => `${o.prob}×${o.payoff}`).join(" + ")} = ${r.expectedPayoff.toFixed(4)}`,
        ),
        step(`E[U] = Σ p × u(payoff):`),
        ...outcomeLines,
        step(
          `<strong>E[U(${r.title})] = ${r.expectedUtility.toFixed(4)}</strong>`,
          "result",
        ),
      ),
    );
  });

  sections.push(
    sec(
      "Decision",
      step(`Compare expected utilities:`),
      ...results.map((r) =>
        step(
          `${r.title}: E[U] = ${r.expectedUtility.toFixed(4)}${r.id === winner.id ? " ← HIGHEST" : ""}`,
          r.id === winner.id ? "positive" : "",
        ),
      ),
      step(
        `<strong>Choose ${winner.title}</strong> — it maximizes expected utility.`,
        "result",
      ),
    ),
  );

  container.innerHTML = sections.join("");
  document
    .getElementById("eu-steps-toggle")
    .setAttribute("aria-expanded", "true");
  document.getElementById("eu-steps-body").classList.remove("hidden");
}

function drawUtilityCurveEU(data) {
  const canvas = document.getElementById("eu-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawUtilityCurveEU(data));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const { results, fn } = data;
  const allPayoffs = results.flatMap((r) => r.outcomes.map((o) => o.payoff));
  const xMin = 0;
  const xMax = Math.max(...allPayoffs) * 1.3;
  const allU = allPayoffs
    .map((x) => applyUtility(x, fn))
    .filter((u) => u !== null);
  const yMin = 0;
  const yMax = Math.max(...allU) * 1.3;

  function toX(x) {
    return padding.left + (x / xMax) * chartWidth;
  }
  function toY(u) {
    return padding.top + chartHeight - (u / yMax) * chartHeight;
  }

  chart.clear();

  for (let i = 0; i <= 5; i++) {
    const x = (xMax / 5) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toX(x), padding.top);
    ctx.lineTo(toX(x), padding.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "center";
    ctx.fillText(x.toFixed(0), toX(x), chart.height - padding.bottom + 18);
  }
  for (let i = 0; i <= 5; i++) {
    const u = (yMax / 5) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(u));
    ctx.lineTo(padding.left + chartWidth, toY(u));
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(u.toFixed(2), padding.left - 8, toY(u) + 4);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = window.CHART_FONTS.md;
  ctx.textAlign = "center";
  ctx.fillText("Payoff ($K)", chart.width / 2, chart.height - 8);
  ctx.save();
  ctx.translate(14, chart.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Utility u(x)", 0, 0);
  ctx.restore();

  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  ctx.strokeStyle = "#a855f7";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let started = false;
  for (let x = xMin; x <= xMax; x += xMax / 300) {
    const u = applyUtility(x, fn);
    if (u === null || u > yMax * 1.05) continue;
    if (!started) {
      ctx.moveTo(toX(x), toY(u));
      started = true;
    } else ctx.lineTo(toX(x), toY(u));
  }
  ctx.stroke();

  drawLabelWithBackground(
    ctx,
    utilityFnLabel(fn),
    padding.left + chartWidth - 5,
    padding.top + 20,
    { color: "#a855f7", font: window.CHART_FONTS.boldSm, align: "right" },
  );

  const optColors = ["#2dd4bf", "#60a5fa", "#f59e0b"];
  results.forEach((r, idx) => {
    const color = optColors[idx % optColors.length];
    r.outcomes.forEach((o) => {
      const u = applyUtility(o.payoff, fn);
      if (u === null) return;
      ctx.beginPath();
      ctx.arc(toX(o.payoff), toY(u), 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    const epX = toX(r.expectedPayoff);
    const epU = applyUtility(r.expectedPayoff, fn);
    const euY = toY(r.expectedUtility);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(epX, padding.top + chartHeight);
    ctx.lineTo(epX, epU !== null ? toY(epU) : padding.top);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(padding.left, euY);
    ctx.lineTo(epX, euY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(epX, euY, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawLabelWithBackground(
      ctx,
      `${r.title}: E[U]=${r.expectedUtility.toFixed(2)}`,
      epX + 8,
      euY - 8,
      { color, font: window.CHART_FONTS.boldSm, align: "left" },
    );
  });
}

// ===================================================================
// TAB 4 — RISK PREMIUM
// ===================================================================

document
  .getElementById("rp-utility-selector")
  .addEventListener("click", (e) => {
    const btn = e.target.closest(".ct-utility-btn");
    if (!btn) return;
    document
      .getElementById("rp-utility-selector")
      .querySelectorAll(".ct-utility-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    rpUtilityFn = btn.dataset.fn;
  });

document
  .getElementById("rp-add-outcome")
  .addEventListener("click", addRPOutcomeRow);
document
  .getElementById("rp-calculate")
  .addEventListener("click", handleRPCalculate);

function addRPOutcomeRow() {
  rpOutcomeCount++;
  const container = document.getElementById("rp-outcomes-list");
  const row = document.createElement("div");
  row.className = "ct-outcome-row";
  row.innerHTML = `
    <input type="number" class="rp-prob" placeholder="e.g. 0.5" min="0" max="1" step="any" />
    <input type="number" class="rp-payoff" placeholder="e.g. 100" step="any" />
    <button class="ct-outcome-remove" aria-label="Remove outcome">✕</button>
  `;
  row.querySelector(".ct-outcome-remove").addEventListener("click", () => {
    row.remove();
    updateRPProbStatus();
  });
  row
    .querySelectorAll("input")
    .forEach((inp) => inp.addEventListener("input", updateRPProbStatus));
  container.appendChild(row);
  updateRPProbStatus();
}

function updateRPProbStatus() {
  const probs = Array.from(document.querySelectorAll(".rp-prob")).map((i) =>
    safeParseFloat(i.value, 0),
  );
  const total = probs.reduce((s, p) => s + p, 0);
  let statusEl = document.getElementById("rp-prob-status");
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = "rp-prob-status";
    document.getElementById("rp-outcomes-list").after(statusEl);
  }
  if (Math.abs(total - 1) < 0.001) {
    statusEl.className = "ct-prob-ok";
    statusEl.textContent = "✅ Probabilities sum to 1.0";
  } else {
    statusEl.className = "ct-prob-warning";
    statusEl.textContent = `⚠️ Probabilities sum to ${total.toFixed(3)} — must equal 1.0`;
  }
}

function solveForCertaintyEquivalent(expectedUtility, fn) {
  return inverseUtility(expectedUtility, fn);
}

function handleRPCalculate() {
  const rows = document.querySelectorAll("#rp-outcomes-list.ct-outcome-row");
  if (rows.length === 0) return;

  const outcomes = Array.from(rows)
    .map((row) => ({
      prob: safeParseFloat(row.querySelector(".rp-prob").value, 0),
      payoff: safeParseFloat(row.querySelector(".rp-payoff").value, 0),
    }))
    .filter((o) => o.prob > 0);

  if (outcomes.length === 0) return;

  const totalProb = outcomes.reduce((s, o) => s + o.prob, 0);
  if (Math.abs(totalProb - 1) > 0.01) return;

  const expectedPayoff = outcomes.reduce((s, o) => s + o.prob * o.payoff, 0);
  const expectedUtility = outcomes.reduce((s, o) => {
    const u = applyUtility(o.payoff, rpUtilityFn);
    return u !== null ? s + o.prob * u : s;
  }, 0);

  const ce = solveForCertaintyEquivalent(expectedUtility, rpUtilityFn);
  const riskPremium = expectedPayoff - ce;
  const wtp = ce;

  let attitude;
  if (riskPremium > 0.001) attitude = "Risk-Averse";
  else if (riskPremium < -0.001) attitude = "Risk-Seeking";
  else attitude = "Risk-Neutral";

  lastRPData = {
    outcomes,
    expectedPayoff,
    expectedUtility,
    ce,
    riskPremium,
    wtp,
    fn: rpUtilityFn,
    attitude,
  };

  document.getElementById("rp-expected-payoff").textContent =
    expectedPayoff.toFixed(4);
  document.getElementById("rp-expected-utility").textContent =
    expectedUtility.toFixed(4);
  document.getElementById("rp-ce").textContent = ce.toFixed(4);
  document.getElementById("rp-premium").textContent = riskPremium.toFixed(4);
  document.getElementById("rp-wtp").textContent = wtp.toFixed(4);
  document.getElementById("rp-attitude").textContent = attitude;

  renderRPSteps(lastRPData);

  document.getElementById("rp-results").classList.remove("hidden");
  document.getElementById("rp-steps-section").classList.remove("hidden");
  document.getElementById("rp-chart-section").classList.remove("hidden");

  requestAnimationFrame(() => drawRiskPremiumChart(lastRPData));
  document.getElementById("rp-results").scrollIntoView({ behavior: "smooth" });
}

function renderRPSteps(data) {
  const {
    outcomes,
    expectedPayoff,
    expectedUtility,
    ce,
    riskPremium,
    fn,
    attitude,
  } = data;
  const container = document.getElementById("rp-steps-content");

  function sec(title, ...items) {
    return `<div class="ct-step-section"><div class="ct-step-section-title">${title}</div>${items.join("")}</div>`;
  }
  function step(text, cls = "") {
    return `<div class="ct-step ${cls}">${text}</div>`;
  }

  container.innerHTML = [
    sec(
      "Step 1 — Expected Payoff",
      step(
        `E[X] = ${outcomes.map((o) => `${o.prob} × ${o.payoff}`).join(" + ")}`,
      ),
      step(`<strong>E[X] = ${expectedPayoff.toFixed(4)}</strong>`, "result"),
    ),
    sec(
      "Step 2 — Expected Utility",
      step(`E[U] = Σ p × ${utilityFnLabel(fn)}`),
      ...outcomes.map((o) => {
        const u = applyUtility(o.payoff, fn);
        return step(
          `p=${o.prob} × u(${o.payoff}) = ${o.prob} × ${u !== null ? u.toFixed(4) : "N/A"} = ${u !== null ? (o.prob * u).toFixed(4) : "N/A"}`,
        );
      }),
      step(`<strong>E[U] = ${expectedUtility.toFixed(4)}</strong>`, "result"),
    ),
    sec(
      "Step 3 — Certainty Equivalent",
      step(`Solve: u(CE) = E[U]`),
      step(`${utilityFnLabel(fn)} = ${expectedUtility.toFixed(4)}`),
      step(
        `CE = ${fn === "sqrt" ? `(${expectedUtility.toFixed(4)})²` : fn === "log" ? `e^${expectedUtility.toFixed(4)}` : fn === "linear" ? `${expectedUtility.toFixed(4)}` : `√${expectedUtility.toFixed(4)}`}`,
      ),
      step(`<strong>CE = ${ce.toFixed(4)}</strong>`, "highlight"),
    ),
    sec(
      "Step 4 — Risk Premium",
      step(`Risk Premium = E[X] − CE`),
      step(`= ${expectedPayoff.toFixed(4)} − ${ce.toFixed(4)}`),
      step(
        `<strong>Risk Premium = ${riskPremium.toFixed(4)}</strong>`,
        riskPremium > 0
          ? "negative"
          : riskPremium < 0
            ? "positive"
            : "highlight",
      ),
      step(
        riskPremium > 0
          ? `The agent is ${attitude} — they would give up ${riskPremium.toFixed(4)} in expected value to eliminate risk.`
          : riskPremium < 0
            ? `The agent is ${attitude} — they require a premium to accept a certain payoff over the gamble.`
            : `The agent is ${attitude} — risk has no cost.`,
      ),
    ),
  ].join("");

  document
    .getElementById("rp-steps-toggle")
    .setAttribute("aria-expanded", "true");
  document.getElementById("rp-steps-body").classList.remove("hidden");
}

function drawRiskPremiumChart(data) {
  const canvas = document.getElementById("rp-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawRiskPremiumChart(data));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 40, right: 60, bottom: 60, left: 80 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;

  const { outcomes, expectedPayoff, expectedUtility, ce, riskPremium, fn } =
    data;
  const allPayoffs = outcomes.map((o) => o.payoff);
  const xMax = Math.max(...allPayoffs, expectedPayoff, ce) * 1.3;
  const xMin = 0;
  const allU = allPayoffs
    .map((x) => applyUtility(x, fn))
    .filter((u) => u !== null);
  const yMax = Math.max(...allU, expectedUtility) * 1.3;
  const yMin = 0;

  function toX(x) {
    return padding.left + ((x - xMin) / (xMax - xMin)) * chartWidth;
  }
  function toY(u) {
    return (
      padding.top + chartHeight - ((u - yMin) / (yMax - yMin)) * chartHeight
    );
  }

  chart.clear();

  for (let i = 0; i <= 5; i++) {
    const x = (xMax / 5) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toX(x), padding.top);
    ctx.lineTo(toX(x), padding.top + chartHeight);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "center";
    ctx.fillText(x.toFixed(0), toX(x), chart.height - padding.bottom + 18);
  }
  for (let i = 0; i <= 5; i++) {
    const u = (yMax / 5) * i;
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(u));
    ctx.lineTo(padding.left + chartWidth, toY(u));
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = window.CHART_FONTS.sm;
    ctx.textAlign = "right";
    ctx.fillText(u.toFixed(2), padding.left - 8, toY(u) + 4);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = window.CHART_FONTS.md;
  ctx.textAlign = "center";
  ctx.fillText("Wealth / Payoff ($K)", chart.width / 2, chart.height - 8);
  ctx.save();
  ctx.translate(14, chart.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Utility u(x)", 0, 0);
  ctx.restore();

  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  ctx.strokeStyle = "#a855f7";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let started = false;
  for (let x = xMin; x <= xMax; x += xMax / 300) {
    const u = applyUtility(x, fn);
    if (u === null || u > yMax * 1.05) continue;
    if (!started) {
      ctx.moveTo(toX(x), toY(u));
      started = true;
    } else ctx.lineTo(toX(x), toY(u));
  }
  ctx.stroke();

  drawLabelWithBackground(
    ctx,
    utilityFnLabel(fn),
    padding.left + chartWidth - 5,
    padding.top + 20,
    { color: "#a855f7", font: window.CHART_FONTS.boldSm, align: "right" },
  );

  outcomes.forEach((o) => {
    const u = applyUtility(o.payoff, fn);
    if (u === null) return;
    ctx.beginPath();
    ctx.arc(toX(o.payoff), toY(u), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#60a5fa";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawLabelWithBackground(ctx, `x=${o.payoff}`, toX(o.payoff), toY(u) - 12, {
      color: "#60a5fa",
      font: window.CHART_FONTS.xs,
      align: "center",
    });
  });

  const euY = toY(expectedUtility);
  const epX = toX(expectedPayoff);
  const ceX = toX(ce);
  const ceU = applyUtility(ce, fn);
  const ceY = ceU !== null ? toY(ceU) : euY;

  ctx.strokeStyle = "rgba(148,163,184,0.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, euY);
  ctx.lineTo(epX, euY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(epX, euY, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#f59e0b";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawLabelWithBackground(
    ctx,
    `E[X]=${expectedPayoff.toFixed(2)}`,
    epX,
    padding.top + chartHeight + 32,
    { color: "#f59e0b", font: window.CHART_FONTS.boldSm, align: "center" },
  );

  ctx.beginPath();
  ctx.arc(ceX, ceY, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#a855f7";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawLabelWithBackground(
    ctx,
    `CE=${ce.toFixed(2)}`,
    ceX,
    padding.top + chartHeight + 32,
    { color: "#a855f7", font: window.CHART_FONTS.boldSm, align: "center" },
  );

  if (Math.abs(riskPremium) > 0.001 && ceX !== epX) {
    const midX = (ceX + epX) / 2;
    const arrowY = padding.top + chartHeight + 44;
    ctx.strokeStyle = "#f472b6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ceX, arrowY);
    ctx.lineTo(epX, arrowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(epX, arrowY - 4);
    ctx.lineTo(epX + 6, arrowY);
    ctx.lineTo(epX, arrowY + 4);
    ctx.fillStyle = "#f472b6";
    ctx.fill();
    drawLabelWithBackground(
      ctx,
      `Risk Premium = ${riskPremium.toFixed(2)}`,
      midX,
      arrowY - 6,
      { color: "#f472b6", font: window.CHART_FONTS.boldSm, align: "center" },
    );
  }
}

// ===================================================================
// RESIZE HANDLER
// ===================================================================

let ctResizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(ctResizeTimeout);
  ctResizeTimeout = setTimeout(() => {
    if (lastElasData) drawElasticityChart(lastElasData);
    if (lastCrossData) drawCrossPriceChart(lastCrossData);
    if (lastEUData) drawUtilityCurveEU(lastEUData);
    if (lastRPData) drawRiskPremiumChart(lastRPData);
  }, 250);
});

// ===================================================================
// INITIALIZE DEFAULT STATE
// ===================================================================

addEUOption("Option A");
addEUOption("Option B");
addRPOutcomeRow();
addRPOutcomeRow();
