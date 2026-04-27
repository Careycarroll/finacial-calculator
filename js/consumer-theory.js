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
// EQUATION PARSER — From Equation mode
// ===================================================================

// Module-level parsed state for demand and supply
let demandParsed = null;
let supplyParsed = null;

/**
 * parseEquation(str)
 *
 * Parses a linear equation string into structured terms.
 *
 * Handles:
 *   - Leading scalar:  20*(750 - 2*p + p_hotel + 450*e)
 *                      20(750 - 2*p)   [implicit multiply]
 *   - No scalar:       750 - 2*p + p_hotel   [scalar defaults to 1]
 *   - Bare number:     16 - 2*p
 *   - Named variables: any [a-zA-Z][a-zA-Z0-9_]* token
 *   - Own-price:       exact match on "p" or "P" (case-insensitive)
 *   - Implicit coef:   p_hotel  →  1·p_hotel
 *   - Negative terms:  -2*p, -(2*p)
 *
 * Returns:
 *   {
 *     scalar: number,          // leading multiplier (1 if absent)
 *     terms: [                 // flat list after scalar is factored in
 *       { coef: number, variable: string|null }
 *       // variable === null  →  constant term
 *       // variable === "p"   →  own-price term
 *       // otherwise          →  shift variable
 *     ],
 *     ownPriceVar: string|null,  // name of the own-price variable detected
 *     variables: string[],       // all unique variable names found
 *     error: string|null         // human-readable parse error, or null
 *   }
 */
function parseEquation(str) {
  const raw = str.trim();
  if (!raw)
    return {
      scalar: 1,
      terms: [],
      ownPriceVar: null,
      variables: [],
      error: "Equation is empty.",
    };

  let scalar = 1;
  let inner = raw;

  // ── Detect leading scalar: number followed by * or ( ──
  // Matches: 20*(  |  20(  |  -20*(  |  -20(
  const scalarMatch = raw.match(
    /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\*?\s*\(/,
  );
  if (scalarMatch) {
    scalar = parseFloat(scalarMatch[1]);
    // Find the matching closing paren for the opening paren after the scalar
    const openIdx = raw.indexOf("(", scalarMatch[0].length - 1);
    const closeIdx = findMatchingParen(raw, openIdx);
    if (closeIdx === -1) {
      return {
        scalar,
        terms: [],
        ownPriceVar: null,
        variables: [],
        error: "Mismatched parentheses.",
      };
    }
    inner = raw.slice(openIdx + 1, closeIdx).trim();
  } else {
    // No leading scalar — strip outer parens if the whole expression is wrapped
    const outerMatch = raw.match(/^\((.+)\)$/);
    if (outerMatch) inner = outerMatch[1].trim();
  }

  // ── Tokenize inner expression into signed terms ──
  // Split on + or - that are not inside parens and not part of scientific notation
  const termStrings = splitTerms(inner);
  if (termStrings === null) {
    return {
      scalar,
      terms: [],
      ownPriceVar: null,
      variables: [],
      error: "Could not parse expression — check parentheses.",
    };
  }

  const terms = [];
  for (const ts of termStrings) {
    const term = parseTerm(ts.trim());
    if (term === null) {
      return {
        scalar,
        terms: [],
        ownPriceVar: null,
        variables: [],
        error:
          'Unrecognised term: "' +
          ts.trim() +
          '". Expected a number, a variable, or coef*variable.',
      };
    }
    // Store unscaled coefficients — scalar applied in collapseToLinear
    terms.push({ coef: term.coef, variable: term.variable });
  }

  // ── Identify own-price variable ──
  const allVars = [
    ...new Set(terms.filter((t) => t.variable !== null).map((t) => t.variable)),
  ];
  let ownPriceVar = null;

  // Exact case-insensitive match on "p"
  ownPriceVar = allVars.find((v) => v.toLowerCase() === "p") || null;

  // If no "p" found and exactly one variable exists, treat it as own-price
  if (!ownPriceVar && allVars.length === 1) {
    ownPriceVar = allVars[0];
  }
  // If no "p" and multiple variables → ownPriceVar stays null → dropdown shown

  return { scalar, terms, ownPriceVar, variables: allVars, error: null };
}

/**
 * findMatchingParen(str, openIdx)
 * Returns the index of the closing paren matching the open paren at openIdx.
 * Returns -1 if not found.
 */
function findMatchingParen(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * splitTerms(expr)
 * Splits a linear expression string on top-level + and - operators.
 * Returns array of signed term strings, or null on paren mismatch.
 *
 * e.g. "750 - 2*p + p_hotel + 450*e"
 *   → ["750", "-2*p", "p_hotel", "450*e"]
 */
function splitTerms(expr) {
  const terms = [];
  let depth = 0;
  let current = "";
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (ch === "(") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) return null; // mismatched
      depth--;
      current += ch;
      i++;
      continue;
    }
    if (depth === 0 && (ch === "+" || ch === "-")) {
      // Check it's not scientific notation: digit e +/- digit
      const prev = current.trimEnd();
      const isScientific = /[eE]$/.test(prev);
      if (!isScientific) {
        if (current.trim()) terms.push(current.trim());
        current = ch; // carry sign into next term
        i++;
        continue;
      }
    }
    current += ch;
    i++;
  }
  if (current.trim()) terms.push(current.trim());
  return terms.length > 0 ? terms : null;
}

/**
 * parseTerm(str)
 * Parses a single signed term string into { coef, variable }.
 * variable === null means constant term.
 * Returns null if the term cannot be parsed.
 *
 * Handles:
 *   "750"          → { coef: 750,  variable: null }
 *   "-2*p"         → { coef: -2,   variable: "p" }
 *   "+p_hotel"     → { coef: 1,    variable: "p_hotel" }
 *   "-p_hotel"     → { coef: -1,   variable: "p_hotel" }
 *   "450*e"        → { coef: 450,  variable: "e" }
 *   "e"            → { coef: 1,    variable: "e" }
 *   "-e"           → { coef: -1,   variable: "e" }
 *   "2p"           → { coef: 2,    variable: "p" }  [implicit multiply]
 */
function parseTerm(str) {
  // Strip leading +
  let s = str.replace(/^\+/, "").trim();

  // Pure number (constant term)
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    return { coef: parseFloat(s), variable: null };
  }

  // coef * variable  or  coef*variable
  const mulMatch = s.match(
    /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\*\s*([a-zA-Z][a-zA-Z0-9_]*)$/,
  );
  if (mulMatch) {
    return { coef: parseFloat(mulMatch[1]), variable: mulMatch[2] };
  }

  // implicit multiply: 2p or 2p_hotel (number immediately followed by identifier)
  const implicitMatch = s.match(
    /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([a-zA-Z][a-zA-Z0-9_]*)$/,
  );
  if (implicitMatch) {
    return { coef: parseFloat(implicitMatch[1]), variable: implicitMatch[2] };
  }

  // bare variable (coef = 1): p_hotel, e, p
  const bareMatch = s.match(/^([a-zA-Z][a-zA-Z0-9_]*)$/);
  if (bareMatch) {
    return { coef: 1, variable: bareMatch[1] };
  }

  // negated variable: -p_hotel, -e
  const negBareMatch = s.match(/^-([a-zA-Z][a-zA-Z0-9_]*)$/);
  if (negBareMatch) {
    return { coef: -1, variable: negBareMatch[1] };
  }

  return null; // unrecognised
}

/**
 * collapseToLinear(parsed, shiftValues)
 *
 * Given a parsed equation and a map of shift variable values,
 * returns { A, B } where the equation is Q = A + B*p.
 *
 * shiftValues: { variableName: number,... }
 *
 * Returns null if own-price term is missing (B = 0 is valid for supply/demand
 * only if the curve is horizontal, but we flag it as an error).
 */
function collapseToLinear(parsed, shiftValues) {
  let A = 0;
  let B = 0;
  const ownVar = parsed.ownPriceVar;
  const scalar = parsed.scalar !== undefined ? parsed.scalar : 1;

  for (const term of parsed.terms) {
    if (term.variable === null) {
      // constant term — scaled
      A += scalar * term.coef;
    } else if (term.variable === ownVar) {
      // own-price coefficient — scaled
      B += scalar * term.coef;
    } else {
      // shift variable — substitute known value, then scale
      const val = shiftValues[term.variable];
      if (val === undefined || isNaN(val)) return null;
      A += scalar * term.coef * val;
    }
  }
  return { A, B };
}

// ===================================================================
// EQUATION UI — Parse confirmation + shift fields
// ===================================================================

/**
 * renderParseConfirmation(side, parsed)
 *
 * Renders the read-only term breakdown and (if needed) the own-price
 * override dropdown into the confirmation container for the given side.
 *
 * side: "d" (demand) or "s" (supply)
 */
function renderParseConfirmation(side, parsed) {
  const confirmEl = document.getElementById(
    "elas-eq-" + side + "-confirmation",
  );
  if (!confirmEl) return;

  if (parsed.error || parsed.terms.length === 0) {
    confirmEl.classList.remove("visible");
    confirmEl.innerHTML = "";
    return;
  }

  const ownVar = parsed.ownPriceVar;
  const scalarStr = parsed.scalar !== 1 ? parsed.scalar : "";

  // Build term chips HTML
  let chipsHtml = "";
  parsed.terms.forEach((term, i) => {
    const isOwn = term.variable !== null && term.variable === ownVar;
    const isConst = term.variable === null;
    const chipClass = isOwn ? "own-price" : isConst ? "constant" : "shift";

    // Sign operator between terms
    if (i > 0) {
      const sign = term.coef >= 0 ? "+" : "−";
      const absCoef = Math.abs(term.coef);
      chipsHtml += '<span class="ct-eq-op">' + sign + "</span>";
      const label =
        term.variable !== null
          ? absCoef === 1
            ? term.variable
            : absCoef + "·" + term.variable
          : String(absCoef);
      chipsHtml +=
        '<span class="ct-eq-term-chip ' + chipClass + '">' + label + "</span>";
    } else {
      // First term — include sign only if negative
      const absCoef = Math.abs(term.coef);
      const prefix = term.coef < 0 ? "−" : "";
      const label =
        term.variable !== null
          ? absCoef === 1
            ? term.variable
            : absCoef + "·" + term.variable
          : String(absCoef);
      chipsHtml +=
        '<span class="ct-eq-term-chip ' +
        chipClass +
        '">' +
        prefix +
        label +
        "</span>";
    }
  });

  // Own-price dropdown — shown only when parser could not auto-detect
  let dropdownHtml = "";
  if (!ownVar && parsed.variables.length > 1) {
    const options = parsed.variables
      .map((v) => '<option value="' + v + '">' + v + "</option>")
      .join("");
    dropdownHtml =
      '<div class="ct-eq-own-price-row">' +
      "<span>Which variable is own-price (P)?</span>" +
      '<select id="elas-eq-' +
      side +
      '-own-price-select">' +
      options +
      "</select>" +
      "</div>";
  }

  confirmEl.innerHTML =
    '<div class="ct-eq-confirmation-label">Parsed as</div>' +
    '<div class="ct-eq-terms">' +
    (scalarStr
      ? '<span class="ct-eq-scalar">' +
        scalarStr +
        '</span><span class="ct-eq-paren"> × (</span>'
      : "") +
    chipsHtml +
    (scalarStr ? '<span class="ct-eq-paren">)</span>' : "") +
    "</div>" +
    dropdownHtml;

  confirmEl.classList.add("visible");

  // Wire own-price dropdown change → re-render shift fields
  if (!ownVar && parsed.variables.length > 1) {
    const sel = document.getElementById(
      "elas-eq-" + side + "-own-price-select",
    );
    if (sel) {
      sel.addEventListener("change", () => {
        const chosen = sel.value;
        // Mutate parsed state so collapseToLinear uses the user's choice
        if (side === "d") {
          demandParsed = Object.assign({}, demandParsed, {
            ownPriceVar: chosen,
          });
          renderShiftFields("d", demandParsed);
          updateCollapsedPreview("d", demandParsed);
        } else {
          supplyParsed = Object.assign({}, supplyParsed, {
            ownPriceVar: chosen,
          });
          renderShiftFields("s", supplyParsed);
          updateCollapsedPreview("s", supplyParsed);
        }
      });
    }
  }
}

