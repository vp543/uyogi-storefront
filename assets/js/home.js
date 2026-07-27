// Home page controller.
(async function () {
  UI.initChrome("home");
  UI.bindAddButtons((id) => window.__data && UYOGI.byId(window.__data, id));

  let data;
  try {
    data = await UYOGI.load();
    window.__data = data;
  } catch (e) {
    document.getElementById("home-featured").innerHTML =
      `<div class="empty"><h3>Catalog unavailable</h3><p>Please email <a href="mailto:${UYOGI_CONFIG.company.email}">${UYOGI_CONFIG.company.email}</a> and we'll help you right away.</p></div>`;
    return;
  }
  if (window.Photos) await Photos.load();

  // Per-category totals + in-stock counts.
  const inStockByCat = {};
  let inStockTotal = 0;
  for (const p of data.products) {
    if (p.inStock) { inStockByCat[p.category] = (inStockByCat[p.category] || 0) + 1; inStockTotal++; }
  }

  // Honest hero facts.
  const total = data.products.length;
  document.getElementById("stat-products").textContent = total.toLocaleString();
  document.getElementById("stat-instock").textContent = inStockTotal.toLocaleString();
  document.getElementById("stat-cats").textContent = data.categories.length;

  // Signature: live stock board — busiest departments, sorted by in-stock depth.
  const ranked = [...data.categories].sort(
    (a, b) => (data.categoryCounts[b] || 0) - (data.categoryCounts[a] || 0)
  );
  const board = ranked.slice(0, 8);
  document.getElementById("stockboard-count").textContent = data.categories.length + " departments";
  document.getElementById("stockboard-rows").innerHTML = board
    .map((c) => UI.deptRowHTML(c, data.categoryCounts[c] || 0, inStockByCat[c] || 0))
    .join("");

  // Full department index (all departments, alphabetical for scanning).
  const kicker = document.getElementById("dept-kicker");
  if (kicker) kicker.textContent = data.categories.length + " departments";
  const alpha = [...data.categories].sort((a, b) => a.localeCompare(b));
  document.getElementById("dept-index").innerHTML = alpha
    .map((c) => UI.categoryTileHTML(c, data.categoryCounts[c] || 0))
    .join("");

  // Featured — in-stock, spread across categories for variety.
  const byCat = {};
  for (const p of data.products) {
    if (!p.inStock) continue;
    (byCat[p.category] = byCat[p.category] || []).push(p);
  }
  const featured = [];
  const cats = Object.keys(byCat);
  let i = 0;
  while (featured.length < 12 && cats.some((c) => byCat[c].length)) {
    const c = cats[i % cats.length];
    if (byCat[c].length) featured.push(byCat[c].shift());
    i++;
  }
  document.getElementById("home-featured").innerHTML =
    featured.map(UI.productCardHTML).join("");
})();
