// Run: node --test "website/tests/photo-candidates.test.mjs"
//
// photo-candidates.js is a plain browser script that attaches to `window`
// (see the Global Constraints in the plan — ES modules would bypass the
// ?v= cache-busting). It is loaded here by evaluating it with a stub `window`,
// which needs no module wrapper in the browser file.
//
// Deliberately NOT node:vm: a vm context is a separate realm, so objects and
// arrays built inside it have different prototypes and every deepEqual against
// a literal declared out here fails with "same structure but not
// reference-equal" — even when the value is correct. new Function evaluates in
// this realm, so the comparisons mean what they look like they mean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../assets/js/photo-candidates.js", import.meta.url), "utf8");
const win = {};
new Function("window", "crypto", src)(win, globalThis.crypto);
const PC = win.PhotoCandidates;

test("exposes the agreed cap of 4", () => {
  assert.equal(PC.MAX_CANDIDATES, 4);
});

test("candidatePaths builds unique per-candidate paths", () => {
  const p = PC.candidatePaths("RW2BXXU0001691", "abc-123");
  assert.deepEqual(p, {
    image: "RW2BXXU0001691/abc-123.webp",
    thumb: "RW2BXXU0001691/abc-123-thumb.webp",
    raw: "RW2BXXU0001691/abc-123-original",
  });
});

test("candidatePaths never returns the legacy fixed path", () => {
  // The old code wrote every photo to <sku>/main.webp, so a replacement
  // reused the URL and the CDN could serve customers the old image.
  const p = PC.candidatePaths("SKU1", PC.newId());
  assert.ok(!p.image.endsWith("/main.webp"));
  assert.notEqual(p.image, p.thumb);
});

test("newId returns a distinct id each call", () => {
  const ids = new Set(Array.from({ length: 50 }, () => PC.newId()));
  assert.equal(ids.size, 50);
});

test("canAdd allows up to 4 and refuses the 5th", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
  assert.equal(PC.canAdd(rows(0)), true);
  assert.equal(PC.canAdd(rows(3)), true);
  assert.equal(PC.canAdd(rows(4)), false);
  assert.equal(PC.canAdd(rows(9)), false);
});

test("sortCandidates orders oldest first and does not mutate", () => {
  const input = [
    { id: "b", uploaded_at: "2026-08-03T17:00:00Z" },
    { id: "a", uploaded_at: "2026-08-03T16:23:00Z" },
    { id: "c", uploaded_at: "2026-08-04T09:00:00Z" },
  ];
  const copy = JSON.parse(JSON.stringify(input));
  assert.deepEqual(PC.sortCandidates(input).map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(input, copy, "must not sort in place");
});

test("isLive compares against product_photos.candidate_id", () => {
  const cand = { id: "x1" };
  assert.equal(PC.isLive(cand, { candidate_id: "x1" }), true);
  assert.equal(PC.isLive(cand, { candidate_id: "x2" }), false);
  assert.equal(PC.isLive(cand, null), false);
  assert.equal(PC.isLive(cand, { candidate_id: null }), false);
});

test("findLive returns the live row or null", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.equal(PC.findLive(list, { candidate_id: "b" }).id, "b");
  assert.equal(PC.findLive(list, { candidate_id: "zz" }), null);
  assert.equal(PC.findLive(list, null), null);
  assert.equal(PC.findLive([], { candidate_id: "a" }), null);
});

test("staleRawPath names the raw to delete when the live photo changes", () => {
  const prev = { id: "old", raw_path: "SKU/old-original" };
  assert.equal(PC.staleRawPath(prev, "new"), "SKU/old-original");
});

test("staleRawPath keeps the raw when the same photo stays live", () => {
  const prev = { id: "same", raw_path: "SKU/same-original" };
  assert.equal(PC.staleRawPath(prev, "same"), null);
});

test("staleRawPath copes with no previous photo and with no raw", () => {
  assert.equal(PC.staleRawPath(null, "new"), null);
  assert.equal(PC.staleRawPath({ id: "old", raw_path: null }, "new"), null);
});

test("photoCountLabel reads naturally at 0, 1 and many", () => {
  assert.equal(PC.photoCountLabel(0), "Needs photo");
  assert.equal(PC.photoCountLabel(1), "1 photo");
  assert.equal(PC.photoCountLabel(3), "3 photos");
});

test("FILTER_MODES lists the four modes in display order", () => {
  assert.deepEqual(PC.FILTER_MODES, ["all", "todo", "done", "review"]);
});

test("all matches every product", () => {
  assert.equal(PC.matchesFilter("all", 0, false), true);
  assert.equal(PC.matchesFilter("all", 1, true), true);
  assert.equal(PC.matchesFilter("all", 3, true), true);
});

test("todo is products with no photos at all", () => {
  assert.equal(PC.matchesFilter("todo", 0, false), true);
  assert.equal(PC.matchesFilter("todo", 1, true), false);
  assert.equal(PC.matchesFilter("todo", 2, false), false);
});

test("done is products with a photo live on the storefront", () => {
  assert.equal(PC.matchesFilter("done", 1, true), true);
  assert.equal(PC.matchesFilter("done", 3, true), true);
  assert.equal(PC.matchesFilter("done", 0, false), false);
  // Photos uploaded but none published: not done.
  assert.equal(PC.matchesFilter("done", 2, false), false);
});

test("review is where the owner still has a choice to make", () => {
  // More than one photo, one of them live -> a choice remains.
  assert.equal(PC.matchesFilter("review", 2, true), true);
  assert.equal(PC.matchesFilter("review", 4, true), true);
  // Photos exist but none is live -> nothing on the site yet.
  assert.equal(PC.matchesFilter("review", 1, false), true);
  assert.equal(PC.matchesFilter("review", 2, false), true);
  // Settled: exactly one photo and it is live.
  assert.equal(PC.matchesFilter("review", 1, true), false);
  // Nothing to review.
  assert.equal(PC.matchesFilter("review", 0, false), false);
});

test("a product can be both done and review at once", () => {
  assert.equal(PC.matchesFilter("done", 3, true), true);
  assert.equal(PC.matchesFilter("review", 3, true), true);
});

test("an unknown mode falls back to all, never to an empty list", () => {
  assert.equal(PC.matchesFilter("nonsense", 0, false), true);
  assert.equal(PC.matchesFilter(undefined, 1, true), true);
  assert.equal(PC.matchesFilter("", 0, false), true);
});

test("missing counts are treated as zero", () => {
  assert.equal(PC.matchesFilter("todo", undefined, false), true);
  assert.equal(PC.matchesFilter("done", undefined, false), false);
});
