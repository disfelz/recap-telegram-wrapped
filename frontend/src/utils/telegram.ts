interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {user?: {id: number; first_name?: string}};
  ready(): void;
  expand(): void;
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
export function initTelegramMiniApp() {
  const app = getTelegramWebApp();
  if (!app) return;
  app.ready(); app.expand();
  app.setHeaderColor?.('#09090F'); app.setBackgroundColor?.('#09090F');
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
