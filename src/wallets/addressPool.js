/**
 * Address pool states:
 * - AVAILABLE: free to assign
 * - RESERVED: assigned to an order until reserved_until (unless payment seen)
 * - INFLIGHT: payment seen on-chain => never auto-release until order is fulfilled/failed
 */

export function reserveDepositAddress(db, method, orderId, reservedUntil) {
  // 1) clean up expired reservations (ONLY if payment not seen)
  releaseDepositAddress(db);

  // 2) pick one available address
  const row = db.prepare(`
    SELECT address
    FROM deposit_addresses
    WHERE method = ? AND status = 'AVAILABLE'
    ORDER BY address ASC
    LIMIT 1
  `).get(method);

  if (!row?.address) return null;

  // 3) reserve it (atomic-ish: only if still available)
  const res = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'RESERVED',
        reserved_order_id = ?,
        reserved_until = ?
    WHERE method = ? AND address = ? AND status = 'AVAILABLE'
  `).run(orderId, reservedUntil, method, row.address);

  if (res.changes !== 1) return null;
  return row.address;
}

/**
 * Auto-release only reservations that are expired AND whose order has NOT seen payment.
 * If payment_seen = 1, address should NOT be released here (it becomes INFLIGHT).
 */
export function releaseDepositAddress(db) {
  const now = Date.now();

  // Release RESERVED addresses for orders that are still unpaid/unseen.
  // We join orders to ensure payment_seen=0 and status still PENDING (or EXPIRED).
  const res = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'AVAILABLE',
        reserved_order_id = NULL,
        reserved_until = NULL
    WHERE status = 'RESERVED'
      AND reserved_until IS NOT NULL
      AND reserved_until < ?
      AND reserved_order_id IN (
        SELECT id
        FROM orders
        WHERE payment_seen = 0
          AND (status = 'PENDING' OR status = 'EXPIRED')
      )
  `).run(now);

  return res.changes || 0;
}

/**
 * Call this as soon as you detect ANY payment for an order.
 * It prevents auto-release even if reserved_until is passed.
 */
export function lockDepositAddressForOrder(db, orderId) {
  const res = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'INFLIGHT'
    WHERE reserved_order_id = ?
      AND status = 'RESERVED'
  `).run(orderId);

  return res.changes || 0;
}

/**
 * Recycle address ONLY when order is finished (FULFILLED / FAILED / EXPIRED without payment, etc.).
 * You said you want recycle after VPC sent => call this at the end of fulfillment.
 */
export function recycleDepositAddressForOrder(db, orderId) {
  const res = db.prepare(`
    UPDATE deposit_addresses
    SET status = 'AVAILABLE',
        reserved_order_id = NULL,
        reserved_until = NULL
    WHERE reserved_order_id = ?
      AND (status = 'RESERVED' OR status = 'INFLIGHT')
  `).run(orderId);

  return res.changes || 0;
}
