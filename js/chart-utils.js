// ===================================================================
// SHARED CHART UTILITIES — DPI scaling & formatting
// ===================================================================

// ===== UNIFIED CURRENCY FORMATTER =====
// Automatically scales display based on magnitude:
//   < $1,000        → 2 decimals     → $3.45, $125.50
//   $1K – $999K     → 0 decimals     → $1,250, $450,000
//   $1M – $999M     → 2 decimal + M  → $1.25M
//   $1B+            → 2 decimal + B  → $1.25B
// Handles negatives: -$1,250, -$3.45M


// ===== SHARED CONSTANTS =====
export const CONFIG = {
  MAX_PROJECTION_MONTHS: 1200,   // 100 years — used in yearsToTarget loops
  SP500_NOMINAL_RETURN: 10.5,    // Historical S&P 500 nominal annual return (%)
  SP500_REAL_RETURN: 7.0,        // Historical S&P 500 real (inflation-adjusted) return (%)
  DEFAULT_INFLATION: 3.0,        // Default inflation rate (%)
  DEFAULT_WITHDRAWAL_RATE: 4.0,  // Classic safe withdrawal rate (%)
  CHART_PADDING: { top: 30, right: 30, bottom: 50, left: 70 },
};

// ===== INPUT PARSING UTILITIES =====
// safeParseFloat: parses a DOM input value, returns fallback if NaN/infinite
// safeParseInt:   same for integer inputs
// Usage: safeParseFloat(document.getElementById('my-input').value)
//        safeParseFloat(document.getElementById('my-input').value, 1)

