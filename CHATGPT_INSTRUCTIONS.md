# Инструкция для ChatGPT по работе с проектом RECAP (Telegram Wrapped)

Скопируй содержимое этого файла (или прикрепи этот архив целиком в чат ChatGPT) и используй готовый стартовый промпт ниже, чтобы ChatGPT продолжил разработку, настройку или деплой **без потери архитектуры и без возврата старых багов**.

---

## Готовый промпт для старта в ChatGPT

```text
Ты — команда senior full-stack разработчиков, UI/UX-дизайнеров, специалистов по Telegram MTProto (Telethon) и ИБ.
Я загрузил архив проекта RECAP — Telegram Wrapped («Твой год. Твои сообщения. Твоя история»).

Изучи файлы в архиве, начиная с CHATGPT_INSTRUCTIONS.md, shared/types.ts, scanner/app/analyzer.py, backend/src/index.ts и frontend/src/App.tsx.

ЖЁСТКИЕ ПРАВИЛА ПРОЕКТА (нельзя нарушать):
1. Архитектура разделена строго на 3 контура:
   - /frontend: React + TypeScript + Vite + Telegram Mini Apps SDK (Cloudflare Pages / свой HTTPS-домен).
   - /backend: Cloudflare Workers + Cloudflare D1 (API + Webhook Telegram-бота + проверка initData).
   - /scanner: отдельный Python-сервис (FastAPI + Telethon) в Docker на VPS/Render/Railway/Fly.io.
   НИКОГДА не пытайся переносить Python Telethon внутрь Cloudflare Worker.
2. Запрещены обязательные подписки на каналы, репосты, платные разблокировки и фейковые/сгенерированные метрики (экранное время, время онлайн, неизвестные удалённые сообщения).
3. Демо-режим (frontend/src/data/demoData.ts) должен быть строго отделён от Live API (frontend/src/api/client.ts).
4. Алгоритм подсчёта (scanner/app/analyzer.py) НЕЛЬЗЯ ломать:
   - Считаем ТОЛЬКО собственные исходящие сообщения пользователя за выбранный год с учётом часового пояса.
   - В личных чатах НЕЛЬЗЯ останавливать пагинацию, если после фильтрации исходящих на странице получилось < 100 (или 0) сообщений. Остановка только при пустой сырой странице от Telegram или дате < start_utc.
   - В группах используем серверную фильтрацию from_user='me', НЕ доверяя приблизительным счётчикам с флагом inexact.
   - НЕ используем Telegram Takeout в основном алгоритме.
   - Пагинация строго по убыванию message.id (cursor_offset_id) с чекпоинтами для возобновления без пропусков и дублей.
   - Медиафайлы НЕ скачиваем — берём только метаданные (тип, длительность голосовых).
   - Если результат неполный (прерывание или недоступный чат), статус обязан быть 'partial' («Частичная статистика»), а не 'completed'.
5. Безопасность:
   - Никогда не проси меня вставлять BOT_TOKEN, API_HASH, пароли 2FA или коды Telegram прямо в чат — давай инструкции, куда безопасно вписать их в GitHub Secrets / Cloudflare / Render.
   - Не пиши в интерфейсе и текстах, что MTProto-сессия «только для чтения» — честно объясняй широкие права, сохранение зашифрованной MTProto-сессии и LogOut только по явному запросу пользователя.
   - Не сохраняй тексты сообщений, коды, пароли и открытые session strings в БД и логах.
6. Я веду разработку и деплой с Android-смартфона и планшета (без ПК), поэтому все шаги давай под браузер Android, GitHub Web / Codespaces, Cloudflare Dashboard и Render/Railway.
7. Всегда проверяй изменения прогоном 12 автотестов: PYTHONPATH=. pytest tests/test_analyzer.py -v.
8. Интерфейс полностью на русском языке, стиль Dark Digital Editorial (#09090F, #151322, #A996FF, #85B8FF, #F7F5FF, #9693AB).

Подтверди, что изучил структуру архива, и спроси, какую задачу делаем первой (деплой, доработка UI, настройка домена/бота или расширение аналитики).
```

---

## Карта файлов проекта (для быстрого ориентирования ChatGPT)

