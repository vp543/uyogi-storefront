// UYOGI storefront — site configuration.
// Edit these values without touching the rest of the code.
window.UYOGI_CONFIG = {
  company: {
    name: "Yogi IT Services",
    brand: "UYOGI",
    tagline: "Stocking IT, electronics & home goods across Kigali.",
    email: "yis.kigali@gmail.com",
    // Fill these in when ready — they show on the site automatically.
    phone: "",          // e.g. "+250 7XX XXX XXX"
    whatsapp: "",       // digits only, e.g. "2507XXXXXXXX"
    shopName: "Main Shop",
    address: "",        // e.g. "KN 4 Ave, Kigali" — shown next to the shop name
    // UYOGI has ONE customer-facing shop in Kigali; stock is held behind it and
    // delivered citywide. (Warehouses aren't shopfronts, so we don't list them.)
    locations: ["Main Shop, Kigali"],
  },

  // ── Product photos (Supabase) ──────────────────────────────────────────
  // Leave blank to disable photos entirely — the storefront then behaves
  // exactly as a static catalog (the "photo pending" look). Fill these in
  // from Supabase → Project Settings → API (see docs/supabase-setup.md).
  supabase: {
    url: "",       // e.g. https://xxxx.supabase.co
    anonKey: "",   // anon public key (safe to expose; RLS protects the data)
  },
  photos: {
    bucket: "product-photos",   // public bucket holding <sku>/main.webp + thumb.webp
  },

  // ── Quote form email delivery ──────────────────────────────────────────
  // The form sends quote requests to company.email. It picks a method below,
  // in this priority order. A mailto: fallback always covers the rest.
  quoteEmail: {
    // Method 1 (DEFAULT, no key needed): FormSubmit.co delivers straight to
    // company.email. ONE-TIME SETUP: submit the form once on the live site;
    // FormSubmit emails yis.kigali@gmail.com a confirmation link — click it,
    // and every future submission arrives automatically in the inbox.
    useFormsubmit: true,

    // Method 2 (optional alternative): paste a Web3Forms access key
    // (free at https://web3forms.com, tied to yis.kigali@gmail.com). If set,
    // this is used instead of FormSubmit.
    web3formsAccessKey: "",
  },

  pageSize: 24,
};
