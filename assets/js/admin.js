// UYOGI staff product-photo admin. Auth + product list + capture/process/publish.
import { SB } from "./supabase-client.js";

const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) el.hidden = !on; };

const state = { products: [], haspic: new Set(), q: "", needsOnly: true, me: null, staff: [] };

// If the Supabase config is blank, show a friendly setup notice and stop.
if (!SB.configured) {
  show($("setup"), true);
} else {
  initAuth();
}

function renderAuthed(on) {
  show($("login"), !on);
  show($("app"), on);
  show($("signout"), on);
}

function initAuth() {
  renderAuthed(false); // default to the login screen until auth state arrives

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    show($("login-err"), false);
    const { error } = await SB.signIn($("e").value.trim(), $("p").value);
    if (error) {
      $("login-err").textContent = "Sign-in failed: " + error.message;
      show($("login-err"), true);
    }
  });
  $("signout").addEventListener("click", () => SB.signOut());

  // Fires immediately with the current session (v2 INITIAL_SESSION), then on changes.
  SB.onAuth(async (user) => {
    renderAuthed(!!user);
    if (!user) return;

    $("app").innerHTML = `<p style="padding:24px">Checking your access…</p>`;
    try { state.me = await SB.myStaff(); } catch (_) { state.me = null; }

    // A brand-new signup has no row yet, or is still pending: no tool for them.
    if (!state.me || state.me.status !== "approved") return renderGate();

    $("app").innerHTML = `<p style="padding:24px">Loading catalog…</p>`;
    await loadData();
    renderList();
  });
}

// Shown to anyone signed in but not approved.
function renderGate() {
  const rejected = state.me && state.me.status === "rejected";
  $("app").innerHTML = `
    <div class="admin__gate">
      <h1>${rejected ? "Access declined" : "Waiting for approval"}</h1>
      <p class="admin__sub">${rejected
        ? "The owner hasn't granted this account access to the photo tool. Talk to the owner if you think that's a mistake."
        : "Your account was created and the owner has been asked to approve it. Once approved, sign in again and you can start adding product photos."}</p>
    </div>`;
}

async function loadData() {
  const data = await UYOGI.load();
  state.products = data.products;
  const rows = await SB.listPhotos();
  state.haspic = new Set(rows.filter((r) => r.status === "active").map((r) => r.sku));
  state.staff = state.me.role === "owner" ? await SB.listStaff() : [];
  if (state.me.role === "owner") {
    try { state.code = await SB.getAccessCode(); } catch (_) { state.code = null; }
  }
}

function renderList() {
  const q = state.q.toLowerCase();
  const items = state.products.filter((p) => {
    if (state.needsOnly && state.haspic.has(p.id)) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q);
  }).slice(0, 200);

  $("app").innerHTML = `
    ${approvalsHTML()}
    <div class="admin__tools">
      <input id="q" class="admin__search" type="search" placeholder="Search product or code…" value="${state.q.replace(/"/g, "&quot;")}">
      <label class="chk"><input type="checkbox" id="needs" ${state.needsOnly ? "checked" : ""}> Needs photo only</label>
      <span class="admin__count">${items.length} shown · ${state.haspic.size} have photos</span>
    </div>
    <div class="admin__grid">${items.map(rowHTML).join("") || `<p class="admin__empty">Nothing matches.</p>`}</div>`;

  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderList(); });
  $("needs").addEventListener("change", (e) => { state.needsOnly = e.target.checked; renderList(); });
  document.querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", () => openCapture(b.getAttribute("data-pick"))));
  document.querySelectorAll("[data-decide]").forEach((b) =>
    b.addEventListener("click", () => decide(b.getAttribute("data-decide"), b.getAttribute("data-status"))));
  if ($("code-save")) $("code-save").addEventListener("click", saveCode);
}

async function saveCode() {
  const next = $("code-input").value.trim();
  state.codeMsg = "";
  try {
    await SB.setAccessCode(next);
    state.code = next;
    state.codeMsg = next ? "Saved." : "Saved — the code is now off.";
  } catch (err) {
    state.codeMsg = "Couldn't save the code: " + err.message;
  }
  renderList();
}