/**
 * renderShiftFields(side, parsed)
 *
 * Renders labeled number inputs for each shift variable (non-own-price)
 * into the shift fields container for the given side.
 */
function renderShiftFields(side, parsed) {
  const container = document.getElementById(
    "elas-eq-" + side + "-shift-fields",
  );
  if (!container) return;

  const shiftVars = parsed.variables.filter((v) => v !== parsed.ownPriceVar);

  if (shiftVars.length === 0) {
    container.classList.remove("visible");
    container.innerHTML = "";
    return;
  }

  // Preserve any existing values before re-rendering
  const existing = {};
  container.querySelectorAll(".ct-eq-shift-input").forEach((inp) => {
    existing[inp.dataset.variable] = inp.value;
  });

  let html =
    '<div class="ct-eq-shift-label">Known Values (shift variables)</div>';
  shiftVars.forEach((v) => {
    const preserved = existing[v] || "";
    html +=
      '<div class="ct-eq-shift-row">' +
      '<label for="elas-eq-' +
      side +
      "-shift-" +
      v +
      '">' +
      v +
      " =</label>" +
      '<input type="number" step="any"' +
      ' id="elas-eq-' +
      side +
      "-shift-" +
      v +
      '"' +
      ' class="ct-eq-shift-input"' +
      ' data-variable="' +
      v +
      '"' +
      ' placeholder="enter value"' +
      ' value="' +
      preserved +
      '"' +
      ' aria-label="Value for shift variable ' +
      v +
      '" />' +
      "</div>";
  });

  container.innerHTML = html;
  container.classList.add("visible");
}

/**
 * updateCollapsedPreview(side, parsed)
 *
 * Reads current shift field values and renders the collapsed Q = A + B·p
 * preview if all shift values are filled. Clears it otherwise.
 */
function updateCollapsedPreview(side, parsed) {
  const previewEl = document.getElementById("elas-eq-" + side + "-collapsed");
  if (!previewEl) return;

  if (!parsed || parsed.error || !parsed.ownPriceVar) {
    previewEl.classList.remove("visible");
    previewEl.textContent = "";
    return;
  }

  const shiftValues = collectShiftValues(side, parsed);
  if (shiftValues === null) {
    previewEl.classList.remove("visible");
    previewEl.textContent = "";
    return;
  }

  const collapsed = collapseToLinear(parsed, shiftValues);
  if (!collapsed) {
    previewEl.classList.remove("visible");
    return;
  }

  const label = side === "d" ? "Q_d" : "Q_s";
  const Bstr =
    collapsed.B >= 0
      ? "+ " + fmtN(collapsed.B) + "·p"
      : "− " + fmtN(Math.abs(collapsed.B)) + "·p";
  previewEl.textContent = label + " = " + fmtN(collapsed.A) + " " + Bstr;
  previewEl.classList.add("visible");
}

/**
 * collectShiftValues(side, parsed)
 *
 * Reads all shift field inputs for the given side.
 * Returns { varName: number,... } or null if any required field is empty/NaN.
 */
function collectShiftValues(side, parsed) {
  const container = document.getElementById(
    "elas-eq-" + side + "-shift-fields",
  );
  if (!container) return {};

  const shiftVars = parsed.variables.filter((v) => v !== parsed.ownPriceVar);
  if (shiftVars.length === 0) return {};

  const values = {};
  for (const v of shiftVars) {
    const inp = document.getElementById("elas-eq-" + side + "-shift-" + v);
    if (!inp || inp.value.trim() === "") return null;
    const val = safeParseFloat(inp.value);
    if (isNaN(val)) return null;
    values[v] = val;
  }
  return values;
}

/**
 * buildEquationPanel(side, accentColor)
 *
 * Wires blur event on the equation textarea for the given side.
 * On blur: parse → update module state → render confirmation + shift fields + collapsed preview.
 * Also wires input on shift fields → update collapsed preview live.
 */
function buildEquationPanel(side, accentColor) {
  const textarea = document.getElementById("elas-eq-" + side + "-raw");
  const errorEl = document.getElementById("elas-eq-" + side + "-parse-error");
  if (!textarea || !errorEl) return;

  function runParse() {
    const raw = textarea.value.trim();
    errorEl.classList.remove("visible");
    errorEl.textContent = "";
    textarea.classList.remove("parse-error", "parse-ok");

    if (!raw) {
      if (side === "d") demandParsed = null;
      else supplyParsed = null;
      const confirmEl = document.getElementById(
        "elas-eq-" + side + "-confirmation",
      );
      const shiftEl = document.getElementById(
        "elas-eq-" + side + "-shift-fields",
      );
      const collapsedEl = document.getElementById(
        "elas-eq-" + side + "-collapsed",
      );
      if (confirmEl) {
        confirmEl.classList.remove("visible");
        confirmEl.innerHTML = "";
      }
      if (shiftEl) {
        shiftEl.classList.remove("visible");
        shiftEl.innerHTML = "";
      }
      if (collapsedEl) {
        collapsedEl.classList.remove("visible");
        collapsedEl.textContent = "";
      }
      return;
    }

    const parsed = parseEquation(raw);

    if (parsed.error) {
      textarea.classList.add("parse-error");
      errorEl.textContent = "⚠ " + parsed.error;
      errorEl.classList.add("visible");
      if (side === "d") demandParsed = null;
      else supplyParsed = null;
      const confirmEl = document.getElementById(
        "elas-eq-" + side + "-confirmation",
      );
      const shiftEl = document.getElementById(
        "elas-eq-" + side + "-shift-fields",
      );
      const collapsedEl = document.getElementById(
        "elas-eq-" + side + "-collapsed",
      );
      if (confirmEl) {
        confirmEl.classList.remove("visible");
        confirmEl.innerHTML = "";
      }
      if (shiftEl) {
        shiftEl.classList.remove("visible");
        shiftEl.innerHTML = "";
      }
      if (collapsedEl) {
        collapsedEl.classList.remove("visible");
        collapsedEl.textContent = "";
      }
      return;
    }

    textarea.classList.add("parse-ok");
    if (side === "d") demandParsed = parsed;
    else supplyParsed = parsed;

    renderParseConfirmation(side, parsed);
    renderShiftFields(side, parsed);
    updateCollapsedPreview(side, parsed);

    // Wire shift field inputs → live collapsed preview update
    const shiftContainer = document.getElementById(
      "elas-eq-" + side + "-shift-fields",
    );
    if (shiftContainer) {
      shiftContainer.querySelectorAll(".ct-eq-shift-input").forEach((inp) => {
        inp.addEventListener("input", () => {
          const current = side === "d" ? demandParsed : supplyParsed;
          if (current) updateCollapsedPreview(side, current);
        });
      });
    }
  }

  textarea.addEventListener("blur", runParse);
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

  // old equation preview listeners removed — handled by buildEquationPanel

  // Wire equation parser panels
  buildEquationPanel("d", "#f472b6");
  buildEquationPanel("s", "#2dd4bf");
});

