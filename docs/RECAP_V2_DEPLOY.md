# RECAP v2 — выпуск с Android без компьютера

Изменения собраны в ветке recap-v2 и Pull Request #8. До проверки не сливайте PR в main и не обновляйте рабочий Worker/Scanner.

## 1. Подготовить постоянный том scanner
У FastAPI/Telethon должен быть приватный persistent volume, примонтированный к /data (не эфемерный /tmp). Переменные:
- SESSION_STORE_DIR=/data/recap_sessions
- CHECKPOINT_DIR=/data/recap_checkpoints
- SESSION_ENCRYPTION_KEY_B64 — прежний ключ AES-256-GCM, 32 байта в base64; не менять между деплоями.
- TELEGRAM_API_ID, TELEGRAM_API_HASH, SCANNER_SHARED_SECRET остаются в защищённом окружении.

Пользователь scanner должен иметь права записи в /data. Каталог session_store создаётся с режимом 0700, файлы — 0600. При удалении контейнера без persistent volume зашифрованная сессия и чекпоинты будут потеряны, поэтому на бесплатном/эфемерном хостинге нельзя обещать вход без кода после перезапуска.

## 2. Сделать резервную копию D1 и мигрировать
Откройте с Android браузера Cloudflare Dashboard → D1 → базу RECAP → Console. До деплоя v2 по очереди выполните SQL:

    ALTER TABLE scan_jobs ADD COLUMN notified_at TEXT;

    CREATE TABLE IF NOT EXISTS phone_contact_requests (
      telegram_user_id INTEGER PRIMARY KEY,
      phone TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

Это содержимое backend/migrations/0002_recap_v2.sql. Выполнять ALTER один раз. Не заменять миграцию повторным запуском backend/schema.sql и не удалять старые результаты.

## 3. Проверить сборку и развернуть
Откройте GitHub Pull Request #8 → Checks. Нужны зелёные scanner-tests, frontend-build, backend-typecheck и источник ZIP. Когда всё готово — сливайте PR и используйте существующий GitHub Actions/Cloudflare Pages и Render/Railway/Fly/VPS деплой. ПК не нужен.

В Worker сохраняются BOT_TOKEN, BOT_WEBHOOK_SECRET, SCANNER_SHARED_SECRET, SCANNER_BASE_URL, APP_URL и привязка D1 DB. В Pages: VITE_API_BASE_URL — HTTPS Worker API, VITE_ENABLE_DEMO=false для production. APP_URL — HTTPS адрес Mini App без параметров, кнопка бота использует screen=reveal и year=YYYY.

## 4. Приёмка на своём Telegram
1. Новый пользователь → QR или номер → код/2FA → автозапуск анализа, счётчики чатов и сообщений.
2. Закрыть Mini App и вернуться: сохранится активный статус задания из /api/me. При callback completed/partial приходит одно сообщение от бота.
3. Открыть кнопку «Смотреть итоги года»: удержание, Stories, экспорт PNG без имён, аналитика.
4. Запустить анализ другого года: используется зашифрованная сессия, код не требуется.
5. Проверить /privacy; для тестового аккаунта выполнить /delete и удостовериться, что Telegram → Устройства больше не содержит сессию RECAP.
6. Проверить отказ scanner и 2FA: ошибки должны отображаться без утечки секретов.

Старые v1-сессии были отозваны: пользователю один раз понадобится новый вход для RECAP v2. Действующие результаты в D1 миграция не удаляет.

## Исходники
GitHub → репозиторий disfelz/recap-telegram-wrapped → ветка recap-v2 → Code → Download ZIP. После успешного CI полный исходный ZIP дополнительно появляется в Artifacts workflow.
