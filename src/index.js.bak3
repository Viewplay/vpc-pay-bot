import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

import { db, migrate } from "./storage/db.js";
import { config } from "./runtime/config.js";
import { computeDiscountRate, computeVpcAmount } from "./vpc/pricing.js";
import { isValidSolanaAddress } from "./vpc/solanaValidate.js";
import { reserveDepositAddress, releaseDepositAddress } from "./wallets/addressPool.js";
import { priceForMethodUSD, METHOD } from "./vpc/prices.js";
import { startWorker } from "./worker/worker.js";
import { getUsdPrice } from "./services/priceFeed.js";

migrate();

const app = express();
app.use(helmet());

/**
 * ✅ CORS + PRE-FLIGHT (OPTIONS)
 * Supports Hostinger preview (origin null) and normal websites.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || origin === "null") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ✅ Parse JSON bodies
app.use(express.json({ limit: "32kb" }));

// ✅ Show real JSON parse errors instead of "Bad Request" HTML
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    console.error("❌ JSON parse error:", err.message);
    return res.status(400).json({ error: "Invalid JSON body", message: err.message });
  }
  return next(err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Serve optional static frontend (for quick testing) */
app.use("/", express.static(path.join(__dirname, "..", "public")));

/** Health */
app.get("/health", (req, res) => res.json({ ok: true }));

/** Debug echo endpoint (helps verify what server receives) */
app.post("/api/debug/echo", (req, res) => {
  return res.json({ ok: true, headers: req.headers, body: req.body });
});

