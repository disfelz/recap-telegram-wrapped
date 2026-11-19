/** Telegram requestContact may omit the international plus sign. */
export function normalizePhoneNumber(input: string): string {
  const compact = input.replace(/[\s()-]/g, '');
  return /^\d/.test(compact) ? `+${compact}` : compact;
}
