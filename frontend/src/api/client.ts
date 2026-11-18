import type { RecapStats, ScanProgressPayload } from '../../../shared/types';
import { getTelegramWebApp } from '../utils/telegram';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL не настроен. Переключись в Демо-режим или укажи URL Worker API.');
  }
  const initData = getTelegramWebApp()?.initData || '';
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Ошибка запроса (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const recapApi = {
  getSavedRecaps: () => apiFetch<{ results: RecapStats[] }>('/api/recap'),

  startQrAuth: (consentAccepted: boolean) =>
    apiFetch<{ authId: string; qrUrl: string; expiresAt: string }>('/api/auth/qr/start', {
      method: 'POST',
      body: JSON.stringify({ consentAccepted }),
    }),

  getQrStatus: (authId: string) =>
    apiFetch<{ status: string }>(`/api/auth/qr/status?authId=${encodeURIComponent(authId)}`),

  startPhoneAuth: (phone: string, consentAccepted: boolean) =>
    apiFetch<{ authId: string; status: string }>('/api/auth/phone/start', {
      method: 'POST',
      body: JSON.stringify({ phone, consentAccepted }),
    }),

  verifyPhoneAuth: (authId: string, payload: { code?: string; password?: string }) =>
    apiFetch<{ status: string; authId: string }>('/api/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ authId, ...payload }),
    }),

  startScan: (year: number, timezone: string, authId: string) =>
    apiFetch<{ jobId: string; status: string }>('/api/scan/start', {
      method: 'POST',
      body: JSON.stringify({ year, timezone, authId }),
    }),

  resumeScan: (jobId: string, authId: string) =>
    apiFetch<{ jobId: string; status: string }>('/api/scan/resume', {
      method: 'POST',
      body: JSON.stringify({ jobId, authId }),
    }),

  getScanStatus: (jobId?: string) =>
    apiFetch<{ job: ScanProgressPayload | null }>(
      jobId ? `/api/scan/status?jobId=${encodeURIComponent(jobId)}` : '/api/scan/status'
    ),

  cancelScan: (jobId: string) =>
    apiFetch<{ cancelled: boolean }>('/api/scan/cancel', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),

  updateSettings: (timezone: string, hideChatNames: boolean) =>
    apiFetch<{ ok: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ timezone, hideChatNames }),
    }),

  deleteAllData: () => apiFetch<{ deleted: boolean }>('/api/data', { method: 'DELETE' }),
};