/** Debug routes: confirm which endpoints are really loaded */
app.get("/api/debug/routes", (req, res) => {
  try {
    const routes = [];
    const stack = app?._router?.stack || [];
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
        routes.push({ path: layer.route.path, methods });
      }
    }
    return res.json({ ok: true, routes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** Debug DB info (tables + counts) */
app.get("/api/debug/db", (req, res) => {
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);

    const hasDepositAddresses = tables.includes("deposit_addresses");
    const hasOrders = tables.includes("orders");

    const depositCount = hasDepositAddresses
      ? db.prepare("SELECT COUNT(*) AS c FROM deposit_addresses").get().c
      : null;

    const reservedCount = hasDepositAddresses
      ? db.prepare("SELECT COUNT(*) AS c FROM deposit_addresses WHERE status <> 'FREE'").get().c
      : null;

    const ordersCount = hasOrders
      ? db.prepare("SELECT COUNT(*) AS c FROM orders").get().c
      : null;

    return res.json({
      ok: true,
      sqlitePath: process.env.SQLITE_PATH || "data.sqlite",
      tables,
      hasDepositAddresses,
      hasOrders,
      depositCount,
      reservedCount,
      ordersCount,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** ===== Admin auth helper ===== */
function requireAdmin(req, res) {
  const expected = (process.env.ADMIN_TOKEN || "").trim();
  const got = String(req.headers["x-admin-token"] || "").trim();

  if (!expected) {
    res.status(500).json({ error: "ADMIN_TOKEN is not set on server (Render env var missing)" });
    return false;
  }
  if (!got || got !== expected) {
    res.status(401).json({ error: "Unauthorized (bad X-Admin-Token)" });
    return false;
  }
  return true;
}

/** ===== Method normalization (IMPORTANT) =====
 * We accept both:
 * - bitcoin / ethereum / solana / usdt_trc20 / usdt_erc20 / usdt_sol
 * - BTC / ETH / SOL / USDT_TRC20 / USDT_ERC20 / USDT_SOL
 */
function normalizeMethod(input) {
  const v = String(input || "").trim();
  if (!v) return "";

  const lower = v.toLowerCase();

  // Already correct values:
  if (
    lower === METHOD.BTC ||
    lower === METHOD.ETH ||
    lower === METHOD.SOL ||
    lower === METHOD.USDT_TRC20 ||
    lower === METHOD.USDT_ERC20 ||
    lower === METHOD.USDT_SOL
  ) {
    return lower;
  }

  // Aliases:
  const map = {
    btc: METHOD.BTC,
    bitcoin: METHOD.BTC,

    eth: METHOD.ETH,
    ethereum: METHOD.ETH,

    sol: METHOD.SOL,
    solana: METHOD.SOL,

    usdt_trc20: METHOD.USDT_TRC20,
    "usdt(trc20)": METHOD.USDT_TRC20,
    trc20: METHOD.USDT_TRC20,

    usdt_erc20: METHOD.USDT_ERC20,
    "usdt(erc20)": METHOD.USDT_ERC20,
    erc20: METHOD.USDT_ERC20,

    usdt_sol: METHOD.USDT_SOL,
    "usdt(sol)": METHOD.USDT_SOL,
  };

  // Also support uppercase enums like "USDT_TRC20"
  const upper = v.toUpperCase();
  const mapUpper = {
    BTC: METHOD.BTC,
    ETH: METHOD.ETH,
    SOL: METHOD.SOL,
    USDT_TRC20: METHOD.USDT_TRC20,
    USDT_ERC20: METHOD.USDT_ERC20,
    USDT_SOL: METHOD.USDT_SOL,
  };

  if (mapUpper[upper]) return mapUpper[upper];
  if (map[lower]) return map[lower];

  return "";
}

const MethodSchema = z
  .preprocess((v) => normalizeMethod(v), z.string())
  .refine(
    (v) =>
      v === METHOD.BTC ||
      v === METHOD.ETH ||
      v === METHOD.SOL ||
      v === METHOD.USDT_TRC20 ||
      v === METHOD.USDT_ERC20 ||
      v === METHOD.USDT_SOL,
    {
      message: `Invalid method. Expected one of: ${METHOD.BTC}, ${METHOD.ETH}, ${METHOD.SOL}, ${METHOD.USDT_TRC20}, ${METHOD.USDT_ERC20}, ${METHOD.USDT_SOL} (or aliases BTC/ETH/SOL/USDT_...)`,
    }
  );

/** ===== Admin endpoints ===== */

/** Stats: shows deposit addresses grouped by method/status */
app.get("/api/admin/stats", (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const rows = db
      .prepare(
        `
      SELECT method, status, COUNT(*) AS count
      FROM deposit_addresses
      GROUP BY method, status
      ORDER BY method, status
    `
      )
      .all();

    return res.json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * ✅ SEED addresses into deposit_addresses
 * Body:
 * { "method": "bitcoin", "addresses": ["bc1...", "..."] }
 * (also accepts "BTC", "ETH", etc)
 */
const SeedSchema = z.object({
  method: MethodSchema,
  addresses: z.array(z.string().min(4)).min(1),
});

app.post("/api/admin/seed", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = SeedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { method, addresses } = parsed.data;

  try {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO deposit_addresses
        (method, address, status, reserved_by, reserved_until, last_used_at)
      VALUES
        (@method, @address, 'FREE', NULL, NULL, NULL)
    `);

    const tx = db.transaction((list) => {
      let inserted = 0;
      let ignored = 0;

      for (const address of list) {
        const a = String(address).trim();
        if (!a) continue;

        const r = insert.run({ method, address: a });
        if (r.changes === 1) inserted++;
        else ignored++;
      }
      return { inserted, ignored };
    });

    const result = tx(addresses);

    return res.json({
      ok: true,
      method,
      inserted: result.inserted,
      ignored: result.ignored,
      total: addresses.length,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** Release expired reservations */
app.post("/api/admin/release-expired", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const released = releaseDepositAddress(db);
  return res.json({ ok: true, released });
});

/** ===== Business endpoints ===== */

const OrderCreateSchema = z.object({
  usd: z.number().finite().min(1),
  solanaAddress: z.string().min(32).max(44),
  payMethod: MethodSchema, // ✅ accepts BTC or bitcoin etc
  promoCode: z.string().optional().default(""),
});

function expiresInMs(method) {
  if (method === METHOD.BTC) return 4 * 60 * 60 * 1000;
  return 30 * 60 * 1000;
}

async function coingeckoPriceUSD(coingeckoId) {
  return await getUsdPrice(coingeckoId);
}

function roundTo(n, decimals) {
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
}

/** Create order */
app.post("/api/order", async (req, res) => {
  try {
    const parsed = OrderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const { usd, solanaAddress, payMethod, promoCode } = parsed.data;

    if (!isValidSolanaAddress(solanaAddress)) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    const promo = (promoCode || "").trim().toLowerCase();
    const discountRate = computeDiscountRate(usd, promo);

    const effectiveVpcPrice = config.VPC_PRICE_USD * (1 - discountRate);
    const vpcAmount = computeVpcAmount(usd, effectiveVpcPrice);

    const { coingeckoId, currencyLabel } = priceForMethodUSD(payMethod);
    const priceUSD = await coingeckoPriceUSD(coingeckoId);

    const cryptoDecimals = payMethod === METHOD.BTC ? 8 : 6;
    const expectedCryptoAmount = roundTo(usd / priceUSD, cryptoDecimals);

    const orderId = nanoid(12);
    const createdAt = Date.now();
    const expiresAt = createdAt + expiresInMs(payMethod);

    const depositAddress = reserveDepositAddress(db, payMethod, orderId, expiresAt);
    if (!depositAddress) {
      return res.status(503).json({ error: "No deposit addresses available (pool exhausted)" });
    }

    db.prepare(
      `INSERT INTO orders
        (id, status, usd, pay_method, solana_address, promo_code, discount_rate, vpc_amount,
         expected_crypto_amount, crypto_currency_label, deposit_address, created_at, expires_at,
         start_block, payment_seen, payment_confirmed, payment_txid, fulfill_tx_sig)
       VALUES
        (@id, 'PENDING', @usd, @payMethod, @solanaAddress, @promoCode, @discountRate, @vpcAmount,
         @expectedCryptoAmount, @currencyLabel, @depositAddress, @createdAt, @expiresAt,
         NULL, 0, 0, NULL, NULL)`
    ).run({
      id: orderId,
      usd,
      payMethod,
      solanaAddress,
      promoCode: promo,
      discountRate,
      vpcAmount,
      expectedCryptoAmount,
      currencyLabel,
      depositAddress,
      createdAt,
      expiresAt,
    });

    return res.json({
      orderId,
      status: "PENDING",
      usd,
      discountRate,
      vpcAmount,
      payMethod,
      currencyLabel,
      depositAddress,
      expectedCryptoAmount,
      expiresAt,
    });
  } catch (e) {
    console.error("❌ /api/order error:", e);
    return res.status(500).json({ error: "Server error", message: String(e?.message || e) });
  }
});

/** Get order */
app.patch("/api/order/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { usd, solanaAddress, promoCode } = req.body || {};

    if (usd !== undefined && (typeof usd !== "number" || usd <= 0)) {
      return res.status(400).json({ ok: false, error: "Invalid usd" });
    }
    if (solanaAddress !== undefined && typeof solanaAddress !== "string") {
      return res.status(400).json({ ok: false, error: "Invalid solanaAddress" });
    }
    if (promoCode !== undefined && typeof promoCode !== "string") {
      return res.status(400).json({ ok: false, error: "Invalid promoCode" });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const order = await db.get(
      `SELECT id, status, deposit_method, deposit_address, deposit_address_id
       FROM orders WHERE id = ?`,
      [orderId]
    );

    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });
    if (order.status !== "PENDING") {
      return res.status(409).json({ ok: false, error: "Order not editable" });
    }

    await db.run(
      `UPDATE orders
       SET usd = COALESCE(?, usd),
           solana_address = COALESCE(?, solana_address),
           promo_code = COALESCE(?, promo_code),
           expires_at = ?
       WHERE id = ?`,
      [usd ?? null, solanaAddress ?? null, promoCode ?? null, expiresAt, orderId]
    );

    if (order.deposit_address_id) {
      await db.run(
        `UPDATE deposit_addresses SET reserved_until = ? WHERE id = ?`,
        [expiresAt, order.deposit_address_id]
      );
    } else {
      await db.run(
        `UPDATE deposit_addresses
         SET reserved_until = ?
         WHERE method = ? AND address = ?`,
        [expiresAt, order.deposit_method, order.deposit_address]
      );
    }

    const updated = await db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    return res.json({ ok: true, order: updated });
  } catch (e) {
    console.error("❌ PATCH /api/order/:id error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/api/order/:id", (req, res) => {
  const id = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Not found" });

  return res.json({
    orderId: row.id,
    status: row.status,
    usd: row.usd,
    payMethod: row.pay_method,
    solanaAddress: row.solana_address,
    discountRate: row.discount_rate,
    vpcAmount: row.vpc_amount,
    depositAddress: row.deposit_address,
    expectedCryptoAmount: row.expected_crypto_amount,
    currencyLabel: row.crypto_currency_label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paymentSeen: Boolean(row.payment_seen),
    paymentConfirmed: Boolean(row.payment_confirmed),
    paymentTxid: row.payment_txid,
    fulfillTxSignature: row.fulfill_tx_sig,
  });
});

/** Optional ping */
app.post("/api/order/:id/paid", (req, res) => {
  const id = String(req.params.id || "");
  const row = db.prepare("SELECT id FROM orders WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Not found" });

  db.prepare("UPDATE orders SET client_ping_at = ? WHERE id = ?").run(Date.now(), id);
  return res.json({ ok: true });
});

app.listen(config.PORT, () => {
  startWorker();
  console.log(`API listening on :${config.PORT}`);
});