// updateElasEquationPreviews removed — replaced by parseEquation + buildEquationPanel

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
    // ── Validate parsed state exists ──
    if (!demandParsed || demandParsed.error) {
      const dTextarea = document.getElementById("elas-eq-d-raw");
      if (dTextarea) dTextarea.classList.add("parse-error");
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent = "⚠ Enter and complete a valid demand equation.";
        dErr.classList.add("visible");
      }
      return;
    }
    if (!supplyParsed || supplyParsed.error) {
      const sTextarea = document.getElementById("elas-eq-s-raw");
      if (sTextarea) sTextarea.classList.add("parse-error");
      const sErr = document.getElementById("elas-eq-s-parse-error");
      if (sErr) {
        sErr.textContent = "⚠ Enter and complete a valid supply equation.";
        sErr.classList.add("visible");
      }
      return;
    }
    if (!demandParsed.ownPriceVar) {
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent =
          "⚠ Could not identify own-price variable — select it from the dropdown.";
        dErr.classList.add("visible");
      }
      return;
    }
    if (!supplyParsed.ownPriceVar) {
      const sErr = document.getElementById("elas-eq-s-parse-error");
      if (sErr) {
        sErr.textContent =
          "⚠ Could not identify own-price variable — select it from the dropdown.";
        sErr.classList.add("visible");
      }
      return;
    }

    // ── Collect shift variable values ──
    const dShiftValues = collectShiftValues("d", demandParsed);
    if (dShiftValues === null) {
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent = "⚠ Fill in all shift variable values for demand.";
        dErr.classList.add("visible");
      }
      return;
    }
    const sShiftValues = collectShiftValues("s", supplyParsed);
    if (sShiftValues === null) {
      const sErr = document.getElementById("elas-eq-s-parse-error");
      if (sErr) {
        sErr.textContent = "⚠ Fill in all shift variable values for supply.";
        sErr.classList.add("visible");
      }
      return;
    }

    // ── Collapse to Q = A + B*p ──
    const dCollapsed = collapseToLinear(demandParsed, dShiftValues);
    const sCollapsed = collapseToLinear(supplyParsed, sShiftValues);
    if (!dCollapsed) {
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent =
          "⚠ Could not collapse demand equation — check shift variable values.";
        dErr.classList.add("visible");
      }
      return;
    }
    if (!sCollapsed) {
      const sErr = document.getElementById("elas-eq-s-parse-error");
      if (sErr) {
        sErr.textContent =
          "⚠ Could not collapse supply equation — check shift variable values.";
        sErr.classList.add("visible");
      }
      return;
    }

    const dA = dCollapsed.A;
    const dB = dCollapsed.B;
    const sC = sCollapsed.A;
    const sD = sCollapsed.B;

    const denom = dB - sD;
    if (Math.abs(denom) < 1e-10) {
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent = "⚠ Curves are parallel — no equilibrium exists.";
        dErr.classList.add("visible");
      }
      return;
    }

    const pStar = (sC - dA) / denom;
    const qStar = dA + dB * pStar;

    if (pStar <= 0 || qStar <= 0) {
      const dErr = document.getElementById("elas-eq-d-parse-error");
      if (dErr) {
        dErr.textContent =
          "⚠ Equilibrium has non-positive P* or Q* — check your equations.";
        dErr.classList.add("visible");
      }
      return;
    }

    const epsilonD = dB * (pStar / qStar);
    const epsilonS = sD * (pStar / qStar);

    // ── Capture raw strings for step renderer ──
    const dRawStr = document.getElementById("elas-eq-d-raw").value.trim();
    const sRawStr = document.getElementById("elas-eq-s-raw").value.trim();

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
      // parser context for step renderer
      demandRaw: dRawStr,
      supplyRaw: sRawStr,
      demandParsed: demandParsed,
      supplyParsed: supplyParsed,
      dShiftValues,
      sShiftValues,
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

    // Demand card
    document.getElementById("elas-value").textContent =
      "εd = " + epsilonD.toFixed(4);
    document.getElementById("elas-abs").textContent =
      "|εd| = " + absD.toFixed(4);
    document.getElementById("elas-badge").innerHTML =
      '<span class="ct-badge ' + clsD + '">' + labels[clsD] + "</span>";

    // Supply card
    document.getElementById("elas-supply-value").textContent =
      "εs = " + epsilonS.toFixed(4);
    document.getElementById("elas-supply-abs").textContent =
      "|εs| = " + absS.toFixed(4);
    document.getElementById("elas-supply-badge").innerHTML =
      '<span class="ct-badge ' + clsS + '">' + labels[clsS] + "</span>";
    document.getElementById("elas-supply-card").style.display = "";

    applyRevenueImpact(
      document.getElementById("elas-revenue-impact"),
      clsD,
      "demand",
      absD,
    );
    renderElasticitySteps(lastElasData);
    renderElasticityReference(absD);
    document.getElementById("elas-results").classList.remove("hidden");
    document.getElementById("elas-steps-section").classList.remove("hidden");
    document.getElementById("elas-chart-section").classList.remove("hidden");
    lastElasData2 = null;
    requestAnimationFrame(() => drawElasticityChart(lastElasData, null));
    buildShiftAnalysisPanel();
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

  // Single curve — show only demand card, hide supply card
  document.getElementById("elas-value").textContent =
    "ε = " + epsilon.toFixed(4);
  document.getElementById("elas-abs").textContent =
    "|ε| = " + absEps.toFixed(4);
  document.getElementById("elas-badge").innerHTML =
    '<span class="ct-badge ' +
    classification +
    '">' +
    labels[classification] +
    "</span>";
  document.getElementById("elas-supply-card").style.display = "none";

  applyRevenueImpact(
    document.getElementById("elas-revenue-impact"),
    classification,
    curveType,
    absEps,
  );

  renderElasticitySteps(lastElasData);
  renderElasticityReference(absEps);
  document.getElementById("elas-results").classList.remove("hidden");
  document.getElementById("elas-steps-section").classList.remove("hidden");
  document.getElementById("elas-chart-section").classList.remove("hidden");
  requestAnimationFrame(() => drawElasticityChart(lastElasData, null));
  document
    .getElementById("elas-results")
    .scrollIntoView({ behavior: "smooth" });
}

/**
 * fmtN(n)
 * Formats a number for step-by-step display.
 * Shows up to 2 decimal places, strips trailing zeros.
 * e.g. 24200.0000 → "24200", 0.05333 → "0.05", -40.0 → "-40"
 */
