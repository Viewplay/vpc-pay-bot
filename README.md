# VPC Pay Bot (API + Worker) + Frontend

This zip contains:
- `src/` backend Node.js (Express API + on-chain watcher + auto VPC SPL transfer)
- `public/` a ready HTML page that calls the backend (`/api/order`, `/api/order/:id`)
- CORS is enabled (including `origin: null` for Hostinger/iframe previews)

## 1) Install / run locally
```bash
npm install
cp .env.example .env
# fill .env values
npm run dev
```

Open:
- API health: http://localhost:3000/health
- Frontend: open `public/index.html` (or serve it)

## 2) Deploy on Render (recommended)
Create a **Web Service**:
- Build Command: `npm install`
- Start Command: `npm start`

Set **Environment Variables** (Render dashboard):
- `SOLANA_SENDER_SECRET` (private key)  ✅ DO NOT COMMIT
- pools: `POOL_BTC`, `POOL_ETH`, `POOL_SOL`, `POOL_USDT_TRC20`, `POOL_USDT_ERC20`, `POOL_USDT_SOL`
- RPC endpoints: `ETH_RPC_URL`, `TRON_API_KEY` (optional but recommended), etc.

## 3) Frontend API URL
In `public/index.html`, set:
```js
const API_BASE = "https://YOUR-RENDER-SERVICE.onrender.com";
```

## Notes
- ETH native transfers via plain JSON-RPC scanning is limited; for reliability use an endpoint with indexing features.
- This project is self-custody: deposits go to your addresses; VPC is sent only after confirmations.
