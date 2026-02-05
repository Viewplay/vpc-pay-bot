import "dotenv/config";
import express from "express";
import helmet from "helmet";
import fetch from "node-fetch";
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
 * âœ… CORS + PRE-FLIGHT (OPTIONS)
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "32kb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Serve optional static frontend (for quick testing) */
app.use("/", express.static(path.join(__dirname, "..", "public")));

/** Health */
app.get("/health", (req, res) => res.json({ ok: true }));

const OrderCreateSchema = z.object({
  usd: z.number().finite().min(20),
  solanaAddress: z.string().min(32).max(44),
  payMethod: z.enum([METHOD.BTC, METHOD.ETH, METHOD.SOL, METHOD.USDT_TRC20, METHOD.USDT_ERC20, METHOD.USDT_SOL]),
  promoCode: z.string().optional().default("")
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
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

    const { usd, solanaAddress, payMethod, promoCode } = parsed.data;

    if (!isValidSolanaAddress(solanaAddress)) return res.status(400).json({ error: "Invalid Solana address" });

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
    if (!depositAddress) return res.status(503).json({ error: "No deposit addresses available (pool exhausted)" });

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
      expiresAt
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
      expiresAt
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", message: String(e?.message || e) });
  }
});

/** Get order */
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
    fulfillTxSignature: row.fulfill_tx_sig
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

/** Admin */
app.post("/api/admin/release-expired", (req, res) => {
  const released = releaseDepositAddress(db);
  return res.json({ ok: true, released });
});

app.listen(config.PORT, () => {
  startWorker();
  console.log(`API listening on :${config.PORT}`);
});



