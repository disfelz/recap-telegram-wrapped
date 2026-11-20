export interface BotEnv {
  DB: D1Database;
  BOT_TOKEN: string;
  APP_URL: string;
  SCANNER_BASE_URL: string;
  SCANNER_SHARED_SECRET: string;
  ADMIN_TELEGRAM_IDS?: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number; type?: string };
    from?: { id: number; first_name?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

export type UserVisitSource = 'bot' | 'webapp';

/** A single pseudonymous user row. No names, usernames, phones, or message content. */
export function recordUserVisit(db: D1Database, userId: number, source: UserVisitSource): Promise<void> {
  const now = new Date().toISOString();
  return db.prepare(
    'INSERT INTO bot_users (telegram_user_id, first_seen_at, last_seen_at, last_source) ' +
    'VALUES (?, ?, ?, ?) ON CONFLICT(telegram_user_id) DO UPDATE SET ' +
    'last_seen_at = excluded.last_seen_at, last_source = excluded.last_source'
  ).bind(userId, now, now, source).run().then(() => undefined);
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  });
}

function openRecapKeyboard(appUrl: string, path = '', showSourceCode = false) {
  const inlineKeyboard: Record<string, unknown>[][] = [
    [
      {
        text: 'Открыть RECAP',
        web_app: { url: `${appUrl}${path}` },
      },
    ],
  ];
  if (showSourceCode) {
    inlineKeyboard.push([
      {
        text: 'Исходный код · GitHub',
        url: 'https://github.com/disfelz/recap-telegram-wrapped',
      },
    ]);
  }
  return { inline_keyboard: inlineKeyboard };
}

async function sendHelp(env: BotEnv, chatId: number): Promise<void> {
  const text = [
    '<b>Команды RECAP:</b>',
    '/start — запуск и описание сервиса',
    '/recap — открыть годовую статистику',
    '/privacy — как защищены твои данные',
    '/delete — удалить все результаты и отозвать сессию',
    '/help — список команд',
  ].join('\n');
  await sendTelegramMessage(env.BOT_TOKEN, chatId, text, openRecapKeyboard(env.APP_URL));
}

