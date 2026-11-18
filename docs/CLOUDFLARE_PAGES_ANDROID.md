# RECAP — публикация frontend на Cloudflare Pages с Android

> Этап 1: публикуем только демонстрационный интерфейс. Live API и MTProto пока не подключены.

## 0. GitHub-интеграция Cloudflare

В GitHub открой https://github.com/settings/installations и настрой установленное приложение **Cloudflare Workers and Pages**.
В **Repository access** добавь приватный репозиторий `disfelz/recap-telegram-wrapped`.
Если приложение отсутствует, открой Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git и авторизуй GitHub.

Cloudflare API в процессе создания Pages-проекта ранее ответил ошибкой `8000011` («internal issue with your Cloudflare Pages Git installation»). До исправления интеграции автоматическая публикация из репозитория недоступна. Не переустанавливай приложение без необходимости: это может затронуть другие проекты.

## 1. Создание Pages-проекта

После подключения в Cloudflare:
- Project name: `recap-felzov` (если занято, используй уникальный вариант)
- Repository: `disfelz/recap-telegram-wrapped` (приватный)
- Production branch: `main`
- Root directory (advanced): `frontend`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: `22` (если требуется переменная, `NODE_VERSION=22`)

## 2. Переменные (пока только демонстрационный релиз)

В Production environment variables установи:
- `VITE_ENABLE_DEMO=true` — явно разрешает показ демонстрационных карточек.
- `VITE_API_BASE_URL` пока **не задавать** — реального API ещё нет.

НЕ добавляй сюда BOT_TOKEN, API_HASH, TELEGRAM_SESSION, Telegram 2FA и другие серверные секреты: переменные VITE_* встраиваются в публичный JS.

## 3. Проверка

Дождись успешного Production deployment в Cloudflare. Открой созданный HTTPS-адрес `*.pages.dev` на телефоне.
Проверь:
1. Главная страница RECAP отображается в Chrome и Telegram WebView.
2. В деморежиме видна явная маркировка демонстрационных данных.
3. Story-карточки переключаются, анимации не мешают.
4. Не создаётся впечатление, что Telegram аккаунт подключён в деморежиме.
5. В Live-режиме при отсутствии API показывается ошибка настройки, а не выдуманная статистика.

## 4. Следующие отдельные этапы

1. Создание Cloudflare D1 и Worker API, проверка Telegram Mini App `initData`.
2. Отдельный безопасный Docker/FastAPI/Telethon сканер на сервере.
3. Серверные секреты, проверка сессий, QR-авторизация, тесты на длинную историю.
4. Настройка Telegram-бота / BotFather и Web App URL.

Трёхконтурную архитектуру не менять. До окончания аудита не принимать реальные Telegram-коды и сессии в браузерном frontend.

Документация: https://developers.cloudflare.com/pages/configuration/git-integration/ и https://developers.cloudflare.com/pages/configuration/build-configuration/
