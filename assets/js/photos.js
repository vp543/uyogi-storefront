// Public read of the SKU -> photo URL map. No Supabase SDK: a single REST
// call. Safe to call when config is blank or the network fails — it just
// yields an empty map and the storefront falls back to "photo pending".
window.Photos = (function () {
  const CFG = window.UYOGI_CONFIG || {};
  const SB = CFG.supabase || {};
  const BUCKET = (CFG.photos && CFG.photos.bucket) || "product-photos";
  let map = {};       // sku -> { image, thumb }
  let loaded = false;

  function publicUrl(path) {
    if (!path) return null;
    return `${SB.url}/storage/v1/object/public/${BUCKET}/${path}`;
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    if (!SB.url || !SB.anonKey) return;   // photos disabled
    try {
      const res = await fetch(
        `${SB.url}/rest/v1/product_photos?status=eq.active&select=sku,image_path,thumb_path`,
        { headers: { apikey: SB.anonKey, Authorization: `Bearer ${SB.anonKey}` } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      const m = {};
      for (const r of rows) m[r.sku] = { image: publicUrl(r.image_path), thumb: publicUrl(r.thumb_path) };
      map = m;
    } catch (_) { /* offline / blocked — stay with empty map */ }
  }

  return {
    load,
    all: () => map,
    has: (sku) => !!map[sku],
    urlFor: (sku) => (map[sku] ? (map[sku].thumb || map[sku].image) : null),
    fullFor: (sku) => (map[sku] ? (map[sku].image || map[sku].thumb) : null),
  };
})();