export function safeParseFloat(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeParseInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formatCurrency(value) {
  if (!Number.isFinite(value)) return '$0.00';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return sign + '$' + (abs / 1_000_000_000).toFixed(2) + 'B';
  }
  if (abs >= 1_000_000) {
    return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  }
  if (abs >= 1_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ===== CHART CONTEXT (DPI-aware) =====

// createChartContext: sets canvas dimensions accounting for device pixel ratio (DPR).
// Always call this instead of setting canvas.width/height directly.
// Returns { ctx, width, height, clear } where width/height are DPR-scaled logical pixels.
export function createChartContext(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  return {
    ctx,
    canvas,
    width,
    height,
    dpr,
    clear() {
      ctx.clearRect(0, 0, width, height);
    },
  };
}

// Get logical dimensions from a canvas already set up by createChartContext
// getChartDimensions: returns the current rendered width/height of a canvas element.
// Use when the canvas size is determined by CSS layout rather than explicit dimensions.
export function getChartDimensions(canvas) {
  return {
    width: parseInt(canvas.style.width) || canvas.width,
    height: parseInt(canvas.style.height) || canvas.height,
  };
}

// ===================================================================
// AUTO-SCROLL TABLES — adds scroll to tables with many rows
// ===================================================================

export function autoScrollTables(maxRows = 25) {
  document.querySelectorAll(".table-wrapper").forEach((wrapper) => {
    const rows = wrapper.querySelectorAll("tbody tr");
    if (rows.length > maxRows) {
      wrapper.style.maxHeight = "500px";
      wrapper.style.overflowY = "auto";
    } else {
      wrapper.style.maxHeight = "";
      wrapper.style.overflowY = "";
    }
  });
}

// ===== SHARED TOOLTIP RENDERER =====
// Draws a rounded-rect tooltip with lines of text on a canvas context.
// ctx:    CanvasRenderingContext2D
// lines:  array of { text, color, bold } or plain strings
// x, y:  anchor point (tip of crosshair or hover point)
// bounds: { width, height, top, right } — chart bounds for edge clamping

// ===== SHARED TOOLTIP RENDERER =====
// Draws a rounded-rect tooltip with lines of text on a canvas context.
// ctx:    CanvasRenderingContext2D
// lines:  array of { text, color, bold } or plain strings
// x, y:  anchor point (tip of crosshair or hover point)
// bounds: { width, height, top, right } — chart bounds for edge clamping

export function drawTooltip(ctx, lines, x, y, bounds) {
  if (!lines || lines.length === 0) return;

  const normalized = lines.map((l) =>
    typeof l === "string" ? { text: l, color: null, bold: false } : l
  );

  ctx.font = "12px sans-serif";
  const tooltipWidth = Math.max(...normalized.map((l) => ctx.measureText(l.text).width)) + 24;
  const tooltipHeight = normalized.length * 20 + 16;

  let tx = x + 15;
  let ty = y - tooltipHeight / 2;

  if (bounds) {
    if (tx + tooltipWidth > bounds.right) tx = x - tooltipWidth - 15;
    if (ty < bounds.top) ty = bounds.top;
    if (ty + tooltipHeight > bounds.top + bounds.height) ty = bounds.top + bounds.height - tooltipHeight;
  }

  // Background
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.lineWidth = 1;
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(tx + r, ty);
  ctx.lineTo(tx + tooltipWidth - r, ty);
  ctx.arcTo(tx + tooltipWidth, ty, tx + tooltipWidth, ty + r, r);
  ctx.lineTo(tx + tooltipWidth, ty + tooltipHeight - r);
  ctx.arcTo(tx + tooltipWidth, ty + tooltipHeight, tx + tooltipWidth - r, ty + tooltipHeight, r);
  ctx.lineTo(tx + r, ty + tooltipHeight);
  ctx.arcTo(tx, ty + tooltipHeight, tx, ty + tooltipHeight - r, r);
  ctx.lineTo(tx, ty + r);
  ctx.arcTo(tx, ty, tx + r, ty, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.textAlign = "left";
  normalized.forEach((line, i) => {
    ctx.fillStyle = line.color || (i === 0 ? "#e2e8f0" : "#94a3b8");
    ctx.font = (line.bold || i === 0) ? "bold 12px sans-serif" : "12px sans-serif";
    ctx.fillText(line.text, tx + 12, ty + 18 + i * 20);
  });
}

// ===== BAR CHART UTILITY =====
// data: array of objects
// options.series: [{ key, color, label }]
// options.xLabel: (d) => string
// options.tooltip: (d) => [line1, line2,...]
// options.controller: AbortController (optional, managed externally)
export function drawBarChart(canvas, data, options) {
  if (!canvas || !data || data.length === 0) return;

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawBarChart(canvas, data, options));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 30, right: 20, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;
  const series = options.series || [];

  const maxValue = Math.max(...data.map((d) =>
    series.reduce((sum, s) => sum + Math.abs(d[s.key] || 0), 0)
  ));

  const barWidth = chartWidth / data.length;

  function toY(value) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  // ── Offscreen static layer ──
  const offscreen = document.createElement("canvas");
  offscreen.width = chart.width;
  offscreen.height = chart.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.scale(1, 1);

  function drawStatic() {
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    // Y-axis grid + labels
    offCtx.font = "11px sans-serif";
    offCtx.textAlign = "right";
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      offCtx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(padding.left, y);
      offCtx.lineTo(offscreen.width - padding.right, y);
      offCtx.stroke();
      offCtx.fillStyle = "#94a3b8";
      offCtx.fillText(
        value >= 1000000 ? `$${(value/1000000).toFixed(1)}M` :
        value >= 1000 ? `$${(value/1000).toFixed(0)}k` :
        `$${value.toFixed(0)}`,
        padding.left - 8, y + 4
      );
    }

    // Bars
    data.forEach((d, i) => {
      const x = padding.left + i * barWidth;
      const bw = barWidth * 0.7;
      const bx = x + (barWidth - bw) / 2;
      let yOffset = padding.top + chartHeight;

      series.forEach((s) => {
        const val = Math.abs(d[s.key] || 0);
        const bh = (val / maxValue) * chartHeight;
        yOffset -= bh;
        offCtx.fillStyle = s.color + "cc";
        offCtx.beginPath();
        offCtx.roundRect(bx, yOffset, bw, bh, [3, 3, 0, 0]);
        offCtx.fill();
      });

      // X-axis label
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = "10px sans-serif";
      offCtx.textAlign = "center";
      offCtx.fillText(
        options.xLabel ? options.xLabel(d) : String(i),
        x + barWidth / 2,
        padding.top + chartHeight + 16
      );
    });

    // Axes
    offCtx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    offCtx.lineWidth = 1;
    offCtx.beginPath();
    offCtx.moveTo(padding.left, padding.top);
    offCtx.lineTo(padding.left, padding.top + chartHeight);
    offCtx.lineTo(offscreen.width - padding.right, padding.top + chartHeight);
    offCtx.stroke();
  }

  drawStatic();

  function drawChart(highlightIndex) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(offscreen, 0, 0);

    if (highlightIndex === null || highlightIndex < 0 || highlightIndex >= data.length) return;

    const d = data[highlightIndex];
    const x = padding.left + highlightIndex * barWidth + barWidth / 2;

    // Highlight active bar
    const bw = barWidth * 0.7;
    const bx = x - bw / 2;
    let yOffset = padding.top + chartHeight;
    series.forEach((s) => {
      const val = Math.abs(d[s.key] || 0);
      const bh = (val / maxValue) * chartHeight;
      yOffset -= bh;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(bx, yOffset, bw, bh, [3, 3, 0, 0]);
      ctx.fill();
    });

    // Crosshair
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tooltip
    const lines = options.tooltip ? options.tooltip(d) : [];
    drawTooltip(ctx, lines, x, padding.top + 10, {
      right: chart.width - padding.right,
      top: padding.top,
      height: chartHeight,
    });
  }

  drawChart(null);

  if (options.controller) options.controller.abort();
  options.controller = new AbortController();
  const { signal } = options.controller;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const scaleX = chart.width / r.width;
    const scaledX = mouseX * scaleX;
    const index = Math.floor((scaledX - padding.left) / barWidth);
    if (index >= 0 && index < data.length) {
      canvas.style.cursor = "crosshair";
      drawChart(index);
    } else {
      canvas.style.cursor = "default";
      drawChart(null);
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal });
}

