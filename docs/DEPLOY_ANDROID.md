# Развёртывание RECAP целиком с Android-смартфона или планшета (без ПК)

## Шаг 1. Загрузи проект в GitHub
1. Открой [github.com](https://github.com) в Chrome на Android (включи режим «Версия для ПК» для удобства) и создай приватный репозиторий `recap-telegram-wrapped`.
2. Распакуй этот ZIP-архив на устройстве или открой новый репозиторий в **GitHub Codespaces** (кнопка `Code -> Codespaces -> Create codespace on main`) и перетащи файлы в рабочую область браузера.
3. Сделай первый коммит в ветку `main`.

## Шаг 2. Создай бота и ключи Telegram (храни их в тайне)
1. В Telegram напиши `@BotFather` -> `/newbot` -> получи `BOT_TOKEN`.
2. Сразу настрой список команд (`/setcommands`):
   ```text
   start - Запуск RECAP
   recap - Открыть годовую статистику
   privacy - Конфиденциальность и права доступа
   delete - Удалить сохранённые результаты
   help - Помощь
   ```
3. Открой `https://my.telegram.org` -> **API development tools** -> создай приложение и сохрани `TELEGRAM_API_ID` и `TELEGRAM_API_HASH`.

## Шаг 3. Разверни Python MTProto-сканер (Render или Railway)
1. Зайди на [render.com](https://render.com) или [railway.app](https://railway.app) через браузер на Android и подключи свой GitHub-репозиторий.
2. Создай **Web Service**:
   - Root Directory: `scanner`
   - Environment / Runtime: `Docker`
3. Добавь переменные окружения (Environment Variables):
   - `TELEGRAM_API_ID` = твой API ID
   - `TELEGRAM_API_HASH` = твой API Hash
   - `SCANNER_SHARED_SECRET` = случайная строка (32+ символов)
   - `SESSION_ENCRYPTION_KEY_B64` = 32 случайных байта в base64 (в терминале Codespaces: `python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"`)
   - `MAX_CONCURRENT_SCANS` = `4`
4. После деплоя скопируй HTTPS-URL сервиса (например, `https://recap-scanner.onrender.com`).

## Шаг 4. Настрой Cloudflare (D1 + Workers + Pages)
1. Открой [dash.cloudflare.com](https://dash.cloudflare.com):
   - **Workers & Pages -> D1 SQL Database -> Create** -> имя `recap-db`.
   - Скопируй `database_id` и вставь его в `backend/wrangler.toml`.
   - Открой вкладку **Console** внутри `recap-db`, вставь и выполни весь SQL из `backend/schema.sql`.
2. В настройках будущего Worker (`recap-telegram-api`) добавь:
   - Переменные: `APP_URL` (твой HTTPS-домен Mini App, например `https://recap-mini-app.pages.dev` или собственный домен), `SCANNER_BASE_URL` (URL сканера из шага 3).
   - Секреты (Encrypted): `BOT_TOKEN`, `BOT_WEBHOOK_SECRET` (случайная строка), `SCANNER_SHARED_SECRET` (та же, что в сканере).
3. В разделе **My Profile -> API Tokens** создай токен с правами `Workers Scripts:Edit`, `Cloudflare Pages:Edit`, `D1:Edit`.

## Шаг 5. Настрой GitHub Actions (автодеплой)
1. В репозитории GitHub перейди в **Settings -> Secrets and variables -> Actions**:
   - **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   - **Variables**: `API_BASE_URL` (HTTPS-домен твоего Cloudflare Worker, например `https://recap-telegram-api.<subdomain>.workers.dev`).
2. Запусти workflow **Test & Deploy RECAP** вручную во вкладке **Actions** (или сделай push в `main`).

## Шаг 6. Подключи Webhook и кнопку Mini App
1. В терминале GitHub Codespaces введи команды ниже. Секреты вводятся в скрытые приглашения терминала, а не в код или чат:
   ```bash
   read -rsp 'BOT_TOKEN: ' BOT_TOKEN; echo
   read -rsp 'BOT_WEBHOOK_SECRET: ' BOT_WEBHOOK_SECRET; echo
   read -rp 'HTTPS URL Worker (без /webhook): ' WORKER_URL
   # Для следующей команды экспортируем только переменные, необходимые Python:
   export BOT_WEBHOOK_SECRET WORKER_URL
   python3 -c 'import os,json; print(json.dumps({"url": os.environ["WORKER_URL"].rstrip("/")+"/webhook/telegram", "secret_token": os.environ["BOT_WEBHOOK_SECRET"]}))' > /tmp/recap-webhook.json
   curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
      -H 'Content-Type: application/json' --data-binary @/tmp/recap-webhook.json
   rm -f /tmp/recap-webhook.json
   unset BOT_TOKEN BOT_WEBHOOK_SECRET WORKER_URL
   ```
   Не включай `set -x` и не публикуй вывод с секретами.
2. В `@BotFather` через `/setmenubutton` укажи URL своего Mini App (`APP_URL`) и текст кнопки `Открыть RECAP`.
3. Напиши боту `/start` — сервис готов к работе.


## Обязательная проверка перед публичным запуском

- В GitHub Actions должны пройти Python-тесты (`12 passed`), Backend TypeScript typecheck и frontend `npm run build`. Если хотя бы одна проверка красная — не публикуй сервис.
- Демо-режим в production оставляй выключенным: `VITE_ENABLE_DEMO=false`. При отсутствии `VITE_API_BASE_URL` не считай приложение работающим в Live.
- Сканер в этом прототипе хранит временные сессии в памяти процесса, а чекпоинты — в каталоге `CHECKPOINT_DIR` (по умолчанию `/tmp/recap_checkpoints`). При перезапуске контейнера память теряется, а без постоянного диска могут пропасть и чекпоинты. Для возобновления после рестартов понадобится постоянное защищённое хранилище, при этом нельзя сохранять открытые Telegram-сессии.
- Не запускай несколько реплик сканера: текущие авторизации привязаны к памяти одного процесса. Не обещай устойчивого возобновления после рестарта до реализации отдельного безопасного хранилища и очереди заданий.
- Проверяй QR/2FA и отзыв сеанса вручную на тестовом аккаунте; мок-тесты не подтверждают реальное поведение Telegram.
- Доступ к сканеру должен быть через HTTPS с секретом в заголовке; ограничь сетевой доступ, установи rate limiting, сроки жизни авторизаций и настрой мониторинг ошибок без личных данных.
- Удаление данных и отзыв сессии — разные операции. Если сервис не может подтвердить сетевое обращение, он не должен сообщать об успешном отзыве. Пользователь должен проверить Telegram → Настройки → Устройства.
