# Импорт RECAP v1.1 с Android

Загрузи **один** файл `RECAP_v1.1_audited_patch.zip` в эту папку через GitHub Web: **Add file → Upload files**.

ZIP не нужно распаковывать на телефоне. Workflow `Import RECAP source` проверит архив, распакует исходники в корень репозитория и удалит временный ZIP. Опасный автоматический деплой из исходного архива **не импортируется**.

После импорта GitHub Actions запустит workflow `RECAP CI` с тремя проверками:
- 12 тестов Python-анализатора;
- сборка React + TypeScript + Vite;
- TypeScript-проверка Cloudflare Worker.

Ничего не деплоится, Telegram-секреты в GitHub загружать не нужно.

Если импорт не запустился, проверь GitHub → Actions → Import RECAP source и разрешения GitHub Actions в настройках репозитория.
