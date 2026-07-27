// Category glyphs — simple line icons drawn in currentColor.
// One per catalog category; a neutral box is the fallback.
(function () {
  const S = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICONS = {
    "Printers": S('<rect x="6" y="3" width="12" height="6" rx="1"/><path d="M6 15H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/><circle cx="17.5" cy="11.5" r=".6" fill="currentColor"/>'),
    "Laptops": S('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20M8 20l1-2h6l1 2"/>'),
    "Desktops": S('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M10 16v4M14 16v4"/>'),
    "Toners": S('<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h4l2 4"/><path d="M7 12h4"/>'),
    "Accessories": S('<path d="M12 3a4 4 0 0 1 4 4c0 3-4 4-4 7"/><circle cx="12" cy="18" r="1" fill="currentColor"/><path d="M5 8l2 2M19 8l-2 2"/>'),
    "Stationery": S('<path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>'),
    "Screens": S('<rect x="2" y="4" width="20" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
    "Hardware": S('<path d="M14 6.5a3.5 3.5 0 0 0-4.6 4.6l-5 5a1.5 1.5 0 0 0 2.1 2.1l5-5A3.5 3.5 0 0 0 17.5 9l-2.2 2.2-2.5-.5-.5-2.5L14 6.5z"/>'),
    "Gas Stoves": S('<rect x="4" y="9" width="16" height="11" rx="2"/><circle cx="9" cy="14" r="2.5"/><circle cx="16" cy="13" r="1.5"/><path d="M12 4c1.5 1 1.5 2.5 0 3.5C10.5 6.5 10.5 5 12 4z"/>'),
    "Lighting": S('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1-1 2H9c0-1-.3-1.4-1-2A6 6 0 0 1 12 3z"/>'),
    "Stabilizers": S('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M13 8l-4 5h3l-1 3 4-5h-3z"/>'),
    "Networking": S('<rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 17h.01M11 17h.01M17 17h1"/><path d="M12 13V9M8 9h8M8 9V6M16 9V6"/>'),
    "Batteries": S('<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2M7 12h2M10.5 10.5v3"/>'),
    "Keyboards": S('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'),
    "Mice": S('<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 6v4"/>'),
    "Cables": S('<path d="M4 20c4 0 4-6 8-6s4 6 8 6"/><path d="M4 4v3a2 2 0 0 0 4 0V4M6 4v0"/><path d="M16 20v-3M18 20v-3"/>'),
    "Dispensers": S('<rect x="7" y="9" width="10" height="12" rx="2"/><rect x="9" y="3" width="6" height="6" rx="1"/><path d="M10 14h4"/>'),
    "Flash Drives": S('<rect x="8" y="3" width="8" height="14" rx="1.5"/><path d="M10 3V1.5M14 3V1.5M9 20h6l-1 2h-4z"/>'),
    "Projectors": S('<rect x="3" y="8" width="18" height="9" rx="2"/><circle cx="9" cy="12.5" r="2.5"/><path d="M16 11h2M6 17v2M18 17v2"/>'),
    "UPS": S('<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 7l-2 4h3l-1 4"/><path d="M9 3v0M15 3v0"/>'),
    "Household": S('<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
    "RAM": S('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v-2M10 8v-2M14 8v-2M18 8v-2M5 16v2M9 16v2M15 16v2M19 16v2M7 11h2M11 11h2M15 11h2"/>'),
    "CCTV": S('<path d="M3 8l13-3 1 4-13 3z"/><path d="M4 12v4a2 2 0 0 0 2 2h2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><path d="M17 9l4-1"/>'),
    "TVs": S('<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 21h6M12 17v4"/>'),
    "Scales": S('<path d="M4 20h16M12 4v16"/><path d="M12 4l-6 3 6-3 6 3"/><path d="M6 7l-2 5a2 2 0 0 0 4 0zM18 7l-2 5a2 2 0 0 0 4 0z"/>'),
    "Racks": S('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M8 6h.01M8 12h.01M8 18h.01"/>'),
    "Fans": S('<circle cx="12" cy="12" r="2"/><path d="M12 10c1-4-1-6-4-6 0 3 2 5 4 6M14 12c4-1 6 1 6 4-3 0-5-2-6-4M12 14c-1 4 1 6 4 6 0-3-2-5-4-6M10 12c-4 1-6-1-6-4 3 0 5 2 6 4"/>'),
    "Chairs & Tables": S('<path d="M7 4v7M7 11h6M13 4v16M7 11v9M17 4v16M15 12h6M9 20h8"/>'),
  };

  const FALLBACK = S('<rect x="4" y="7" width="16" height="12" rx="1.5"/><path d="M4 11h16M9 7V5h6v2"/>');

  window.categoryIcon = (name) => ICONS[name] || FALLBACK;
})();