function fmtN(n) {
  if (!isFinite(n)) return String(n);
  const s = parseFloat(n.toFixed(2));
  return String(s);
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
    const {
      dA,
      dB,
      sC,
      sD,
      pStar,
      qStar,
      epsilonD,
      epsilonS,
      demandRaw,
      supplyRaw,
      demandParsed: dp,
      supplyParsed: sp,
      dShiftValues,
      sShiftValues,
    } = data;
    const absD = Math.abs(epsilonD);
    const absS = Math.abs(epsilonS);
    const clsD = classifyElasticity(absD);
    const clsS = classifyElasticity(absS);
    const hasShifts =
      dp &&
      (Object.keys(dShiftValues || {}).length > 0 ||
        Object.keys(sShiftValues || {}).length > 0);

    // ── Step 1 — Original Equations ──
    sections.push(
      sec(
        "Step 1 — Original Equations",
        step(
          `<span style="color:#f472b6;">Demand: Q_d = ${demandRaw || dA + " + (" + dB + ")·P"}</span>`,
        ),
        step(
          `<span style="color:#2dd4bf;">Supply: Q_s = ${supplyRaw || sC + " + (" + sD + ")·P"}</span>`,
        ),
      ),
    );

    // ── Step 2 — Substitute Known Values (only if shift vars present) ──
    if (hasShifts) {
      const dSubSteps = [];
      const sSubSteps = [];

      // Demand substitution
      if (dp && Object.keys(dShiftValues || {}).length > 0) {
        const subList = Object.entries(dShiftValues)
          .map(([k, v]) => k + " = " + v)
          .join(",  ");
        dSubSteps.push(step("Known: " + subList, "highlight"));

        // Show each shift term being substituted
        let runningConst = 0;
        let ownCoef = 0;
        const ownVar = dp.ownPriceVar;
        dp.terms.forEach((term) => {
          if (term.variable === null) {
            runningConst += term.coef;
            dSubSteps.push(step("constant term: " + term.coef));
          } else if (term.variable === ownVar) {
            ownCoef += term.coef;
          } else {
            const val = dShiftValues[term.variable];
            const contrib = term.coef * val;
            runningConst += contrib;
            dSubSteps.push(
              step(
                "(" +
                  term.coef +
                  ") × " +
                  term.variable +
                  " = (" +
                  term.coef +
                  ") × " +
                  val +
                  " = " +
                  fmtN(contrib),
              ),
            );
          }
        });
        if (dp.scalar !== 1) {
          dSubSteps.push(
            step(
              "Apply scalar " +
                dp.scalar +
                ": A = " +
                dp.scalar +
                " × " +
                fmtN(runningConst) +
                " = " +
                fmtN(dA),
            ),
          );
          dSubSteps.push(
            step(
              "Apply scalar " +
                dp.scalar +
                ": B = " +
                dp.scalar +
                " × " +
                fmtN(ownCoef) +
                " = " +
                fmtN(dB),
            ),
          );
        }
        dSubSteps.push(
          step(
            "<strong>Demand collapsed: Q_d = " +
              fmtN(dA) +
              " + (" +
              fmtN(dB) +
              ")·P</strong>",
            "result",
          ),
        );
      }

      // Supply substitution
      if (sp && Object.keys(sShiftValues || {}).length > 0) {
        const subList = Object.entries(sShiftValues)
          .map(([k, v]) => k + " = " + v)
          .join(",  ");
        sSubSteps.push(step("Known: " + subList, "highlight"));

        let runningConst = 0;
        let ownCoef = 0;
        const ownVar = sp.ownPriceVar;
        sp.terms.forEach((term) => {
          if (term.variable === null) {
            runningConst += term.coef;
            sSubSteps.push(step("constant term: " + term.coef));
          } else if (term.variable === ownVar) {
            ownCoef += term.coef;
          } else {
            const val = sShiftValues[term.variable];
            const contrib = term.coef * val;
            runningConst += contrib;
            sSubSteps.push(
              step(
                "(" +
                  term.coef +
                  ") × " +
                  term.variable +
                  " = (" +
                  term.coef +
                  ") × " +
                  val +
                  " = " +
                  fmtN(contrib),
              ),
            );
          }
        });
        if (sp.scalar !== 1) {
          sSubSteps.push(
            step(
              "Apply scalar " +
                sp.scalar +
                ": A = " +
                sp.scalar +
                " × " +
                fmtN(runningConst) +
                " = " +
                fmtN(sC),
            ),
          );
          sSubSteps.push(
            step(
              "Apply scalar " +
                sp.scalar +
                ": B = " +
                sp.scalar +
                " × " +
                fmtN(ownCoef) +
                " = " +
                fmtN(sD),
            ),
          );
        }
        sSubSteps.push(
          step(
            "<strong>Supply collapsed: Q_s = " +
              fmtN(sC) +
              " + (" +
              fmtN(sD) +
              ")·P</strong>",
            "result",
          ),
        );
      }

      if (dSubSteps.length > 0 || sSubSteps.length > 0) {
        sections.push(
          sec("Step 2 — Substitute Known Values", ...dSubSteps, ...sSubSteps),
        );
      }
    }

    // ── Step 3 — Collapsed Form ──
    sections.push(
      sec(
        hasShifts ? "Step 3 — Collapsed Linear Form" : "Step 2 — Linear Form",
        step(
          `<span style="color:#f472b6;">Q_d = ${fmtN(dA)} + (${fmtN(dB)})·P</span>`,
        ),
        step(
          `<span style="color:#2dd4bf;">Q_s = ${fmtN(sC)} + (${fmtN(sD)})·P</span>`,
        ),
      ),
    );

    // ── Step 4 — Solve for Equilibrium ──
    const stepOffset = hasShifts ? 4 : 3;
    sections.push(
      sec(
        "Step " + stepOffset + " — Solve for Equilibrium (Set Q_d = Q_s)",
        step(`${fmtN(dA)} + (${fmtN(dB)})·P = ${fmtN(sC)} + (${fmtN(sD)})·P`),
        step(`${fmtN(dA)} − ${fmtN(sC)} = (${fmtN(sD)})·P − (${fmtN(dB)})·P`),
        step(`${fmtN(dA - sC)} = (${fmtN(sD - dB)})·P`),
        step(`P* = ${fmtN(dA - sC)} ÷ ${fmtN(sD - dB)}`),
        step(`<strong>P* = ${fmtN(pStar)}</strong>`, "result"),
      ),
    );

    // ── Step 5 — Solve for Q* ──
    sections.push(
      sec(
        "Step " + (stepOffset + 1) + " — Solve for Q*",
        step(`Q* = ${fmtN(dA)} + (${fmtN(dB)}) × ${fmtN(pStar)}`),
        step(`<strong>Q* = ${fmtN(qStar)}</strong>`, "result"),
      ),
    );

    // ── Step 6 — Demand Elasticity ──
    sections.push(
      sec(
        "Step " + (stepOffset + 2) + " — Demand Elasticity at Equilibrium",
        step("ε_d = (∂Q_d/∂P) × (P*/Q*)"),
        step(`= ${fmtN(dB)} × (${fmtN(pStar)} / ${fmtN(qStar)})`),
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

    // ── Step 7 — Supply Elasticity ──
    sections.push(
      sec(
        "Step " + (stepOffset + 3) + " — Supply Elasticity at Equilibrium",
        step("ε_s = (∂Q_s/∂P) × (P*/Q*)"),
        step(`= ${fmtN(sD)} × (${fmtN(pStar)} / ${fmtN(qStar)})`),
        step(`<strong>ε_s = ${epsilonS.toFixed(4)}</strong>`, "result"),
        step(
          `<strong>${clsLabels[clsS]}</strong>`,
          clsS === "elastic" ? "positive" : "highlight",
        ),
      ),
    );

    // ── Step 8 — Revenue Impact ──
    sections.push(
      sec(
        "Step " + (stepOffset + 4) + " — Revenue Impact (Demand)",
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

function drawElasticityChart(data, data2 = null, targetCanvas = null) {
  const canvas = targetCanvas || document.getElementById("elas-chart-canvas");
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawElasticityChart(data, data2, targetCanvas));
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
    const s =
      curveType === "demand"
        ? -Math.abs(epsilon) * (refQ / refP)
        : Math.abs(epsilon) * (refQ / refP);
    const ic = refQ - s * refP;
    if (curveType === "demand") {
      demandSlope = s;
      demandIntercept = ic;
    } else {
      supplySlope = s;
      supplyIntercept = ic;
    }
  }

  // ── Axis bounds — same logic as micro-econ getChartBounds ──
  const pMin = 0;
  const qMin = 0;
  let qMax, pMax;

  if (hasEquation) {
    // Use intercepts and equilibrium to set natural bounds
    const dIntAbs = Math.abs(demandIntercept);
    const pZeroDemand =
      demandSlope !== 0 ? Math.abs(-demandIntercept / demandSlope) : 0;
    qMax = Math.max(dIntAbs, Math.abs(refQ) * 1.6, 1);
    pMax = Math.max(pZeroDemand, Math.abs(refP) * 1.8, 1);
  } else {
    // Single curve — use ref point to set bounds
    const slope = demandSlope !== undefined ? demandSlope : supplySlope;
    const intercept =
      demandSlope !== undefined ? demandIntercept : supplyIntercept;
    const pZero = slope !== 0 ? Math.abs(-intercept / slope) : refP * 2;
    qMax = Math.max(Math.abs(intercept), Math.abs(refQ) * 1.6, 1);
    pMax = Math.max(pZero, Math.abs(refP) * 1.8, 1);
  }

  // Compute clean tick step without expanding axis bounds
  function niceStep(rawMax, steps) {
    const rawStep = rawMax / steps;
    if (rawStep <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const nice = [1, 2, 2.5, 5, 10].find((f) => f * mag >= rawStep) || 10;
    return nice * mag;
  }
  const qTickStep = niceStep(qMax, 6);
  const pTickStep = niceStep(pMax, 6);

  function toX(q) {
    return padding.left + (q / qMax) * chartWidth;
  }
  function toY(p) {
    return padding.top + chartHeight - (p / pMax) * chartHeight;
  }
  function fromX(x) {
    return ((x - padding.left) / chartWidth) * qMax;
  }

  const absEps = Math.abs(epsilon);
  const cls = classifyElasticity(absEps);
  const clsColors = {
    elastic: "#f472b6",
    inelastic: "#2dd4bf",
    "unit-elastic": "#f59e0b",
  };

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

    // Grid — clean tick steps
    for (let p = 0; p <= pMax * 1.001; p += pTickStep) {
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
      offCtx.fillText(fmtN(p), padding.left - 8, y + 4);
    }
    for (let q = 0; q <= qMax * 1.001; q += qTickStep) {
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
      offCtx.fillText(fmtN(q), x, offscreen.height - padding.bottom + 18);
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
        if (!started) {
          offCtx.moveTo(toX(q), toY(p));
          started = true;
        } else offCtx.lineTo(toX(q), toY(p));
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
        if (!started) {
          offCtx.moveTo(toX(q), toY(p));
          started = true;
        } else offCtx.lineTo(toX(q), toY(p));
      }
      offCtx.stroke();
      // Label — find a visible point in the upper-left region of the supply curve
      // Try several candidate Q positions and use the first one that fits in bounds
      const sCandidates = [qMax * 0.55, qMax * 0.45, qMax * 0.35, qMax * 0.65];
      for (const sLabelQ of sCandidates) {
        if (Math.abs(supplySlope) < 1e-10) break;
        const sLabelP = (sLabelQ - supplyIntercept) / supplySlope;
        if (
          sLabelP > pMax * 0.1 &&
          sLabelP <= pMax * 0.85 &&
          sLabelQ >= 0 &&
          sLabelQ <= qMax
        ) {
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
      // P*/Q* axis labels — suppressed when data2 present (P1*/Q1* drawn in data2 block)
      if (!data2) {
        offCtx.fillStyle = "#f59e0b";
        offCtx.font = window.CHART_FONTS.boldSm;
        offCtx.textAlign = "right";
        offCtx.fillText("P*=" + fmtN(refP), padding.left - 4, eqY + 4);
        offCtx.textAlign = "center";
        offCtx.fillText(
          "Q*=" + fmtN(refQ),
          eqX,
          padding.top + chartHeight + 32,
        );
      }
      // E label with smart positioning — hidden when data2 present (E1/E2 drawn in data2 block)
      if (!data2) {
        offCtx.font = window.CHART_FONTS.boldSm;
        const eqLabel = "E(" + fmtN(refQ) + ", " + fmtN(refP) + ")";
        const eqLabelW = offCtx.measureText(eqLabel).width;
        const eqLabelH = 14;
        const eqPad = 4;
        const eqInRight = eqX > padding.left + chartWidth * 0.6;
        const eqLabelX = eqInRight ? eqX - eqLabelW - 14 : eqX + 12;
        const eqNearTop = eqY < padding.top + chartHeight * 0.25;
        const eqLabelY = eqNearTop ? eqY + 20 : eqY - 10;
        offCtx.fillStyle = "rgba(15,23,42,0.85)";
        offCtx.beginPath();
        offCtx.roundRect(
          eqLabelX - eqPad,
          eqLabelY - eqLabelH,
          eqLabelW + eqPad * 2,
          eqLabelH + eqPad,
          4,
        );
        offCtx.fill();
        offCtx.fillStyle = "#f59e0b";
        offCtx.textAlign = "left";
        offCtx.fillText(eqLabel, eqLabelX, eqLabelY - 2);
      }
    }

    // Arc mode: two observed points
    if (data.mode === "arc") {
      [
        [data.q1, data.p1],
        [data.q2, data.p2],
      ].forEach(([q, p]) => {
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
      drawLabelWithBackground(
        offCtx,
        "ε = " + epsilon.toFixed(3),
        refX + 12,
        refY2 - 10,
        {
          color: clsColors[cls],
          font: window.CHART_FONTS.boldSm,
          align: "left",
        },
      );
    }
  }

  drawStatic();

  // ── Scenario 2 overlay (dashed curves + E2) ──
  if (data2) {
    const dA2 = data2.dA,
      dB2 = data2.dB;
    const sC2 = data2.sC,
      sD2 = data2.sD;
    const pStar2 = data2.pStar,
      qStar2 = data2.qStar;
    const epsilonD2 = data2.epsilonD;

    // D2 dashed curve — only draw if demand actually changed
    const demandChanged = dA2 !== demandIntercept || dB2 !== demandSlope;
    const supplyChanged = sC2 !== supplyIntercept || sD2 !== supplySlope;

    if (demandChanged) {
      offCtx.strokeStyle = "#f472b6";
      offCtx.globalAlpha = 0.55;
      offCtx.lineWidth = 2;
      offCtx.setLineDash([7, 5]);
      offCtx.beginPath();
      let started = false;
      for (let p = pMin; p <= pMax; p += pMax / 300) {
        const q = dA2 + dB2 * p;
        if (q < 0 || q > qMax * 1.02) continue;
        if (!started) {
          offCtx.moveTo(toX(q), toY(p));
          started = true;
        } else offCtx.lineTo(toX(q), toY(p));
      }
      offCtx.stroke();
      offCtx.setLineDash([]);
      offCtx.globalAlpha = 1;
      // D2 label
      const d2LabelQ = qMax * 0.05;
      const d2LabelP = dB2 !== 0 ? (d2LabelQ - dA2) / dB2 : null;
      if (d2LabelP !== null && d2LabelP > 0 && d2LabelP <= pMax) {
        offCtx.globalAlpha = 0.85;
        offCtx.font = window.CHART_FONTS.boldSm;
        const d2LW = offCtx.measureText("D₂").width + 12;
        offCtx.fillStyle = "rgba(15,23,42,0.92)";
        offCtx.beginPath();
        offCtx.roundRect(toX(d2LabelQ) + 1, toY(d2LabelP) - 18, d2LW, 18, 3);
        offCtx.fill();
        offCtx.fillStyle = "#f472b6";
        offCtx.textAlign = "left";
        offCtx.fillText("D₂", toX(d2LabelQ) + 5, toY(d2LabelP) - 4);
        offCtx.globalAlpha = 1;
      }
    }

    // S2 dashed curve — only draw if supply actually changed
    if (supplyChanged) {
      offCtx.strokeStyle = "#2dd4bf";
      offCtx.globalAlpha = 0.55;
      offCtx.lineWidth = 2;
      offCtx.setLineDash([7, 5]);
      offCtx.beginPath();
      let started = false;
      for (let p = pMin; p <= pMax; p += pMax / 300) {
        const q = sC2 + sD2 * p;
        if (q < 0 || q > qMax * 1.02) continue;
        if (!started) {
          offCtx.moveTo(toX(q), toY(p));
          started = true;
        } else offCtx.lineTo(toX(q), toY(p));
      }
      offCtx.stroke();
      offCtx.setLineDash([]);
      offCtx.globalAlpha = 1;
      // S2 label — find visible point
      const s2Candidates = [qMax * 0.55, qMax * 0.45, qMax * 0.35, qMax * 0.65];
      for (const sLQ of s2Candidates) {
        if (Math.abs(sD2) < 1e-10) break;
        const sLP = (sLQ - sC2) / sD2;
        if (sLP > pMax * 0.1 && sLP <= pMax * 0.85 && sLQ >= 0 && sLQ <= qMax) {
          offCtx.globalAlpha = 0.85;
          offCtx.font = window.CHART_FONTS.boldSm;
          const s2LW = offCtx.measureText("S₂").width + 12;
          offCtx.fillStyle = "rgba(15,23,42,0.92)";
          offCtx.beginPath();
          offCtx.roundRect(toX(sLQ) + 5, toY(sLP) - 18, s2LW, 18, 3);
          offCtx.fill();
          offCtx.fillStyle = "#2dd4bf";
          offCtx.textAlign = "left";
          offCtx.fillText("S₂", toX(sLQ) + 9, toY(sLP) - 4);
          offCtx.globalAlpha = 1;
          break;
        }
      }
    }

    // E2 equilibrium point
    const eqX2 = toX(qStar2);
    const eqY2 = toY(pStar2);
    offCtx.strokeStyle = "rgba(251,146,60,0.5)";
    offCtx.lineWidth = 1;
    offCtx.setLineDash([4, 4]);
    offCtx.beginPath();
    offCtx.moveTo(eqX2, padding.top + chartHeight);
    offCtx.lineTo(eqX2, eqY2);
    offCtx.moveTo(padding.left, eqY2);
    offCtx.lineTo(eqX2, eqY2);
    offCtx.stroke();
    offCtx.setLineDash([]);
    offCtx.beginPath();
    offCtx.arc(eqX2, eqY2, 7, 0, Math.PI * 2);
    offCtx.fillStyle = "#fb923c";
    offCtx.fill();
    offCtx.strokeStyle = "#0f172a";
    offCtx.lineWidth = 2;
    offCtx.stroke();

    // E2 label
    offCtx.font = window.CHART_FONTS.boldSm;
    const e2Label = "E₂(" + fmtN(qStar2) + ", " + fmtN(pStar2) + ")";
    const e2LW = offCtx.measureText(e2Label).width;
    const e2LH = 14;
    const e2Pad = 4;
    const e2InRight = eqX2 > padding.left + chartWidth * 0.6;
    const e2LX = e2InRight ? eqX2 - e2LW - 14 : eqX2 + 12;
    const e2NearTop = eqY2 < padding.top + chartHeight * 0.25;
    const e2LY = e2NearTop ? eqY2 + 20 : eqY2 - 10;
    offCtx.fillStyle = "rgba(15,23,42,0.85)";
    offCtx.beginPath();
    offCtx.roundRect(
      e2LX - e2Pad,
      e2LY - e2LH,
      e2LW + e2Pad * 2,
      e2LH + e2Pad,
      4,
    );
    offCtx.fill();
    offCtx.fillStyle = "#fb923c";
    offCtx.textAlign = "left";
    offCtx.fillText(e2Label, e2LX, e2LY - 2);

    // ── Relabel E1 dot (already drawn by drawStatic) ──
    // Draw E1 label explicitly so it reads "E1" not just "E"
    const eqX1 = toX(refQ);
    const eqY1 = toY(refP);
    offCtx.font = window.CHART_FONTS.boldSm;
    const e1Label = "E₁(" + fmtN(refQ) + ", " + fmtN(refP) + ")";
    const e1LW = offCtx.measureText(e1Label).width;
    const e1LH = 14;
    const e1Pad = 4;
    const e1InRight = eqX1 > padding.left + chartWidth * 0.6;
    const e1LX = e1InRight ? eqX1 - e1LW - 14 : eqX1 + 12;
    const e1NearTop = eqY1 < padding.top + chartHeight * 0.25;
    const e1LY = e1NearTop ? eqY1 + 36 : eqY1 + 16;
    offCtx.fillStyle = "rgba(15,23,42,0.85)";
    offCtx.beginPath();
    offCtx.roundRect(
      e1LX - e1Pad,
      e1LY - e1LH,
      e1LW + e1Pad * 2,
      e1LH + e1Pad,
      4,
    );
    offCtx.fill();
    offCtx.fillStyle = "#f59e0b";
    offCtx.textAlign = "left";
    offCtx.fillText(e1Label, e1LX, e1LY - 2);

    // ── Axis annotations: P1*/P2* on Y axis, Q1*/Q2* on X axis ──
    const p1 = refP,
      p2 = pStar2;
    const q1 = refQ,
      q2 = qStar2;
    const pUp = p2 > p1;
    const qUp = q2 > q1;

    // ── Axis annotations ──
    const py1 = toY(p1),
      py2 = toY(p2);
    const qx1 = toX(q1),
      qx2 = toX(q2);

    // Helper: draw label with dark background box
    function axisLabel(text, x, y, color, align) {
      offCtx.font = window.CHART_FONTS.boldSm;
      offCtx.textAlign = align || "left";
      const w = offCtx.measureText(text).width;
      const pad = 3;
      const bx =
        align === "right"
          ? x - w - pad
          : align === "center"
            ? x - w / 2 - pad
            : x - pad;
      offCtx.fillStyle = "rgba(15,23,42,0.88)";
      offCtx.beginPath();
      offCtx.roundRect(bx, y - 11, w + pad * 2, 14, 3);
      offCtx.fill();
      offCtx.fillStyle = color;
      offCtx.fillText(text, x, y);
    }

    // P1* — outside Y axis, right-aligned to axis left edge
    axisLabel("P₁*=" + fmtN(p1), padding.left - 4, py1 + 4, "#f59e0b", "right");

    // P2* — inside chart, offset right to clear Y axis arrow
    axisLabel("P₂*=" + fmtN(p2), padding.left + 16, py2 + 4, "#fb923c", "left");

    // ── Directional arrows drawn ON the axis lines ──
    // Y axis spine: pink segment from py1 to py2 with arrowhead at py2
    // X axis baseline: pink segment from qx1 to qx2 with arrowhead at qx2

    // Q1* — below X axis baseline
    axisLabel(
      "Q₁*=" + fmtN(q1),
      qx1,
      padding.top + chartHeight + 34,
      "#f59e0b",
      "center",
    );

    // Q2* — above X axis baseline
    axisLabel(
      "Q₂*=" + fmtN(q2),
      qx2,
      padding.top + chartHeight - 18,
      "#fb923c",
      "center",
    );

    // Y axis arrow — draw ON the Y axis spine between py1 and py2
    const pyGap = Math.abs(py2 - py1);
    if (pyGap > 16) {
      const pyTail = py1;
      const pyTip = py2;
      const headDir = py2 > py1 ? 1 : -1; // +1 = pointing down (P fell), -1 = pointing up (P rose)
      offCtx.strokeStyle = "#f472b6";
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      offCtx.moveTo(padding.left, pyTail);
      offCtx.lineTo(padding.left, pyTip);
      offCtx.stroke();
      // Arrowhead at pyTip
      offCtx.beginPath();
      offCtx.moveTo(padding.left - 5, pyTip - headDir * 8);
      offCtx.lineTo(padding.left, pyTip);
      offCtx.lineTo(padding.left + 5, pyTip - headDir * 8);
      offCtx.stroke();
    }

    // X axis arrow — draw ON the X axis baseline between qx1 and qx2
    const qxGap = Math.abs(qx2 - qx1);
    if (qxGap > 16) {
      const qxTail = qx1;
      const qxTip = qx2;
      const headDirX = qx2 > qx1 ? 1 : -1;
      const qAxisY = padding.top + chartHeight;
      offCtx.strokeStyle = "#f472b6";
      offCtx.lineWidth = 2.5;
      offCtx.beginPath();
      offCtx.moveTo(qxTail, qAxisY);
      offCtx.lineTo(qxTip, qAxisY);
      offCtx.stroke();
      // Arrowhead at qxTip
      offCtx.beginPath();
      offCtx.moveTo(qxTip - headDirX * 8, qAxisY - 5);
      offCtx.lineTo(qxTip, qAxisY);
      offCtx.lineTo(qxTip - headDirX * 8, qAxisY + 5);
      offCtx.stroke();
    }
  }

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
        tooltipLines.push({
          text: "Q = " + hoverQ.toFixed(3),
          color: "#e2e8f0",
        });
        tooltipLines.push({
          text: "εd = " + hEps.toFixed(3),
          color: clsColors[hCls],
          bold: true,
        });
        tooltipLines.push({
          text:
            hCls === "elastic"
              ? "Elastic"
              : hCls === "inelastic"
                ? "Inelastic"
                : "Unit Elastic",
          color: clsColors[hCls],
        });
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
        if (tooltipLines.length > 0)
          tooltipLines.push({ text: "─────────", color: "#334155" });
        tooltipLines.push({ text: "Supply", color: "#2dd4bf", bold: true });
        tooltipLines.push({ text: "P = " + hP.toFixed(3), color: "#e2e8f0" });
        tooltipLines.push({
          text: "Q = " + hoverQ.toFixed(3),
          color: "#e2e8f0",
        });
        tooltipLines.push({
          text: "εs = " + hEps.toFixed(3),
          color: "#2dd4bf",
          bold: true,
        });
        tooltipLines.push({
          text:
            hCls === "elastic"
              ? "Elastic"
              : hCls === "inelastic"
                ? "Inelastic"
                : "Unit Elastic",
          color: clsColors[hCls],
        });
      }
    }

    if (tooltipLines.length === 0) return;

    // Tooltip box
    ctx.font = window.CHART_FONTS.md;
    const tooltipWidth =
      Math.max(...tooltipLines.map((l) => ctx.measureText(l.text).width)) + 24;
    const tooltipHeight = tooltipLines.length * 20 + 12;
    let tx = hx + 15;
    let ty = padding.top + 10;
    if (tx + tooltipWidth > chart.width - padding.right)
      tx = hx - tooltipWidth - 15;
    if (ty + tooltipHeight > padding.top + chartHeight)
      ty = padding.top + chartHeight - tooltipHeight;

    const rad = 6;
    ctx.fillStyle = "rgba(15,23,42,0.95)";
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + rad, ty);
    ctx.lineTo(tx + tooltipWidth - rad, ty);
    ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + rad, rad);
    ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - rad);
    ctx.arcTo(
      tx + tooltipWidth,
      ty + tooltipHeight,
      tx + tooltipWidth - rad,
      ty + tooltipHeight,
      rad,
    );
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

  canvas.addEventListener(
    "mousemove",
    rafThrottle((e) => {
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
    }),
    { signal },
  );

  canvas.addEventListener(
    "mouseleave",
    () => {
      canvas.style.cursor = "default";
      drawOverlay(null);
    },
    { signal },
  );
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
// SHIFT ANALYSIS — Scenario 2 panel + runShiftAnalysis + modal
// ===================================================================

// Module-level shift state
let lastElasData2 = null;

/**
 * buildShiftAnalysisPanel()
 *
 * Called after a successful equation-mode Calculate.
 * Renders the two-column Scenario 1 (read-only) / Scenario 2 (editable)
 * comparison grid. Wires live input events to runShiftAnalysis().
 *
 * Handles both cases:
 *   - Equations with shift variables: one input per shift var per curve
 *   - Simple equations (no shift vars): replacement constant + slope inputs
 */
function buildShiftAnalysisPanel() {
  const section = document.getElementById("elas-shift-section");
  const grid = document.getElementById("elas-shift-grid");
  if (!section || !grid) return;

  if (!lastElasData || lastElasData.mode !== "equation") {
    section.classList.add("hidden");
    return;
  }

  const {
    dA,
    dB,
    sC,
    sD,
    pStar,
    qStar,
    epsilonD,
    epsilonS,
    demandParsed: dp,
    supplyParsed: sp,
    dShiftValues,
    sShiftValues,
  } = lastElasData;

  const hasShiftVars =
    (dp && Object.keys(dShiftValues || {}).length > 0) ||
    (sp && Object.keys(sShiftValues || {}).length > 0);

  // ── Build Scenario 1 read-only column ──
  let s1Html = '<div class="ct-shift-col">';
  s1Html += '<div class="ct-shift-col-title s1">Scenario 1 — Baseline</div>';

  if (hasShiftVars) {
    // Scalar display — read-only in S1
    if (dp && dp.scalar !== 1) {
      s1Html += '<div class="ct-shift-curve-label demand">Demand scalar</div>';
      s1Html +=
        '<div class="ct-shift-readonly-row">' +
        '<span class="ct-shift-readonly-label">scalar =</span>' +
        '<span class="ct-shift-readonly-value">' +
        fmtN(dp.scalar) +
        "</span></div>";
    }
    if (sp && sp.scalar !== 1) {
      s1Html += '<div class="ct-shift-curve-label supply">Supply scalar</div>';
      s1Html +=
        '<div class="ct-shift-readonly-row">' +
        '<span class="ct-shift-readonly-label">scalar =</span>' +
        '<span class="ct-shift-readonly-value">' +
        fmtN(sp.scalar) +
        "</span></div>";
    }
    // Demand shift vars
    const dVars = dp ? Object.keys(dShiftValues || {}) : [];
    if (dVars.length > 0) {
      s1Html +=
        '<div class="ct-shift-curve-label demand">Demand shifters</div>';
      dVars.forEach((v) => {
        s1Html +=
          '<div class="ct-shift-readonly-row">' +
          '<span class="ct-shift-readonly-label">' +
          v +
          " =</span>" +
          '<span class="ct-shift-readonly-value">' +
          fmtN(dShiftValues[v]) +
          "</span>" +
          "</div>";
      });
    }
    // Supply shift vars
    const sVars = sp ? Object.keys(sShiftValues || {}) : [];
    if (sVars.length > 0) {
      s1Html +=
        '<div class="ct-shift-curve-label supply">Supply shifters</div>';
      sVars.forEach((v) => {
        s1Html +=
          '<div class="ct-shift-readonly-row">' +
          '<span class="ct-shift-readonly-label">' +
          v +
          " =</span>" +
          '<span class="ct-shift-readonly-value">' +
          fmtN(sShiftValues[v]) +
          "</span>" +
          "</div>";
      });
    }
  } else {
    // Simple equation — show A and B for each curve
    s1Html += '<div class="ct-shift-curve-label demand">Demand</div>';
    s1Html +=
      '<div class="ct-shift-readonly-row">' +
      '<span class="ct-shift-readonly-label">Constant (A) =</span>' +
      '<span class="ct-shift-readonly-value">' +
      fmtN(dA) +
      "</span></div>";
    s1Html +=
      '<div class="ct-shift-readonly-row">' +
      '<span class="ct-shift-readonly-label">Slope (B) =</span>' +
      '<span class="ct-shift-readonly-value">' +
      fmtN(dB) +
      "</span></div>";
    s1Html += '<div class="ct-shift-curve-label supply">Supply</div>';
    s1Html +=
      '<div class="ct-shift-readonly-row">' +
      '<span class="ct-shift-readonly-label">Constant (C) =</span>' +
      '<span class="ct-shift-readonly-value">' +
      fmtN(sC) +
      "</span></div>";
    s1Html +=
      '<div class="ct-shift-readonly-row">' +
      '<span class="ct-shift-readonly-label">Slope (D) =</span>' +
      '<span class="ct-shift-readonly-value">' +
      fmtN(sD) +
      "</span></div>";
  }

  // Scenario 1 equilibrium summary
  s1Html +=
    '<div class="ct-shift-curve-label" style="color:var(--accent);">Equilibrium</div>';
  s1Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">P* =</span>' +
    '<span class="ct-shift-readonly-value">' +
    fmtN(pStar) +
    "</span></div>";
  s1Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">Q* =</span>' +
    '<span class="ct-shift-readonly-value">' +
    fmtN(qStar) +
    "</span></div>";
  s1Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">εd =</span>' +
    '<span class="ct-shift-readonly-value">' +
    epsilonD.toFixed(4) +
    "</span></div>";
  s1Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">εs =</span>' +
    '<span class="ct-shift-readonly-value">' +
    epsilonS.toFixed(4) +
    "</span></div>";
  s1Html += "</div>";

  // ── Build Scenario 2 editable column ──
  let s2Html = '<div class="ct-shift-col scenario-2">';
  s2Html += '<div class="ct-shift-col-title s2">Scenario 2 — Shift</div>';

  if (hasShiftVars) {
    // Scalar inputs — editable in S2
    if (dp && dp.scalar !== 1) {
      s2Html += '<div class="ct-shift-curve-label demand">Demand scalar</div>';
      s2Html +=
        '<div class="ct-shift-input-row">' +
        '<label for="elas-s2-d-scalar">scalar =</label>' +
        '<input type="number" step="any" id="elas-s2-d-scalar"' +
        ' class="ct-shift-s2-input" data-side="scalar-d" data-variable="scalar"' +
        ' placeholder="inherit: ' +
        fmtN(dp.scalar) +
        '"' +
        ' aria-label="Scenario 2 demand scalar" />' +
        "</div>" +
        '<div class="ct-shift-delta neutral" id="elas-s2-d-scalar-delta"></div>';
    }
    if (sp && sp.scalar !== 1) {
      s2Html += '<div class="ct-shift-curve-label supply">Supply scalar</div>';
      s2Html +=
        '<div class="ct-shift-input-row">' +
        '<label for="elas-s2-s-scalar">scalar =</label>' +
        '<input type="number" step="any" id="elas-s2-s-scalar"' +
        ' class="ct-shift-s2-input" data-side="scalar-s" data-variable="scalar"' +
        ' placeholder="inherit: ' +
        fmtN(sp.scalar) +
        '"' +
        ' aria-label="Scenario 2 supply scalar" />' +
        "</div>" +
        '<div class="ct-shift-delta neutral" id="elas-s2-s-scalar-delta"></div>';
    }
    const dVars = dp ? Object.keys(dShiftValues || {}) : [];
    if (dVars.length > 0) {
      s2Html +=
        '<div class="ct-shift-curve-label demand">Demand shifters</div>';
      dVars.forEach((v) => {
        s2Html +=
          '<div class="ct-shift-input-row">' +
          '<label for="elas-s2-d-' +
          v +
          '">' +
          v +
          " =</label>" +
          '<input type="number" step="any"' +
          ' id="elas-s2-d-' +
          v +
          '"' +
          ' class="ct-shift-s2-input"' +
          ' data-side="d"' +
          ' data-variable="' +
          v +
          '"' +
          ' placeholder="inherit: ' +
          fmtN(dShiftValues[v]) +
          '"' +
          ' aria-label="Scenario 2 value for ' +
          v +
          '" />' +
          "</div>" +
          '<div class="ct-shift-delta neutral" id="elas-s2-d-delta-' +
          v +
          '"></div>';
      });
    }
    const sVars = sp ? Object.keys(sShiftValues || {}) : [];
    if (sVars.length > 0) {
      s2Html +=
        '<div class="ct-shift-curve-label supply">Supply shifters</div>';
      sVars.forEach((v) => {
        s2Html +=
          '<div class="ct-shift-input-row">' +
          '<label for="elas-s2-s-' +
          v +
          '">' +
          v +
          " =</label>" +
          '<input type="number" step="any"' +
          ' id="elas-s2-s-' +
          v +
          '"' +
          ' class="ct-shift-s2-input"' +
          ' data-side="s"' +
          ' data-variable="' +
          v +
          '"' +
          ' placeholder="inherit: ' +
          fmtN(sShiftValues[v]) +
          '"' +
          ' aria-label="Scenario 2 value for ' +
          v +
          '" />' +
          "</div>" +
          '<div class="ct-shift-delta neutral" id="elas-s2-s-delta-' +
          v +
          '"></div>';
      });
    }
  } else {
    // Simple equation replacement inputs
    s2Html += '<div class="ct-shift-curve-label demand">Demand</div>';
    s2Html +=
      '<div class="ct-shift-input-row">' +
      '<label for="elas-s2-dA">Constant (A) =</label>' +
      '<input type="number" step="any" id="elas-s2-dA" class="ct-shift-s2-input"' +
      ' data-side="simple" data-variable="dA"' +
      ' placeholder="' +
      fmtN(dA) +
      '"' +
      ' aria-label="Scenario 2 demand constant" />' +
      "</div>" +
      '<div class="ct-shift-delta neutral" id="elas-s2-dA-delta"></div>' +
      '<div class="ct-shift-input-row">' +
      '<label for="elas-s2-dB">Slope (B) =</label>' +
      '<input type="number" step="any" id="elas-s2-dB" class="ct-shift-s2-input"' +
      ' data-side="simple" data-variable="dB"' +
      ' placeholder="' +
      fmtN(dB) +
      '"' +
      ' aria-label="Scenario 2 demand slope" />' +
      "</div>" +
      '<div class="ct-shift-delta neutral" id="elas-s2-dB-delta"></div>';

    s2Html += '<div class="ct-shift-curve-label supply">Supply</div>';
    s2Html +=
      '<div class="ct-shift-input-row">' +
      '<label for="elas-s2-sC">Constant (C) =</label>' +
      '<input type="number" step="any" id="elas-s2-sC" class="ct-shift-s2-input"' +
      ' data-side="simple" data-variable="sC"' +
      ' placeholder="' +
      fmtN(sC) +
      '"' +
      ' aria-label="Scenario 2 supply constant" />' +
      "</div>" +
      '<div class="ct-shift-delta neutral" id="elas-s2-sC-delta"></div>' +
      '<div class="ct-shift-input-row">' +
      '<label for="elas-s2-sD">Slope (D) =</label>' +
      '<input type="number" step="any" id="elas-s2-sD" class="ct-shift-s2-input"' +
      ' data-side="simple" data-variable="sD"' +
      ' placeholder="' +
      fmtN(sD) +
      '"' +
      ' aria-label="Scenario 2 supply slope" />' +
      "</div>" +
      '<div class="ct-shift-delta neutral" id="elas-s2-sD-delta"></div>';
  }

  // Scenario 2 equilibrium results (populated by runShiftAnalysis)
  s2Html +=
    '<div class="ct-shift-curve-label" style="color:#f59e0b;">Equilibrium</div>';
  s2Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">P* =</span>' +
    '<span class="ct-shift-readonly-value" id="elas-s2-pstar">—</span></div>';
  s2Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">Q* =</span>' +
    '<span class="ct-shift-readonly-value" id="elas-s2-qstar">—</span></div>';
  s2Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">εd =</span>' +
    '<span class="ct-shift-readonly-value" id="elas-s2-epsd">—</span></div>';
  s2Html +=
    '<div class="ct-shift-readonly-row">' +
    '<span class="ct-shift-readonly-label">εs =</span>' +
    '<span class="ct-shift-readonly-value" id="elas-s2-epss">—</span></div>';
  s2Html += "</div>";

  grid.innerHTML = s1Html + s2Html;
  section.classList.remove("hidden");

  // Wire live input events
  grid.querySelectorAll(".ct-shift-s2-input").forEach((inp) => {
    inp.addEventListener("input", runShiftAnalysis);
  });
}

/**
 * runShiftAnalysis()
 *
 * Reads Scenario 2 inputs, inherits blanks from Scenario 1,
 * collapses to dA2/dB2/sC2/sD2, solves for E2, updates display,
 * redraws chart with both scenarios.
 */
function runShiftAnalysis() {
  if (!lastElasData || lastElasData.mode !== "equation") return;

  const {
    dA,
    dB,
    sC,
    sD,
    epsilonD,
    epsilonS,
    demandParsed: dp,
    supplyParsed: sp,
    dShiftValues,
    sShiftValues,
  } = lastElasData;

  const hasShiftVars =
    (dp && Object.keys(dShiftValues || {}).length > 0) ||
    (sp && Object.keys(sShiftValues || {}).length > 0);

  let dA2, dB2, sC2, sD2;

  if (hasShiftVars) {
    // Build Scenario 2 shift value maps — blank inherits Scenario 1
    const dVars = dp ? Object.keys(dShiftValues || {}) : [];
    const sVars = sp ? Object.keys(sShiftValues || {}) : [];

    const dShift2 = {};
    dVars.forEach((v) => {
      const inp = document.getElementById("elas-s2-d-" + v);
      const val =
        inp && inp.value.trim() !== ""
          ? safeParseFloat(inp.value)
          : dShiftValues[v];
      dShift2[v] = val;

      // Update delta display
      const deltaEl = document.getElementById("elas-s2-d-delta-" + v);
      if (deltaEl && inp && inp.value.trim() !== "") {
        const delta = val - dShiftValues[v];
        const sign = delta > 0 ? "+" : "";
        deltaEl.textContent = "Δ = " + sign + fmtN(delta);
        deltaEl.className =
          "ct-shift-delta " +
          (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");
      } else if (deltaEl) {
        deltaEl.textContent = "";
        deltaEl.className = "ct-shift-delta neutral";
      }
    });

    const sShift2 = {};
    sVars.forEach((v) => {
      const inp = document.getElementById("elas-s2-s-" + v);
      const val =
        inp && inp.value.trim() !== ""
          ? safeParseFloat(inp.value)
          : sShiftValues[v];
      sShift2[v] = val;

      const deltaEl = document.getElementById("elas-s2-s-delta-" + v);
      if (deltaEl && inp && inp.value.trim() !== "") {
        const delta = val - sShiftValues[v];
        const sign = delta > 0 ? "+" : "";
        deltaEl.textContent = "Δ = " + sign + fmtN(delta);
        deltaEl.className =
          "ct-shift-delta " +
          (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");
      } else if (deltaEl) {
        deltaEl.textContent = "";
        deltaEl.className = "ct-shift-delta neutral";
      }
    });

    // Apply scalar override if provided
    const dScalarInp = document.getElementById("elas-s2-d-scalar");
    const sScalarInp = document.getElementById("elas-s2-s-scalar");
    const dScalar2 =
      dScalarInp && dScalarInp.value.trim() !== ""
        ? safeParseFloat(dScalarInp.value)
        : dp
          ? dp.scalar
          : 1;
    const sScalar2 =
      sScalarInp && sScalarInp.value.trim() !== ""
        ? safeParseFloat(sScalarInp.value)
        : sp
          ? sp.scalar
          : 1;

    // Update scalar delta displays
    if (dp && dp.scalar !== 1) {
      const dSDelta = document.getElementById("elas-s2-d-scalar-delta");
      if (dSDelta && dScalarInp && dScalarInp.value.trim() !== "") {
        const delta = dScalar2 - dp.scalar;
        const sign = delta > 0 ? "+" : "";
        dSDelta.textContent = "Δ = " + sign + fmtN(delta);
        dSDelta.className =
          "ct-shift-delta " +
          (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");
      } else if (dSDelta) {
        dSDelta.textContent = "";
        dSDelta.className = "ct-shift-delta neutral";
      }
    }
    if (sp && sp.scalar !== 1) {
      const sSDelta = document.getElementById("elas-s2-s-scalar-delta");
      if (sSDelta && sScalarInp && sScalarInp.value.trim() !== "") {
        const delta = sScalar2 - sp.scalar;
        const sign = delta > 0 ? "+" : "";
        sSDelta.textContent = "Δ = " + sign + fmtN(delta);
        sSDelta.className =
          "ct-shift-delta " +
          (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");
      } else if (sSDelta) {
        sSDelta.textContent = "";
        sSDelta.className = "ct-shift-delta neutral";
      }
    }

    // Build modified parsed objects with new scalar
    const dp2 = dp ? Object.assign({}, dp, { scalar: dScalar2 }) : dp;
    const sp2 = sp ? Object.assign({}, sp, { scalar: sScalar2 }) : sp;

    const dCollapsed2 = collapseToLinear(dp2, dShift2);
    const sCollapsed2 = collapseToLinear(sp2, sShift2);
    if (!dCollapsed2 || !sCollapsed2) return;
    dA2 = dCollapsed2.A;
    dB2 = dCollapsed2.B;
    sC2 = sCollapsed2.A;
    sD2 = sCollapsed2.B;
  } else {
    // Simple equation — read replacement values, inherit blanks
    const dAInp = document.getElementById("elas-s2-dA");
    const dBInp = document.getElementById("elas-s2-dB");
    const sCInp = document.getElementById("elas-s2-sC");
    const sDInp = document.getElementById("elas-s2-sD");

    dA2 = dAInp && dAInp.value.trim() !== "" ? safeParseFloat(dAInp.value) : dA;
    dB2 = dBInp && dBInp.value.trim() !== "" ? safeParseFloat(dBInp.value) : dB;
    sC2 = sCInp && sCInp.value.trim() !== "" ? safeParseFloat(sCInp.value) : sC;
    sD2 = sDInp && sDInp.value.trim() !== "" ? safeParseFloat(sDInp.value) : sD;

    // Delta displays
    [
      ["dA", dA],
      ["dB", dB],
      ["sC", sC],
      ["sD", sD],
    ].forEach(([key, base]) => {
      const inp = document.getElementById("elas-s2-" + key);
      const deltaEl = document.getElementById("elas-s2-" + key + "-delta");
      if (!deltaEl) return;
      if (inp && inp.value.trim() !== "") {
        const val = safeParseFloat(inp.value);
        const delta = val - base;
        const sign = delta > 0 ? "+" : "";
        deltaEl.textContent = "Δ = " + sign + fmtN(delta);
        deltaEl.className =
          "ct-shift-delta " +
          (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");
      } else {
        deltaEl.textContent = "";
        deltaEl.className = "ct-shift-delta neutral";
      }
    });
  }

  // Check if Scenario 2 is identical to Scenario 1 — clear and return
  if (dA2 === dA && dB2 === dB && sC2 === sC && sD2 === sD) {
    lastElasData2 = null;
    document.getElementById("elas-s2-pstar").textContent = "—";
    document.getElementById("elas-s2-qstar").textContent = "—";
    document.getElementById("elas-s2-epsd").textContent = "—";
    document.getElementById("elas-s2-epss").textContent = "—";
    document.getElementById("elas-shift-results").classList.add("hidden");
    requestAnimationFrame(() => drawElasticityChart(lastElasData, null));
    syncModalChart();
    return;
  }

  // Solve Scenario 2 equilibrium
  const denom2 = dB2 - sD2;
  if (Math.abs(denom2) < 1e-10) {
    document.getElementById("elas-s2-pstar").textContent = "No equilibrium";
    lastElasData2 = null;
    return;
  }

  const pStar2 = (sC2 - dA2) / denom2;
  const qStar2 = dA2 + dB2 * pStar2;

  if (pStar2 <= 0 || qStar2 <= 0) {
    document.getElementById("elas-s2-pstar").textContent = "Non-positive";
    lastElasData2 = null;
    return;
  }

  const epsilonD2 = dB2 * (pStar2 / qStar2);
  const epsilonS2 = sD2 * (pStar2 / qStar2);

  lastElasData2 = {
    dA: dA2,
    dB: dB2,
    sC: sC2,
    sD: sD2,
    pStar: pStar2,
    qStar: qStar2,
    epsilonD: epsilonD2,
    epsilonS: epsilonS2,
  };

  // Update Scenario 2 equilibrium display
  document.getElementById("elas-s2-pstar").textContent = fmtN(pStar2);
  document.getElementById("elas-s2-qstar").textContent = fmtN(qStar2);
  document.getElementById("elas-s2-epsd").textContent = epsilonD2.toFixed(4);
  document.getElementById("elas-s2-epss").textContent = epsilonS2.toFixed(4);

  // Update comparison results bar
  const resultsEl = document.getElementById("elas-shift-results");
  const { pStar, qStar } = lastElasData;

  function deltaItem(label, val1, val2, isElasticity) {
    const delta = val2 - val1;
    const sign = delta > 0 ? "+" : "";
    const cls = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
    const fmt = isElasticity ? (v) => v.toFixed(4) : fmtN;
    return (
      '<div class="ct-shift-result-item">' +
      '<span class="ct-shift-result-label">' +
      label +
      "</span>" +
      '<span class="ct-shift-result-value ' +
      cls +
      '">' +
      sign +
      fmt(delta) +
      "</span>" +
      '<span style="font-size:0.72rem;color:var(--text-secondary);">' +
      fmt(val1) +
      " → " +
      fmt(val2) +
      "</span>" +
      "</div>"
    );
  }

  resultsEl.innerHTML =
    deltaItem("ΔP*", pStar, pStar2, false) +
    deltaItem("ΔQ*", qStar, qStar2, false) +
    deltaItem("Δεd", epsilonD, epsilonD2, true) +
    deltaItem("Δεs", epsilonS, epsilonS2, true);
  resultsEl.classList.remove("hidden");

  // ── Interpretation panel ──
  renderShiftInterpretation({
    pStar,
    pStar2,
    qStar,
    qStar2,
    epsilonD,
    epsilonD2,
    epsilonS,
    epsilonS2,
    dA,
    dB,
    sC,
    sD,
    dA2,
    dB2,
    sC2,
    sD2,
  });

  // Redraw chart with both scenarios
  requestAnimationFrame(() => drawElasticityChart(lastElasData, lastElasData2));
  syncModalChart();
}

/**
 * renderShiftInterpretation(params)
 * Renders plain-language economic interpretation of the shift deltas.
 */
function renderShiftInterpretation({
  pStar,
  pStar2,
  qStar,
  qStar2,
  epsilonD,
  epsilonD2,
  epsilonS,
  epsilonS2,
  dA,
  dB,
  sC,
  sD,
  dA2,
  dB2,
  sC2,
  sD2,
}) {
  const el = document.getElementById("elas-shift-interpretation");
  if (!el) return;

  const deltaP = pStar2 - pStar;
  const deltaQ = qStar2 - qStar;
  const deltaEd = epsilonD2 - epsilonD;
  const deltaEs = epsilonS2 - epsilonS;

  const demandShifted = dA2 !== dA || dB2 !== dB;
  const supplyShifted = sC2 !== sC || sD2 !== sD;

  const sign = (v) => (v > 0 ? "+" : "");
  const pct = (v) => (v * 100).toFixed(1) + "%";

  // Determine shift direction narrative
  let shiftNarrative = "";
  if (demandShifted && supplyShifted) {
    shiftNarrative = "Both demand and supply shifted.";
  } else if (demandShifted) {
    shiftNarrative =
      dA2 > dA
        ? "Demand shifted <strong>outward (right)</strong> — consumers want more at every price."
        : "Demand shifted <strong>inward (left)</strong> — consumers want less at every price.";
  } else if (supplyShifted) {
    shiftNarrative =
      sC2 > sC || sD2 > sD
        ? "Supply shifted <strong>outward (right)</strong> — producers supply more at every price."
        : "Supply shifted <strong>inward (left)</strong> — producers supply less at every price.";
  }

  // Price interpretation
  const pDir = deltaP > 0 ? "rose" : "fell";
  const pCls = deltaP > 0 ? "negative" : "positive";
  const pPct = Math.abs((deltaP / pStar) * 100).toFixed(1);
  const pInterp =
    `Equilibrium price <strong>${pDir} by ${Math.abs(deltaP).toFixed(2)} 
    (${pPct}%)</strong>, from ${fmtN(pStar)} to ${fmtN(pStar2)}. ` +
    (deltaP > 0
      ? "A higher price means consumers pay more per unit."
      : "A lower price benefits consumers and may expand the market.");

  // Quantity interpretation
  const qDir = deltaQ > 0 ? "rose" : "fell";
  const qCls = deltaQ > 0 ? "positive" : "negative";
  const qPct = Math.abs((deltaQ / qStar) * 100).toFixed(1);
  const qInterp =
    `Equilibrium quantity <strong>${qDir} by ${fmtN(Math.abs(deltaQ))} 
    (${qPct}%)</strong>, from ${fmtN(qStar)} to ${fmtN(qStar2)}. ` +
    (deltaQ > 0
      ? "More units are traded — the market expanded."
      : "Fewer units are traded — the market contracted.");

  // Revenue interpretation (P × Q)
  const rev1 = pStar * qStar;
  const rev2 = pStar2 * qStar2;
  const deltaRev = rev2 - rev1;
  const revDir = deltaRev > 0 ? "increased" : "decreased";
  const revCls = deltaRev > 0 ? "positive" : "negative";
  const revPct = Math.abs((deltaRev / rev1) * 100).toFixed(1);
  const revInterp = `Total market revenue (P × Q) <strong>${revDir} by ${revPct}%</strong>, 
    from ${fmtN(rev1)} to ${fmtN(rev2)}.`;

  // Elasticity interpretation
  const absEd1 = Math.abs(epsilonD),
    absEd2 = Math.abs(epsilonD2);
  const cls1 =
    absEd1 > 1.001 ? "elastic" : absEd1 < 0.999 ? "inelastic" : "unit elastic";
  const cls2 =
    absEd2 > 1.001 ? "elastic" : absEd2 < 0.999 ? "inelastic" : "unit elastic";
  let edInterp = `Demand elasticity moved from <strong>${epsilonD.toFixed(4)} (${cls1})</strong> 
    to <strong>${epsilonD2.toFixed(4)} (${cls2})</strong>. `;
  if (cls1 === cls2) {
    edInterp += `Demand remains <strong>${cls2}</strong> — the pricing power relationship is unchanged.`;
  } else {
    edInterp +=
      cls2 === "elastic"
        ? "Demand became <strong>more elastic</strong> — consumers are now more price-sensitive at the new equilibrium."
        : "Demand became <strong>more inelastic</strong> — consumers are now less price-sensitive at the new equilibrium.";
  }

  // Supply elasticity interpretation
  const absEs1 = Math.abs(epsilonS),
    absEs2 = Math.abs(epsilonS2);
  const scls1 =
    absEs1 > 1.001 ? "elastic" : absEs1 < 0.999 ? "inelastic" : "unit elastic";
  const scls2 =
    absEs2 > 1.001 ? "elastic" : absEs2 < 0.999 ? "inelastic" : "unit elastic";
  let esInterp = `Supply elasticity moved from <strong>${epsilonS.toFixed(4)} (${scls1})</strong> 
    to <strong>${epsilonS2.toFixed(4)} (${scls2})</strong>. `;
  if (scls1 === scls2) {
    esInterp += `Supply remains <strong>${scls2}</strong>.`;
  } else {
    esInterp +=
      scls2 === "elastic"
        ? "Supply became <strong>more elastic</strong> — producers respond more strongly to price at the new equilibrium."
        : "Supply became <strong>more inelastic</strong> — producers respond less strongly to price at the new equilibrium.";
  }

  function item(text, cls) {
    return '<div class="ct-shift-interp-item ' + cls + '">' + text + "</div>";
  }

  el.innerHTML =
    "<h3>What the shift means</h3>" +
    (shiftNarrative ? item(shiftNarrative, "neutral") : "") +
    item(pInterp, pCls) +
    item(qInterp, qCls) +
    item(revInterp, revCls) +
    item(
      edInterp,
      Math.abs(deltaEd) < 0.001
        ? "neutral"
        : deltaEd > 0
          ? "positive"
          : "negative",
    ) +
    item(
      esInterp,
      Math.abs(deltaEs) < 0.001
        ? "neutral"
        : deltaEs > 0
          ? "positive"
          : "negative",
    );

  el.classList.remove("hidden");
}

// ===================================================================
// MODAL — expand / close
// ===================================================================

/**
 * syncModalChart()
 * If the modal is open, redraws the modal canvas to match current state.
 */
function syncModalChart() {
  const modal = document.getElementById("elas-chart-modal");
  if (!modal || !modal.classList.contains("open")) return;
  const modalCanvas = document.getElementById("elas-chart-modal-canvas");
  if (!modalCanvas) return;
  requestAnimationFrame(() =>
    drawElasticityChart(lastElasData, lastElasData2, modalCanvas),
  );
}

function openElasModal() {
  const modal = document.getElementById("elas-chart-modal");
  if (!modal || !lastElasData) return;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  // Draw into modal canvas after layout settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawElasticityChart(
        lastElasData,
        lastElasData2,
        document.getElementById("elas-chart-modal-canvas"),
      );
    });
  });
}

function closeElasModal() {
  const modal = document.getElementById("elas-chart-modal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const expandBtn = document.getElementById("elas-chart-expand");
  const closeBtn = document.getElementById("elas-modal-close");
  const modal = document.getElementById("elas-chart-modal");

  if (expandBtn) expandBtn.addEventListener("click", openElasModal);
  if (closeBtn) closeBtn.addEventListener("click", closeElasModal);
  if (modal) {
    // Click outside inner panel closes modal
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeElasModal();
    });
  }
  // Escape key closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeElasModal();
  });
});

