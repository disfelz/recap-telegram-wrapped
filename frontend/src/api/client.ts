import type { RecapMe, RecapStats, ScanProgressPayload } from '../../../shared/types';
import { getTelegramWebApp } from '../utils/telegram';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new Error('Не настроен адрес RECAP API. Открой демо или настрой Cloudflare Worker.');
  const initData = getTelegramWebApp()?.initData || '';
  const response = await fetch(API_BASE.replace(/\/$/, '') + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData, ...init.headers },
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as {error?: string;detail?: string};
    throw new Error(error.error || error.detail || 'Ошибка API (' + response.status + ')');
  }
  return response.json() as Promise<T>;
}
const post = <T,>(path: string, data: object) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) });

export const recapApi = {
  getMe: () => apiFetch<RecapMe>('/api/me'),
  getSavedRecaps: () => apiFetch<{results: RecapStats[]}>('/api/recap'),
  getChatNames: (year: number) => apiFetch<{names: Record<string,string>}>('/api/chats/names?year='+year),
  pickupPhoneContact: () => apiFetch<{phone: string|null}>('/api/auth/contact/pickup'),
  startQrAuth: (consentAccepted: boolean) =>
    post<{authId: string;qrUrl: string;expiresAt: string}>('/api/auth/qr/start', {consentAccepted}),
  getQrStatus: (authId: string) =>
    apiFetch<{status: string}>('/api/auth/qr/status?authId=' + encodeURIComponent(authId)),
  startPhoneAuth: (phone: string, consentAccepted: boolean) =>
    post<{authId: string;status: string}>('/api/auth/phone/start', {phone,consentAccepted}),
  verifyPhoneAuth: (authId: string, input: {code?: string; password?: string}) =>
    post<{authId: string;status: string}>('/api/auth/phone/verify', {authId,...input}),
  startScan: (year: number, timezone: string, authId = '') =>
    post<{jobId: string;status: string}>('/api/scan/start', {year, timezone, authId}),
  resumeScan: (jobId: string, authId = '') =>
    post<{jobId: string;status: string}>('/api/scan/resume', {jobId,authId}),
  getScanStatus: (jobId?: string) =>
    apiFetch<{job: ScanProgressPayload|null}>('/api/scan/status' + (jobId ? '?jobId='+encodeURIComponent(jobId) : '')),
  cancelScan: (jobId: string) => post<{cancelled: boolean}>('/api/scan/cancel',{jobId}),
  pauseScan: (jobId: string) => post<{paused: boolean}>('/api/scan/pause',{jobId}),
  unpauseScan: (jobId: string) => post<{resumed: boolean}>('/api/scan/unpause',{jobId}),
  updateSettings: (timezone: string, hideChatNames: boolean) =>
    apiFetch<{ok: boolean}>('/api/settings', {method:'PUT',body:JSON.stringify({timezone,hideChatNames})}),
  deleteAllData: () => apiFetch<{deleted: boolean}>('/api/data',{method:'DELETE'}),
};