// ===== LINE CHART UTILITY =====
// data: array of objects
// options.series: [{ key, color, label }]
// options.xLabel: (d, i) => string  — for x-axis tick labels
// options.xTicks: number            — how many x-axis ticks to show (default 10)
// options.tooltip: (d) => [line1, line2,...]
// options.controller: AbortController (optional, managed externally)
export function drawLineChart(canvas, data, options) {
  if (!canvas || !data || data.length === 0) return;

  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => drawLineChart(canvas, data, options));
    return;
  }

  const chart = createChartContext(canvas, rect.width, rect.height);
  const ctx = chart.ctx;
  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const chartWidth = chart.width - padding.left - padding.right;
  const chartHeight = chart.height - padding.top - padding.bottom;
  const series = options.series || [];
  const xTicks = options.xTicks || 10;

  const allValues = series.flatMap((s) => data.map((d) => d[s.key] || 0));
  const maxValue = Math.max(...allValues) || 1;

  function toX(i) {
    return padding.left + (i / (data.length - 1)) * chartWidth;
  }

  function toY(value) {
    return padding.top + chartHeight - (value / maxValue) * chartHeight;
  }

  function fromX(x) {
    return ((x - padding.left) / chartWidth) * (data.length - 1);
  }

  // ── Offscreen static layer ──
  const offscreen = document.createElement("canvas");
  offscreen.width = chart.width;
  offscreen.height = chart.height;
  const offCtx = offscreen.getContext("2d");

  function drawStatic() {
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    // Y-axis grid + labels
    offCtx.font = "11px sans-serif";
    offCtx.textAlign = "right";
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      offCtx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(padding.left, y);
      offCtx.lineTo(offscreen.width - padding.right, y);
      offCtx.stroke();
      offCtx.fillStyle = "#94a3b8";
      offCtx.fillText(
        value >= 1000000 ? `$${(value/1000000).toFixed(1)}M` :
        value >= 1000 ? `$${(value/1000).toFixed(0)}k` :
        `$${value.toFixed(0)}`,
        padding.left - 8, y + 4
      );
    }

    // X-axis ticks
    offCtx.textAlign = "center";
    const step = Math.ceil(data.length / xTicks);
    for (let i = 0; i < data.length; i += step) {
      const x = toX(i);
      offCtx.fillStyle = "#94a3b8";
      offCtx.font = "10px sans-serif";
      offCtx.fillText(
        options.xLabel ? options.xLabel(data[i], i) : String(i),
        x, padding.top + chartHeight + 16
      );
      offCtx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      offCtx.lineWidth = 1;
      offCtx.beginPath();
      offCtx.moveTo(x, padding.top);
      offCtx.lineTo(x, padding.top + chartHeight);
      offCtx.stroke();
    }

    // Axes
    offCtx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    offCtx.lineWidth = 1;
    offCtx.beginPath();
    offCtx.moveTo(padding.left, padding.top);
    offCtx.lineTo(padding.left, padding.top + chartHeight);
    offCtx.lineTo(offscreen.width - padding.right, padding.top + chartHeight);
    offCtx.stroke();

    // Series lines + fills
    series.forEach((s) => {
      offCtx.strokeStyle = s.color;
      offCtx.lineWidth = 2;
      offCtx.beginPath();
      data.forEach((d, i) => {
        const x = toX(i);
        const y = toY(d[s.key] || 0);
        if (i === 0) offCtx.moveTo(x, y);
        else offCtx.lineTo(x, y);
      });
      offCtx.stroke();

      if (s.fill) {
        offCtx.lineTo(toX(data.length - 1), toY(0));
        offCtx.lineTo(toX(0), toY(0));
        offCtx.closePath();
        offCtx.fillStyle = s.color + "1a";
        offCtx.fill();
      }
    });
  }

  drawStatic();

  function drawChart(highlightIndex) {
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.drawImage(offscreen, 0, 0);

    if (highlightIndex === null || highlightIndex < 0 || highlightIndex >= data.length) return;

    const d = data[highlightIndex];
    const hx = toX(highlightIndex);

    // Crosshair
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots on series
    series.forEach((s) => {
      const hy = toY(d[s.key] || 0);
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Tooltip
    const lines = options.tooltip ? options.tooltip(d) : [];
    drawTooltip(ctx, lines, hx, padding.top + 10, {
      right: chart.width - padding.right,
      top: padding.top,
      height: chartHeight,
    });
  }

  drawChart(null);

  if (options.controller) options.controller.abort();
  options.controller = new AbortController();
  const { signal } = options.controller;

  canvas.addEventListener("mousemove", rafThrottle((e) => {
    const r = canvas.getBoundingClientRect();
    const mouseX = e.clientX - r.left;
    const scaleX = chart.width / r.width;
    const index = Math.round(fromX(mouseX * scaleX));
    if (index >= 0 && index < data.length) {
      canvas.style.cursor = "crosshair";
      drawChart(index);
    } else {
      canvas.style.cursor = "default";
      drawChart(null);
    }
  }), { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal });
}

// ===== CHART LOADING SPINNER =====
// showChartLoading: shows a spinner overlay on the canvas-chart container of a given canvas.
// hideChartLoading: removes the spinner.
// The spinner div is created once and reused on subsequent calls.

export function showChartLoading(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.closest(".canvas-chart");
  if (!container) return;

  let spinner = container.querySelector(".chart-loading");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.className = "chart-loading";
    spinner.innerHTML = '<div class="chart-spinner"></div>';
    container.appendChild(spinner);
  }
  spinner.classList.add("active");
}