// ===================================================================
// ELASTICITY REFERENCE PANEL
// ===================================================================

/**
 * renderElasticityReference(absEps)
 * Renders the classification table, formulas, and intuitions
 * into #elas-reference. Highlights the row matching absEps.
 */
function renderElasticityReference(absEps) {
  const el = document.getElementById("elas-reference");
  if (!el) return;

  // Classification rows
  const rows = [
    {
      condition: "|ε| = ∞",
      label: "Perfectly Elastic",
      badge: "perf-elastic",
      curve: "Horizontal",
      revenue: "Falls to zero",
      match: absEps === Infinity,
    },
    {
      condition: "|ε| > 1",
      label: "Elastic",
      badge: "elastic",
      curve: "Relatively flat",
      revenue: "Falls",
      match: absEps > 1.001 && absEps !== Infinity,
    },
    {
      condition: "|ε| = 1",
      label: "Unit Elastic",
      badge: "unit-elastic",
      curve: "—",
      revenue: "Unchanged",
      match: absEps >= 0.999 && absEps <= 1.001,
    },
    {
      condition: "|ε| < 1",
      label: "Inelastic",
      badge: "inelastic",
      curve: "Relatively steep",
      revenue: "Rises",
      match: absEps < 0.999 && absEps > 0,
    },
    {
      condition: "|ε| = 0",
      label: "Perfectly Inelastic",
      badge: "perf-inelastic",
      curve: "Vertical",
      revenue: "Rises proportionally",
      match: absEps === 0,
    },
  ];

  const tableRows = rows
    .map(
      (r) =>
        '<tr class="' +
        (r.match ? "active-row" : "") +
        '">' +
        "<td><code>" +
        r.condition +
        "</code></td>" +
        '<td><span class="ct-elas-ref-badge ' +
        r.badge +
        '">' +
        r.label +
        "</span></td>" +
        "<td>" +
        r.curve +
        "</td>" +
        "<td>" +
        r.revenue +
        "</td>" +
        "</tr>",
    )
    .join("");

  const table =
    '<table class="ct-elas-ref-table">' +
    "<thead><tr>" +
    "<th>Condition</th>" +
    "<th>Classification</th>" +
    "<th>Curve Shape</th>" +
    "<th>Price ↑ → Revenue</th>" +
    "</tr></thead>" +
    "<tbody>" +
    tableRows +
    "</tbody>" +
    "</table>";

  const formulas =
    '<div class="ct-elas-ref-formulas">' +
    '<div class="ct-elas-ref-formula">' +
    '<div class="ct-elas-ref-formula-label">Point Elasticity</div>' +
    '<div class="ct-elas-ref-formula-text">ε = (∂q/∂p) × (p/q)</div>' +
    "</div>" +
    '<div class="ct-elas-ref-formula">' +
    '<div class="ct-elas-ref-formula-label">Arc Elasticity (Midpoint)</div>' +
    '<div class="ct-elas-ref-formula-text">ε = (ΔQ/Q̄) ÷ (ΔP/P̄)</div>' +
    "</div>" +
    '<div class="ct-elas-ref-formula">' +
    '<div class="ct-elas-ref-formula-label">Revenue Rule</div>' +
    '<div class="ct-elas-ref-formula-text">ΔR = P·ΔQ + Q·ΔP</div>' +
    "</div>" +
    "</div>";

  const intuitions =
    '<div class="ct-elas-ref-intuitions">' +
    '<div class="ct-elas-ref-intuition"><strong>More substitutes</strong> → more elastic</div>' +
    '<div class="ct-elas-ref-intuition"><strong>Necessities</strong> → more inelastic</div>' +
    '<div class="ct-elas-ref-intuition"><strong>Short run</strong> → more inelastic</div>' +
    '<div class="ct-elas-ref-intuition"><strong>Long run</strong> → more elastic</div>' +
    '<div class="ct-elas-ref-intuition"><strong>Narrow market definition</strong> → more elastic</div>' +
    '<div class="ct-elas-ref-intuition"><strong>Broad market definition</strong> → more inelastic</div>' +
    "</div>";

  el.innerHTML =
    '<div class="ct-elas-reference-title">Elasticity Reference</div>' +
    table +
    formulas +
    intuitions;
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
