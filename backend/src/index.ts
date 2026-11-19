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
  body?: unknown,
  signal?: AbortSignal
): Promise<Response> {
  const res = await fetch(`${env.SCANNER_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SCANNER_SHARED_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
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
        jobId: string; telegramUserId: number; year: number; timezone: string;
        status: string; stage: string; processedDialogs: number; totalEligibleDialogs: number;
        outgoingFound: number; floodWaitUntil?: string | null; errorMessage?: string | null;
        stats?: Record<string, unknown> | null; sessionClosed?: boolean;
      };
      const final = payload.status === 'completed' || payload.status === 'partial';
      if (!payload.jobId || !Number.isSafeInteger(payload.telegramUserId) ||
          !Number.isInteger(payload.year) || !['queued', 'auth_pending', 'quick_preview',
            'scanning', 'paused_flood_wait', 'paused_user', 'completed', 'partial',
            'cancelled', 'failed'].includes(payload.status) ||
          (final && (!payload.stats || payload.stats.year !== payload.year ||
            payload.stats.completionStatus !== payload.status))) {
        return jsonResponse({ error: 'Invalid scanner callback' }, 400, corsOrigin);
      }
      // Strict identity match: a stale scanner must not resurrect a deleted user.
      const expected = await env.DB.prepare(
        'SELECT telegram_user_id, year, timezone, status, notified_at FROM scan_jobs WHERE id = ?'
      ).bind(payload.jobId).first<{
        telegram_user_id: number; year: number; timezone: string; status: string; notified_at: string | null;
      }>();
      if (!expected || expected.telegram_user_id !== payload.telegramUserId ||
          expected.year !== payload.year || expected.timezone !== payload.timezone) {
        return jsonResponse({ error: 'Unknown or mismatched job' }, 409, corsOrigin);
      }
      const alreadyFinished = final && expected.status === payload.status;
      if (['cancelled', 'failed'].includes(expected.status) ||
          (['completed', 'partial'].includes(expected.status) && !alreadyFinished)) {
        return jsonResponse({ ok: true, ignored: true }, 200, corsOrigin);
      }
      if ((expected.status === 'paused_user' &&
          ['queued', 'auth_pending', 'quick_preview', 'scanning', 'paused_flood_wait'].includes(payload.status)) ||
          (expected.status !== 'paused_user' && payload.status === 'paused_user')) {
        return jsonResponse({ ok: true, ignored: true }, 200, corsOrigin);
      }

      const now = new Date().toISOString();
      if (!alreadyFinished) {
        // D1 batch runs transactionally: the recap is persisted before the
        // completion status becomes visible to polling clients.
        const update = env.DB.prepare(
          `UPDATE scan_jobs SET status = ?, stage = ?, processed_dialogs = ?,
             total_eligible_dialogs = ?, outgoing_found = ?, flood_wait_until = ?,
             error_message = ?, updated_at = ?
           WHERE id = ? AND telegram_user_id = ?
             AND status NOT IN ('cancelled', 'completed', 'failed', 'partial')`
        ).bind(payload.status, payload.stage, payload.processedDialogs,
          payload.totalEligibleDialogs, payload.outgoingFound, payload.floodWaitUntil ?? null,
          payload.errorMessage ?? null, now, payload.jobId, payload.telegramUserId);

        if (final && payload.stats) {
          const insert = env.DB.prepare(
            `INSERT INTO recap_results
              (telegram_user_id, year, timezone, completion_status, stats_json, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ? FROM scan_jobs
             WHERE id = ? AND telegram_user_id = ?
               AND status NOT IN ('cancelled', 'completed', 'failed', 'partial')
             ON CONFLICT(telegram_user_id, year) DO UPDATE SET
               timezone = excluded.timezone, completion_status = excluded.completion_status,
               stats_json = excluded.stats_json, updated_at = excluded.updated_at`
          ).bind(payload.telegramUserId, payload.year, payload.timezone,
            payload.status, JSON.stringify(payload.stats), now, now,
            payload.jobId, payload.telegramUserId);
          // Insert first with conditional status check, update second in same transaction.
          await env.DB.batch([insert, update]);
        } else {
          await update.run();
        }
      }

      if (final) {
        // Claim the send exactly once per job with an atomic D1 compare-and-set.
        // A retried callback can deliver a failed notice without duplicating a
        // successful one.
        const claimed = await env.DB.prepare(
          `UPDATE scan_jobs SET notified_at = ? WHERE id = ?
           AND telegram_user_id = ? AND status = ? AND notified_at IS NULL`
        ).bind(now, payload.jobId, payload.telegramUserId, payload.status).run();
        if (claimed.meta.changes > 0) {
          const target = new URL(env.APP_URL);
          target.searchParams.set('screen', 'reveal');
          target.searchParams.set('year', String(payload.year));
          const base = payload.status === 'partial'
            ? `Часть статистики за ${payload.year} год готова. Некоторые чаты оказались недоступны.`
            : `Твой RECAP за ${payload.year} год готов!`;
          const sessionNote = payload.sessionClosed === true
            ? 'Временный сеанс уже закрыт — можешь проверить в Настройки → Устройства.'
            : 'Не удалось автоматически подтвердить выход — на всякий случай проверь Настройки → Устройства.';
          const message = base + ' ' + sessionNote;
          try {
            const response = await fetch(
              `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: payload.telegramUserId,
                  text: message,
                  reply_markup: { inline_keyboard: [[{
                    text: 'Смотреть итоги года', web_app: { url: target.toString() },
                  }]] },
                }) }
            );
            if (!response.ok) {
              // Known Telegram rejection: safe to allow a future callback retry.
              await env.DB.prepare(
                'UPDATE scan_jobs SET notified_at = NULL WHERE id = ? AND notified_at = ?'
              ).bind(payload.jobId, now).run();
              console.warn('Telegram completion notification failed', response.status);
            }
          } catch {
            // Transport ambiguity: avoid a possible duplicate Telegram message.
            console.warn('Telegram completion notification status unknown');
          }
        }
      }

      return jsonResponse({ ok: true }, 200, corsOrigin);
    }

    if (url.pathname.startsWith('/api/')) {
      const user = await requireUser(request, env);
      if (!user) {
        return jsonResponse({ error: 'Invalid Telegram initData signature' }, 401, corsOrigin);
      }

      if (url.pathname === '/api/export/send' && request.method === 'POST') {
        // Signed, time-limited Telegram initData has already been verified above.
        const maxPngSize = 5 * 1024 * 1024;
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > maxPngSize + 65536) {
          return jsonResponse({ error: 'Размер PNG не должен превышать 5 МБ' }, 413, corsOrigin);
        }
        if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data;')) {
          return jsonResponse({ error: 'Ожидается multipart/form-data' }, 415, corsOrigin);
        }
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonResponse({ error: 'Не удалось прочитать PNG' }, 400, corsOrigin);
        }
        const image = form.get('image');
        const yearRaw = form.get('year');
        const format = form.get('format');
        const year = typeof yearRaw === 'string' ? Number(yearRaw) : NaN;
        if (!Number.isInteger(year) || year < 2013 || year > new Date().getUTCFullYear() ||
            (format !== 'story' && format !== 'square')) {
          return jsonResponse({ error: 'Некорректный год или формат открытки' }, 400, corsOrigin);
        }
        if (!(image instanceof File) || image.size === 0 || image.size > maxPngSize) {
          return jsonResponse({ error: 'Нужен PNG размером до 5 МБ' }, 413, corsOrigin);
        }
        const bytes = new Uint8Array(await image.arrayBuffer());
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length < 24 || !pngSignature.every((byte, index) => bytes[index] === byte) ||
            String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
          return jsonResponse({ error: 'Файл не является корректным PNG' }, 400, corsOrigin);
        }
        const view = new DataView(bytes.buffer);
        if (view.getUint32(16) !== 1080 || view.getUint32(20) !== (format === 'story' ? 1920 : 1080)) {
          return jsonResponse({ error: 'Неверный размер PNG для выбранного формата' }, 400, corsOrigin);
        }
        const saved = await env.DB.prepare(
          'SELECT 1 AS found FROM recap_results WHERE telegram_user_id = ? AND year = ?'
        ).bind(user.id, year).first<{ found: number }>();
        if (!saved) {
          return jsonResponse({ error: 'Нет сохранённой статистики за этот год' }, 404, corsOrigin);
        }
        const upload = new FormData();
        upload.set('chat_id', String(user.id));
        upload.set('caption', `Твой RECAP за ${year} год`);
        upload.set('photo', new Blob([bytes], { type: 'image/png' }), `RECAP-${year}-${format}.png`);
        try {
          const tgResponse = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
            method: 'POST', body: upload, signal: AbortSignal.timeout(20000),
          });
          const result = await tgResponse.json().catch(() => null) as {ok?:boolean;description?:string}|null;
          if (!tgResponse.ok || !result?.ok) {
            console.warn('Telegram PNG delivery failed', tgResponse.status, result?.description);
            return jsonResponse({
              error: 'Не удалось отправить открытку. Открой чат с ботом, нажми Start и попробуй снова.'
            }, 502, corsOrigin);
          }
        } catch {
          return jsonResponse({ error: 'Telegram временно недоступен. Попробуй ещё раз.' }, 502, corsOrigin);
        }
        return jsonResponse({ ok: true }, 200, corsOrigin);
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const [recentJob, recaps, settings] = await Promise.all([
          env.DB.prepare(
            `SELECT id, year, status, stage, processed_dialogs,
              total_eligible_dialogs, outgoing_found, flood_wait_until,
              error_message, updated_at FROM scan_jobs
             WHERE telegram_user_id = ? AND status IN (
               'queued','auth_pending','quick_preview','scanning','paused_flood_wait','paused_user'
             ) ORDER BY created_at DESC LIMIT 1`
          ).bind(user.id).first<any>(),
          env.DB.prepare(
            'SELECT year FROM recap_results WHERE telegram_user_id = ? ORDER BY year DESC'
          ).bind(user.id).all<{ year: number }>(),
          env.DB.prepare(
            'SELECT timezone, hide_chat_names FROM user_settings WHERE telegram_user_id = ?'
          ).bind(user.id).first<{ timezone: string; hide_chat_names: number }>(),
        ]);
        let authorized = false;
        try {
          const res = await proxyToScanner(env,
            `/internal/auth/status?telegram_user_id=${user.id}`, 'GET', undefined, AbortSignal.timeout(2500));
          if (!res.ok) throw new Error('scanner unavailable');
          const state = (await res.json()) as { authorized: boolean };
          authorized = state.authorized;
        } catch {
          if (!(recaps.results || []).length && !recentJob) {
            return jsonResponse({ error: 'Сервис авторизации недоступен' }, 503, corsOrigin);
          }
        }
        return jsonResponse({
          authorized, availableYears: (recaps.results || []).map((r) => r.year),
          timezone: settings?.timezone || null,
          hideChatNames: settings?.hide_chat_names !== 0,
          activeJob: recentJob ? {
            jobId: recentJob.id, year: recentJob.year, status: recentJob.status,
            stage: recentJob.stage, processedDialogs: recentJob.processed_dialogs,
            totalEligibleDialogs: recentJob.total_eligible_dialogs,
            outgoingFound: recentJob.outgoing_found,
            floodWaitUntil: recentJob.flood_wait_until,
            errorMessage: recentJob.error_message, updatedAt: recentJob.updated_at,
          } : null,
        }, 200, corsOrigin);
      }

      if (url.pathname === '/api/chats/names' && request.method === 'GET') {
        const year = Number(url.searchParams.get('year'));
        if (!Number.isInteger(year) || year < 2013 || year > new Date().getUTCFullYear()) {
          return jsonResponse({ error: 'Invalid year' }, 400, corsOrigin);
        }
        const recap = await env.DB.prepare(
          'SELECT stats_json FROM recap_results WHERE telegram_user_id = ? AND year = ?'
        ).bind(user.id, year).first<{ stats_json: string }>();
        if (!recap) return jsonResponse({ error: 'Нет статистики за этот год' }, 404, corsOrigin);
        // Never re-open MTProto after completed or partial scan. Existing API
        // contract stays intact; callers display local non-identifying masks.
        return jsonResponse({ names: {} }, 200, corsOrigin);
      }

      if (url.pathname === '/api/auth/contact/pickup' && request.method === 'GET') {
        const contact = await env.DB.prepare(
          'SELECT phone FROM phone_contact_requests WHERE telegram_user_id = ? AND expires_at > ?'
        ).bind(user.id, new Date().toISOString()).first<{ phone: string }>();
        if (!contact) return jsonResponse({ phone: null }, 200, corsOrigin);
        await env.DB.prepare('DELETE FROM phone_contact_requests WHERE telegram_user_id = ?')
          .bind(user.id).run();
        return jsonResponse({ phone: contact.phone }, 200, corsOrigin);
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
        const body = (await request.json()) as { year: number; timezone?: string; authId?: string };
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
        if (body.authId != null && typeof body.authId !== 'string') {
          return jsonResponse({ error: 'Некорректный идентификатор авторизации' }, 400, corsOrigin);
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
            auth_id: body.authId || '',
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
        if (!body.jobId) {
          return jsonResponse({ error: 'Не указано задание' }, 400, corsOrigin);
        }
        if (!body.authId || typeof body.authId !== 'string') {
          return jsonResponse({
            error: 'Временный сеанс закрыт. Для продолжения войди в Telegram ещё раз.',
            requiresAuth: true
          }, 409, corsOrigin);
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
             error_message = NULL, flood_wait_until = NULL, notified_at = NULL, updated_at = ?
             WHERE id = ? AND telegram_user_id = ?`
          ).bind(new Date().toISOString(), body.jobId, user.id).run();
        } catch {
          return jsonResponse({ error: 'Уже идёт другое сканирование' }, 409, corsOrigin);
        }
        try {
          const result = await proxyToScanner(env, '/internal/scan/start', 'POST', {
            job_id: body.jobId,
            telegram_user_id: user.id,
            auth_id: body.authId || '',
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
          env.DB.prepare('DELETE FROM phone_contact_requests WHERE telegram_user_id = ?').bind(user.id),
        ]);
        return jsonResponse({ deleted: true }, 200, corsOrigin);
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404, corsOrigin);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Short-lived contact exchange data is physically removed even when a
    // user leaves the app after sharing their phone number.
    ctx.waitUntil(env.DB.prepare(
      'DELETE FROM phone_contact_requests WHERE expires_at <= ?'
    ).bind(new Date().toISOString()).run().then(() => undefined));
    // Keep the health endpoint responsive on hosts that idle unused scanners.
    // A failed ping must never block the scheduled cleanup task.
    ctx.waitUntil(fetch(`${env.SCANNER_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    }).then(response => {
      if (!response.ok) console.warn('Scanner health ping failed', response.status);
    }).catch(() => {
      console.warn('Scanner health ping temporarily unavailable');
    }));
  },
};
