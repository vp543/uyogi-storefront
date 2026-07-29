// Photo editing: rotate, straighten, crop. Two layers —
//   1. pure canvas transforms (no DOM events, unit-testable with pixel checks)
//   2. mountEditor(), a touch-friendly UI built on top of them
// Knows nothing about products, Supabase or publishing, so it can be tested alone.
window.ImgEdit = (function () {
  const MAX_ANGLE = 15;                 // beyond this, the 90° buttons are the right tool
  const MIN_CROP = 16;                  // source px; smaller than this is a mis-drag
  const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // ── pure transforms — each returns a NEW canvas, never mutates its input ──
  function rotate90(canvas, dir) {
    const c = cv(canvas.height, canvas.width);
    const x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2);
    x.rotate((dir >= 0 ? 90 : -90) * Math.PI / 180);
    x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  function straighten(canvas, deg) {
    const a = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, deg || 0)) * Math.PI / 180;
    if (!a) return copy(canvas);
    // Grow the canvas so no corner is clipped by the rotation.
    const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const w = Math.ceil(canvas.width * cos + canvas.height * sin);
    const h = Math.ceil(canvas.width * sin + canvas.height * cos);
    const c = cv(w, h), x = c.getContext("2d");
    x.translate(w / 2, h / 2);
    x.rotate(a);
    x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  function cropCanvas(canvas, rect) {
    const x0 = Math.max(0, Math.min(Math.round(rect.x), canvas.width - 1));
    const y0 = Math.max(0, Math.min(Math.round(rect.y), canvas.height - 1));
    const w = Math.max(1, Math.min(Math.round(rect.w), canvas.width - x0));
    const h = Math.max(1, Math.min(Math.round(rect.h), canvas.height - y0));
    const c = cv(w, h);
    c.getContext("2d").drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    return c;
  }

  function copy(canvas) {
    const c = cv(canvas.width, canvas.height);
    c.getContext("2d").drawImage(canvas, 0, 0);
    return c;
  }

  // Order is fixed and must not vary: quarter turns, then straighten, then crop.
  // The crop rectangle is therefore in the coordinate space of the rotated image.
  function applyEdit(canvas, edit) {
    const e = edit || {};
    let out = copy(canvas);
    const quarters = (((e.quarter | 0) % 4) + 4) % 4;
    for (let i = 0; i < quarters; i++) out = rotate90(out, 1);
    if (e.angle) out = straighten(out, e.angle);
    if (e.crop) out = cropCanvas(out, e.crop);
    return out;
  }

  // Size of the image after rotation but before cropping — the space crop rects live in.
  function rotatedSize(canvas, edit) {
    const e = edit || {};
    const q = (((e.quarter | 0) % 4) + 4) % 4;
    let w = q % 2 ? canvas.height : canvas.width;
    let h = q % 2 ? canvas.width : canvas.height;
    if (e.angle) {
      const a = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, e.angle)) * Math.PI / 180;
      const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
      const w2 = Math.ceil(w * cos + h * sin), h2 = Math.ceil(w * sin + h * cos);
      w = w2; h = h2;
    }
    return { w, h };
  }

  // ── editor UI ────────────────────────────────────────────────────────
  // mountEditor(container, sourceCanvas, { onChange }) -> { getEdit, getResult,
  // isValid, destroy }. Pointer events cover mouse and touch in one path.
  function mountEditor(container, source, opts = {}) {
    const edit = { quarter: 0, angle: 0, crop: null };
    let rotated = null;                 // source after quarter+angle, before crop

    container.innerHTML = `
      <div class="ed">
        <div class="ed__stage" id="ed-stage">
          <canvas class="ed__canvas" id="ed-canvas"></canvas>
          <div class="ed__crop" id="ed-crop" hidden>
            <span class="ed__h" data-h="nw"></span><span class="ed__h" data-h="ne"></span>
            <span class="ed__h" data-h="sw"></span><span class="ed__h" data-h="se"></span>
          </div>
        </div>
        <div class="ed__row">
          <button type="button" class="btn btn--ghost" id="ed-rl">↺ 90°</button>
          <button type="button" class="btn btn--ghost" id="ed-rr">↻ 90°</button>
          <button type="button" class="btn btn--ghost" id="ed-reset">Reset</button>
        </div>
        <label class="ed__slider">Straighten
          <input type="range" id="ed-angle" min="-${MAX_ANGLE}" max="${MAX_ANGLE}" step="1" value="0">
          <span id="ed-angle-val">0°</span>
        </label>
        <p class="ed__hint" id="ed-hint">Drag the corners to crop.</p>
      </div>`;

    const $ = (id) => container.querySelector("#" + id);
    const canvas = $("ed-canvas"), cropBox = $("ed-crop"), stage = $("ed-stage");

    // Redraw the preview from the source, then place the crop overlay on top.
    function redraw() {
      rotated = applyEdit(source, { quarter: edit.quarter, angle: edit.angle, crop: null });
      const maxW = stage.clientWidth || 300;
      const scale = Math.min(1, maxW / rotated.width);
      canvas.width = Math.round(rotated.width * scale);
      canvas.height = Math.round(rotated.height * scale);
      canvas.getContext("2d").drawImage(rotated, 0, 0, canvas.width, canvas.height);
      placeCrop();
      if (opts.onChange) opts.onChange(getEdit());
    }

    const scaleFactor = () => (rotated ? canvas.width / rotated.width : 1);

    function placeCrop() {
      if (!edit.crop) { cropBox.hidden = true; return; }
      const s = scaleFactor();
      cropBox.hidden = false;
      cropBox.style.left = (canvas.offsetLeft + edit.crop.x * s) + "px";
      cropBox.style.top = (canvas.offsetTop + edit.crop.y * s) + "px";
      cropBox.style.width = (edit.crop.w * s) + "px";
      cropBox.style.height = (edit.crop.h * s) + "px";
    }

    function clampCrop() {
      if (!edit.crop) return;
      const c = edit.crop;
      c.x = Math.max(0, Math.min(c.x, rotated.width - MIN_CROP));
      c.y = Math.max(0, Math.min(c.y, rotated.height - MIN_CROP));
      c.w = Math.max(MIN_CROP, Math.min(c.w, rotated.width - c.x));
      c.h = Math.max(MIN_CROP, Math.min(c.h, rotated.height - c.y));
    }

    // Drag a corner handle, or drag on the image to draw a fresh crop box.
    let drag = null;
    const toSource = (ev) => {
      const r = canvas.getBoundingClientRect(), s = scaleFactor();
      return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s };
    };

    function onDown(ev) {
      const handle = ev.target.getAttribute && ev.target.getAttribute("data-h");
      const p = toSource(ev);
      if (handle) drag = { handle };
      else drag = { handle: "new", ox: p.x, oy: p.y };
      if (drag.handle === "new") edit.crop = { x: p.x, y: p.y, w: MIN_CROP, h: MIN_CROP };
      ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }

    function onMove(ev) {
      if (!drag || !edit.crop) return;
      const p = toSource(ev), c = edit.crop;
      if (drag.handle === "new") {
        c.x = Math.min(drag.ox, p.x); c.y = Math.min(drag.oy, p.y);
        c.w = Math.abs(p.x - drag.ox); c.h = Math.abs(p.y - drag.oy);
      } else {
        const right = c.x + c.w, bottom = c.y + c.h;
        if (drag.handle.includes("w")) { c.x = Math.min(p.x, right - MIN_CROP); c.w = right - c.x; }
        if (drag.handle.includes("e")) { c.w = Math.max(MIN_CROP, p.x - c.x); }
        if (drag.handle.includes("n")) { c.y = Math.min(p.y, bottom - MIN_CROP); c.h = bottom - c.y; }
        if (drag.handle.includes("s")) { c.h = Math.max(MIN_CROP, p.y - c.y); }
      }
      clampCrop(); placeCrop();
      ev.preventDefault();
    }

    function onUp() {
      if (!drag) return;
      drag = null;
      clampCrop(); placeCrop();
      if (opts.onChange) opts.onChange(getEdit());
    }

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    $("ed-rl").addEventListener("click", () => { edit.quarter = (edit.quarter + 3) % 4; edit.crop = null; redraw(); });
    $("ed-rr").addEventListener("click", () => { edit.quarter = (edit.quarter + 1) % 4; edit.crop = null; redraw(); });
    $("ed-reset").addEventListener("click", () => {
      edit.quarter = 0; edit.angle = 0; edit.crop = null;
      $("ed-angle").value = 0; $("ed-angle-val").textContent = "0°";
      redraw();
    });
    $("ed-angle").addEventListener("input", (e) => {
      edit.angle = Number(e.target.value);
      $("ed-angle-val").textContent = edit.angle + "°";
      edit.crop = null;                 // the crop space changed under it
      redraw();
    });

    redraw();

    const getEdit = () => ({ quarter: edit.quarter, angle: edit.angle, crop: edit.crop ? { ...edit.crop } : null });
    return {
      getEdit,
      getResult: () => applyEdit(source, getEdit()),
      isValid: () => !edit.crop || (edit.crop.w >= MIN_CROP && edit.crop.h >= MIN_CROP),
      destroy: () => {
        window.removeEventListener("pointerup", onUp);
        container.innerHTML = "";
      },
    };
  }

  return { rotate90, straighten, cropCanvas, applyEdit, rotatedSize, copy, mountEditor, MAX_ANGLE, MIN_CROP };
})();
