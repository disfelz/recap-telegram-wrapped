# Архитектура RECAP — Telegram Wrapped

## Поток данных
1. Пользователь открывает Mini App через кнопку **«Открыть RECAP»** в Telegram-боте.
2. Frontend получает `window.Telegram.WebApp.initData` и отправляет его в заголовке `X-Telegram-Init-Data` на Cloudflare Worker (`/backend`).
3. Cloudflare Worker проверяет криптографическую подпись `initData` через HMAC-SHA256 с использованием `BOT_TOKEN` и извлекает `telegram_user_id`.
4. После явного согласия пользователя Worker проксирует запрос авторизации в изолированный Python-сервис (`/scanner`) с внутренним токеном `SCANNER_SHARED_SECRET`.
5. Python-сервис запускает QR-вход (или вход по телефону + код + 2FA) через Telethon, проверяет, что `me.id == telegram_user_id`, шифрует `StringSession` с помощью AES-256-GCM и отключает сокет до старта сканирования.
6. При запуске анализа Worker создаёт запись в таблице `scan_jobs` (уникальный частичный индекс `idx_one_active_job_per_user` блокирует параллельные запуски одного аккаунта).
7. Scanner выполняет двухэтапный анализ (`quick_preview` -> `full_scan`), периодически сохраняет чекпоинты по `cursor_offset_id`, соблюдает `FloodWaitError` и шлёт прогресс в Worker (`/internal/scanner/callback`).
8. По завершении полного или частичного скана, отмене или ошибке Scanner вызывает `LogOutRequest()` и удаляет зашифрованный файл. Только после попытки выхода отправляет Worker финальный callback c `sessionClosed: true/false`; `true` означает подтверждение Telegram, а не простой `disconnect()`. Чекпоинт частичного анализа остаётся для продолжения после нового входа. Во время FloodWait и ручной паузы сеанс не отзывается.
