// Admin-only Supabase wrapper. Loaded as an ES module by admin.html.
// When the config is blank it stays unconfigured (no client, no network) so
// admin.html can show a friendly "not set up yet" message instead of crashing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const C = (window.UYOGI_CONFIG && window.UYOGI_CONFIG.supabase) || {};
const PUB = (window.UYOGI_CONFIG && window.UYOGI_CONFIG.photos && window.UYOGI_CONFIG.photos.bucket) || "product-photos";
const RAW = "product-photos-raw";

export const configured = !!(C.url && C.anonKey);
export const client = configured ? createClient(C.url, C.anonKey) : null;

export const SB = {
  configured,
  pubBucket: PUB,
  rawBucket: RAW,
  async signIn(email, pw) { return client.auth.signInWithPassword({ email, password: pw }); },
  async signUp(email, pw, fullName, accessCode) {
    // access_code is validated by a BEFORE INSERT trigger on auth.users and
    // stripped there, so it never persists on the account.
    return client.auth.signUp({
      email, password: pw,
      options: { data: { full_name: fullName, access_code: accessCode || "" } },
    });
  },
  // Yes/no only — the code itself is never sent to the browser.
  async checkAccessCode(code) {
    const { data, error } = await client.rpc("check_access_code", { code });
    if (error) throw error;
    return data === true;
  },
  async signOut() { return client.auth.signOut(); },

  // ── Staff accounts / owner approval ──────────────────────────────────
  // The signed-in user's own row. Null while the signup trigger hasn't run
  // yet, which the caller treats the same as "pending".
  async myStaff() {
    const u = await SB.user();
    if (!u) return null;
    const { data, error } = await client.from("staff").select("*").eq("id", u.id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listStaff() {
    const { data, error } = await client.from("staff").select("*").order("requested_at", { ascending: false });
    if (error) throw error; return data || [];
  },
  // Owner-only: read / change the shared signup code ('' disables the check).
  async getAccessCode() {
    const { data, error } = await client.from("signup_settings").select("access_code").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data ? data.access_code : null;
  },
  async setAccessCode(code) {
    const { error } = await client.from("signup_settings")
      .update({ access_code: code, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
  },
  async setStaffStatus(id, status) {
    const me = await SB.user();
    const { error } = await client.from("staff")
      .update({ status, decided_at: new Date().toISOString(), decided_by: me?.id })
      .eq("id", id);
    if (error) throw error;
  },
  async user() { const { data } = await client.auth.getUser(); return data.user; },
  onAuth(cb) { client.auth.onAuthStateChange((_e, s) => cb(s?.user || null)); },
  async listPhotos() {
    const { data, error } = await client.from("product_photos").select("sku,image_path,thumb_path,status");
    if (error) throw error; return data || [];
  },
  // ── Photo candidates ─────────────────────────────────────────────────
  // Every photo uploaded for a product. product_photos.candidate_id says
  // which one is live; nothing here decides that.
  async listCandidates(sku) {
    const { data, error } = await client.from("product_photo_candidates")
      .select("*").eq("sku", sku).order("uploaded_at", { ascending: true });
    if (error) throw error; return data || [];
  },
  // One entry per candidate row — the caller tallies them into per-SKU
  // counts for the list badges.
  async allCandidateSkus() {
    const { data, error } = await client.from("product_photo_candidates").select("sku");
    if (error) throw error; return (data || []).map((r) => r.sku);
  },
  // Returns the stored row so the caller has the id the database accepted.
  // Throws if the 4-photo cap trigger rejects the insert.
  async insertCandidate(row) {
    const { data, error } = await client.from("product_photo_candidates")
      .insert(row).select().single();
    if (error) throw error; return data;
  },
  async deleteCandidate(id) {
    const { error } = await client.from("product_photo_candidates").delete().eq("id", id);
    if (error) throw error;
  },
  // Called when a candidate stops being live: its raw original is deleted.
  // PostgREST answers 204 on an UPDATE that RLS filtered to zero rows —
  // success-shaped, but nothing happened — so this re-reads the column and
  // throws unless it is actually null. Without that, a row could keep
  // claiming a raw file that removeImage already deleted from storage.
  async clearCandidateRaw(id) {
    const { error } = await client.from("product_photo_candidates")
      .update({ raw_path: null }).eq("id", id);
    if (error) throw error;
    const { data, error: selErr } = await client.from("product_photo_candidates")
      .select("raw_path").eq("id", id).maybeSingle();
    if (selErr) throw selErr;
    // A missing row (already deleted) can't claim a stale file either way —
    // only a row that still exists AND still has a raw_path is the problem.
    if (data && data.raw_path !== null) {
      throw new Error("raw_path didn't clear — you may not have permission to change this candidate");
    }
  },
  // The live-photo row for one product, or null. Used to confirm writes:
  // PostgREST returns 204 on an update RLS filtered to zero rows, so a
  // re-read is the only proof anything changed.
  async getPhoto(sku) {
    const { data, error } = await client.from("product_photos")
      .select("*").eq("sku", sku).maybeSingle();
    if (error) throw error; return data;
  },
  async uploadImage(bucket, path, blob) {
    const { error } = await client.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
  },
  // Throws like every other method here — a caller that wants a missing or
  // failed delete to be non-fatal (a raw original that's legitimately
  // absent, a best-effort cleanup pass) must catch and diag() it themselves,
  // so that tolerance is visible at the call site instead of hidden in here.
  async removeImage(bucket, path) {
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw error;
  },
  // Public URL of a stored object. Cache-busted by callers after a replace,
  // since replacing a photo reuses the same path.
  publicUrl(bucket, path) { return `${C.url}/storage/v1/object/public/${bucket}/${path}`; },
  async upsertPhoto(row) {
    const { error } = await client.from("product_photos").upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deletePhoto(sku) { const { error } = await client.from("product_photos").delete().eq("sku", sku); if (error) throw error; },
};
