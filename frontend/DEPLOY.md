# RECAP Mini App — production deployment

The React/Vite app is deployed to Cloudflare Pages project `recap-mini-app` from the repository's `main` branch.

## Pages build settings
- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`
- Build watch paths: include `*`, exclude none.

## Build-time environment
- `VITE_API_BASE_URL=https://recap-telegram-api.felz.workers.dev`
- `VITE_ENABLE_DEMO=false`

Canonical URL: https://recap-mini-app.pages.dev

All Telegram bot tokens, webhook and scanner secrets must stay server-side, outside the Vite client bundle.

The frontend can render independently, but personal reports require Telegram's signed Mini App initData and a working scanner backend. Do not treat successful static deployment as proof that Telegram scanning is ready.
