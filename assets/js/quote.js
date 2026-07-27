// Quote page controller — cart list + inquiry form (Web3Forms with mailto fallback).
(function () {
  UI.initChrome("quote");
  const CFG = UYOGI_CONFIG;
  const listEl = document.getElementById("q-items");
  const emptyEl = document.getElementById("q-empty");
  const formWrap = document.getElementById("q-form-wrap");

  function iconFor(cat) { return window.categoryIcon(cat); }

  function renderItems() {
    const items = Cart.items();
    UI.updateCartBadge();
    if (!items.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      formWrap.style.display = "none";
      return;
    }
    emptyEl.style.display = "none";
    formWrap.style.display = "";
    listEl.innerHTML = items
      .map(
        (i) => `<div class="q-item" data-id="${UI.esc(i.id)}">
          <div class="q-item__tile">${iconFor(i.category)}</div>
          <div>
            <div class="q-item__name">${UI.esc(i.name)}</div>
            <div class="q-item__code">${i.code ? UI.esc(i.code) : UI.esc(i.category)}</div>
          </div>
          <div class="qty q-item__qty">
            <button type="button" data-step="-1" aria-label="Decrease">−</button>
            <input type="number" min="1" value="${i.qty}" aria-label="Quantity for ${UI.esc(i.name)}">
            <button type="button" data-step="1" aria-label="Increase">+</button>
          </div>
          <button class="q-item__rm" data-rm="${UI.esc(i.id)}" aria-label="Remove ${UI.esc(i.name)}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>`
      )
      .join("");
  }

  listEl.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) { Cart.remove(rm.getAttribute("data-rm")); renderItems(); return; }
    const step = e.target.closest("[data-step]");
    if (step) {
      const item = step.closest(".q-item");
      const id = item.getAttribute("data-id");
      const input = item.querySelector("input");
      const next = Math.max(1, (parseInt(input.value, 10) || 1) + parseInt(step.getAttribute("data-step"), 10));
      Cart.setQty(id, next);
      input.value = next;
      UI.updateCartBadge();
    }
  });
  listEl.addEventListener("change", (e) => {
    if (e.target.matches("input")) {
      const item = e.target.closest(".q-item");
      const next = Math.max(1, parseInt(e.target.value, 10) || 1);
      Cart.setQty(item.getAttribute("data-id"), next);
      e.target.value = next;
      UI.updateCartBadge();
    }
  });

  // ---- Form submit ----
  const form = document.getElementById("quote-form");

  function itemsText() {
    return Cart.items()
      .map((i, n) => `${n + 1}. ${i.name}${i.code ? " [" + i.code + "]" : ""} — qty ${i.qty}`)
      .join("\n");
  }

  function showSuccess(name) {
    formWrap.innerHTML = `<div class="q-success">
      <div class="ok-mark"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <h3>Request sent${name ? ", " + UI.esc(name.split(" ")[0]) : ""}!</h3>
      <p class="sub">Thank you. The UYOGI team will get back to you at the contact you provided with prices and availability.</p>
      <a class="btn btn--primary" href="shop.html" style="margin-top:8px">Continue browsing</a>
    </div>`;
    Cart.clear();
    UI.updateCartBadge();
  }

  function mailtoFallback(payload) {
    const body =
      `New quote request from the UYOGI website%0D%0A%0D%0A` +
      `Name: ${encodeURIComponent(payload.name)}%0D%0A` +
      `Phone: ${encodeURIComponent(payload.phone)}%0D%0A` +
      `Email: ${encodeURIComponent(payload.email || "-")}%0D%0A%0D%0A` +
      `Items requested:%0D%0A${encodeURIComponent(payload.items)}%0D%0A%0D%0A` +
      `Message: ${encodeURIComponent(payload.message || "-")}`;
    const subject = encodeURIComponent(`Quote request — ${payload.name}`);
    window.location.href = `mailto:${CFG.company.email}?subject=${subject}&body=${body}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!Cart.items().length) { UI.toast("Add at least one product first."); return; }
    const fd = new FormData(form);
    const payload = {
      name: (fd.get("name") || "").toString().trim(),
      phone: (fd.get("phone") || "").toString().trim(),
      email: (fd.get("email") || "").toString().trim(),
      message: (fd.get("message") || "").toString().trim(),
      items: itemsText(),
    };
    if (!payload.name || !payload.phone) {
      UI.toast("Please enter your name and phone number.");
      return;
    }

    const submitBtn = document.getElementById("q-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    const resetBtn = () => { submitBtn.disabled = false; submitBtn.textContent = "Send quote request"; };

    const cfg = CFG.quoteEmail || {};
    const messageBody = `Items requested:\n${payload.items}\n\nMessage: ${payload.message || "-"}`;

    // Method 2 — Web3Forms (used only if an access key is configured).
    if (cfg.web3formsAccessKey) {
      try {
        const res = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            access_key: cfg.web3formsAccessKey,
            subject: `Quote request — ${payload.name}`,
            from_name: "UYOGI Website",
            name: payload.name, phone: payload.phone,
            email: payload.email || "not provided", message: messageBody,
          }),
        });
        const json = await res.json();
        if (json.success) { showSuccess(payload.name); return; }
        throw new Error(json.message || "send failed");
      } catch (err) {
        UI.toast("Couldn't send automatically — opening your email app.");
        mailtoFallback(payload);
      } finally { resetBtn(); }
      return;
    }

    // Method 1 (default) — FormSubmit.co, delivers to company.email. No key.
    if (cfg.useFormsubmit) {
      try {
        const res = await fetch(
          "https://formsubmit.co/ajax/" + encodeURIComponent(CFG.company.email),
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              _subject: `Quote request — ${payload.name}`,
              _template: "table",
              Name: payload.name,
              Phone: payload.phone,
              Email: payload.email || "not provided",
              Items: payload.items,
              Message: payload.message || "-",
            }),
          }
        );
        const json = await res.json();
        // FormSubmit returns success:"true" once activated; before activation it
        // still returns success and emails a one-time confirmation link.
        if (json.success === true || json.success === "true") { showSuccess(payload.name); return; }
        throw new Error(json.message || "send failed");
      } catch (err) {
        UI.toast("Couldn't send automatically — opening your email app.");
        mailtoFallback(payload);
      } finally { resetBtn(); }
      return;
    }

    // No service configured — mailto fallback.
    mailtoFallback(payload);
    resetBtn();
    setTimeout(() => showSuccess(payload.name), 400);
  });

  Cart.onChange(renderItems);
  renderItems();
})();
