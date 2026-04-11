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


// ===== INPUT PARSING UTILITIES =====
// safeParseFloat: parses a DOM input value, returns fallback if NaN/infinite
// safeParseInt:   same for integer inputs
// Usage: safeParseFloat(document.getElementById('my-input').value)
//        safeParseFloat(document.getElementById('my-input').value, 1)

function safeParseFloat(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeParseInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(value) {
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

function createChartContext(canvas, width, height) {
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
function getChartDimensions(canvas) {
  return {
    width: parseInt(canvas.style.width) || canvas.width,
    height: parseInt(canvas.style.height) || canvas.height,
  };
}

// ===================================================================
// AUTO-SCROLL TABLES — adds scroll to tables with many rows
// ===================================================================

function autoScrollTables(maxRows = 25) {
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

// ===== BAR CHART UTILITY =====
// data: array of objects
// options.series: [{ key, color, label }]
// options.xLabel: (d) => string
// options.tooltip: (d) => [line1, line2,...]
// options.controller: AbortController (optional, managed externally)
function drawBarChart(canvas, data, options) {
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

  function drawChart(highlightIndex) {
    ctx.clearRect(0, 0, chart.width, chart.height);

    // Y-axis grid + labels
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(
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

      const isHighlighted = highlightIndex === i;

      series.forEach((s) => {
        const val = Math.abs(d[s.key] || 0);
        const bh = (val / maxValue) * chartHeight;
        yOffset -= bh;
        ctx.fillStyle = isHighlighted
          ? s.color
          : s.color + "cc";
        ctx.beginPath();
        ctx.roundRect(bx, yOffset, bw, bh, [3, 3, 0, 0]);
        ctx.fill();
      });

      // X-axis label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        options.xLabel ? options.xLabel(d) : String(i),
        x + barWidth / 2,
        padding.top + chartHeight + 16
      );
    });

    // Axes
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(chart.width - padding.right, padding.top + chartHeight);
    ctx.stroke();

    // Crosshair + tooltip
    if (highlightIndex !== null && highlightIndex >= 0 && highlightIndex < data.length) {
      const d = data[highlightIndex];
      const x = padding.left + highlightIndex * barWidth + barWidth / 2;

      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      const lines = options.tooltip ? options.tooltip(d) : [];
      ctx.font = "12px sans-serif";
      const tooltipWidth = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
      const tooltipHeight = lines.length * 20 + 16;
      let tx = x + 15;
      let ty = padding.top + 10;
      if (tx + tooltipWidth > chart.width - padding.right) tx = x - tooltipWidth - 15;
      if (ty + tooltipHeight > padding.top + chartHeight) ty = padding.top + chartHeight - tooltipHeight;

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

      ctx.textAlign = "left";
      lines.forEach((line, li) => {
        ctx.fillStyle = li === 0 ? "#e2e8f0" : "#94a3b8";
        ctx.font = li === 0 ? "bold 12px sans-serif" : "12px sans-serif";
        ctx.fillText(line, tx + 12, ty + 18 + li * 20);
      });
    }
  }

  drawChart(null);

  if (options.controller) options.controller.abort();
  options.controller = new AbortController();
  const { signal } = options.controller;

  canvas.addEventListener("mousemove", (e) => {
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
  }, { signal });

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
function drawLineChart(canvas, data, options) {
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

  function drawChart(highlightIndex) {
    ctx.clearRect(0, 0, chart.width, chart.height);

    // Y-axis grid + labels
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const value = (maxValue / ySteps) * i;
      const y = toY(value);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(chart.width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(
        value >= 1000000 ? `$${(value/1000000).toFixed(1)}M` :
        value >= 1000 ? `$${(value/1000).toFixed(0)}k` :
        `$${value.toFixed(0)}`,
        padding.left - 8, y + 4
      );
    }

    // X-axis ticks
    ctx.textAlign = "center";
    const step = Math.ceil(data.length / xTicks);
    for (let i = 0; i < data.length; i += step) {
      const x = toX(i);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(
        options.xLabel ? options.xLabel(data[i], i) : String(i),
        x, padding.top + chartHeight + 16
      );
      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(chart.width - padding.right, padding.top + chartHeight);
    ctx.stroke();

    // Series lines + fills
    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = toX(i);
        const y = toY(d[s.key] || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (s.fill) {
        ctx.lineTo(toX(data.length - 1), toY(0));
        ctx.lineTo(toX(0), toY(0));
        ctx.closePath();
        ctx.fillStyle = s.color + "1a";
        ctx.fill();
      }
    });

    // Crosshair + tooltip
    if (highlightIndex !== null && highlightIndex >= 0 && highlightIndex < data.length) {
      const d = data[highlightIndex];
      const hx = toX(highlightIndex);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

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

      const lines = options.tooltip ? options.tooltip(d) : [];
      ctx.font = "12px sans-serif";
      const tooltipWidth = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
      const tooltipHeight = lines.length * 20 + 16;
      let tx = hx + 15;
      let ty = padding.top + 10;
      if (tx + tooltipWidth > chart.width - padding.right) tx = hx - tooltipWidth - 15;
      if (ty + tooltipHeight > padding.top + chartHeight) ty = padding.top + chartHeight - tooltipHeight;

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

      ctx.textAlign = "left";
      lines.forEach((line, li) => {
        ctx.fillStyle = li === 0 ? "#e2e8f0" : "#94a3b8";
        ctx.font = li === 0 ? "bold 12px sans-serif" : "12px sans-serif";
        ctx.fillText(line, tx + 12, ty + 18 + li * 20);
      });
    }
  }

  drawChart(null);

  if (options.controller) options.controller.abort();
  options.controller = new AbortController();
  const { signal } = options.controller;

  canvas.addEventListener("mousemove", (e) => {
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
  }, { signal });

  canvas.addEventListener("mouseleave", () => {
    canvas.style.cursor = "default";
    drawChart(null);
  }, { signal });
}

// ===== FORM ENTER-KEY DELEGATION =====
// Single delegated listener on each.calc-form instead of per-input listeners
function bindFormEnter(callback) {
  document.querySelectorAll(".calc-form").forEach((form) => {
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
