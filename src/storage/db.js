import Database from "better-sqlite3";

export const db = new Database(process.env.SQLITE_PATH || "data.sqlite");
db.pragma("journal_mode = WAL");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS address_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_method TEXT NOT NULL,
      address TEXT NOT NULL,
      locked_by_order_id TEXT,
      locked_until INTEGER,
      UNIQUE(pay_method, address)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,

      usd REAL NOT NULL,
      pay_method TEXT NOT NULL,
      solana_address TEXT NOT NULL,

      promo_code TEXT,
      discount_rate REAL NOT NULL,
      vpc_amount INTEGER NOT NULL,

      expected_crypto_amount REAL NOT NULL,
      crypto_currency_label TEXT NOT NULL,
      deposit_address TEXT NOT NULL,

      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,

      start_block INTEGER,
      payment_seen INTEGER NOT NULL DEFAULT 0,
      payment_confirmed INTEGER NOT NULL DEFAULT 0,
      payment_txid TEXT,

      fulfill_tx_sig TEXT,
      client_ping_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
  `);
}
