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
