import { METHOD } from "../vpc/prices.js";

function envPool(method) {
  switch (method) {
    case METHOD.BTC:
      return process.env.POOL_BTC;
    case METHOD.ETH:
      return process.env.POOL_ETH;
    case METHOD.SOL:
      return process.env.POOL_SOL;
    case METHOD.USDT_TRC20:
      return process.env.POOL_USDT_TRC20;
    case METHOD.USDT_ERC20:
      return process.env.POOL_USDT_ERC20;
    case METHOD.USDT_SOL:
      return process.env.POOL_USDT_SOL;
    default:
      throw new Error(`Unknown pool for ${method}`);
  }
}

function parseAddresses(csv) {
  return String(csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensurePoolSeeded(db, method) {
  const csv = envPool(method);
  const addresses = parseAddresses(csv);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO address_locks(pay_method, address, locked_by_order_id, locked_until)
     VALUES (?, ?, NULL, NULL)`
  );
  const tx = db.transaction(() => {
    for (const a of addresses) stmt.run(method, a);
  });
  tx();
}

export function reserveDepositAddress(db, method, orderId, lockedUntil) {
  ensurePoolSeeded(db, method);

  const row = db
    .prepare(
      `SELECT address FROM address_locks
       WHERE pay_method = ?
         AND (locked_until IS NULL OR locked_until < ?)
       LIMIT 1`
    )
    .get(method, Date.now());

  if (!row) return null;

  const address = row.address;

  const updated = db
    .prepare(
      `UPDATE address_locks
       SET locked_by_order_id = ?, locked_until = ?
       WHERE pay_method = ? AND address = ?
         AND (locked_until IS NULL OR locked_until < ?)`
    )
    .run(orderId, lockedUntil, method, address, Date.now());

  if (updated.changes !== 1) return null;
  return address;
}

export function releaseDepositAddress(db) {
  const now = Date.now();
  const r = db
    .prepare(
      `UPDATE address_locks
       SET locked_by_order_id = NULL, locked_until = NULL
       WHERE locked_until IS NOT NULL AND locked_until < ?`
    )
    .run(now);
  return r.changes;
}
