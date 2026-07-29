// Client-side product-photo pipeline: remove background, trim to the product,
// center on a white square with padding + soft shadow, export webp + thumb.
// Nothing leaves the device here — only the finished blobs are returned.
window.ImgPipeline = (function () {
  // pad is deliberately tight: the product should fill the frame, since the
  // background is already gone. It only needs to clear the drop shadow below.
  const DEFAULTS = { size: 1200, thumb: 400, pad: 36, bg: "#ffffff" };

  // The remover downloads a model on first use and the browser caches it.
  // isnet_quint8 (42 MB) is the smallest one imgly ships; the library defaults
  // to isnet_fp16 (84 MB). On Kigali mobile data that difference is minutes and
  // half an employee's data bundle, and the quality loss on a product on a
  // plain surface is not visible.
  const MODEL = "isnet_quint8";
  const MODEL_BYTES = 44348940;                            // /models/isnet_quint8
  const RUNTIME_BYTES = 10684943;                          // largest ort wasm a phone may pick
  const FIRST_RUN_BYTES = MODEL_BYTES + RUNTIME_BYTES;     // ≈ 52 MB, once per phone
  // No progress event at all for this long means the network or the phone has
  // given up. Better to say so than to leave "Processing…" on screen forever.
  const STALL_MS = 180000;

  const COMPUTE_STEPS = {
    "compute:decode": "Reading the photo…",
    "compute:inference": "Removing the background…",
    "compute:mask": "Cleaning up the edges…",
    "compute:encode": "Finishing…",
  };

  // --- pure helpers (unit-tested) ---
  function _contentBounds(img) {
    const { data, width, height } = img;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: width, h: height }; // nothing found
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  function _fitBox(bw, bh, canvas, pad) {
    const inner = canvas - 2 * pad;
    const s = Math.min(inner / bw, inner / bh);
    return { dw: Math.round(bw * s), dh: Math.round(bh * s) };
  }

  async function _blobToImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  }

  // Compose a cut-out (RGBA canvas) onto a white square with a soft shadow.
  function _compose(cutCanvas, size, pad, bg) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const cctx = cutCanvas.getContext("2d");
    const bounds = _contentBounds(cctx.getImageData(0, 0, cutCanvas.width, cutCanvas.height));
    const { dw, dh } = _fitBox(bounds.w, bounds.h, size, pad);
    const dx = (size - dw) / 2, dy = (size - dh) / 2;
    ctx.save();
    // Shadow has to fit inside `pad` or it gets clipped at the canvas edge.
    ctx.shadowColor = "rgba(28,26,23,0.18)";
    ctx.shadowBlur = size * 0.015;
    ctx.shadowOffsetY = size * 0.008;
    ctx.drawImage(cutCanvas, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
    ctx.restore();
    return c;
  }
  function _toBlob(canvas, type, q) {
    return new Promise((res) => canvas.toBlob((b) => res(b), type, q));
  }
  function _resize(canvas, size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    c.getContext("2d").drawImage(canvas, 0, 0, size, size);
    return c;
  }

  // ── first-run download reporting ──────────────────────────────────────
  // imgly reports raw (key, current, total) events: bytes per resource for
  // "fetch:*", step counters for "compute:*". Turn those into one honest line
  // of text. Downloads are summed across resources and measured against the
  // expected first-run total, so the percentage can't reach 100% when only the
  // small wasm has landed and then appear to go backwards. Pure — self-tested.
  function makeProgressReporter(onStatus) {
    const seen = new Map();
    return function report(key, current, total) {
      if (key.indexOf("fetch:") === 0) {
        seen.set(key, { current, total });
        let got = 0, want = 0;
        for (const v of seen.values()) { got += v.current; want += v.total; }
        want = Math.max(want, FIRST_RUN_BYTES);
        const pct = Math.min(99, Math.floor((got / want) * 100));
        // Within a megabyte of the total, say "done" rather than "52 of 52 MB".
        onStatus(got >= want - 1048576
          ? "Downloaded — starting up…"
          : `Setting up this phone — ${pct}% (${_mb(got)} of ${_mb(want)} MB). One time only, stay on WiFi.`, pct);
      } else if (key.indexOf("compute:") === 0) {
        onStatus(COMPUTE_STEPS[key] || "Working…", null);
      }
    };
  }
  function _mb(bytes) { return Math.round(bytes / 1048576); }

  let _libPromise = null;
  function _lib() {
    if (!_libPromise) _libPromise = import("https://esm.sh/@imgly/background-removal@1.5.5");
    return _libPromise;
  }

  // Runs `work(progress)`, failing loudly if that progress callback goes quiet
  // for STALL_MS instead of hanging on a dead download forever.
  async function _watched(onStatus, work) {
    const report = makeProgressReporter(onStatus || function () {});
    let last = Date.now(), timer = null;
    const progress = (key, cur, tot) => {
      last = Date.now();
      try { report(key, cur, tot); } catch (_) { /* status text is never worth failing over */ }
    };
    const stalled = new Promise((_res, rej) => {
      timer = setInterval(() => {
        if (Date.now() - last > STALL_MS)
          rej(new Error("the download stopped — check the connection and try again"));
      }, 5000);
    });
    try { return await Promise.race([work(progress), stalled]); }
    finally { clearInterval(timer); }
  }

  // Download and initialise the model without processing anything, so an
  // employee can do the big one-time download on WiFi before they start.
  async function preload(onStatus) {
    const mod = await _lib();
    return _watched(onStatus, (progress) => mod.preload({ model: MODEL, progress }));
  }

  // The slow half: download/run the model and return the transparent cut-out.
  // Accepts a File/Blob straight from the camera, or a canvas the user has
  // already rotated and cropped. removeBg is injected so tests can stub it.
  async function cutout(input, removeBg, onStatus) {
    if (!removeBg) removeBg = (await _lib()).removeBackground;
    const source = (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement)
      ? await new Promise((r) => input.toBlob(r, "image/png"))
      : input;
    // PNG blob (transparent background)
    const cutBlob = await _watched(onStatus, (progress) => removeBg(source, { model: MODEL, progress }));
    const cutImg = await _blobToImage(cutBlob);
    const cut = document.createElement("canvas");
    cut.width = cutImg.naturalWidth; cut.height = cutImg.naturalHeight;
    cut.getContext("2d").drawImage(cutImg, 0, 0);
    return cut;
  }

  // The fast half: drop the cut-out onto the white square and encode. Cheap
  // enough to re-run on every edit, which is what keeps stage 2 instant.
  async function compose(cut, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const main = _compose(cut, o.size, o.pad, o.bg);
    const thumb = _resize(main, o.thumb);
    return {
      mainBlob: await _toBlob(main, "image/webp", 0.9),
      thumbBlob: await _toBlob(thumb, "image/webp", 0.85),
      width: o.size, height: o.size,
      preview: main,
    };
  }

  // Kept for callers that want the whole thing in one go.
  async function processImage(file, opts = {}, removeBg) {
    return compose(await cutout(file, removeBg), opts);
  }

  return {
    processImage, cutout, compose, preload,
    firstRunMB: _mb(FIRST_RUN_BYTES),
    _contentBounds, _fitBox, _compose, _makeProgressReporter: makeProgressReporter,
  };
})();