| Путь | Назначение |
|---|---|
| `shared/types.ts` | Единые TypeScript-контракты (`RecapStats`, `ScanProgressPayload`, `PersonaProfile`, `ScanMetrics`) |
| `frontend/src/App.tsx` | Главный оркестратор Mini App (6 экранов, строгая изоляция Demo/Live, polling статуса) |
| `frontend/src/api/client.ts` | Реальный HTTP-клиент к Cloudflare Worker с заголовком `X-Telegram-Init-Data` |
| `frontend/src/data/demoData.ts` | Изолированные демо-данные за 2026 / 2025 / 2024 годы |
| `frontend/src/screens/WelcomeScreen.tsx` | Экран 1 — Welcome (орбитальная эмблема, выбор года, старт / демо) |
| `frontend/src/screens/ConnectScreen.tsx` | Экран 2 — Подключение (честное раскрытие прав, согласие, QR + вход по телефону/2FA) |
| `frontend/src/screens/ScanScreen.tsx` | Экран 3 — Двухэтапный анализ (прогресс, FloodWait, отмена/продолжение, partial/completed) |
| `frontend/src/screens/StoriesScreen.tsx` | Экран 4 — 12 уникальных полноэкранных Wrapped Stories + свайпы + тактильная отдача |
| `frontend/src/screens/AnalyticsScreen.tsx` | Экран 5 — Подробная аналитика, графики, переключение годов, сравнение YoY |
| `frontend/src/screens/SettingsScreen.tsx` | Экран 6 — Часовой пояс, скрытие имён, Demo/Live режим, удаление всех данных |
| `frontend/src/utils/exportCard.ts` | Экспорт итоговой открытки в PNG (`1080×1920` и `1080×1080`) на HTML5 Canvas |
| `frontend/src/utils/telegram.ts` | Обёртка над Telegram Mini Apps SDK (HapticFeedback, BackButton, Web Share) |
| `backend/src/index.ts` | Cloudflare Worker REST API + webhook + callback сканера |
| `backend/src/bot.ts` | Команды бота `/start`, `/recap`, `/privacy`, `/delete`, `/help` и кнопка «Открыть RECAP» |
| `backend/src/crypto.ts` | Проверка подписи `initData` (HMAC-SHA256 по спецификации Telegram) |
| `backend/schema.sql` | Схема Cloudflare D1 с `UNIQUE INDEX` против параллельных сканов одного аккаунта |
| `scanner/app/analyzer.py` | Новый быстрый двухэтапный алгоритм анализа + чекпоинты + проверка целостности сумм |
| `scanner/app/auth.py` | MTProto QR-вход, вход по телефону/2FA, сверка `me.id == initData.user.id`, `LogOutRequest` |
| `scanner/app/crypto.py` | AES-256-GCM шифрование сохранённых `StringSession` с AAD привязкой к `telegram_user_id` |
| `scanner/app/config.py` | Настройки из env + фильтр маскирования секретов/телефонов/кодов в логах |
| `scanner/app/server.py` | FastAPI-сервер, `asyncio.Semaphore` для ограничения параллельности, фоновые задачи |
| `tests/test_analyzer.py` | 12 автоматических тестов + замер API-запросов и времени выполнения |
| `docs/DEPLOY_ANDROID.md` | Пошаговый деплой без ПК (с Android/планшета) |
| `docs/PRIVACY.md` | Политика конфиденциальности |

---

## Что проверить в первую очередь после заливки в GitHub

1. **Прогон тестов в GitHub Actions**: при первом push в `main` должна пройти джоба `test-scanner` (все 12 тестов зелёные).
2. **Сборка фронтенда**: в Codespaces или GitHub Actions убедиться, что `cd frontend && npm install && npm run build` проходит без ошибок TypeScript.
3. **Секреты (НЕ коммитить в репозиторий!)**:
   - Render / Railway (`scanner`): `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `SCANNER_SHARED_SECRET`, `SESSION_ENCRYPTION_KEY_B64`.
   - Cloudflare Worker (`backend`): `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `SCANNER_SHARED_SECRET`, плюс переменные `APP_URL`, `SCANNER_BASE_URL`.
   - GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, переменная `API_BASE_URL`.
4. **Реальный тест MTProto**: после развёртывания протестировать QR-вход и вход с одного устройства на собственном аккаунте, проверить в «Устройствах» Telegram, что сессия **RECAP Analyzer** остаётся авторизованной после подсчёта и исчезает только после ручного удаления.
