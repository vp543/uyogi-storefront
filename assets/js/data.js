// Loads and caches the catalog (products.json), and exposes helpers.
window.UYOGI = (function () {
  let cache = null;

  async function load() {
    if (cache) return cache;
    const res = await fetch("data/products.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("catalog fetch failed: " + res.status);
    cache = await res.json();
    // Precompute per-category counts.
    const counts = {};
    for (const p of cache.products) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    cache.categoryCounts = counts;
    return cache;
  }

  function byId(data, id) {
    return data.products.find((p) => p.id === id) || null;
  }

  // Location key -> label for display.
  const LOCATION_LABELS = {
    shop: "Main Shop",
    shopGodown: "Shop Store",
    muhima: "Muhima",
    anik: "Anik",
    kimihurura: "Kimihurura",
    rwamagana: "Rwamagana",
    yogi: "Yogi",
  };

  return { load, byId, LOCATION_LABELS };
})();
