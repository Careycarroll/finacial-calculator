// ===================================================================
// NEWS FEED — RSS READER
// ===================================================================

const CORS_PROXIES = [
  { url: "https://corsproxy.io/?url=", encode: true },
  { url: "https://api.allorigins.win/raw?url=", encode: true },
];
let currentProxyIndex = 0;

const STORAGE_KEY = "newsfeed_feeds";
const READ_KEY = "newsfeed_read";
const BOOKMARK_KEY = "newsfeed_bookmarks";
const CACHE_KEY = "newsfeed_cache";
const CACHE_TIME_KEY = "newsfeed_cache_time";
const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

let allFeeds = [];
const FAILED_KEY = "newsfeed_failed";
const FAILED_MAX_AGE = 24 * 60 * 60 * 1000; // Remember failures for 24h
let allArticles = [];
let displayedCount = 0;
const ARTICLES_PER_PAGE = 30;
let activeCategory = "all";
let activeHoursFilter = 24;
let isFetching = false;
let cancelRequested = false;
let fetchController = null;
let searchQuery = "";
let searchDebounceTimer = null;

// ===================================================================
// INITIALIZATION
// ===================================================================

function init() {
  allFeeds = loadFeeds();

  // Event listeners
  document.getElementById("news-refresh-btn").addEventListener("click", () => {
    // Clear cache and fetch fresh
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
    refreshFeeds();
  });
  document
    .getElementById("news-opml-input")
    .addEventListener("change", handleOPMLImport);
  document
    .getElementById("news-empty-import-btn")
    .addEventListener("click", () => {
      document.getElementById("news-opml-input").click();
    });
  document.getElementById("news-import-btn").addEventListener("click", () => {
      document.getElementById("news-opml-input").click();
    });
  document
    .getElementById("news-empty-demo-btn")
    .addEventListener("click", loadDemoFeeds);
  document
    .getElementById("news-manage-btn")
    .addEventListener("click", openManager);
  document
    .getElementById("news-manager-close")
    .addEventListener("click", closeManager);
  document
    .getElementById("news-manager-overlay")
    .addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeManager();
    });
  document
    .getElementById("news-add-btn")
    .addEventListener("click", handleAddFeed);
  document
    .getElementById("news-export-btn")
    .addEventListener("click", exportOPML);
  document
    .getElementById("news-clear-btn")
    .addEventListener("click", clearAllFeeds);
  document
    .getElementById("news-load-more-btn")
    .addEventListener("click", showMoreArticles);
  // Filter toggle
  document
    .getElementById("news-filter-toggle")
    .addEventListener("click", toggleFilterPanel);

  // Keyboard shortcut to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeManager();
  });


  document
    .getElementById("news-cancel-btn")
    .addEventListener("click", cancelFetch);

  document.getElementById("news-export-bookmarks-json").addEventListener("click", exportBookmarksJSON);
  document.getElementById("news-export-bookmarks-csv").addEventListener("click", exportBookmarksCSV);
  // Search
  document
    .getElementById("news-search")
    .addEventListener("input", handleSearch);
  document
    .getElementById("news-search-clear")
    .addEventListener("click", clearSearch);

  // Delegated article listeners (one listener instead of 3 per article)
  document.getElementById("news-articles").addEventListener("click", (e) => {
    const article = e.target.closest(".news-article");
    if (!article) return;
    const articleId = article.dataset.articleId;
    const articleData = allArticles.find((a) => a.id === articleId);
    if (!articleData) return;

    if (e.target.closest(".bookmark-btn")) {
      e.stopPropagation();
      const nowBookmarked = toggleBookmark(articleId);
      const btn = article.querySelector(".bookmark-btn");
      btn.classList.toggle("bookmarked", nowBookmarked);
      btn.textContent = nowBookmarked ? "★" : "☆";
      return;
    }

    if (e.target.closest(".open-btn")) {
      e.stopPropagation();
      markAsRead(articleId);
      article.classList.add("read");
      window.open(articleData.link, "_blank");
      return;
    }

    if (e.target.closest(".news-article-body")) {
      markAsRead(articleId);
      article.classList.add("read");
      window.open(articleData.link, "_blank");
    }
  });

  if (allFeeds.length > 0) {
    document.getElementById("news-empty").classList.add("hidden");
    renderCategoryBar();
    loadFromCache();
  }
}

