// Product detail controller.
(async function () {
  UI.initChrome("shop");
  const root = document.getElementById("pdp-root");

  let data;
  try {
    data = await UYOGI.load();
    window.__data = data;
  } catch (e) {
    root.innerHTML = `<div class="empty"><h3>Catalog unavailable</h3><p>Please email <a href="mailto:${UYOGI_CONFIG.company.email}">${UYOGI_CONFIG.company.email}</a>.</p></div>`;
    return;
  }
  if (window.Photos) await Photos.load();

  const id = new URLSearchParams(location.search).get("id");
  const p = id ? UYOGI.byId(data, id) : null;

  if (!p) {
    root.innerHTML = `<div class="empty">
      <h3>Product not found</h3><p>It may be out of our catalog. Browse everything instead.</p>
      <a class="btn btn--primary" href="shop.html" style="margin-top:14px">Go to shop</a></div>`;
    document.title = "Product not found · UYOGI";
    return;
  }

  document.title = `${p.name} · UYOGI`;

  // UYOGI has one customer-facing shop; stock is held behind it. We show the
  // total on hand, not internal warehouse splits (those aren't shopfronts).
  let availabilityBox = "";
  if (p.inStock) {
    availabilityBox = `<div class="pdp__box">
        <h4>Availability</h4>
        <p class="loc-summary"><strong>${p.qty} in stock</strong> in Kigali. Add it to a quote and we'll confirm pickup at the shop or delivery to you.</p>
      </div>`;
  }

  root.innerHTML = `
    <div class="crumbs wrap">
      <a href="index.html">Home</a> <span>›</span>
      <a href="shop.html">Shop</a> <span>›</span>
      <a href="shop.html?category=${encodeURIComponent(p.category)}">${UI.esc(p.category)}</a>
    </div>
    <div class="wrap pdp">
      <div class="pdp__media">
        ${(window.Photos && Photos.fullFor(p.id))
          ? `<img class="pdp__img" src="${Photos.fullFor(p.id)}" alt="${UI.esc(p.name)}">`
          : `<span class="pdp-media-tag">Photo soon</span>
             <span class="pdp-glyph">${window.categoryIcon(p.category)}</span>
             ${p.code ? `<span class="pdp-media-code">${UI.esc(p.code)}</span>` : ""}`}
      </div>
      <div class="pdp__info">
        <span class="pdp__cat">${UI.esc(p.category)}</span>
        <h1>${UI.esc(p.name)}</h1>
        <div class="pdp__meta">
          ${UI.stockBadge(p)}
          ${p.code ? `<span class="pdp__code">${UI.esc(p.code)}</span>` : ""}
          <span class="pdp__price">${UI.priceLabel(p)}</span>
        </div>

        ${availabilityBox}

        <div class="pdp__actions">
          <div class="qty">
            <button type="button" data-step="-1" aria-label="Decrease">−</button>
            <input id="qty" type="number" value="1" min="1" inputmode="numeric" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase">+</button>
          </div>
          <button class="btn btn--primary btn--lg" id="add-btn">Add to quote</button>
          <a class="btn btn--ghost btn--lg" href="quote.html">View quote</a>
        </div>
        <p class="note">${p.inStock
          ? "In stock now. Add it to your quote and we'll confirm price, availability and delivery."
          : "Currently out of stock — you can still request it and we'll source or restock it for you."}</p>
      </div>
    </div>
  `;

  const qtyInput = document.getElementById("qty");
  root.querySelectorAll("[data-step]").forEach((b) =>
    b.addEventListener("click", () => {
      const step = parseInt(b.getAttribute("data-step"), 10);
      qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) + step);
    })
  );
  document.getElementById("add-btn").addEventListener("click", () => {
    const q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    Cart.add(p, q);
    UI.updateCartBadge();
    UI.toast(`Added ${q} × “${p.name}” to your quote`);
  });
})();
