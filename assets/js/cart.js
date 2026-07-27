// Quote cart — persisted in localStorage. Works for in-stock and out-of-stock items.
window.Cart = (function () {
  const KEY = "uyogi_quote_v1";
  const listeners = [];

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    listeners.forEach((fn) => fn(items));
  }

  function items() {
    return read();
  }
  function count() {
    return read().reduce((n, i) => n + (i.qty || 1), 0);
  }
  function has(id) {
    return read().some((i) => i.id === id);
  }
  function add(product, qty = 1) {
    const items = read();
    const found = items.find((i) => i.id === product.id);
    if (found) {
      found.qty += qty;
    } else {
      items.push({
        id: product.id,
        code: product.code,
        name: product.name,
        category: product.category,
        qty,
      });
    }
    write(items);
  }
  function setQty(id, qty) {
    const items = read().map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i));
    write(items);
  }
  function remove(id) {
    write(read().filter((i) => i.id !== id));
  }
  function clear() {
    write([]);
  }
  function onChange(fn) {
    listeners.push(fn);
  }

  // Cross-tab sync.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) listeners.forEach((fn) => fn(read()));
  });

  return { items, count, has, add, setQty, remove, clear, onChange };
})();
