// Shared UI: header, footer, product cards, badges, toasts.
window.UI = (function () {
  const CFG = window.UYOGI_CONFIG;

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // The real UYOGI wordmark (transparent PNG). It already contains "UYOGI",
  // so the header/footer no longer add separate brand text next to it.
  const logoMark = () =>
    `<img class="brand__logo" src="assets/img/uyogi-logo.png" alt="${esc(CFG.company.brand)} — ${esc(CFG.company.name)}" width="152" height="66">`;

  function stockBadge(p) {
    return p.inStock
      ? `<span class="badge badge--ok"><span class="dot"></span>In stock</span>`
      : `<span class="badge badge--out"><span class="dot"></span>Out of stock</span>`;
  }

  function priceLabel(p) {
    // Price-ready: show the number when present, otherwise invite a quote.
    if (p.price != null && p.price !== "") {
      return `<span class="price">RWF ${esc(Number(p.price).toLocaleString())}</span>`;
    }
    return `<span class="price price--ask">Request price</span>`;
  }

  // Catalog-line card: name + real part code + live status. No photo yet,
  // so we don't fake one with a decorative icon — the code carries the weight.
  function productCardHTML(p) {
    const photo = window.Photos && Photos.urlFor(p.id);
    const media = photo
      ? `<a class="card__photo" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}"><img loading="lazy" src="${esc(photo)}" alt="${esc(p.name)}"></a>`
      : "";
    return `<article class="card ${photo ? "card--haspic" : ""}" data-id="${esc(p.id)}">
      ${media}
      <div class="card__top">
        <a class="card__cat" href="shop.html?category=${encodeURIComponent(p.category)}">${window.categoryIcon(p.category)}${esc(p.category)}</a>
      </div>
      <h3 class="card__name"><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
      ${p.code ? `<span class="card__code">${esc(p.code)}</span>` : `<span class="card__code card__code--none">No code</span>`}
      <div class="card__foot">
        ${stockBadge(p)}
        ${priceLabel(p)}
      </div>
      <button class="btn btn--add" data-add="${esc(p.id)}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Add to quote
      </button>
    </article>`;
  }

  // Department tile for the full index grid.
  function categoryTileHTML(cat, count) {
    return `<a class="dept-tile" href="shop.html?category=${encodeURIComponent(cat)}">
      <span class="dept-tile__ic">${window.categoryIcon(cat)}</span>
      <span class="dept-tile__name">${esc(cat)}</span>
      <span class="dept-tile__n">${count}</span>
    </a>`;
  }

  // Single row on the live stock board (hero signature).
  function deptRowHTML(cat, count, inStockCount) {
    const live = inStockCount > 0;
    return `<a class="dept-row ${live ? "" : "dept-row--empty"}" href="shop.html?category=${encodeURIComponent(cat)}">
      <span class="dept-row__ic">${window.categoryIcon(cat)}</span>
      <span class="dept-row__name">${esc(cat)}</span>
      <span class="dept-row__n">${count}</span>
    </a>`;
  }

  function renderHeader(active) {
    const el = document.getElementById("site-header");
    if (!el) return;
    el.innerHTML = `
      <div class="wrap header__inner">
        <a class="brand" href="index.html" aria-label="${esc(CFG.company.brand)} home">
          ${logoMark()}
        </a>
        <form class="search" action="shop.html" method="get" role="search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input type="search" name="q" placeholder="Search 1,800+ products…" aria-label="Search products" autocomplete="off">
        </form>
        <nav class="nav" aria-label="Primary">
          <a href="shop.html" class="${active === "shop" ? "is-active" : ""}">Shop</a>
          <a href="about.html" class="${active === "about" ? "is-active" : ""}">About</a>
          <a class="nav__quote" href="quote.html">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 8h-12z"/><path d="M6 6L5 3H3"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
            <span>Quote</span>
            <span class="cart-count" data-cart-count>0</span>
          </a>
        </nav>
      </div>`;
    updateCartBadge();
  }

  function renderFooter() {
    const el = document.getElementById("site-footer");
    if (!el) return;
    const c = CFG.company;
    const tel = (n) => `<a href="tel:${esc(n.replace(/\s/g, ""))}">${esc(n)}</a>`;
    const contactRows = [
      c.phone ? tel(c.phone) : "",
      c.phone2 ? tel(c.phone2) : "",
      c.whatsapp ? `<a href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener">Chat on WhatsApp</a>` : "",
      `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
      c.instagram ? `<a href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a>` : "",
    ].filter(Boolean).join("");
    el.innerHTML = `
      <div class="wrap footer__inner">
        <div class="footer__brand">
          <a class="brand brand--light" href="index.html">${logoMark()}</a>
          <p>${esc(c.name)} — ${esc(c.tagline)}</p>
        </div>
        <div class="footer__col">
          <h4>Contact</h4>
          <div class="footer__links">${contactRows}</div>
        </div>
        <div class="footer__col">
          <h4>Visit</h4>
          <div class="footer__links">
            <span>${esc(c.shopName || "Main Shop")} · Kigali, Rwanda</span>
            ${c.address ? `<span>${esc(c.address)}</span>` : ""}
            ${c.hours ? `<span>${esc(c.hours)}</span>` : ""}
            <span>Delivery across Kigali</span>
          </div>
        </div>
        <div class="footer__col">
          <h4>Catalog</h4>
          <div class="footer__links">
            <a href="shop.html">All products</a>
            <a href="quote.html">Your quote</a>
            <a href="about.html">About us</a>
          </div>
        </div>
      </div>
      <div class="wrap footer__base">
        <span>© ${new Date().getFullYear()} ${esc(c.name)} · Kigali, Rwanda</span>
        <span>Prices on request${c.payment ? ` · ${esc(c.payment)}` : ""} · Delivery citywide</span>
      </div>`;
  }

  function updateCartBadge() {
    const n = window.Cart ? Cart.count() : 0;
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = n;
      el.classList.toggle("is-empty", n === 0);
    });
  }

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-show"), 2200);
  }

  // Wire any [data-add] button on the page to add its product to the quote.
  function bindAddButtons(getProduct) {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (!btn) return;
      const p = getProduct(btn.getAttribute("data-add"));
      if (!p) return;
      Cart.add(p);
      updateCartBadge();
      toast(`Added “${p.name}” to your quote`);
    });
  }

  function initChrome(active) {
    renderHeader(active);
    renderFooter();
    if (window.Cart) Cart.onChange(updateCartBadge);
  }

  return {
    esc, logoMark, stockBadge, priceLabel, productCardHTML, categoryTileHTML, deptRowHTML,
    renderHeader, renderFooter, updateCartBadge, toast, bindAddButtons, initChrome,
  };
})();