// ── Owner-only: staff approval queue ───────────────────────────────────
function approvalsHTML() {
  if (!state.me || state.me.role !== "owner") return "";
  const pending = state.staff.filter((s) => s.status === "pending");
  const team = state.staff.filter((s) => s.status !== "pending" && s.id !== state.me.id);

  const person = (s) => `<b>${esc(s.full_name || "—")}</b><small>${esc(s.email || "")}</small>`;

  const pendingRows = pending.map((s) => `
    <li class="staff__row">
      <span class="staff__who">${person(s)}</span>
      <span class="staff__acts">
        <button class="btn btn--ghost" data-decide="${esc(s.id)}" data-status="rejected">Decline</button>
        <button class="btn btn--primary" data-decide="${esc(s.id)}" data-status="approved">Approve</button>
      </span>
    </li>`).join("");

  const teamRows = team.map((s) => `
    <li class="staff__row">
      <span class="staff__who">${person(s)}</span>
      <span class="staff__acts">
        <span class="admin__badge ${s.status === "approved" ? "is-has" : "is-need"}">${esc(s.status)}</span>
        <button class="btn btn--ghost" data-decide="${esc(s.id)}" data-status="${s.status === "approved" ? "rejected" : "approved"}">
          ${s.status === "approved" ? "Revoke" : "Approve"}
        </button>
      </span>
    </li>`).join("");

  return `
    <section class="staff">
      <h2 class="staff__title">Staff access ${pending.length ? `<span class="staff__badge">${pending.length} waiting</span>` : ""}</h2>
      ${state.staffErr ? `<p class="admin__err">${esc(state.staffErr)}</p>` : ""}
      ${pending.length
        ? `<ul class="staff__list">${pendingRows}</ul>`
        : `<p class="admin__sub">No requests waiting. Share <b>signup.html</b> with an employee to let them ask for access.</p>`}
      ${team.length ? `<h3 class="staff__sub">Team</h3><ul class="staff__list">${teamRows}</ul>` : ""}
      ${codeHTML()}
    </section>`;
}

// Owner-only: the shared code employees must type on the signup page.
function codeHTML() {
  if (state.code === null || state.code === undefined) return "";
  const off = state.code === "";
  return `
    <h3 class="staff__sub">Signup access code</h3>
    <p class="admin__sub">${off
      ? "<b>Off</b> — anyone with the signup link can request an account."
      : "Employees must type this on the signup page. Give it to them yourself; never post it publicly."}</p>
    <div class="staff__code">
      <input id="code-input" type="text" value="${esc(state.code)}" placeholder="Leave empty to turn the code off" spellcheck="false">
      <button class="btn btn--primary" id="code-save">Save code</button>
    </div>
    ${state.codeMsg ? `<p class="admin__sub">${esc(state.codeMsg)}</p>` : ""}`;
}