export function hideChartLoading(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.closest(".canvas-chart");
  if (!container) return;
  const spinner = container.querySelector(".chart-loading");
  if (spinner) spinner.classList.remove("active");
}

// ===== RAF THROTTLE =====
// Wraps a mousemove callback so it only fires once per animation frame.
// Prevents redraws faster than the screen refresh rate (60/120/144hz).

export function rafThrottle(fn) {
  let pending = false;
  return function(...args) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn.apply(this, args);
    });
  };
}

// ===== INPUT VALIDATION UTILITY =====
// schema: array of { id, label, required, min, max, integer }
// containerSelector: string or element — used to clear errors before validating
// Returns true if all fields pass, false if any fail (errors shown inline)

export function validateInputs(schema, containerSelector) {
  if (containerSelector) clearAllErrors(containerSelector);
  let valid = true;

  schema.forEach(({ id, label, required, min, max, integer }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const raw = el.value.trim();
    const num = integer ? parseInt(raw, 10) : parseFloat(raw);

    if (required && raw === "") {
      showFieldError(id, `${label} is required.`);
      valid = false;
      return;
    }

    if (raw === "") return;

    if (isNaN(num)) {
      showFieldError(id, `${label} must be a valid number.`);
      valid = false;
      return;
    }

    if (min !== undefined && num < min) {
      showFieldError(id, `${label} must be at least ${min}.`);
      valid = false;
      return;
    }

    if (max !== undefined && num > max) {
      showFieldError(id, `${label} must be no more than ${max}.`);
      valid = false;
      return;
    }
  });

  return valid;
}

// ===== INLINE FIELD VALIDATION HELPERS =====
// showFieldError: marks an input with a red border and shows a message below it
// clearFieldError: removes error state from a single field
// clearAllErrors: removes all error states within a container

export function showFieldError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add("input-error");
  let msg = el.parentElement.querySelector(".field-error-msg");
  if (!msg) {
    msg = document.createElement("span");
    msg.className = "field-error-msg";
    el.parentElement.appendChild(msg);
  }
  msg.textContent = message;
  msg.style.display = "block";
}

export function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.remove("input-error");
  const msg = el.parentElement.querySelector(".field-error-msg");
  if (msg) msg.style.display = "none";
}

export function clearAllErrors(containerSelector) {
  const container = typeof containerSelector === "string"
    ? document.querySelector(containerSelector)
    : containerSelector;
  if (!container) return;
  container.querySelectorAll(".input-error").forEach((el) => {
    el.classList.remove("input-error");
  });
  container.querySelectorAll(".field-error-msg").forEach((el) => {
    el.style.display = "none";
  });
}

// ===== FORM ENTER-KEY DELEGATION =====
// Single delegated listener on each.calc-form instead of per-input listeners
export function bindFormEnter(callback, containerSelector) {
  const root = containerSelector
    ? document.querySelector(containerSelector)
    : document;
  if (!root) return;
  const forms = root.querySelectorAll(".calc-form");
  forms.forEach((form) => {
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) {
        e.preventDefault();
        callback(e);
      }
    });
  });
}

// ===== PAGE PERFORMANCE METRIC =====
window.addEventListener("load", () => {
  requestAnimationFrame(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const totalKB = (resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024).toFixed(1);
    const domReady = nav.domContentLoadedEventEnd.toFixed(0);
    const fullLoad = nav.loadEventEnd.toFixed(0);
    console.log(
      `%c⚡ Page Load: DOM Ready ${domReady}ms | Full Load ${fullLoad}ms | ${resources.length} resources (${totalKB} KB)`,
      "color: #2dd4bf; font-weight: bold;"
    );
  });
});
