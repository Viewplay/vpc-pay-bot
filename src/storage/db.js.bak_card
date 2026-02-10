import Database from "better-sqlite3";

export const db = new Database(process.env.SQLITE_PATH || "data.sqlite");

// WAL améliore les perfs et évite des locks bizarres sur SQLite
db.pragma("journal_mode = WAL");

export function migrate() {
  db.exec(`
    -- ✅ Pool d'adresses de dépôt (utilisé par addressPool.js)
    CREATE TABLE IF NOT EXISTS deposit_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'FREE',   -- FREE | RESERVED | INFLIGHT
      reserved_by TEXT,                      -- orderId
      reserved_until INTEGER,                -- timestamp ms
      last_used_at INTEGER                   -- timestamp ms
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_addresses_method_address
      ON deposit_addresses(method, address);

    CREATE INDEX IF NOT EXISTS idx_deposit_addresses_status_method
      ON deposit_addresses(status, method);

    CREATE INDEX IF NOT EXISTS idx_deposit_addresses_reserved_until
      ON deposit_addresses(reserved_until);

    -- ✅ Orders
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

    -- (Optionnel) ancien système "address_locks" -> on le garde pour ne rien casser
    CREATE TABLE IF NOT EXISTS address_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_method TEXT NOT NULL,
      address TEXT NOT NULL,
      locked_by_order_id TEXT,
      locked_until INTEGER,
      UNIQUE(pay_method, address)
    );
  `);
}