async function decide(id, status) {
  state.staffErr = "";
  try {
    await SB.setStaffStatus(id, status);
    state.staff = await SB.listStaff();
  } catch (err) {
    state.staffErr = "Couldn't update that account: " + err.message;
  }
  renderList();
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function rowHTML(p) {
  const has = state.haspic.has(p.id);
  return `<button class="admin__row" data-pick="${esc(p.id)}">
    <span class="admin__ic">${window.categoryIcon(p.category)}</span>
    <span class="admin__meta"><b>${esc(p.name)}</b><small>${esc(p.code || "—")} · ${esc(p.category)}</small></span>
    <span class="admin__badge ${has ? "is-has" : "is-need"}">${has ? "Has photo" : "Needs photo"}</span>
  </button>`;
}

function openCapture(sku) {
  const p = state.products.find((x) => x.id === sku);
  if (!p) return;
  const hadPhoto = state.haspic.has(sku);

  $("app").insertAdjacentHTML("beforeend", `
    <div class="cap" id="cap">
      <div class="cap__panel">
        <button class="cap__x" id="cap-x" aria-label="Close">✕</button>
        <h2>${esc(p.name)}</h2>
        <p class="admin__sub">${esc(p.code || "—")} · ${esc(p.category)}</p>
        <div class="cap__stage" id="cap-stage"></div>
        <div class="cap__actions" id="cap-actions" hidden></div>
        <p id="cap-status" class="admin__sub" hidden></p>
      </div>
    </div>`);

  let processed = null, originalFile = null;
  const stage = $("cap-stage"), status = $("cap-status"), actions = $("cap-actions");
  const setStatus = (m) => { status.textContent = m; status.hidden = !m; };
  const close = () => { const c = $("cap"); if (c) c.remove(); };

  function renderActions() {
    const removeBtn = hadPhoto ? `<button class="btn btn--ghost" id="cap-remove" style="margin-right:auto">Remove photo</button>` : "";
    const publishBtns = processed
      ? `<button class="btn btn--ghost" id="cap-retake">Retake</button>
         <button class="btn btn--primary" id="cap-publish">Publish photo</button>`
      // Showing the existing photo: offer a way back to the capture screen.
      : (hadPhoto ? `<button class="btn btn--primary" id="cap-replace">Replace photo</button>` : "");
    actions.innerHTML = removeBtn + publishBtns;
    actions.hidden = !(removeBtn || publishBtns);
  }

  // The product already has a photo — show it, so staff can see what they
  // are about to replace instead of an empty "take a photo" placeholder.
  function renderCurrent() {
    processed = null;
    const src = SB.publicUrl(SB.pubBucket, `${sku}/main.webp`) + `?t=${Date.now()}`;
    stage.innerHTML = `<img class="cap__preview" src="${src}" alt="Current photo of ${esc(p.name)}">`;
    setStatus("Current photo");
    renderActions();
  }

  function renderDrop() {
    processed = null;
    setStatus("");
    stage.innerHTML = `<label class="cap__drop" id="cap-drop">
      <input id="cap-file" type="file" accept="image/*" capture="environment" hidden>
      <span>Tap to take a photo<br><small>or choose an image</small></span>
    </label>`;
    $("cap-file").addEventListener("change", onFile);
    renderActions();
  }

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    originalFile = file;
    setStatus("Cleaning up the photo… (first run downloads a small model)");
    stage.innerHTML = `<div class="cap__spin">Processing…</div>`;
    try {
      processed = await ImgPipeline.processImage(file);
      stage.innerHTML = `<img class="cap__preview" src="${URL.createObjectURL(processed.mainBlob)}" alt="preview">`;
      setStatus("");
      renderActions();
    } catch (err) {
      setStatus("Couldn't process that image. Try another. (" + err.message + ")");
      renderDrop();
    }
  }

  async function publish() {
    if (!processed) return;
    setStatus("Publishing…");
    try {
      const user = await SB.user();
      await SB.uploadImage(SB.pubBucket, `${sku}/main.webp`, processed.mainBlob);
      await SB.uploadImage(SB.pubBucket, `${sku}/thumb.webp`, processed.thumbBlob);
      if (originalFile) { try { await SB.uploadImage(SB.rawBucket, `${sku}/original`, originalFile); } catch (_) {} }
      await SB.upsertPhoto({
        sku, image_path: `${sku}/main.webp`, thumb_path: `${sku}/thumb.webp`,
        width: processed.width, height: processed.height, status: "active",
        uploaded_by: user?.id, uploaded_at: new Date().toISOString(),
      });
      state.haspic.add(sku);
      close(); renderList();
    } catch (err) { setStatus("Publish failed: " + err.message); }
  }

  async function remove() {
    if (!confirm("Remove this product's photo?")) return;
    setStatus("Removing…");
    try {
      await SB.removeImage(SB.pubBucket, `${sku}/main.webp`);
      await SB.removeImage(SB.pubBucket, `${sku}/thumb.webp`);
      await SB.deletePhoto(sku);
      state.haspic.delete(sku);
      close(); renderList();
    } catch (err) { setStatus("Remove failed: " + err.message); }
  }

  actions.addEventListener("click", (e) => {
    if (e.target.id === "cap-retake") hadPhoto ? renderCurrent() : renderDrop();
    else if (e.target.id === "cap-replace") renderDrop();
    else if (e.target.id === "cap-publish") publish();
    else if (e.target.id === "cap-remove") remove();
  });
  $("cap-x").addEventListener("click", close);

  hadPhoto ? renderCurrent() : renderDrop();
}
