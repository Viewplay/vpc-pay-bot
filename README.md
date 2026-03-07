# vpc-pay-bot (clean)

Node.js API + worker that:
- creates payment orders (BTC / ETH / SOL / USDT TRC20 / USDT ERC20 / USDT SOL)
- watches inbound payments
- sends VPC (SPL token) to the customer's Solana address after payment

## 1) Install

```bash
npm install
```

## 2) Environment variables

Create a `.env` next to `package.json`:

```env
# Required
ADMIN_TOKEN=change_me
SQLITE_PATH=data.sqlite

# VPC sender (REQUIRED to actually send VPC)
SOLANA_SENDER_SECRET=[...]   # JSON array OR base58 secret key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VPC_MINT=YOUR_VPC_MINT
VPC_PRICE_USD=0.0019

# Worker
WORKER_INTERVAL_MS=20000
AMOUNT_TOLERANCE_PCT=0.5

# BTC (Esplora)
BTC_API_BASE=https://blockstream.info/api

# ETH / USDT ERC20
ETH_RPC_URL=https://mainnet.infura.io/v3/XXXX   # or Alchemy / your node
USDT_ERC20_CONTRACT=0xdAC17F958D2ee523a2206206994597C13D831ec7

# TRON / USDT TRC20 (TronGrid)
TRON_FULL_HOST=https://api.trongrid.io
TRON_API_KEY=optional_trongrid_key
USDT_TRC20_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Solana USDT (SPL)
USDT_SOL_MINT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
```

Notes:
- `TRON_RPC_URL` is also accepted as an alias of `TRON_FULL_HOST`.
- `WORKER_INTERVAL` is also accepted as an alias of `WORKER_INTERVAL_MS`.

## 3) Run locally

```bash
npm run start
```

API runs on `http://localhost:3000`.

## 4) Seed deposit addresses (VERY IMPORTANT)

This project uses an **address pool**. You must pre-fill addresses for each method.

Endpoint:

`POST /api/admin/seed`
Headers:
- `X-Admin-Token: <ADMIN_TOKEN>`

Body:
```json
{ "method": "bitcoin", "addresses": ["bc1....", "bc1...."] }
```

Supported methods:
- `bitcoin`, `ethereum`, `solana`
- `usdt_trc20`, `usdt_erc20`, `usdt_sol`
(also accepts aliases like `BTC`, `ETH`, `SOL`, `USDT_TRC20`, etc.)

Check pool status:

`GET /api/admin/stats` with `X-Admin-Token`.

## 5) Promo codes

Promo logic is in: `src/vpc/pricing.js`

- Add/edit/remove codes in `PROMO_CODES`.
- To disable promo codes entirely: in `src/index.js`, force `promoCode=""` (ignore the client field).

## 6) Where to change BTC/ETH/USDT settings

- BTC explorer/API: `.env` -> `BTC_API_BASE`
- ETH RPC: `.env` -> `ETH_RPC_URL`
- USDT ERC20 contract: `.env` -> `USDT_ERC20_CONTRACT`
- TRON host/key: `.env` -> `TRON_FULL_HOST`, `TRON_API_KEY`
- USDT TRC20 contract: `.env` -> `USDT_TRC20_CONTRACT`
- USDT SOL mint: `.env` -> `USDT_SOL_MINT`

## 7) Deploy (Render)

- Set all env vars in Render.
- Use `npm install` + `npm start`.
- Persist `data.sqlite` using a Render Disk (recommended), and set `SQLITE_PATH=/var/data/data.sqlite`.
