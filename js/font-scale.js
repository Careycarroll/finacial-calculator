// ===================================================================
// FONT SCALE — Persistent chart + UI font size control
// Cycles: small → medium → large → small
// Loaded as a plain script (not module) on every page.
// ===================================================================

(function () {
  const SCALES = ["small", "medium", "large"];
  const ROOT_SIZES = { small: "15px", medium: "17px", large: "19px" };
  const CHART_FONTS_MAP = {
    small:  { xs: "10px", sm: "11px", md: "12px", lg: "13px", boldSm: "bold 11px", boldMd: "bold 12px", boldLg: "bold 13px" },
    medium: { xs: "11px", sm: "13px", md: "14px", lg: "15px", boldSm: "bold 13px", boldMd: "bold 14px", boldLg: "bold 15px" },
    large:  { xs: "13px", sm: "15px", md: "16px", lg: "17px", boldSm: "bold 15px", boldMd: "bold 16px", boldLg: "bold 17px" },
  };
  const SANS = " sans-serif";

  // Read stored scale, default to medium
  const stored = localStorage.getItem("fontScale") || "medium";
  const current = SCALES.includes(stored) ? stored : "medium";

  // Apply root font size immediately (before render)
  document.documentElement.style.fontSize = ROOT_SIZES[current];

  // Expose chart font constants globally so all JS modules can read them
  const f = CHART_FONTS_MAP[current];
  window.CHART_FONTS = {
    xs:     f.xs     + SANS,
    sm:     f.sm     + SANS,
    md:     f.md     + SANS,
    lg:     f.lg     + SANS,
    boldSm: f.boldSm + SANS,
    boldMd: f.boldMd + SANS,
    boldLg: f.boldLg + SANS,
    current: current,
  };

  // Inject toggle button into nav once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelector(".top-nav-links");
    if (!navLinks) return;

    const labels = { small: "A⁻", medium: "A", large: "A⁺" };
    const btn = document.createElement("button");
    btn.id = "font-scale-btn";
    btn.className = "font-scale-btn";
    btn.setAttribute("aria-label", "Cycle font size");
    btn.setAttribute("title", "Font size: " + current);
    btn.textContent = labels[current];

    btn.addEventListener("click", () => {
      const idx = SCALES.indexOf(current);
      const next = SCALES[(idx + 1) % SCALES.length];
      localStorage.setItem("fontScale", next);
      location.reload();
    });

    navLinks.appendChild(btn);
  });
})();
