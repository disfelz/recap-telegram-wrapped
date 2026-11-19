import { verifyTelegramInitData, TelegramInitUser } from './crypto';
import { handleBotUpdate, BotEnv } from './bot';

export interface Env extends BotEnv {
  BOT_WEBHOOK_SECRET: string;
}

function jsonResponse(data: unknown, status = 200, origin = '*'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}

async function requireUser(request: Request, env: Env): Promise<TelegramInitUser | null> {
  const initData = request.headers.get('X-Telegram-Init-Data') || '';
  return verifyTelegramInitData(initData, env.BOT_TOKEN);
}

async function proxyToScanner(
  env: Env,
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const res = await fetch(`${env.SCANNER_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SCANNER_SHARED_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': env.APP_URL,
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsOrigin = env.APP_URL || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        },
      });
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true }, 200, corsOrigin);
    }

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!secret || secret !== env.BOT_WEBHOOK_SECRET) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsOrigin);
      }
      const update = await request.json();
      await handleBotUpdate(update as never, env);
      return jsonResponse({ ok: true }, 200, corsOrigin);
    }

    if (url.pathname === '/internal/scanner/callback' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.SCANNER_SHARED_SECRET}`) {
        return jsonResponse({ error: 'Unauthorized' }, 401, corsOrigin);
      }

      const payload = (await request.json()) as {
        jobId: string;
        telegramUserId: number;
        year: number;
        timezone: string;
        status: string;
        stage: string;
        processedDialogs: number;
        totalEligibleDialogs: number;
        outgoingFound: number;
        floodWaitUntil?: string | null;
        errorMessage?: string | null;
        stats?: Record<string, unknown> | null;
      };

      // Scanner cannot overwrite another user's report or resurrect a cancelled job.
      const expected = await env.DB.prepare(
        'SELECT telegram_user_id, year, timezone, status FROM scan_jobs WHERE id = ?'
      ).bind(payload.jobId).first<{ telegram_user_id: number; year: number; timezone: string; status: string }>();
      if (!expected || expected.telegram_user_id !== payload.telegramUserId ||
          expected.year !== payload.year || expected.timezone !== payload.timezone) {
        return jsonResponse({ error: 'Unknown or mismatched job' }, 409, corsOrigin);
      }
      if (['cancelled', 'completed', 'failed', 'partial'].includes(expected.status)) {
        return jsonResponse({ ok: true, ignored: true }, 200, corsOrigin);
      }
      // A delayed progress callback must not override a manual pause/resume.
      if ((expected.status === 'paused_user' &&
           ['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait'].includes(payload.status)) ||
          (expected.status !== 'paused_user' && payload.status === 'paused_user')) {
        return jsonResponse({ ok: true, ignored: true }, 200, corsOrigin);
      }
      const now = new Date().toISOString();
      const updateJob = await env.DB.prepare(
        `UPDATE scan_jobs
         SET status = ?, stage = ?, processed_dialogs = ?, total_eligible_dialogs = ?,
             outgoing_found = ?, flood_wait_until = ?, error_message = ?, updated_at = ?
         WHERE id = ? AND telegram_user_id = ? AND status NOT IN ('cancelled', 'completed', 'failed', 'partial')`
      )
        .bind(
          payload.status,
          payload.stage,
          payload.processedDialogs,
          payload.totalEligibleDialogs,
          payload.outgoingFound,
          payload.floodWaitUntil ?? null,
          payload.errorMessage ?? null,
          now,
          payload.jobId,
          payload.telegramUserId
        )
        .run();

      if (payload.stats && (payload.status === 'completed' || payload.status === 'partial')) {
        await env.DB.prepare(
          `INSERT INTO recap_results
             (telegram_user_id, year, timezone, completion_status, stats_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(telegram_user_id, year) DO UPDATE SET
             timezone = excluded.timezone,
             completion_status = excluded.completion_status,
             stats_json = excluded.stats_json,
             updated_at = excluded.updated_at`
        )
          .bind(
            payload.telegramUserId,
            payload.year,
            payload.timezone,
            payload.status,
            JSON.stringify(payload.stats),
            now,
            now
          )
          .run();
      }

      // Notify the user once after a job reaches a terminal state. The D1 status
      // transition is guarded above, so a retried callback cannot send duplicates.
      if (updateJob.meta.changes > 0 &&
          ['completed', 'partial', 'failed'].includes(payload.status)) {
        const finished = payload.status === 'completed';
        const partial = payload.status === 'partial';
        const message = finished
          ? `✅ <b>Твой RECAP за ${payload.year} год готов!</b>\n\nТочная статистика собрана. Открывай свои итоги.`
          : partial
          ? `📊 <b>RECAP за ${payload.year} год — частичный результат</b>\n\nНе все переписки удалось обработать. Можно посмотреть подтверждённые цифры и затем продолжить анализ.`
          : `⚠️ <b>Анализ RECAP за ${payload.year} год остановился</b>\n\nОткрой приложение, чтобы проверить статус и повторить попытку.`;

        try {
          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: payload.telegramUserId,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{
                    text: 'Открыть RECAP',
                    web_app: { url: `${env.APP_URL}?screen=stories&year=${payload.year}` },
                  }]],
                },
              }),
            }
          );
          if (!telegramResponse.ok) {
            console.warn('RECAP completion notice was not delivered', telegramResponse.status);
          }
        } catch {
          // Delivery failure must not roll back the completed analysis.
          console.warn('RECAP completion notice request failed');
        }
      }

      return jsonResponse({ ok: true }, 200, corsOrigin);
    }

    if (url.pathname.startsWith('/api/')) {
      const user = await requireUser(request, env);
      if (!user) {
        return jsonResponse({ error: 'Invalid Telegram initData signature' }, 401, corsOrigin);
      }

      if (url.pathname === '/api/recap' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT year, completion_status, stats_json, updated_at FROM recap_results WHERE telegram_user_id = ? ORDER BY year DESC'
        )
          .bind(user.id)
          .all<{ year: number; completion_status: string; stats_json: string; updated_at: string }>();

        const results = (rows.results || []).map((r) => JSON.parse(r.stats_json));
        return jsonResponse({ results }, 200, corsOrigin);
      }

      if (url.pathname === '/api/auth/qr/start' && request.method === 'POST') {
        const body = (await request.json()) as { consentAccepted?: boolean };
        if (!body.consentAccepted) {
          return jsonResponse({ error: 'Explicit user consent is required' }, 400, corsOrigin);
        }
        return proxyToScanner(env, '/internal/auth/qr/start', 'POST', {
          telegram_user_id: user.id,
        });
      }

      if (url.pathname === '/api/auth/qr/status' && request.method === 'GET') {
        const tokenId = url.searchParams.get('authId') || '';
        return proxyToScanner(
          env,
          `/internal/auth/qr/status?telegram_user_id=${user.id}&auth_id=${encodeURIComponent(tokenId)}`,
          'GET'
        );
      }

      if (url.pathname === '/api/auth/phone/start' && request.method === 'POST') {
        const body = (await request.json()) as { phone: string; consentAccepted?: boolean };
        if (!body.consentAccepted) {
          return jsonResponse({ error: 'Explicit user consent is required' }, 400, corsOrigin);
        }
        return proxyToScanner(env, '/internal/auth/phone/start', 'POST', {
          telegram_user_id: user.id,
          phone: body.phone,
        });
      }

      if (url.pathname === '/api/auth/phone/verify' && request.method === 'POST') {
        const body = (await request.json()) as { authId: string; code?: string; password?: string };
        return proxyToScanner(env, '/internal/auth/phone/verify', 'POST', {
          telegram_user_id: user.id,
          auth_id: body.authId,
          code: body.code,
          password: body.password,
        });
      }

      if (url.pathname === '/api/scan/start' && request.method === 'POST') {
        const body = (await request.json()) as { year: number; timezone?: string; authId: string };
        const year = Number(body.year);
        if (!Number.isInteger(year) || year < 2013 || year > new Date().getUTCFullYear()) {
          return jsonResponse({ error: 'Invalid year' }, 400, corsOrigin);
        }

        const timezone = body.timezone || 'Europe/Moscow';
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        } catch {
          return jsonResponse({ error: 'Некорректный часовой пояс' }, 400, corsOrigin);
        }
        if (!body.authId || typeof body.authId !== 'string') {
          return jsonResponse({ error: 'Отсутствует подтверждённая авторизация' }, 400, corsOrigin);
        }
        // Also guard jobs paused by their owner; older D1 indexes may not yet include paused_user.
        const existing = await env.DB.prepare(
          "SELECT id FROM scan_jobs WHERE telegram_user_id = ? AND status IN ('queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait', 'paused_user') LIMIT 1"
        ).bind(user.id).first();
        if (existing) {
          return jsonResponse({ error: 'Уже выполняется или приостановлен анализ. Продолжи или отмени его.' }, 409, corsOrigin);
        }
        const jobId = crypto.randomUUID();
        const now = new Date().toISOString();

        try {
          await env.DB.prepare(
            `INSERT INTO scan_jobs (id, telegram_user_id, year, timezone, status, stage, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'queued', 'quick_preview', ?, ?)`
          )
            .bind(jobId, user.id, year, timezone, now, now)
            .run();
        } catch {
          return jsonResponse(
            { error: 'Для этого аккаунта уже выполняется сканирование' },
            409,
            corsOrigin
          );
        }

        try {
          const startRes = await proxyToScanner(env, '/internal/scan/start', 'POST', {
            job_id: jobId,
            telegram_user_id: user.id,
            auth_id: body.authId,
            year,
            timezone,
            callback_url: `${url.origin}/internal/scanner/callback`,
          });
          if (!startRes.ok) {
            await env.DB.prepare('UPDATE scan_jobs SET status = ?, updated_at = ? WHERE id = ?')
              .bind('failed', new Date().toISOString(), jobId).run();
          }
          return startRes;
        } catch {
          await env.DB.prepare('UPDATE scan_jobs SET status = ?, updated_at = ? WHERE id = ?')
            .bind('failed', new Date().toISOString(), jobId).run();
          return jsonResponse({ error: 'Сервис анализа временно недоступен' }, 503, corsOrigin);
        }
      }

      if (url.pathname === '/api/scan/resume' && request.method === 'POST') {
        const body = (await request.json()) as { jobId?: string; authId?: string };
        if (!body.jobId || !body.authId) {
          return jsonResponse({ error: 'Не указано задание или авторизация' }, 400, corsOrigin);
        }
        const previous = await env.DB.prepare(
          `SELECT year, timezone, status FROM scan_jobs WHERE id = ? AND telegram_user_id = ?`
        ).bind(body.jobId, user.id).first<{year:number; timezone:string; status:string}>();
        if (!previous || !['cancelled', 'partial', 'failed'].includes(previous.status)) {
          return jsonResponse({ error: 'Это задание нельзя возобновить' }, 409, corsOrigin);
        }
        try {
          await env.DB.prepare(
            `UPDATE scan_jobs SET status = 'queued', stage = 'quick_preview',
             error_message = NULL, flood_wait_until = NULL, updated_at = ?
             WHERE id = ? AND telegram_user_id = ?`
          ).bind(new Date().toISOString(), body.jobId, user.id).run();
        } catch {
          return jsonResponse({ error: 'Уже идёт другое сканирование' }, 409, corsOrigin);
        }
        try {
          const result = await proxyToScanner(env, '/internal/scan/start', 'POST', {
            job_id: body.jobId,
            telegram_user_id: user.id,
            auth_id: body.authId,
            year: previous.year,
            timezone: previous.timezone,
            callback_url: `${url.origin}/internal/scanner/callback`,
          });
          if (!result.ok) {
            await env.DB.prepare('UPDATE scan_jobs SET status = ?, updated_at = ? WHERE id = ?')
              .bind('partial', new Date().toISOString(), body.jobId).run();
          }
          return result;
        } catch {
          await env.DB.prepare('UPDATE scan_jobs SET status = ?, updated_at = ? WHERE id = ?')
            .bind('partial', new Date().toISOString(), body.jobId).run();
          return jsonResponse({ error: 'Сервис анализа временно недоступен' }, 503, corsOrigin);
        }
      }

      if (url.pathname === '/api/scan/status' && request.method === 'GET') {
        const jobId = url.searchParams.get('jobId');
        const row = jobId
          ? await env.DB.prepare(
              'SELECT * FROM scan_jobs WHERE id = ? AND telegram_user_id = ?'
            )
              .bind(jobId, user.id)
              .first()
          : await env.DB.prepare(
              'SELECT * FROM scan_jobs WHERE telegram_user_id = ? ORDER BY created_at DESC LIMIT 1'
            )
              .bind(user.id)
              .first();

        if (!row) return jsonResponse({ job: null }, 200, corsOrigin);
        return jsonResponse({ job: {
          jobId: row.id,
          year: row.year,
          status: row.status,
          stage: row.stage,
          processedDialogs: row.processed_dialogs,
          totalEligibleDialogs: row.total_eligible_dialogs,
          outgoingFound: row.outgoing_found,
          floodWaitUntil: row.flood_wait_until,
          errorMessage: row.error_message,
          updatedAt: row.updated_at,
        } }, 200, corsOrigin);
      }

      if (url.pathname === '/api/scan/pause' && request.method === 'POST') {
        const body = (await request.json()) as { jobId?: string };
        if (!body.jobId) return jsonResponse({ error: 'Не указано задание' }, 400, corsOrigin);
        const row = await env.DB.prepare(
          'SELECT status FROM scan_jobs WHERE id = ? AND telegram_user_id = ?'
        ).bind(body.jobId, user.id).first<{ status: string }>();
        if (!row) return jsonResponse({ error: 'Задание не найдено' }, 404, corsOrigin);
        if (row.status === 'paused_user') return jsonResponse({ paused: true }, 200, corsOrigin);
        if (!['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait'].includes(row.status)) {
          return jsonResponse({ error: 'Это задание нельзя приостановить' }, 409, corsOrigin);
        }
        let response: Response;
        try {
          response = await proxyToScanner(env, '/internal/scan/pause', 'POST', {
            job_id: body.jobId, telegram_user_id: user.id,
          });
        } catch {
          return jsonResponse({ error: 'Нет связи со сканером. Пауза не подтверждена.' }, 503, corsOrigin);
        }
        if (!response.ok) return response;
        await env.DB.prepare(
          "UPDATE scan_jobs SET status = 'paused_user', updated_at = ? WHERE id = ? AND telegram_user_id = ? AND status IN ('queued','auth_pending','quick_preview','scanning','paused_flood_wait')"
        ).bind(new Date().toISOString(), body.jobId, user.id).run();
        return jsonResponse({ paused: true }, 200, corsOrigin);
      }

      if (url.pathname === '/api/scan/unpause' && request.method === 'POST') {
        const body = (await request.json()) as { jobId?: string };
        if (!body.jobId) return jsonResponse({ error: 'Не указано задание' }, 400, corsOrigin);
        const row = await env.DB.prepare(
          'SELECT status, stage FROM scan_jobs WHERE id = ? AND telegram_user_id = ?'
        ).bind(body.jobId, user.id).first<{ status: string; stage: string }>();
        if (!row) return jsonResponse({ error: 'Задание не найдено' }, 404, corsOrigin);
        if (row.status !== 'paused_user') return jsonResponse({ error: 'Это задание не на паузе' }, 409, corsOrigin);
        let response: Response;
        try {
          response = await proxyToScanner(env, '/internal/scan/unpause', 'POST', {
            job_id: body.jobId, telegram_user_id: user.id,
          });
        } catch {
          return jsonResponse({ error: 'Нет связи со сканером. Возобновление не подтверждено.' }, 503, corsOrigin);
        }
        if (!response.ok) return response;
        await env.DB.prepare(
          "UPDATE scan_jobs SET status = ?, updated_at = ? WHERE id = ? AND telegram_user_id = ? AND status = 'paused_user'"
        ).bind(row.stage === 'full_scan' ? 'scanning' : 'quick_preview',
          new Date().toISOString(), body.jobId, user.id).run();
        return jsonResponse({ resumed: true }, 200, corsOrigin);
      }

      if (url.pathname === '/api/scan/cancel' && request.method === 'POST') {
        const body = (await request.json()) as { jobId: string };
        const row = await env.DB.prepare(
          'SELECT status FROM scan_jobs WHERE id = ? AND telegram_user_id = ?'
        ).bind(body.jobId, user.id).first<{status:string}>();
        if (!row) return jsonResponse({ error: 'Задание не найдено' }, 404, corsOrigin);
        if (['completed', 'partial', 'failed', 'cancelled'].includes(row.status)) {
          return jsonResponse({ error: 'Задание уже завершено' }, 409, corsOrigin);
        }
        // Signal the scanner before marking the database terminal; otherwise UI lies.
        let response: Response;
        try {
          response = await proxyToScanner(env, '/internal/scan/cancel', 'POST', {
            job_id: body.jobId,
            telegram_user_id: user.id,
          });
        } catch {
          return jsonResponse({ error: 'Не удалось связаться со сканером для отмены' }, 503, corsOrigin);
        }
        if (response.ok) {
          await env.DB.prepare(
            `UPDATE scan_jobs SET status = 'cancelled', updated_at = ?
             WHERE id = ? AND telegram_user_id = ? AND status NOT IN ('completed', 'partial', 'failed')`
          ).bind(new Date().toISOString(), body.jobId, user.id).run();
        }
        return response;
      }

      if (url.pathname === '/api/settings' && request.method === 'PUT') {
        const body = (await request.json()) as { timezone: string; hideChatNames: boolean };
        await env.DB.prepare(
          `INSERT INTO user_settings (telegram_user_id, timezone, hide_chat_names, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(telegram_user_id) DO UPDATE SET
             timezone = excluded.timezone,
             hide_chat_names = excluded.hide_chat_names,
             updated_at = excluded.updated_at`
        )
          .bind(user.id, body.timezone, body.hideChatNames ? 1 : 0, new Date().toISOString())
          .run();
        return jsonResponse({ ok: true }, 200, corsOrigin);
      }

      if (url.pathname === '/api/data' && request.method === 'DELETE') {
        let revoke: Response;
        try {
          revoke = await proxyToScanner(env, `/internal/users/${user.id}/revoke`, 'POST');
        } catch {
          return jsonResponse({ error: 'Не удалось подтвердить отзыв сеанса — повторите попытку' }, 503, corsOrigin);
        }
        if (!revoke.ok) return jsonResponse({ error: 'Не удалось подтвердить отзыв сеанса' }, 503, corsOrigin);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM recap_results WHERE telegram_user_id = ?').bind(user.id),
          env.DB.prepare('DELETE FROM scan_jobs WHERE telegram_user_id = ?').bind(user.id),
          env.DB.prepare('DELETE FROM user_settings WHERE telegram_user_id = ?').bind(user.id),
        ]);
        return jsonResponse({ deleted: true }, 200, corsOrigin);
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404, corsOrigin);
  },
};
