// UYOGI staff product-photo admin. Auth + product list + capture/process/publish.
import { SB } from "./supabase-client.js";

const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) el.hidden = !on; };

const state = { products: [], haspic: new Set(), candCount: new Map(), q: "", needsOnly: true, me: null, staff: [] };

// ── Diagnostics ────────────────────────────────────────────────────────
// Kept in localStorage on purpose: if the phone reloads the page while the
// camera is open, an in-memory log would vanish along with the evidence.
// Staff can read it via the "Diagnostics" link and send a screenshot.
const LOGKEY = "uyogi.diag";
function diag(msg) {
  try {
    const l = JSON.parse(localStorage.getItem(LOGKEY) || "[]");
    l.push(new Date().toISOString().slice(11, 19) + "  " + msg);
    localStorage.setItem(LOGKEY, JSON.stringify(l.slice(-60)));
  } catch (_) { /* private mode / quota — diagnostics are optional */ }
  if ($("diag-body")) renderDiag();
}
function diagList() {
  try { return JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch (_) { return []; }
}
function renderDiag() {
  const b = $("diag-body");
  if (b) b.textContent = diagList().join("\n") || "(nothing logged yet)";
}
// The background remover downloads ~52 MB the first time it runs on a phone
// and the browser keeps it cached. Remember that it happened, so the WiFi
// warning shows to staff who still face the download and nobody else.
const READYKEY = "uyogi.model.ready";
function modelReady() { try { return localStorage.getItem(READYKEY) === "1"; } catch (_) { return false; } }
function markModelReady() { try { localStorage.setItem(READYKEY, "1"); } catch (_) {} }

window.addEventListener("error", (e) => diag("JS ERROR: " + e.message));
window.addEventListener("unhandledrejection", (e) => diag("PROMISE REJECTED: " + (e.reason && e.reason.message || e.reason)));
document.addEventListener("visibilitychange", () => diag("page " + document.visibilityState));
diag("--- page loaded (" + (navigator.userAgent.match(/Android|iPhone|iPad/) || ["desktop"])[0] + ") ---");

// Diagnostics panel wiring (works even when Supabase isn't configured).
if ($("diag-toggle")) {
  $("diag-toggle").addEventListener("click", () => {
    const p = $("diag-panel");
    p.hidden = !p.hidden;
    if (!p.hidden) renderDiag();
  });
  $("diag-clear").addEventListener("click", () => {
    localStorage.removeItem(LOGKEY); renderDiag();
  });
  $("diag-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(diagList().join("\n")); $("diag-copy").textContent = "Copied"; }
    catch (_) { $("diag-copy").textContent = "Select the text above"; }
  });
}

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

  // Fires immediately with the current session (v2 INITIAL_SESSION), then on
  // changes — including token refreshes and tab-visibility recovery, which are
  // NOT sign-ins. Re-rendering on those would destroy an open capture modal
  // (and the photo on its way into it), so ignore events for the same user.
  let shownFor = undefined;
  SB.onAuth(async (user) => {
    diag("auth event: " + (user ? "user " + user.id.slice(0, 8) : "signed out"));
    renderAuthed(!!user);
    if (!user) { shownFor = null; return; }
    if (shownFor === user.id) { diag("  ignored (same user, already rendered)"); return; }
    shownFor = user.id;

    $("app").innerHTML = `<p style="padding:24px">Checking your access…</p>`;
    try { state.me = await SB.myStaff(); } catch (_) { state.me = null; }

    // A brand-new signup has no row yet, or is still pending: no tool for them.
    if (!state.me || state.me.status !== "approved") return renderGate();

    $("app").innerHTML = `<p style="padding:24px">Loading catalog…</p>`;
    await loadData();
    renderList();
    reopenInterruptedCapture();
  });
}

// The phone can throw the page away while the camera app is in front. The photo
// itself cannot survive that — the input it was headed for no longer exists — so
// reopen the product and say plainly what happened instead of silently dropping
// the employee back at the top of the list.
function reopenInterruptedCapture() {
  let sku = null;
  try { sku = sessionStorage.getItem("uyogi.capture"); } catch (_) {}
  if (!sku) return;
  diag("reopening interrupted capture: " + sku);
  openCapture(sku);
  const s = $("cap-status");
  if (s) {
    s.textContent = "Your phone reloaded the page while the camera was open, so that photo was lost. Take it again — or take it with your normal camera app first and use “Choose from gallery” below, which is more reliable.";
    s.hidden = false;
  }
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
  // Per-SKU candidate counts drive the list badge. One row per photo, so a
  // tally client-side is cheaper than a grouped query for this data size.
  const counts = new Map();
  for (const s of await SB.allCandidateSkus()) counts.set(s, (counts.get(s) || 0) + 1);
  state.candCount = counts;
  state.staff = state.me.role === "owner" ? await SB.listStaff() : [];
  if (state.me.role === "owner") {
    try { state.code = await SB.getAccessCode(); } catch (_) { state.code = null; }
  }
}

