# RECAP — Cloudflare Pages deployment

Cloudflare Pages project: `recap-mini-app`
Production URL: https://recap-mini-app.pages.dev
GitHub repository: `disfelz/recap-telegram-wrapped`
Production branch: `main`

Build configuration:
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

Production build environment variables:
- `VITE_API_BASE_URL=https://recap-telegram-api.felz.workers.dev`
- `VITE_ENABLE_DEMO=false`

Worker's `APP_URL` must match the production URL above. All Telegram bot tokens, webhook secrets and scanner credentials belong exclusively in encrypted server-side secrets, never in `VITE_*` variables.

The first deployment is triggered by a commit to `main`. Verify the Pages build succeeds before testing the Mini App via the bot. Backend scanning requires a separately deployed scanner service and matching `SCANNER_SHARED_SECRET`.