// ===================================================================
// STORAGE
// ===================================================================


function getFailedFeeds() {
  try {
    const data = JSON.parse(localStorage.getItem(FAILED_KEY)) || {};
    const now = Date.now();
    // Prune expired entries
    Object.keys(data).forEach(url => {
      if (now - data[url] > FAILED_MAX_AGE) delete data[url];
    });
    localStorage.setItem(FAILED_KEY, JSON.stringify(data));
    return data;
  } catch { return {}; }
}

function markFeedFailed(xmlUrl) {
  const data = getFailedFeeds();
  data[xmlUrl] = Date.now();
  localStorage.setItem(FAILED_KEY, JSON.stringify(data));
}

function clearFailedFeeds() {
  localStorage.removeItem(FAILED_KEY);
}
function loadFeeds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFeeds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allFeeds));
}

function getReadArticles() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY)) || [];
  } catch {
    return [];
  }
}

function markAsRead(articleId) {
  const read = getReadArticles();
  if (!read.includes(articleId)) {
    read.push(articleId);
    // Keep only last 1000
    if (read.length > 1000) read.splice(0, read.length - 1000);
    localStorage.setItem(READ_KEY, JSON.stringify(read));
  }
}

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || [];
  } catch {
    return [];
  }
}

function toggleBookmark(articleId) {
  let bookmarks = getBookmarks();
  if (bookmarks.includes(articleId)) {
    bookmarks = bookmarks.filter((b) => b !== articleId);
  } else {
    bookmarks.push(articleId);
  }
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
  return bookmarks.includes(articleId);
}
// ===================================================================
// CACHE
// ===================================================================

function saveToCache() {
  try {
    // Only cache essential fields to save space
    const slim = allArticles.map((a) => ({
      id: a.id,
      title: a.title,
      link: a.link,
      description: a.description,
      date: a.date.getTime(),
      source: a.source,
      category: a.category,
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch (e) {
    // localStorage full — clear old cache and try once more
    console.warn("Cache save failed, clearing old cache:", e.message);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
  }
}

function loadFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cacheTime = parseInt(localStorage.getItem(CACHE_TIME_KEY) || "0");
    const age = Date.now() - cacheTime;

    if (cached && cacheTime) {
      const parsed = JSON.parse(cached);
      allArticles = parsed.map((a) => ({ ...a, date: new Date(a.date) }));

      allArticles.sort((a, b) => b.date - a.date);
      displayedCount = 0;
      showMoreArticles();
      document.getElementById("news-articles").classList.remove("hidden");

      // Show cache age
      const minsAgo = Math.floor(age / 60000);
      const hoursAgo = Math.floor(age / 3600000);
      let ageText = "";
      if (minsAgo < 60) {
        ageText = `${minsAgo}m ago`;
      } else {
        ageText = `${hoursAgo}h ago`;
      }
      document.getElementById("news-last-updated").textContent =
        `Cached from ${ageText}`;

      // If cache is stale, auto-refresh
      if (age > CACHE_MAX_AGE) {
        document.getElementById("news-last-updated").textContent =
          `Cache is ${ageText} old — refreshing...`;
        refreshFeeds();
      }

      return;
    }
  } catch (e) {
    console.warn("Cache load failed:", e.message);
  }

  // No cache — fetch fresh
  refreshFeeds();
}

function getCacheAge() {
  const cacheTime = parseInt(localStorage.getItem(CACHE_TIME_KEY) || "0");
  return Date.now() - cacheTime;
}

// ===================================================================
// CANCEL
// ===================================================================

function cancelFetch() {
  cancelRequested = true;
  if (fetchController) fetchController.abort();
  fetchController = null;
  isFetching = false;
  document.getElementById("news-loading").classList.add("hidden");
  const now = new Date();
  document.getElementById("news-last-updated").textContent =
    "Stopped — " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
// ===================================================================
// SEARCH
// ===================================================================

function handleSearch(e) {
  const query = e.target.value.trim();
  const clearBtn = document.getElementById("news-search-clear");

  if (query.length > 0) {
    clearBtn.classList.remove("hidden");
  } else {
    clearBtn.classList.add("hidden");
  }

  // Debounce — wait 250ms after typing stops
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchQuery = query.toLowerCase();
    displayedCount = 0;
    showMoreArticles();
    updateActiveFilterTags();
  }, 250);
}

function clearSearch() {
  document.getElementById("news-search").value = "";
  document.getElementById("news-search-clear").classList.add("hidden");
  searchQuery = "";
  displayedCount = 0;
  showMoreArticles();
  updateActiveFilterTags();
}
// ===================================================================
// OPML PARSING
// ===================================================================

function parseOPML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const feeds = [];

  // Find category groups (outlines with child outlines)
  const topOutlines = doc.querySelectorAll("body > outline");

  topOutlines.forEach((group) => {
    const category =
      group.getAttribute("text") ||
      group.getAttribute("title") ||
      "Uncategorized";

    const children = group.querySelectorAll(":scope > outline");

    if (children.length === 0 && group.getAttribute("xmlUrl")) {
      // Single feed, no category wrapper
      feeds.push({
        name:
          group.getAttribute("text") ||
          group.getAttribute("title") ||
          "Unknown",
        xmlUrl: group.getAttribute("xmlUrl"),
        htmlUrl: group.getAttribute("htmlUrl") || "",
        category: "Uncategorized",
      });
    } else {
      children.forEach((child) => {
        const xmlUrl = child.getAttribute("xmlUrl");
        if (xmlUrl) {
          feeds.push({
            name:
              child.getAttribute("text") ||
              child.getAttribute("title") ||
              "Unknown",
            xmlUrl: xmlUrl,
            htmlUrl: child.getAttribute("htmlUrl") || "",
            category: category,
          });
        }
      });
    }
  });

  return feeds;
}

function handleOPMLImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const feeds = parseOPML(event.target.result);

    if (feeds.length === 0) {
      alert("No feeds found in the OPML file. Please check the format.");
      return;
    }

    // Merge with existing (avoid duplicates by xmlUrl)
    const existingUrls = new Set(allFeeds.map((f) => f.xmlUrl));
    let newCount = 0;

    feeds.forEach((feed) => {
      if (!existingUrls.has(feed.xmlUrl)) {
        allFeeds.push(feed);
        existingUrls.add(feed.xmlUrl);
        newCount++;
      }
    });

    saveFeeds();
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);

    document.getElementById("news-empty").classList.add("hidden");
    renderCategoryBar();
    refreshFeeds();

    alert(
      `Imported ${newCount} new feed${newCount !== 1 ? "s" : ""} (${feeds.length - newCount} duplicates skipped).`,
    );
  };

  reader.readAsText(file);
  // Reset input so same file can be imported again
  e.target.value = "";
}

// ===================================================================
// FEED FETCHING
// ===================================================================

async function refreshFeeds() {
  if (allFeeds.length === 0) return;
  if (isFetching) return;

  isFetching = true;
  const refreshStart = performance.now();
  fetchController = new AbortController();
  cancelRequested = false;

  const loading = document.getElementById("news-loading");
  const articlesEl = document.getElementById("news-articles");
  const progress = document.getElementById("news-loading-progress");

  loading.classList.remove("hidden");
  articlesEl.classList.remove("hidden");
  articlesEl.innerHTML = "";
  document.getElementById("news-load-more").classList.add("hidden");

  allArticles = [];
  displayedCount = 0;
  let completed = 0;
  let failed = 0;

  // Rotate proxy for each refresh to spread load
  currentProxyIndex = (currentProxyIndex + 1) % CORS_PROXIES.length;

  const concurrency = 10;
  const queue = [...allFeeds];

  let lastRenderTime = 0;
  const RENDER_THROTTLE = 1000;
  function renderCurrentArticles() {
    allArticles.sort((a, b) => b.date - a.date);

    const filtered = getFilteredArticles();
    const readArticles = getReadArticles();
    const bookmarks = getBookmarks();

    articlesEl.innerHTML = "";
    const toShow = filtered.slice(
      0,
      Math.max(displayedCount, ARTICLES_PER_PAGE),
    );
    displayedCount = toShow.length;

    toShow.forEach((article) => {
      const isRead = readArticles.includes(article.id);
      const isBookmarked = bookmarks.includes(article.id);
      const el = createArticleElement(article, isRead, isBookmarked);
      articlesEl.appendChild(el);
    });

    const loadMore = document.getElementById("news-load-more");
    if (displayedCount < filtered.length) {
      loadMore.classList.remove("hidden");
      document.getElementById("news-load-more-btn").textContent =
        `Load More (${filtered.length - displayedCount} remaining)`;
    } else {
      loadMore.classList.add("hidden");
    }

    updateArticleCount(filtered.length);
  }

  async function fetchNext() {
    if (queue.length === 0) return;
    if (cancelRequested) return;

    // Small delay to avoid rate limiting
    if (completed > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (cancelRequested) return;
    if (queue.length === 0) return;

    const feed = queue.shift();
    const failedFeeds = getFailedFeeds();
    if (failedFeeds[feed.xmlUrl]) {
      completed++;
      progress.textContent = `${completed} of ${allFeeds.length} feeds loaded${failed > 0 ? ` (${failed} failed)` : ""}`;
      if (queue.length > 0 && !cancelRequested) await fetchNext();
      return;
    }
    try {
      const articles = await fetchFeed(feed);
      allArticles.push(...articles);
      const now = Date.now();
      if (now - lastRenderTime > RENDER_THROTTLE) {
        lastRenderTime = now;
        renderCurrentArticles();
      }
    } catch (err) {
      failed++;
      console.warn(`Failed to fetch ${feed.name}:`, err.message);
      markFeedFailed(feed.xmlUrl);
    }

    completed++;
    const remaining = queue.length;
    progress.textContent = `${completed} of ${allFeeds.length} feeds loaded${failed > 0 ? ` (${failed} failed)` : ""}`;

    if (queue.length > 0 && !cancelRequested) {
      await fetchNext();
    }
  }

  // Start concurrent fetches
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(fetchNext());
  }

  await Promise.all(workers);

  // Final render
  if (allArticles.length > 0) {
    allArticles.sort((a, b) => b.date - a.date);
    displayedCount = 0;
    showMoreArticles();

    // Save to cache
    saveToCache();
  }

  // Hide loading
  loading.classList.add("hidden");
  isFetching = false;
  fetchController = null;
  // Update last refreshed time
  const now = new Date();

  if (cancelRequested) {
    document.getElementById("news-last-updated").textContent =
      `Stopped at ${completed} of ${allFeeds.length} feeds — ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    document.getElementById("news-last-updated").textContent =
      `Last updated: ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${((performance.now() - refreshStart) / 1000).toFixed(1)}s`;
  }

  if (allArticles.length === 0 && failed > 0) {
    articlesEl.innerHTML = `
      <div class="news-empty" style="padding: 2rem;">
        <p>⚠️ All ${failed} feeds failed to load. The CORS proxies may be rate-limited.</p>
        <p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
          Wait 30 seconds and try again — the proxies allow ~20-60 requests per minute.
          With ${allFeeds.length} feeds, it may take 2-3 refreshes to warm up.
        </p>
      </div>
    `;
  } else if (failed > 0) {
    const note = document.createElement("div");
    note.style.cssText =
      "text-align: center; padding: 1rem; font-size: 0.8rem; color: var(--text-secondary);";
    note.textContent = `⚠️ ${failed} of ${allFeeds.length} feeds failed to load. These may not support CORS proxying.`;
    articlesEl.appendChild(note);
  }

  cancelRequested = false;
}

async function fetchFeed(feed) {
  let lastError = null;

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    if (cancelRequested) throw new Error("Cancelled");

    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
    const proxy = CORS_PROXIES[proxyIndex];

    try {
      const url =
        proxy.url +
        (proxy.encode ? encodeURIComponent(feed.xmlUrl) : feed.xmlUrl);

      const response = await fetch(url, {
        signal: AbortSignal.any([fetchController.signal, AbortSignal.timeout(3000)]),
      });

      // If rate limited, try next proxy immediately
      if (response.status === 429) {
        throw new Error("Rate limited (429)");
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();

      // Validate we got XML, not an error page
      if (
        !text.includes("<") ||
        (text.includes("<!DOCTYPE html>") &&
          !text.includes("<rss") &&
          !text.includes("<feed") &&
          !text.includes("<channel"))
      ) {
        throw new Error("Response is not RSS/Atom XML");
      }

      // If this proxy worked, prefer it for future requests
      currentProxyIndex = proxyIndex;

      return parseFeed(text, feed);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("All proxies failed");
}

function parseFeed(xmlString, feed) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const articles = [];

  // Try RSS format first
  const items = doc.querySelectorAll("item");

  if (items.length > 0) {
    items.forEach((item) => {
      const title = getTextContent(item, "title");
      const link = getTextContent(item, "link");
      const description = cleanDescription(
        getTextContent(item, "description") ||
          getTextContent(item, "content\\:encoded"),
      );
      const pubDate = getTextContent(item, "pubDate");
      const date = pubDate ? new Date(pubDate) : new Date();

      if (title && link) {
        articles.push({
          id: hashString(link + title),
          title: title.trim(),
          link: link.trim(),
          description: description,
          date: date,
          source: feed.name,
          category: feed.category,
          htmlUrl: feed.htmlUrl,
        });
      }
    });
  } else {
    // Try Atom format
    const entries = doc.querySelectorAll("entry");
    entries.forEach((entry) => {
      const title = getTextContent(entry, "title");
      const linkEl = entry.querySelector("link[href]");
      const link = linkEl ? linkEl.getAttribute("href") : "";
      const description = cleanDescription(
        getTextContent(entry, "summary") || getTextContent(entry, "content"),
      );
      const published =
        getTextContent(entry, "published") || getTextContent(entry, "updated");
      const date = published ? new Date(published) : new Date();

      if (title && link) {
        articles.push({
          id: hashString(link + title),
          title: title.trim(),
          link: link.trim(),
          description: description,
          date: date,
          source: feed.name,
          category: feed.category,
          htmlUrl: feed.htmlUrl,
        });
      }
    });
  }

  return articles;
}

function getTextContent(parent, tagName) {
  const el = parent.querySelector(tagName);
  return el ? el.textContent : "";
}

function cleanDescription(html) {
  if (!html) return "";
  // Strip HTML tags
  const div = document.createElement("div");
  div.innerHTML = html;
  let text = div.textContent || div.innerText || "";
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Truncate
  if (text.length > 300) {
    text = text.substring(0, 300) + "…";
  }
  return text;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return "art_" + Math.abs(hash).toString(36);
}

// ===================================================================
// RENDERING
// ===================================================================

function showMoreArticles() {
  const container = document.getElementById("news-articles");
  const filtered = getFilteredArticles();
  const readArticles = getReadArticles();
  const bookmarks = getBookmarks();

  const nextBatch = filtered.slice(
    displayedCount,
    displayedCount + ARTICLES_PER_PAGE,
  );

  if (displayedCount === 0) {
    container.innerHTML = "";
  }

  nextBatch.forEach((article) => {
    const isRead = readArticles.includes(article.id);
    const isBookmarked = bookmarks.includes(article.id);
    const el = createArticleElement(article, isRead, isBookmarked);
    container.appendChild(el);
  });

  displayedCount += nextBatch.length;

  // Show/hide load more
  const loadMore = document.getElementById("news-load-more");
  if (displayedCount < filtered.length) {
    loadMore.classList.remove("hidden");
    document.getElementById("news-load-more-btn").textContent =
      `Load More (${filtered.length - displayedCount} remaining)`;
    updateArticleCount(filtered.length);
  } else {
    loadMore.classList.add("hidden");
  }
  updateArticleCount(filtered.length);
  if (filtered.length === 0) {
    const hasDateFilter = activeHoursFilter > 0;
    const hasCategoryFilter = activeCategory !== "all";
    let hint = "";
    if (hasDateFilter && hasCategoryFilter) {
      hint =
        " in this category and time range. Try expanding the date filter or selecting 'All'.";
    } else if (hasDateFilter) {
      hint = " in this time range. Try selecting a longer date range.";
    } else if (hasCategoryFilter) {
      hint = " in this category. Try selecting 'All'.";
    } else {
      hint = ". Try refreshing.";
    }

    container.innerHTML = `
      <div class="news-empty" style="padding: 2rem;">
        <p>No articles found${hint}</p>
      </div>
    `;
  }
}

function getFilteredArticles() {
  let filtered = allArticles;

  // Category filter
  if (activeCategory !== "all") {
    filtered = filtered.filter((a) => a.category === activeCategory);
  }

  // Date filter
  if (activeHoursFilter > 0) {
    const cutoff = new Date(Date.now() - activeHoursFilter * 60 * 60 * 1000);
    filtered = filtered.filter((a) => a.date >= cutoff);
  }

  // Search filter
  if (searchQuery) {
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(searchQuery) ||
        a.source.toLowerCase().includes(searchQuery) ||
        (a.description && a.description.toLowerCase().includes(searchQuery)),
    );
  }

  return filtered;
}

function createArticleElement(article, isRead, isBookmarked) {
  const el = document.createElement("div");
  el.className = `news-article${isRead ? " read" : ""}`;
  el.dataset.articleId = article.id;

  const timeAgo = getTimeAgo(article.date);

  el.innerHTML = `
    <div class="news-article-body">
      <div class="news-article-meta">
        <span class="news-article-source">${escapeHtml(article.source)}</span>
        <span class="news-article-category">${escapeHtml(simplifyCategory(article.category))}</span>
        <span class="news-article-date">${timeAgo}</span>
      </div>
      <div class="news-article-title">${escapeHtml(article.title)}</div>
      ${article.description ? `<div class="news-article-description">${escapeHtml(article.description)}</div>` : ""}
    </div>
    <div class="news-article-actions">
      <button class="news-article-action bookmark-btn ${isBookmarked ? "bookmarked" : ""}" title="Bookmark">
        ${isBookmarked ? "★" : "☆"}
      </button>
      <button class="news-article-action open-btn" title="Open in new tab">↗</button>
    </div>
  `;

  return el;
}
function simplifyCategory(category) {
  // Remove "BIZ - " prefix for cleaner display
  return category.replace(/^BIZ\s*-\s*/i, "");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ===================================================================
// CATEGORY BAR
// ===================================================================
function toggleFilterPanel() {
  const panel = document.getElementById("news-filter-panel");
  const btn = document.getElementById("news-filter-toggle");

  panel.classList.toggle("hidden");

  if (panel.classList.contains("hidden")) {
    btn.textContent = "🔽 Filters";
    btn.classList.remove("open");
  } else {
    btn.textContent = "🔼 Filters";
    btn.classList.add("open");
  }
}

function updateActiveFilterTags() {
  const container = document.getElementById("news-active-filters");
  const tags = [];

  if (activeCategory !== "all") {
    tags.push(simplifyCategory(activeCategory));
  }

  const dateLabels = {
    24: "Last 24h",
    72: "Last 3 Days",
    168: "Last 7 Days",
    720: "Last 30 Days",
    0: "All Time",
  };

  if (activeHoursFilter !== 24) {
    tags.push(dateLabels[activeHoursFilter] || `${activeHoursFilter}h`);
  }

  if (searchQuery) {
    tags.push(`"${searchQuery}"`);
  }

  if (tags.length === 0) {
    container.innerHTML = "";
  } else {
    container.innerHTML = tags
      .map(
        (t) => `<span class="news-active-filter-tag">${escapeHtml(t)}</span>`,
      )
      .join("");
  }
}

function renderCategoryBar() {
  const bar = document.getElementById("news-category-bar");

  const categories = [...new Set(allFeeds.map((f) => f.category))].sort();

  bar.innerHTML = `
    <button class="news-category-btn ${activeCategory === "all" ? "active" : ""}" data-category="all">All</button>
    ${categories
      .map(
        (cat) => `
      <button class="news-category-btn ${activeCategory === cat ? "active" : ""}" data-category="${escapeHtml(cat)}">
        ${escapeHtml(simplifyCategory(cat))}
      </button>
    `,
      )
      .join("")}
  `;

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".news-category-btn");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    bar
      .querySelectorAll(".news-category-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    displayedCount = 0;
    showMoreArticles();
    document.getElementById("news-articles").classList.remove("hidden");
    updateActiveFilterTags();
  });

  renderDateBar();
  updateActiveFilterTags();
}

function renderDateBar() {
  const bar = document.getElementById("news-date-bar");

  bar.querySelectorAll(".news-date-btn").forEach((btn) => {
    const hours = parseInt(btn.dataset.hours);
    btn.classList.toggle("active", hours === activeHoursFilter);

    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      activeHoursFilter = parseInt(newBtn.dataset.hours);
      bar
        .querySelectorAll(".news-date-btn")
        .forEach((b) => b.classList.remove("active"));
      newBtn.classList.add("active");
      displayedCount = 0;
      showMoreArticles();
      updateActiveFilterTags();
    });
  });
}

function updateArticleCount(count) {
  const el = document.getElementById("news-article-count");
  if (!el) return;

  const total = allArticles.length;
  if (activeHoursFilter > 0 || activeCategory !== "all") {
    el.textContent = `${count} of ${total} articles`;
  } else {
    el.textContent = `${total} articles`;
  }
}

// ===================================================================
// FEED MANAGER
// ===================================================================

function openManager() {
  document.getElementById("news-manager-overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderFeedList();
  renderCategoryDropdown();
}

function closeManager() {
  document.getElementById("news-manager-overlay").classList.add("hidden");
  document.body.style.overflow = "";
}

function renderFeedList() {
  const container = document.getElementById("news-feed-list");

  if (allFeeds.length === 0) {
    container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No feeds configured.</p>`;
    return;
  }

  // Group by category
  const groups = {};
  allFeeds.forEach((feed, index) => {
    if (!groups[feed.category]) groups[feed.category] = [];
    groups[feed.category].push({ ...feed, index });
  });

  container.innerHTML = Object.keys(groups)
    .sort()
    .map(
      (category) => `
    <div class="news-feed-category-group">
      <div class="news-feed-category-header">${escapeHtml(simplifyCategory(category))} (${groups[category].length})</div>
      ${groups[category]
        .map(
          (feed) => `
        <div class="news-feed-item" data-index="${feed.index}">
          <div class="news-feed-item-info">
            <span class="news-feed-item-name">${escapeHtml(feed.name)}</span>
            <span class="news-feed-item-url">${escapeHtml(feed.xmlUrl)}</span>
          </div>
          <div class="news-feed-item-actions">
            <button class="news-feed-item-remove" data-index="${feed.index}">Remove</button>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `,
    )
    .join("");

  // Remove buttons
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".news-feed-item-remove");
    if (!btn) return;
    const index = parseInt(btn.dataset.index);
    const feed = allFeeds[index];
    if (confirm(`Remove "${feed.name}"?`)) {
      allFeeds.splice(index, 1);
      saveFeeds();
      renderFeedList();
      renderCategoryBar();
      renderCategoryDropdown();
    }
  });
}

function renderCategoryDropdown() {
  const select = document.getElementById("news-add-category");
  const categories = [...new Set(allFeeds.map((f) => f.category))].sort();

  select.innerHTML = `
    <option value="">Select category...</option>
    ${categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(simplifyCategory(cat))}</option>`).join("")}
  `;
}

function handleAddFeed() {
  const name = document.getElementById("news-add-name").value.trim();
  const url = document.getElementById("news-add-url").value.trim();
  const existingCategory = document.getElementById("news-add-category").value;
  const newCategory = document
    .getElementById("news-add-new-category")
    .value.trim();

  if (!name) {
    alert("Please enter a feed name.");
    return;
  }

  if (!url) {
    alert("Please enter a feed URL.");
    return;
  }

  const category = newCategory || existingCategory || "Uncategorized";

  // Check for duplicate
  if (allFeeds.some((f) => f.xmlUrl === url)) {
    alert("This feed URL already exists.");
    return;
  }

  allFeeds.push({
    name,
    xmlUrl: url,
    htmlUrl: "",
    category,
  });

  saveFeeds();

  // Clear inputs
  document.getElementById("news-add-name").value = "";
  document.getElementById("news-add-url").value = "";
  document.getElementById("news-add-new-category").value = "";

  renderFeedList();
  renderCategoryBar();
  renderCategoryDropdown();

  document.getElementById("news-empty").classList.add("hidden");
}

// ===================================================================
// EXPORT OPML
// ===================================================================

function exportOPML() {
  const groups = {};
  allFeeds.forEach((feed) => {
    if (!groups[feed.category]) groups[feed.category] = [];
    groups[feed.category].push(feed);
  });

  let opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="1.0">\n  <head>\n    <title>Exported Feeds</title>\n  </head>\n  <body>\n`;

  Object.keys(groups)
    .sort()
    .forEach((category) => {
      opml += `\n    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`;
      groups[category].forEach((feed) => {
        opml += `      <outline type="rss" text="${escapeXml(feed.name)}" title="${escapeXml(feed.name)}" xmlUrl="${escapeXml(feed.xmlUrl)}" htmlUrl="${escapeXml(feed.htmlUrl)}"/>\n`;
      });
      opml += `    </outline>\n`;
    });

  opml += `\n  </body>\n</opml>`;

  const blob = new Blob([opml], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "feeds.opml";
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ===================================================================
// CLEAR ALL
// ===================================================================

function clearAllFeeds() {
  if (!confirm("Remove all feeds? This cannot be undone.")) return;

  allFeeds = [];
  allArticles = [];
  displayedCount = 0;
  saveFeeds();

  document.getElementById("news-articles").innerHTML = "";
  document.getElementById("news-articles").classList.add("hidden");
  document.getElementById("news-category-bar").classList.add("hidden");
  document.getElementById("news-load-more").classList.add("hidden");
  document.getElementById("news-empty").classList.remove("hidden");
  document.getElementById("news-last-updated").textContent = "";

  renderFeedList();
  closeManager();
}

// ===================================================================
// DEMO FEEDS
// ===================================================================

function loadDemoFeeds() {
  allFeeds = [
    {
      name: "MarketWatch",
      xmlUrl: "https://www.marketwatch.com/rss/topstories",
      htmlUrl: "https://marketwatch.com",
      category: "Financial News",
    },
    {
      name: "CNBC",
      xmlUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
      htmlUrl: "https://cnbc.com",
      category: "Financial News",
    },
    {
      name: "NPR Business",
      xmlUrl: "https://feeds.npr.org/1006/rss.xml",
      htmlUrl: "https://npr.org",
      category: "General Business",
    },
    {
      name: "TechCrunch",
      xmlUrl: "https://techcrunch.com/feed",
      htmlUrl: "https://techcrunch.com",
      category: "Startups",
    },
    {
      name: "Harvard Business Review",
      xmlUrl: "https://hbr.org/rss",
      htmlUrl: "https://hbr.org",
      category: "Management",
    },
  ];

  saveFeeds();
  document.getElementById("news-empty").classList.add("hidden");
  renderCategoryBar();
  refreshFeeds();
}

// ===================================================================
// START
// ===================================================================

// ===================================================================
// EXPORT BOOKMARKS
// ===================================================================

function getBookmarkedArticles() {
  const bookmarks = getBookmarks();
  return allArticles.filter(a => bookmarks.includes(a.id)).map(a => ({
    title: a.title,
    source: a.source,
    category: a.category,
    date: a.date.toISOString(),
    link: a.link,
    description: a.description || ""
  }));
}

function exportBookmarksJSON() {
  const articles = getBookmarkedArticles();
  if (articles.length === 0) {
    alert("No bookmarked articles to export.");
    return;
  }
  const data = {
    exported: new Date().toISOString(),
    count: articles.length,
    articles: articles
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bookmarks_" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportBookmarksCSV() {
  const articles = getBookmarkedArticles();
  if (articles.length === 0) {
    alert("No bookmarked articles to export.");
    return;
  }
  const header = "Title,Source,Category,Date,Link";
  const rows = articles.map(a => {
    const esc = (s) => String.fromCharCode(34) + s.replace(/"/g, String.fromCharCode(34,34)) + String.fromCharCode(34);
    return [esc(a.title), esc(a.source), esc(a.category), esc(a.date), esc(a.link)].join(",");
  });
  const csv = [header,...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bookmarks_" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
init();
