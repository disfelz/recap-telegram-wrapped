export interface TelegramInitUser {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
}

const MAX_AUTH_AGE_SECONDS = 86400;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256(keyData: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string
): Promise<TelegramInitUser | null> {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const providedHash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  if (!providedHash || !authDateRaw) return null;
  // Reject ambiguous or duplicate signed fields; do not accept stale/future login claims.
  for (const field of ['hash', 'auth_date', 'user']) {
    if (params.getAll(field).length !== 1) return null;
  }

  const authDate = Number(authDateRaw);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > nowSec + 60 || nowSec - authDate > MAX_AUTH_AGE_SECONDS) {
    return null;
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(
    new TextEncoder().encode('WebAppData'),
    botToken
  );
  const expectedHash = toHex(await hmacSha256(secretKey, dataCheckString));

  if (!timingSafeEqual(expectedHash, providedHash.toLowerCase())) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    const user = JSON.parse(userJson) as TelegramInitUser;
    if (!Number.isSafeInteger(user.id) || user.id <= 0) return null;
    return user;
  } catch {
    return null;
  }
}
