interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

export function getTelegramWebApp(): TelegramWebApp | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return tg?.WebApp ?? null;
}

export function initTelegramMiniApp(): void {
  const wa = getTelegramWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  wa.setHeaderColor?.('#09090F');
  wa.setBackgroundColor?.('#09090F');
}

export function haptic(type: 'light' | 'medium' | 'selection' | 'success' = 'light'): void {
  const hf = getTelegramWebApp()?.HapticFeedback;
  if (!hf) return;
  if (type === 'selection') hf.selectionChanged();
  else if (type === 'success') hf.notificationOccurred('success');
  else hf.impactOccurred(type);
}