export async function handleBotUpdate(update: TelegramUpdate, env: BotEnv, ctx: ExecutionContext): Promise<void> {
  const msg = update.message;
  if (!msg?.from) return;
  // /delete must finish its visit write BEFORE removing the user row, so no
  // background write from this request can recreate an already-deleted row.
  const isPrivateDeletion = msg.chat.id === msg.from.id &&
    msg.text?.trim().split(/\s+/)[0].toLowerCase().split('@')[0] === '/delete';
  const track = recordUserVisit(env.DB, msg.from.id, 'bot').catch((error: unknown) => {
    console.warn('Unable to record bot visit', error);
  });
  if (isPrivateDeletion) await track;
  else ctx.waitUntil(track);
  const rawPhone = msg.contact?.phone_number.replace(/[\s()-]/g, '') || '';
  const normalizedPhone = /^\d/.test(rawPhone) ? `+${rawPhone}` : rawPhone;
  if (msg.contact && msg.chat.id === msg.from.id &&
      msg.contact.user_id === msg.from.id &&
      /^\+\d{7,15}$/.test(normalizedPhone)) {
    await env.DB.prepare(
      `INSERT INTO phone_contact_requests (telegram_user_id, phone, expires_at)
       VALUES (?, ?, ?) ON CONFLICT(telegram_user_id)
       DO UPDATE SET phone = excluded.phone, expires_at = excluded.expires_at`
    ).bind(msg.from.id, normalizedPhone, new Date(Date.now() + 120000).toISOString()).run();
    return;
  }
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = msg.text.trim().split(/\s+/)[0].toLowerCase().split('@')[0];
  if (command === '/delete' && chatId !== userId) {
    await sendTelegramMessage(env.BOT_TOKEN, chatId, 'Для удаления данных напиши /delete боту в личном чате.');
    return;
  }

  switch (command) {
    case '/start': {
      const text = [
        '<b>RECAP — Твой год. Твои сообщения. Твоя история.</b>',
        '',
        'Настоящая статистика твоих отправленных сообщений в Telegram за выбранный год.',
        '• Без обязательных подписок на каналы и репостов.',
        '• Без платных разблокировок.',
        '• Тексты переписок не сохраняются, медиафайлы не скачиваются.',
        '• Временный вход используется только для подсчёта; после завершения выполняем Telegram LogOut.',
      ].join('\n');

      await sendTelegramMessage(env.BOT_TOKEN, chatId, text, openRecapKeyboard(env.APP_URL, '', true));
      break;
    }

    case '/recap': {
      const existing = await env.DB.prepare(
        'SELECT year, completion_status FROM recap_results WHERE telegram_user_id = ? ORDER BY year DESC LIMIT 1'
      )
        .bind(userId)
        .first<{ year: number; completion_status: string }>();

      const statusNote = existing
        ? `Найдена сохранённая статистика за <b>${existing.year}</b> год (${
            existing.completion_status === 'completed' ? 'полная' : 'частичная'
          }).`
        : 'У тебя пока нет готового отчёта — открой RECAP, чтобы запустить анализ.';

      await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        statusNote,
        openRecapKeyboard(env.APP_URL, '?screen=reveal')
      );
      break;
    }

    case '/privacy': {
      const text = [
        '<b>Приватность RECAP</b>',
        '',
        '• У MTProto нет режима «только чтение»: сессия технически имеет широкие права Telegram-аккаунта.',
        '• Временная MTProto-сессия нужна только для подсчёта (обычно 1–3 минуты, иногда дольше). Она шифруется AES-256-GCM и автоматически закрывается через Telegram LogOut после результата, отмены или ошибки; файл удаляется.',
        '• Тексты сообщений не сохраняем, медиа не скачиваем. В D1 храним статистику, настройки, Telegram ID и технические даты первого/последнего визита. Переданный контакт удаляется после получения приложением или становится недействительным через 2 минуты.',
        '• Если Telegram не подтвердил LogOut, мы прямо сообщим об этом. Проверь Настройки → Устройства и вручную заверши временный сеанс.',
        '• Удалить статистику и настройки можно через Mini App или командой /delete.',
        '• Проверь активные сеансы: Telegram → Настройки → Устройства.',
      ].join('\n');
      await sendTelegramMessage(env.BOT_TOKEN, chatId, text);
      break;
    }

    case '/delete': {
      // Refuse to claim deletion if we cannot contact the active-session service.
      let revoked = false;
      try {
        const response = await fetch(`${env.SCANNER_BASE_URL}/internal/users/${userId}/revoke`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.SCANNER_SHARED_SECRET}` },
        });
        revoked = response.ok;
      } catch {
        revoked = false;
      }
      if (!revoked) {
        await sendTelegramMessage(
          env.BOT_TOKEN, chatId,
          'Не удалось связаться с сервисом анализа. Данные пока не удалены; повтори /delete позже и проверь активные устройства Telegram.'
        );
        break;
      }

      await env.DB.batch([
        env.DB.prepare('DELETE FROM recap_results WHERE telegram_user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM scan_jobs WHERE telegram_user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM user_settings WHERE telegram_user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM phone_contact_requests WHERE telegram_user_id = ?').bind(userId),
        env.DB.prepare('DELETE FROM bot_users WHERE telegram_user_id = ?').bind(userId),
      ]);

      await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        'Результаты RECAP удалены. Временный сеанс отозван, если он ещё существовал. Проверь список устройств в Telegram.'
      );
      break;
    }

    case '/stats': {
      // A secret with comma-separated IDs is the only admin authority.
      // Never expose this command in public bot commands or /help.
      const isAdmin = msg.chat.type === 'private' && chatId === userId &&
        (env.ADMIN_TELEGRAM_IDS || '').split(',').some(
          (id) => /^\\d+$/.test(id.trim()) && id.trim() === String(userId)
        );
      if (!isAdmin) {
        await sendHelp(env, chatId);
        break;
      }

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const [users, scans, results] = await Promise.all([
          env.DB.prepare(
            'SELECT COUNT(*) AS total, ' +
            'COUNT(CASE WHEN first_seen_at >= ? THEN 1 END) AS new24h, ' +
            'COUNT(CASE WHEN first_seen_at >= ? THEN 1 END) AS new7d, ' +
            'COUNT(CASE WHEN last_seen_at >= ? THEN 1 END) AS active24h FROM bot_users'
          ).bind(since24h, since7d, since24h).first<{
            total: number; new24h: number; new7d: number; active24h: number;
          }>(),
          env.DB.prepare(
            'SELECT COUNT(DISTINCT telegram_user_id) AS started, ' +
            "COUNT(CASE WHEN status IN ('queued', 'quick_preview', 'scanning', " +
            "'paused_flood_wait', 'paused_user') THEN 1 END) AS active " +
            'FROM scan_jobs'
          ).first<{ started: number; active: number }>(),
          env.DB.prepare(
            'SELECT COUNT(DISTINCT telegram_user_id) AS ready, ' +
            "COUNT(DISTINCT CASE WHEN completion_status = 'completed' " +
            'THEN telegram_user_id END) AS completed, ' +
            "COUNT(DISTINCT CASE WHEN completion_status = 'partial' " +
            'THEN telegram_user_id END) AS partial FROM recap_results'
          ).first<{ ready: number; completed: number; partial: number }>(),
        ]);
        if (!users || !scans || !results) throw new Error('Missing statistics row');

        const lines = [
          '<b>RECAP · статистика</b>',
          '',
          '👥 Всего пользователей: <b>' + users.total + '</b>',
          '🆕 Новых за 24 ч: <b>' + users.new24h + '</b>',
          '🗓 Новых за 7 дней: <b>' + users.new7d + '</b>',
          '⚡ Активных за 24 ч: <b>' + users.active24h + '</b>',
          '',
          '🔎 Запустили анализ: <b>' + scans.started + '</b>',
          '🎉 Получили RECAP: <b>' + results.ready + '</b>',
          '  ✅ Полный: <b>' + results.completed + '</b>',
          '  ◐ Частичный: <b>' + results.partial + '</b>',
          '⏳ Активных сканов: <b>' + scans.active + '</b>',
          '',
          '<i>Полный и частичный RECAP могут быть у одного пользователя за разные годы.</i>',
        ];
        await sendTelegramMessage(env.BOT_TOKEN, chatId, lines.join('\\n'));
      } catch (error) {
        console.error('Failed to query admin statistics', error);
        await sendTelegramMessage(
          env.BOT_TOKEN, chatId,
          'Не удалось получить статистику. Проверь миграции D1 и повтори запрос.'
        );
      }
      break;
    }

    case '/help':
    default: {
      await sendHelp(env, chatId);
      break;
    }
  }
}
