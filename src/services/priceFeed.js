const CACHE_TTL_MS = 20_000;
const cache = new Map(); // key -> { price, ts }

function now() { return Date.now(); }

async function fetchJson(url, { timeoutMs = 7000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { "accept": "application/json" } });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { ok: r.ok, status: r.status, data, text };
  } finally {
    clearTimeout(t);
  }
}

async function withRetry(fn, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 250 * (i + 1)));
  }
  throw lastErr;
}

async function priceFromCoinGecko(coingeckoId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=usd`;
  const res = await fetchJson(url, { timeoutMs: 7000 });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const p = res.data?.[coingeckoId]?.usd;
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) throw new Error("CoinGecko invalid price");
  return p;
}

function coinbasePairForId(coingeckoId) {
  const m = {
    bitcoin: "BTC-USD",
    ethereum: "ETH-USD",
    solana: "SOL-USD",
    tether: "USDT-USD",
  };
  return m[coingeckoId] || null;
}

async function priceFromCoinbase(coingeckoId) {
  // USDT sometimes not available or weird => fallback handled below
  const pair = coinbasePairForId(coingeckoId);
  if (!pair) throw new Error("Coinbase pair not supported");
  const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(pair)}/spot?currency=USD`;
  const res = await fetchJson(url, { timeoutMs: 7000 });
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const amt = res.data?.data?.amount;
  const p = Number(amt);
  if (!Number.isFinite(p) || p <= 0) throw new Error("Coinbase invalid price");
  return p;
}

/**
 * ✅ Robust USD price getter:
 * 1) cache
 * 2) CoinGecko (retry)
 * 3) Coinbase (retry)
 * 4) USDT hard fallback (1.00)
 */
export async function getUsdPrice(coingeckoId) {
  const key = String(coingeckoId || "").trim().toLowerCase();
  if (!key) throw new Error("Missing price id");

  const c = cache.get(key);
  if (c && (now() - c.ts) < CACHE_TTL_MS) return c.price;

  const errors = [];

  try {
    const p = await withRetry(() => priceFromCoinGecko(key), 2);
    cache.set(key, { price: p, ts: now() });
    return p;
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  try {
    const p = await withRetry(() => priceFromCoinbase(key), 2);
    cache.set(key, { price: p, ts: now() });
    return p;
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  // Last resort for stablecoins
  if (key === "tether") {
    const p = 1.0;
    cache.set(key, { price: p, ts: now() });
    return p;
  }

  throw new Error(`Price feed failed (${key}): ${errors.join(" | ")}`);
}