function renderList() {
  const q = state.q.toLowerCase();
  const matches = state.products.filter((p) => {
    if (state.needsOnly && state.haspic.has(p.id)) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q);
  });
  // Fewer rows on screen = less memory = less chance the phone discards the page
  // while the camera app is open. Search reaches the rest of the catalogue.
  const LIMIT = 60;
  const items = matches.slice(0, LIMIT);

  $("app").innerHTML = `
    ${approvalsHTML()}
    <div class="admin__tools">
      <input id="q" class="admin__search" type="search" placeholder="Search product or code…" value="${state.q.replace(/"/g, "&quot;")}">
      <label class="chk"><input type="checkbox" id="needs" ${state.needsOnly ? "checked" : ""}> Needs photo only</label>
      <span class="admin__count">${matches.length > LIMIT
        ? `first ${LIMIT} of ${matches.length} — search to narrow`
        : `${matches.length} shown`} · ${state.haspic.size} have photos</span>
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
  // Never stack modals: reopening after a reload and a tap on the list can
  // otherwise both fire, leaving a dead modal underneath the live one.
  const existing = document.getElementById("cap");
  if (existing) existing.remove();
  // `let`, not `const`: publishing the first photo flips it, and renderActions
  // reads it to decide whether to offer "Add another photo" and "Remove photo".
  // Leaving it const would strand staff on a screen with neither button after
  // their first upload.
  let hadPhoto = (state.candCount.get(sku) || 0) > 0;

  diag("open capture: " + sku + (hadPhoto ? " (has photo)" : ""));
  // Remember which product is open. Phones routinely discard the page while the
  // camera app is in front; on reload we reopen here instead of dumping the
  // employee back at the top of a 1,800-item list with no explanation.
  try { sessionStorage.setItem("uyogi.capture", sku); } catch (_) {}
  // Mounted on <body>, not inside #app: anything that re-renders the product
  // list must not be able to tear the modal out from under an in-flight photo.
  document.body.insertAdjacentHTML("beforeend", `
    <div class="cap" id="cap">
      <div class="cap__panel">
        <button class="cap__x" id="cap-x" aria-label="Close">✕</button>
        <h2>${esc(p.name)}</h2>
        <p class="admin__sub">${esc(p.code || "—")} · ${esc(p.category)}</p>
        <div class="cap__stage" id="cap-stage"></div>
        <div class="cap__note" id="cap-note" hidden></div>
        <div class="cap__actions" id="cap-actions" hidden></div>
        <p id="cap-status" class="admin__sub" hidden></p>
      </div>
    </div>`);

  let processed = null, originalFile = null;
  let candidates = [], livePhoto = null;   // this product's photos, and which is live
  let cut = null;        // transparent cut-out, kept so stage 2 never re-runs the model
  let editor = null;     // live ImgEdit instance, if a stage is showing one
  const stage = $("cap-stage"), status = $("cap-status"), actions = $("cap-actions");
  const setStatus = (m) => { status.textContent = m; status.hidden = !m; };
  const setNote = (html) => { const n = $("cap-note"); if (n) { n.innerHTML = html || ""; n.hidden = !html; } };
  const close = () => {
    try { sessionStorage.removeItem("uyogi.capture"); } catch (_) {}
    killEditor();
    const c = $("cap"); if (c) c.remove();
  };

  function renderActions() {
    const removeBtn = hadPhoto
      ? `<button class="btn btn--ghost" id="cap-remove" style="margin-right:auto">Remove photo</button>` : "";
    if (processed) {
      actions.innerHTML = removeBtn +
        `<button class="btn btn--ghost" id="cap-retake">Retake</button>
         <button class="btn btn--primary" id="cap-publish">Publish photo</button>`;
      actions.hidden = false;
      return;
    }
    // Showing the strip: offer another photo unless the product is at the cap.
    const room = PhotoCandidates.canAdd(candidates);
    const addBtn = hadPhoto
      ? (room
        ? `<button class="btn btn--primary" id="cap-replace">Add another photo</button>`
        : `<button class="btn btn--primary" id="cap-replace" disabled
             title="This product already has ${PhotoCandidates.MAX_CANDIDATES} photos. Delete one first.">Add another photo</button>`)
      : "";
    actions.innerHTML = removeBtn + addBtn;
    actions.hidden = !(removeBtn || addBtn);
  }

  // The product's photos, oldest first, with the live one marked. Replaces the
  // old single-photo view: staff can now compare attempts instead of judging
  // one image from memory of the last.
  async function renderCandidates() {
    processed = null;
    killEditor();
    stage.classList.remove("is-editing");
    setNote("");
    setStatus("Loading photos…");
    try {
      const [rows, photoRow] = await Promise.all([SB.listCandidates(sku), SB.getPhoto(sku)]);
      candidates = PhotoCandidates.sortCandidates(rows);
      livePhoto = photoRow;
    } catch (err) {
      diag("CANDIDATE LOAD FAILED: " + err.message);
      setStatus("Couldn't load this product's photos: " + err.message + ". Try closing and reopening this product.");
      // processed is already null (set above), so renderActions offers only
      // Remove/Add-another — never Retake/Publish left stranded from the
      // previous screen with nothing behind them to publish.
      renderActions();
      return;
    }
    if (!candidates.length) return renderDrop();

    const live = PhotoCandidates.findLive(candidates, livePhoto);
    stage.classList.add("is-strip");
    stage.innerHTML = `<div class="cand__grid">${candidates.map((c, i) => {
      const on = live && c.id === live.id;
      return `
        <figure class="cand ${on ? "is-live" : ""}">
          <img class="cand__img" src="${esc(SB.publicUrl(SB.pubBucket, c.thumb_path || c.image_path))}"
               alt="Photo ${i + 1} of ${esc(p.name)}" data-zoom="${esc(c.id)}">
          <figcaption class="cand__cap">${on ? "● On site" : `Photo ${i + 1}`}</figcaption>
          <span class="cand__acts">
            ${on ? "" : `<button class="btn btn--ghost" data-use="${esc(c.id)}">Use this</button>`}
            <button class="btn btn--ghost cand__del" data-del="${esc(c.id)}"
              ${on ? `disabled title="This photo is on the website. Choose another one first."` : ""}>Delete</button>
          </span>
        </figure>`;
    }).join("")}</div>`;

    setStatus(live
      ? `${candidates.length} of 4 photos. The one marked “On site” is what customers see.`
      : `${candidates.length} of 4 photos. None is on the website yet — choose one.`);
    stage.querySelectorAll("[data-zoom]").forEach((el) =>
      el.addEventListener("click", () => zoom(el.getAttribute("data-zoom"))));
    renderActions();
  }

  // A phone thumbnail is too small to judge a photo by. Show one full size,
  // with a way back to the strip.
  function zoom(id) {
    const c = candidates.find((x) => x.id === id);
    if (!c) return;
    stage.classList.remove("is-strip");
    stage.innerHTML = `<img class="cap__preview" src="${esc(SB.publicUrl(SB.pubBucket, c.image_path))}" alt="Full size photo">`;
    setStatus("Tap “Back to photos” to return.");
    actions.innerHTML = `<button class="btn btn--primary" id="cap-back">Back to photos</button>`;
    actions.hidden = false;
  }

  function renderDrop() {
    processed = null;
    stage.classList.remove("is-editing", "is-strip");
    setStatus("");
    // Two separate inputs on purpose. `capture` sends Android straight to the
    // camera app with no gallery option, and that hand-off is what makes the
    // phone discard the page — so offer a gallery route that skips it.
    stage.innerHTML = `
      <label class="cap__drop" id="cap-drop">
        <input id="cap-file" type="file" accept="image/*" capture="environment" hidden>
        <span>Tap to take a photo</span>
      </label>
      <label class="cap__alt" id="cap-alt-label">
        <input id="cap-file-alt" type="file" accept="image/*" hidden>
        <span>Choose from gallery</span>
      </label>`;
    for (const id of ["cap-file", "cap-file-alt"]) {
      $(id).addEventListener("change", onFile);
      $(id).addEventListener("click", () => diag(id === "cap-file" ? "camera opened" : "gallery picker opened"));
    }
    // Say the size out loud BEFORE they shoot, not after — on mobile data this
    // download is the difference between "slow" and "gave up".
    if (modelReady()) setNote("");
    else setNote(`
      <p>This phone still needs a one-time <b>${ImgPipeline.firstRunMB} MB</b> download before it can clean up photos.
         Do it on WiFi — after that, photos are quick and work anywhere.</p>
      <button class="btn btn--ghost" id="cap-prep" type="button">Download it now</button>`);
    if ($("cap-prep")) $("cap-prep").addEventListener("click", prepare);
    renderActions();
  }

  // Fetch the model without taking a photo, so the big download can happen on
  // WiFi at the shop instead of on mobile data in front of a customer.
  async function prepare() {
    diag("preload started");
    setNote(`<p id="prep-msg">Starting the download…</p>`);
    try {
      await ImgPipeline.preload(onModelStatus((m) => { const el = $("prep-msg"); if (el) el.textContent = m; }));
      markModelReady();
      diag("preload OK");
      setNote(`<p>Ready — this phone can now clean up photos anywhere.</p>`);
    } catch (err) {
      diag("PRELOAD FAILED: " + err.message);
      setNote(`<p>That didn't finish: ${esc(err.message)}</p>
               <button class="btn btn--ghost" id="cap-prep" type="button">Try again</button>`);
      if ($("cap-prep")) $("cap-prep").addEventListener("click", prepare);
    }
  }

  // Shared progress plumbing: paint every message, but only log the milestones
  // so 42 MB of chunk events can't flood the diagnostics log.
  function onModelStatus(paint) {
    let logged = -1;
    return (msg, pct) => {
      paint(msg);
      if (pct == null) { diag(msg); return; }
      const bucket = Math.floor(pct / 25);
      if (bucket > logged) { logged = bucket; diag("download " + pct + "%"); }
    };
  }

  async function onFile(e) {
    diag("change fired, files=" + (e.target.files ? e.target.files.length : "none"));
    const file = e.target.files[0];
    if (!file) { diag("no file returned — aborted"); return; }
    originalFile = file;
    diag("file received: " + Math.round(file.size / 1024) + " KB, " + (file.type || "unknown type"));
    try {
      const raw = await fileToCanvas(file);
      renderTrim(raw);
    } catch (err) {
      diag("COULD NOT READ IMAGE: " + err.message);
      setStatus("Couldn't read that photo. Try another one.");
      renderDrop();
    }
  }

  function fileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }

  function killEditor() { if (editor) { editor.destroy(); editor = null; } }

  // Stage 1 — straighten and crop the raw photo, before the model sees it.
  function renderTrim(raw) {
    diag("stage 1 edit");
    processed = null;
    killEditor();
    stage.classList.add("is-editing");
    stage.innerHTML = `<div id="ed-host" style="width:100%"></div>`;
    editor = ImgEdit.mountEditor($("ed-host"), raw, {});
    setStatus("Straighten or crop if you need to, then Continue.");
    actions.innerHTML = `
      <button class="btn btn--ghost" id="cap-retake">Retake</button>
      <button class="btn btn--primary" id="cap-continue">Continue</button>`;
    actions.hidden = false;
  }

  // The slow step, run exactly once per photo.
  async function runCutout() {
    const edited = editor ? editor.getResult() : null;
    if (!edited) return;
    killEditor();
    setNote("");
    setStatus(modelReady()
      ? "Cleaning up the photo…"
      : `Setting up this phone — about ${ImgPipeline.firstRunMB} MB to download, once. Stay on WiFi.`);
    stage.classList.remove("is-editing");
    stage.innerHTML = `<div class="cap__spin">Processing…</div>`;
    actions.hidden = true;
    try {
      cut = await ImgPipeline.cutout(edited, null, onModelStatus(setStatus));
      markModelReady();
      diag("cutout OK");
      renderAdjust();
    } catch (err) {
      diag("PROCESSING FAILED: " + err.message);
      setStatus("Couldn't process that image. Try another. (" + err.message + ")");
      renderTrim(edited);   // keep their work rather than sending them back to the camera
    }
  }

  // Stage 2 — same controls on the finished white-background result. Instant,
  // because it re-composites the cached cut-out instead of re-running the model.
  function renderAdjust() {
    diag("stage 2 edit");
    killEditor();
    stage.classList.add("is-editing");
    stage.innerHTML = `
      <div id="ed-host" style="width:100%"></div>
      <div class="ed__result"><img id="ed-out" alt="How it will look on the website"></div>`;
    let seq = 0;
    const recompose = async () => {
      // mountEditor fires onChange once during mount, before `editor` is
      // assigned below. The explicit call after mounting covers that case.
      if (!editor) return;
      const mine = ++seq;
      const result = await ImgPipeline.compose(editor.getResult());
      if (mine !== seq) return;         // a newer edit landed while we encoded
      processed = result;
      const out = $("ed-out");
      if (out) out.src = URL.createObjectURL(result.mainBlob);
      renderActions();
    };
    editor = ImgEdit.mountEditor($("ed-host"), cut, { onChange: recompose });
    setStatus("This is how it will look on the website.");
    recompose();
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
    if (e.target.id === "cap-retake") { killEditor(); hadPhoto ? renderCandidates() : renderDrop(); }
    else if (e.target.id === "cap-back") renderCandidates();
    else if (e.target.id === "cap-replace") renderDrop();
    else if (e.target.id === "cap-continue") runCutout();
    else if (e.target.id === "cap-publish") publish();
    else if (e.target.id === "cap-remove") remove();
  });
  $("cap-x").addEventListener("click", close);

  hadPhoto ? renderCandidates() : renderDrop();
}
