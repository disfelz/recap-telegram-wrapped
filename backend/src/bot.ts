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
  if (!msg?.text || !msg.from) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = msg.text.trim().split(/\s+/)[0].toLowerCase().split('@')[0];

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
        openRecapKeyboard(env.APP_URL, '?screen=stories')
      );
      break;
    }

    case '/privacy': {
      const text = [
        '<b>Конфиденциальность и безопасность RECAP</b>',
        '',
        '1. <b>Честно о правах доступа:</b> для подсчёта истории используется временная MTProto-сессия. Telegram не предоставляет режима «только чтение» для MTProto — технически сессия имеет широкие права аккаунта. Поэтому мы шифруем её в оперативном хранилище и пытаемся завершать через Telegram API (LogOut) после анализа или отмены. Результат отзыва рекомендуется проверять в списке устройств.',
        '2. <b>Что НЕ сохраняется:</b> тексты сообщений, медиафайлы, коды входа, пароли 2FA и session strings.',
        '3. <b>Что сохраняется:</b> только числовые агрегаты (счётчики по месяцам, часам, типам сообщений) строго для твоего Telegram ID.',
        '4. <b>Никаких третьих сторон и ИИ:</b> твои данные не передаются сторонним сервисам и моделям.',
        '5. Удалить всё можно в любой момент командой /delete.',
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
      ]);

      await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        'Результаты и настройки RECAP удалены. Отзыв активных временных сессий запрошен; проверь также список устройств Telegram.'
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
