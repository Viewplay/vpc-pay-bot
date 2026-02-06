/**
 * deposit_addresses columns:
 * - method TEXT
 * - address TEXT
 * - status TEXT  (FREE | RESERVED | INFLIGHT)
 * - reserved_by TEXT
 * - reserved_until INTEGER (ms)
 * - last_used_at INTEGER (ms)
 */

export function reserveDepositAddress(db, method, orderId, expiresAt) {
  const now = Date.now();

  // Pick one FREE address
  const row = db.prepare(`
    SELECT address
    FROM deposit_addresses
    WHERE method = ?
      AND status = 'FREE'
    ORDER BY id ASC
    LIMIT 1
  `).get(method);

  if (!row) return null;

  // Reserve it (atomic)
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
      AND reserved_until IS NOT NULL
      AND reserved_until > ?
    ORDER BY id ASC
    LIMIT 1
  `).get(method, orderId, now);

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
