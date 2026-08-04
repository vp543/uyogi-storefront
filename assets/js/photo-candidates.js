// Pure rules for multiple photos per product. No DOM, no network, no state —
// everything here is a function of its arguments, which is what makes it
// testable outside a browser (see website/tests/photo-candidates.test.mjs).
//
// A plain script attaching to window, deliberately NOT an ES module: module
// imports resolve without the ?v= query string, which would bypass the cache
// busting that stops a staff phone running new JS against old CSS.
window.PhotoCandidates = (function () {
  const MAX_CANDIDATES = 4;

  function newId() {
    return crypto.randomUUID();
  }

  // Unique per candidate, so a replacement never reuses a URL. The old code
  // wrote every photo to <sku>/main.webp and the CDN could keep serving the
  // previous image for up to ten minutes.
  function candidatePaths(sku, id) {
    return {
      image: `${sku}/${id}.webp`,
      thumb: `${sku}/${id}-thumb.webp`,
      raw: `${sku}/${id}-original`,
    };
  }

  function canAdd(candidates) {
    return (candidates || []).length < MAX_CANDIDATES;
  }

  // Oldest first, so [1] is the first attempt. Returns a new array.
  function sortCandidates(candidates) {
    return [...(candidates || [])].sort((a, b) =>
      String(a.uploaded_at || "").localeCompare(String(b.uploaded_at || "")));
  }

  // candidate_id on the product_photos row is the single authority on what is
  // live. Never compare path strings to work this out.
  function isLive(candidate, photoRow) {
    return !!(candidate && photoRow && photoRow.candidate_id &&
              photoRow.candidate_id === candidate.id);
  }

  function findLive(candidates, photoRow) {
    return (candidates || []).find((c) => isLive(c, photoRow)) || null;
  }

  // Raw originals are 2-5 MB against 150 KB for the finished image, so only
  // the live photo keeps one. Returns the raw to delete, or null.
  function staleRawPath(previousLive, nextLiveId) {
    if (!previousLive || !previousLive.raw_path) return null;
    if (previousLive.id === nextLiveId) return null;
    return previousLive.raw_path;
  }

  function photoCountLabel(n) {
    if (!n) return "Needs photo";
    return n === 1 ? "1 photo" : `${n} photos`;
  }

  return {
    MAX_CANDIDATES, newId, candidatePaths, canAdd,
    sortCandidates, isLive, findLive, staleRawPath, photoCountLabel,
  };
})();
