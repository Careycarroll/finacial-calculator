/**
 * Gridstack Initialization & Layout Manager
 * Handles drag-and-drop grid layouts with localStorage persistence
 */

function initGridStack() {
  // Wait for GridStack library to be available
  if (typeof GridStack === "undefined") {
    console.error("GridStack library not loaded");
    return;
  }

  // Initialize Gridstack on the main grid
  const gridElement = document.querySelector(".grid-stack");

  if (!gridElement) {
    console.log("No grid-stack element found on this page");
    return;
  }

  normalizeGridStackAttributes(gridElement);

  // Get page identifier for localStorage key
  const pageId = getPageId();

  console.log("Initializing GridStack for page:", pageId);
  console.log("Grid element:", gridElement);
  console.log("Grid element dimensions:", {
    width: gridElement.offsetWidth,
    height: gridElement.offsetHeight,
    clientWidth: gridElement.clientWidth,
  });

  // Initialize Gridstack with proper settings
  const grid = GridStack.init({
    column: 12,
    cellHeight: 100,
    cellHeightUnit: "px",
    float: false,
    resizable: {
      handles: "se",
    },
    draggable: {
      handle: ".gs-drag-handle",
    },
    margin: 10,
    minRow: 1,
    animate: true,
  });

  console.log("GridStack initialized:", grid);
  console.log("Grid items:", grid.getGridItems());

  // Force a recalculation after a brief delay
  setTimeout(() => {
    grid.batchUpdate();
    grid.commit();
    console.log("Grid items after batch update:", grid.getGridItems());
    console.log("Grid element height after commit:", gridElement.offsetHeight);
  }, 100);

  // Load saved layout from localStorage
  loadLayout(grid, pageId);

  // Force a recalculation and re-render after layout is loaded
  setTimeout(() => {
    console.log("=== Final Grid State ===");
    const items = grid.getGridItems();
    console.log("Total items:", items.length);
    items.forEach((item) => {
      const node = item.gridstackNode;
      console.log(`Item: ${item.id}`, {
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        element: item,
        elementStyle: window.getComputedStyle(item),
      });
    });
    console.log("Grid container dimensions:", {
      width: gridElement.offsetWidth,
      height: gridElement.offsetHeight,
      clientWidth: gridElement.clientWidth,
    });
  }, 500);

  // Save layout on change
  grid.on("change", function (event, items) {
    saveLayout(grid, pageId);
  });

  // Optional: Add a reset button for testing
  const resetBtn = document.getElementById("reset-layout-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (confirm("Reset layout to default?")) {
        localStorage.removeItem(`gridLayout_${pageId}`);
        window.location.reload();
      }
    });
  }
}

function normalizeGridStackAttributes(gridElement) {
  const allElements = gridElement.querySelectorAll(
    "*[data-gs-x], *[data-gs-y], *[data-gs-w], *[data-gs-h], *[data-gs-auto-position], *[data-gs-no-resize], *[data-gs-no-move], *[data-gs-locked], *[data-gs-id], *[data-gs-max-w], *[data-gs-min-w], *[data-gs-max-h], *[data-gs-min-h]",
  );

  allElements.forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-gs-")) {
        const normalizedName = attr.name.replace("data-", "");
        if (!element.hasAttribute(normalizedName)) {
          element.setAttribute(normalizedName, attr.value);
        }
      }
    });
  });

  if (
    gridElement.hasAttribute("data-gs-column") &&
    !gridElement.hasAttribute("gs-column")
  ) {
    gridElement.setAttribute(
      "gs-column",
      gridElement.getAttribute("data-gs-column"),
    );
  }
  if (
    gridElement.hasAttribute("data-gs-min-row") &&
    !gridElement.hasAttribute("gs-min-row")
  ) {
    gridElement.setAttribute(
      "gs-min-row",
      gridElement.getAttribute("data-gs-min-row"),
    );
  }
  if (
    gridElement.hasAttribute("data-gs-max-row") &&
    !gridElement.hasAttribute("gs-max-row")
  ) {
    gridElement.setAttribute(
      "gs-max-row",
      gridElement.getAttribute("data-gs-max-row"),
    );
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    // Wait a bit more to ensure everything including external scripts are loaded
    setTimeout(initGridStack, 300);
  });
} else {
  // DOM already loaded
  setTimeout(initGridStack, 300);
}

/**
 * Get a unique identifier for the current page
 */
function getPageId() {
  const path = window.location.pathname;
  const fileName = path.split("/").pop() || "index.html";
  return fileName.replace(".html", "");
}

/**
 * Save the current grid layout to localStorage
 */
function saveLayout(grid, pageId) {
  const items = grid.getGridItems();
  const layout = items.map((item) => {
    const node = item.gridstackNode;
    return {
      id: item.id,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
    };
  });

  const key = `gridLayout_${pageId}`;
  const versionKey = `gridLayoutVersion_${pageId}`;
  const currentVersion = "1";
  localStorage.setItem(key, JSON.stringify(layout));
  localStorage.setItem(versionKey, currentVersion);
  console.log(`Layout saved for ${pageId}`);
}

/**
 * Load a saved layout from localStorage
 */
function loadLayout(grid, pageId) {
  const key = `gridLayout_${pageId}`;
  const versionKey = `gridLayoutVersion_${pageId}`;
  const currentVersion = "1";
  const savedVersion = localStorage.getItem(versionKey);

  if (savedVersion !== currentVersion) {
    if (savedVersion !== null) {
      console.log(
        `Layout version changed for ${pageId}; clearing stale saved layout.`,
      );
    }
    localStorage.removeItem(key);
    localStorage.setItem(versionKey, currentVersion);
    return;
  }

  const savedLayout = localStorage.getItem(key);

  if (!savedLayout) {
    console.log(`No saved layout found for ${pageId}`);
    return;
  }

  try {
    const layout = JSON.parse(savedLayout);
    console.log("Loaded layout from localStorage:", layout);

    // Validate layout data
    let isValid = true;
    layout.forEach((item) => {
      if (item.x === undefined || item.y === undefined) {
        console.warn("Invalid layout item, missing coordinates:", item);
        isValid = false;
      }
    });

    if (!isValid) {
      console.log("Invalid layout detected, resetting");
      localStorage.removeItem(key);
      return;
    }

    layout.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        console.log(
          `Updating ${item.id} to position x=${item.x}, y=${item.y}, w=${item.w}, h=${item.h}`,
        );
        grid.update(element, {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }
    });

    console.log(`Layout loaded for ${pageId}`);
  } catch (error) {
    console.error("Error loading layout:", error);
    localStorage.removeItem(key);
  }
}

/**
 * Helper function to add a new grid item dynamically
 */
window.addGridItem = function (id, content, x = 0, y = null, w = 4, h = 3) {
  const grid = GridStack.getGridInstance();
  if (!grid) return;

  const element = document.createElement("div");
  element.id = id;
  element.className = "grid-stack-item";
  element.innerHTML = content;

  document.querySelector(".grid-stack").appendChild(element);
  grid.addWidget(element, { x, y, w, h });
};

/**
 * Helper function to remove a grid item
 */
window.removeGridItem = function (id) {
  const grid = GridStack.getGridInstance();
  if (!grid) return;

  const element = document.getElementById(id);
  if (element) {
    grid.removeWidget(element);
  }
};

/**
 * Helper function to lock/unlock items
 */
window.toggleLock = function (id) {
  const element = document.getElementById(id);
  if (element) {
    element.classList.toggle("locked");
    const grid = GridStack.getGridInstance();
    const node = element.gridstackNode;
    grid.update(element, { staticWidget: !node.staticWidget });
  }
};
