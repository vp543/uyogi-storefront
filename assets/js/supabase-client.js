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
  async signOut() { return client.auth.signOut(); },
  async user() { const { data } = await client.auth.getUser(); return data.user; },
  onAuth(cb) { client.auth.onAuthStateChange((_e, s) => cb(s?.user || null)); },
  async listPhotos() {
    const { data, error } = await client.from("product_photos").select("sku,image_path,thumb_path,status");
    if (error) throw error; return data || [];
  },
  async uploadImage(bucket, path, blob) {
    const { error } = await client.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
  },
  async removeImage(bucket, path) { await client.storage.from(bucket).remove([path]); },
  async upsertPhoto(row) {
    const { error } = await client.from("product_photos").upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deletePhoto(sku) { const { error } = await client.from("product_photos").delete().eq("sku", sku); if (error) throw error; },
};
