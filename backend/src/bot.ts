export interface BotEnv {
  DB: D1Database;
  BOT_TOKEN: string;
  APP_URL: string;
  SCANNER_BASE_URL: string;
  SCANNER_SHARED_SECRET: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
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

function openRecapKeyboard(appUrl: string, path = '') {
  return {
    inline_keyboard: [
      [
        {
          text: 'Открыть RECAP',
          web_app: { url: `${appUrl}${path}` },
        },
      ],
    ],
  };
}

export async function handleBotUpdate(update: TelegramUpdate, env: BotEnv): Promise<void> {
  const msg = update.message;
  if (!msg?.from) return;
  if (msg.contact && msg.chat.id === msg.from.id &&
      msg.contact.user_id === msg.from.id &&
      /^\+?\d{7,15}$/.test(msg.contact.phone_number.replace(/[\s()-]/g, ''))) {
    await env.DB.prepare(
      `INSERT INTO phone_contact_requests (telegram_user_id, phone, expires_at)
       VALUES (?, ?, ?) ON CONFLICT(telegram_user_id)
       DO UPDATE SET phone = excluded.phone, expires_at = excluded.expires_at`
    ).bind(msg.from.id, msg.contact.phone_number, new Date(Date.now() + 120000).toISOString()).run();
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
      ].join('\n');

      await sendTelegramMessage(env.BOT_TOKEN, chatId, text, openRecapKeyboard(env.APP_URL));
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
        '• Сессия шифруется AES-256-GCM и сохраняется на сервере анализа для обновления годов без нового входа. После скана соединение закрывается, но Telegram LogOut не вызывается.',
        '• Тексты сообщений не сохраняем, медиа не скачиваем. В D1 храним статистику, настройки и технический прогресс. Переданный контакт удаляется после получения приложением или становится недействительным через 2 минуты.',
        '• Отключить аккаунт и удалить всё можно в настройках Mini App или командой /delete. Для этого выполняем Telegram LogOut.',
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
      ]);

      await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        'Результаты RECAP удалены. Telegram LogOut подтверждён. Проверь список устройств в настройках Telegram.'
      );
      break;
    }

    case '/help':
    default: {
      const text = [
        '<b>Команды RECAP:</b>',
        '/start — запуск и описание сервиса',
        '/recap — открыть годовую статистику',
        '/privacy — как защищены твои данные',
        '/delete — удалить все результаты и отозвать сессию',
        '/help — список команд',
      ].join('\n');

      await sendTelegramMessage(env.BOT_TOKEN, chatId, text, openRecapKeyboard(env.APP_URL));
      break;
    }
  }
}
