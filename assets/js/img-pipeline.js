// Client-side product-photo pipeline: remove background, trim to the product,
// center on a white square with padding + soft shadow, export webp + thumb.
// Nothing leaves the device here — only the finished blobs are returned.
window.ImgPipeline = (function () {
  // pad is deliberately tight: the product should fill the frame, since the
  // background is already gone. It only needs to clear the drop shadow below.
  const DEFAULTS = { size: 1200, thumb: 400, pad: 36, bg: "#ffffff" };

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

  // The slow half: download/run the model and return the transparent cut-out.
  // Accepts a File/Blob straight from the camera, or a canvas the user has
  // already rotated and cropped. removeBg is injected so tests can stub it.
  async function cutout(input, removeBg) {
    if (!removeBg) {
      const mod = await import("https://esm.sh/@imgly/background-removal@1.5.5");
      removeBg = mod.removeBackground;
    }
    const source = (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement)
      ? await new Promise((r) => input.toBlob(r, "image/png"))
      : input;
    const cutBlob = await removeBg(source);        // PNG blob (transparent background)
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

  return { processImage, cutout, compose, _contentBounds, _fitBox, _compose };
})();
