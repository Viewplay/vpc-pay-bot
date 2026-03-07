function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

let _cache = null;

function loadRegistry() {
  if (_cache) return _cache;

  // You will set this on Render as one JSON string:
  // PROMO_REGISTRY_JSON = {"ERIC10":{"name":"Eric","chatId":"7826360898","discountPct":4}}
  const raw = (process.env.PROMO_REGISTRY_JSON || "").trim();
  const obj = raw ? safeParseJson(raw) : null;

  _cache = (obj && typeof obj === "object") ? obj : {};
  return _cache;
}

/**
 * Returns promo entry by code.
 * Example entry:
 * { name: "Eric", chatId: "7826360898", discountPct: 4 }
 */
export function getPromoByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  const reg = loadRegistry();
  const v = reg[c];
  if (!v || typeof v !== "object") return null;

  const name = String(v.name || "").trim() || c;
  const chatId = String(v.chatId || "").trim();
  const discountPct = Number(v.discountPct || 0);

  return { code: c, name, chatId, discountPct: Number.isFinite(discountPct) ? discountPct : 0 };
}

export function getDiscountPct(code) {
  const p = getPromoByCode(code);
  return p ? p.discountPct : 0;
}
