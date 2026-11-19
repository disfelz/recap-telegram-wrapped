type SafeArea = { top: number; bottom: number; left?: number; right?: number };
type SafeAreaEvent = 'safeAreaChanged' | 'contentSafeAreaChanged' | 'fullscreenChanged';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {user?: {id: number; first_name?: string}};
  ready(): void;
  expand(): void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  lockOrientation?: () => void;
  isFullscreen?: boolean;
  safeAreaInset?: SafeArea;
  contentSafeAreaInset?: SafeArea;
  onEvent?: (name: SafeAreaEvent, listener: () => void) => void;
  offEvent?: (name: SafeAreaEvent, listener: () => void) => void;
  requestContact?: (callback?: (sent: boolean) => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred(style:'light'|'medium'|'heavy'|'rigid'|'soft'): void;
    notificationOccurred(type:'success'|'error'|'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: {
    show():void; hide():void; onClick(cb:()=>void):void; offClick(cb:()=>void):void;
  };
}

export function getTelegramWebApp(): TelegramWebApp|null {
  return (window as Window & {Telegram?:{WebApp?:TelegramWebApp}}).Telegram?.WebApp || null;
}

function applySafeArea(app: TelegramWebApp): void {
  const root = document.documentElement;
  const safe = app.safeAreaInset;
  const content = app.contentSafeAreaInset;
  // Until Telegram supplies its values, keep the CSS fallback (Telegram CSS vars / OS env).
  if (!safe && !content) {
    root.style.removeProperty('--app-safe-top');
    root.style.removeProperty('--app-safe-bottom');
    return;
  }
  const nonnegative = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  const top = nonnegative(safe?.top) + nonnegative(content?.top);
  const bottom = nonnegative(safe?.bottom) + nonnegative(content?.bottom);
  root.style.setProperty('--app-safe-top',
    `max(${top}px, calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)), env(safe-area-inset-top, 0px))`);
  root.style.setProperty('--app-safe-bottom',
    `max(${bottom}px, calc(var(--tg-safe-area-inset-bottom, 0px) + var(--tg-content-safe-area-inset-bottom, 0px)), env(safe-area-inset-bottom, 0px))`);
}

/** Returns event unsubscription for React's effect cleanup / StrictMode. */
export function initTelegramMiniApp(): () => void {
  const app = getTelegramWebApp();
  if (!app) return () => undefined;

  app.ready();
  app.expand();
  app.setHeaderColor?.('#09090F');
  app.setBackgroundColor?.('#09090F');

  const syncSafeArea = () => applySafeArea(app);
  const events: SafeAreaEvent[] = ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged'];
  syncSafeArea();
  for (const event of events) {
    try { app.onEvent?.(event, syncSafeArea); }
    catch { /* Older Telegram clients don't expose all viewport events. */ }
  }
  try { app.disableVerticalSwipes?.(); }
  catch { /* Native gesture handling is optional. */ }
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      window.matchMedia('(orientation: portrait)').matches) {
    try { app.lockOrientation?.(); }
    catch { /* Desktop and older versions keep normal rotation. */ }
  }
  try {
    if (typeof app.requestFullscreen === 'function') app.requestFullscreen();
  } catch {
    try { app.expand(); } catch { /* Client may not allow expanding. */ }
  }
  syncSafeArea();

  return () => {
    for (const event of events) {
      try { app.offEvent?.(event, syncSafeArea); }
      catch { /* Clients without unsubscribe support are harmless. */ }
    }
  };
}

export function haptic(type:'light'|'medium'|'heavy'|'selection'|'success'='light') {
  const api=getTelegramWebApp()?.HapticFeedback;
  if (!api) return;
  try {
    if (type==='selection') api.selectionChanged();
    else if(type==='success') api.notificationOccurred('success');
    else api.impactOccurred(type);
  } catch { /* Unsupported Telegram client: haptics are optional. */ }
}

export async function requestOwnContact():Promise<boolean> {
  const api=getTelegramWebApp();
  if(!api?.requestContact) return false;
  return new Promise<boolean>(resolve => {
    try { api.requestContact?.(sent => resolve(sent)); }
    catch { resolve(false); }
  });
}
