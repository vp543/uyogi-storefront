// Shop page controller — search, category filter, stock filter, sort, pagination.
(async function () {
  UI.initChrome("shop");

  const els = {
    filters: document.getElementById("filters"),
    catList: document.getElementById("cat-list"),
    stockChk: document.getElementById("stock-only"),
    grid: document.getElementById("shop-grid"),
    title: document.getElementById("shop-title"),
    count: document.getElementById("shop-count"),
    sort: document.getElementById("sort"),
    active: document.getElementById("active-filters"),
    pager: document.getElementById("pager"),
    toggle: document.getElementById("filter-toggle"),
    backdrop: document.getElementById("filter-backdrop"),
    searchInput: document.getElementById("shop-search-input"),
  };

  let data;
  try {
    data = await UYOGI.load();
    window.__data = data;
  } catch (e) {
    els.grid.innerHTML =
      `<div class="empty"><h3>Catalog unavailable</h3><p>Please email <a href="mailto:${UYOGI_CONFIG.company.email}">${UYOGI_CONFIG.company.email}</a>.</p></div>`;
    return;
  }
  if (window.Photos) await Photos.load();
  UI.bindAddButtons((id) => UYOGI.byId(data, id));

  const PAGE = UYOGI_CONFIG.pageSize || 24;
  const params = new URLSearchParams(location.search);
  const state = {
    category: params.get("category") || "",
    q: (params.get("q") || "").trim(),
    inStockOnly: params.get("stock") === "1",
    sort: params.get("sort") || "relevance",
    page: parseInt(params.get("page") || "1", 10),
  };

  if (els.searchInput) els.searchInput.value = state.q;
  if (els.stockChk) els.stockChk.checked = state.inStockOnly;
  if (els.sort) els.sort.value = state.sort;

  // ---- Build category filter list ----
  function renderCatList() {
    const rows = [
      `<button data-cat="" class="${state.category === "" ? "is-active" : ""}">All products <span class="n">${data.products.length}</span></button>`,
    ];
    for (const c of data.categories) {
      rows.push(
        `<button data-cat="${UI.esc(c)}" class="${state.category === c ? "is-active" : ""}">${UI.esc(c)} <span class="n">${data.categoryCounts[c] || 0}</span></button>`
      );
    }
    els.catList.innerHTML = rows.join("");
  }

  // ---- Filtering ----
  function currentList() {
    let list = data.products;
    if (state.category) list = list.filter((p) => p.category === state.category);
    if (state.inStockOnly) list = list.filter((p) => p.inStock);
    if (state.q) {
      const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((p) => {
        const hay = (p.name + " " + p.code + " " + p.category).toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    const s = state.sort;
    list = [...list];
    if (s === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (s === "stock") list.sort((a, b) => b.qty - a.qty);
    else list.sort((a, b) => Number(b.inStock) - Number(a.inStock)); // relevance: in-stock first
    return list;
  }

  function syncURL() {
    const p = new URLSearchParams();
    if (state.category) p.set("category", state.category);
    if (state.q) p.set("q", state.q);
    if (state.inStockOnly) p.set("stock", "1");
    if (state.sort !== "relevance") p.set("sort", state.sort);
    if (state.page > 1) p.set("page", state.page);
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  }

  function renderActive() {
    const pills = [];
    if (state.q) pills.push(pill(`“${state.q}”`, "q"));
    if (state.category) pills.push(pill(state.category, "category"));
    if (state.inStockOnly) pills.push(pill("In stock only", "stock"));
    els.active.innerHTML = pills.join("");
    els.active.style.display = pills.length ? "flex" : "none";
  }
  function pill(label, key) {
    return `<span class="pill">${UI.esc(label)}<button data-clear="${key}" aria-label="Remove filter">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button></span>`;
  }

  function render() {
    renderCatList();
    const list = currentList();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page > pages) state.page = pages;
    const slice = list.slice((state.page - 1) * PAGE, state.page * PAGE);

    els.title.textContent = state.q
      ? `Results for “${state.q}”`
      : state.category || "All products";
    els.count.textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;

    if (!list.length) {
      els.grid.innerHTML = `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <h3>No products match</h3><p>Try a different search or clear your filters.</p>
        <button class="btn btn--ghost" id="reset-all" style="margin-top:14px">Clear filters</button>
      </div>`;
      els.pager.innerHTML = "";
      renderActive();
      return;
    }

    els.grid.innerHTML = slice.map(UI.productCardHTML).join("");
    renderActive();
    renderPager(pages);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPager(pages) {
    if (pages <= 1) { els.pager.innerHTML = ""; return; }
    const cur = state.page;
    const nums = new Set([1, pages, cur, cur - 1, cur + 1]);
    const seq = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    let html = `<button data-page="${cur - 1}" ${cur === 1 ? "disabled" : ""}>Prev</button>`;
    let last = 0;
    for (const n of seq) {
      if (n - last > 1) html += `<span style="padding:0 4px;color:var(--steel)">…</span>`;
      html += `<button data-page="${n}" class="${n === cur ? "is-active" : ""}">${n}</button>`;
      last = n;
    }
    html += `<button data-page="${cur + 1}" ${cur === pages ? "disabled" : ""}>Next</button>`;
    els.pager.innerHTML = html;
  }

  // ---- Events ----
  els.catList.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cat]");
    if (!b) return;
    state.category = b.getAttribute("data-cat");
    state.page = 1;
    syncURL(); render(); closeFilters();
  });

  els.stockChk.addEventListener("change", () => {
    state.inStockOnly = els.stockChk.checked; state.page = 1; syncURL(); render();
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value; state.page = 1; syncURL(); render();
  });

  let searchTimer;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = els.searchInput.value.trim(); state.page = 1; syncURL(); render();
    }, 220);
  });
  document.getElementById("shop-search-form").addEventListener("submit", (e) => e.preventDefault());

  els.active.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-clear]");
    if (!b) return;
    const k = b.getAttribute("data-clear");
    if (k === "q") { state.q = ""; els.searchInput.value = ""; }
    if (k === "category") state.category = "";
    if (k === "stock") { state.inStockOnly = false; els.stockChk.checked = false; }
    state.page = 1; syncURL(); render();
  });

  els.pager.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b || b.disabled) return;
    state.page = parseInt(b.getAttribute("data-page"), 10);
    syncURL(); render();
  });

  els.grid.addEventListener("click", (e) => {
    if (e.target.id === "reset-all") {
      state.q = ""; state.category = ""; state.inStockOnly = false;
      els.searchInput.value = ""; els.stockChk.checked = false;
      state.page = 1; syncURL(); render();
    }
  });

  // Mobile filter drawer.
  function openFilters() { els.filters.classList.add("is-open"); els.backdrop.classList.add("is-open"); }
  function closeFilters() { els.filters.classList.remove("is-open"); els.backdrop.classList.remove("is-open"); }
  els.toggle.addEventListener("click", openFilters);
  els.backdrop.addEventListener("click", closeFilters);

  render();
})();
