// Performance optimizations using Quicklink
// Load Quicklink from CDN and initialize prefetching
(function () {
  // Load Quicklink library
  const script = document.createElement("script");
  script.src = "https://unpkg.com/quicklink@2.3.0/dist/quicklink.umd.js";
  script.onload = function () {
    // Initialize prefetching on hover for all links
    if (window.quicklink) {
      window.quicklink.listen({
        el: document.body,
        origins: [location.origin],
      });
    }

    // Optional: Prefetch critical pages on idle
    const criticalPages = [
      "pages/loan.html",
      "pages/loan-advanced.html",
      "pages/pv.html",
      "pages/npv-irr.html",
      "pages/options.html",
      "pages/projections.html",
      "pages/fire.html",
      "pages/news.html",
    ];

    // Prefetch critical pages after initial page load
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => {
        criticalPages.forEach((page) => {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.href = page;
          document.head.appendChild(link);
        });
      });
    }
  };
  document.head.appendChild(script);
})();
