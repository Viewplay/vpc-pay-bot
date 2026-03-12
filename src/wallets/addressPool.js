/**
 * deposit_addresses columns:
 * - id INTEGER PRIMARY KEY
 * - method TEXT
 * - address TEXT
 * - status TEXT  (FREE | RESERVED | INFLIGHT)
 * - reserved_by TEXT
 * - reserved_until INTEGER (ms)
 * - last_used_at INTEGER (ms)
 *
 * STRICT POOL MODE:
 * - syncDepositPoolStrict(db, method, addresses) will:
 *   1) insert missing addresses as FREE
 *   2) delete addresses not in the provided list (for that method)
 */

function normalizeAddressForMethod(method, address) {
  const a = String(address || "").trim();
  if (!a) return "";
  // EVM addresses: normalize to lowercase for stable matching
  if (method === "ethereum" || method === "usdt_erc20") return a.toLowerCase();
  return a;
}

function uniqueNormalized(method, addresses) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(addresses) ? addresses : []) {
    const n = normalizeAddressForMethod(method, raw);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Strictly sync one pool into DB.
 * - Adds missing addresses (FREE).
 * - Removes addresses not in the given list.
 *
 * Safety: throws if addresses list is empty (prevents accidental wipe).
 */
export function syncDepositPoolStrict(db, method, addresses) {
  const list = uniqueNormalized(method, addresses);

  if (list.length === 0) {
    throw new Error(`syncDepositPoolStrict: empty address list for method="${method}" (refusing to wipe).`);
  }

  const tx = db.transaction(() => {
    // 1) Insert missing
    const ins = db.prepare(`
      INSERT OR IGNORE INTO deposit_addresses (method, address, status, reserved_by, reserved_until, last_used_at)
      VALUES (?, ?, 'FREE', NULL, NULL, NULL)
    `);

    for (const addr of list) ins.run(method, addr);

    // 2) Delete any address not in pools.json (for this method)
    // Build placeholders (?, ?, ?, ...)
    const placeholders = list.map(() => "?").join(",");
    const del = db.prepare(`
      DELETE FROM deposit_addresses
      WHERE method = ?
        AND address NOT IN (${placeholders})
    `);

    del.run(method, ...list);
  });

  tx();
}

/**
 * Sync all pools (strict) from a JSON object:
 * {
 *   bitcoin: [...],
 *   ethereum: [...],
 *   solana: [...],
 *   usdt_trc20: [...],
 *   usdt_erc20: [...],
 *   usdt_sol: [...]
 * }
 */
export function syncAllPoolsStrict(db, pools) {
  const p = pools || {};
  const methods = [
    "bitcoin",
    "ethereum",
    "solana",
    "usdt_trc20",
    "usdt_erc20",
    "usdt_sol",
  ];

  for (const method of methods) {
    if (p[method]) syncDepositPoolStrict(db, method, p[method]);
  }
}

export function reserveDepositAddress(db, method, orderId, expiresAt) {
  const now = Date.now();

  const row = db.prepare(`
    SELECT address
    FROM deposit_addresses
    WHERE method = ?
      AND status = 'FREE'
    ORDER BY id ASC
    LIMIT 1
  `).get(method);

  if (!row) return null;

  const upd = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'RESERVED',
        reserved_by = ?,
        reserved_until = ?,
        last_used_at = ?
    WHERE method = ?
      AND address = ?
      AND status = 'FREE'
  `).run(orderId, expiresAt, now, method, row.address);

  if (upd.changes !== 1) return null;
  return row.address;
}

export function getOrReserveDepositAddress(db, method, orderId, expiresAt) {
  const now = Date.now();

  const existing = db.prepare(`
    SELECT address
      FROM deposit_addresses
      WHERE method = ?
        AND status = 'RESERVED'
        AND reserved_by = ?
      ORDER BY id ASC
      LIMIT 1
  `).get(method, orderId);

  if (existing?.address) {
    db.prepare(`
      UPDATE deposit_addresses
      SET reserved_until = ?,
          last_used_at = ?
      WHERE method = ?
        AND address = ?
        AND status = 'RESERVED'
        AND reserved_by = ?
    `).run(expiresAt, now, method, existing.address, orderId);

    return existing.address;
  }

  return reserveDepositAddress(db, method, orderId, expiresAt);
}

export function markAddressInFlight(db, method, address, orderId, expiresAt) {
  const now = Date.now();
  db.prepare(`
    UPDATE deposit_addresses
    SET status = 'INFLIGHT',
        reserved_by = ?,
        reserved_until = ?,
        last_used_at = ?
    WHERE method = ?
      AND address = ?
  `).run(orderId, expiresAt, now, method, address);
}

export function freeDepositAddress(db, method, address) {
  db.prepare(`
    UPDATE deposit_addresses
    SET status = 'FREE',
        reserved_by = NULL,
        reserved_until = NULL
    WHERE method = ?
      AND address = ?
  `).run(method, address);
}

// Release expired RESERVED only (never INFLIGHT)
export function releaseDepositAddress(db) {
  const now = Date.now();
  const r = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'FREE',
        reserved_by = NULL,
        reserved_until = NULL
    WHERE status = 'RESERVED'
      AND reserved_until IS NOT NULL
      AND reserved_until < ?
  `).run(now);
  return r.changes;
}