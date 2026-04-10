// ===================================================================
// SHARED CHART UTILITIES — DPI scaling
// ===================================================================

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
