import React, { useEffect, useState } from 'react';
import { QrCode, Smartphone, ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react';
import { recapApi } from '../api/client';
import { QrMatrix } from '../components/QrMatrix';
import { haptic } from '../utils/telegram';

interface ConnectScreenProps {
  demoMode: boolean;
  onAuthorized: (authId: string) => void;
  onBack: () => void;
}

export const ConnectScreen: React.FC<ConnectScreenProps> = ({
  demoMode,
  onAuthorized,
  onBack,
}) => {
  const [tab, setTab] = useState<'qr' | 'phone'>('qr');
  const [consent, setConsent] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [authId, setAuthId] = useState<string | null>(null);
  const [ttl, setTtl] = useState(30);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadQr = async () => {
    if (!consent) return;
    setError(null);
    if (demoMode) {
      setAuthId('demo-auth-id');
      setQrUrl(`tg://login?token=RECAP_DEMO_${Date.now()}`);
      setTtl(30);
      return;
    }
    try {
      setLoading(true);
      const res = await recapApi.startQrAuth(true);
      setAuthId(res.authId);
      setQrUrl(res.qrUrl);
      setTtl(30);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'qr' && consent && !authId) {
      loadQr();
    }
  }, [tab, consent]);

  useEffect(() => {
    if (tab !== 'qr' || !consent || !authId) return;
    const timer = setInterval(() => {
      setTtl((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [tab, consent, authId]);

  useEffect(() => {
    if (demoMode || tab !== 'qr' || !authId) return;
    const poller = setInterval(async () => {
      try {
        const res = await recapApi.getQrStatus(authId);
        if (res.status === 'authorized') {
          clearInterval(poller);
          haptic('success');
          onAuthorized(authId);
        } else if (res.status === 'needs_2fa') {
          setTab('phone');
          setPhoneStep('2fa');
        } else if (res.status === 'expired') {
          setTtl(0);
        }
      } catch {
        // ignore transient errors
      }
    }, 2200);
    return () => clearInterval(poller);
  }, [demoMode, tab, authId, onAuthorized]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return;
    setError(null);

    if (demoMode) {
      haptic('success');
      onAuthorized('demo-auth-phone');
      return;
    }

    try {
      setLoading(true);
      if (phoneStep === 'phone') {
        const res = await recapApi.startPhoneAuth(phone.trim(), true);
        setAuthId(res.authId);
        setPhoneStep('code');
      } else if (phoneStep === 'code' && authId) {
        const res = await recapApi.verifyPhoneAuth(authId, { code: code.trim() });
        if (res.status === 'authorized') {
          haptic('success');
          onAuthorized(authId);
        } else if (res.status === 'needs_2fa') {
          setPhoneStep('2fa');
        }
      } else if (phoneStep === '2fa' && authId) {
        const res = await recapApi.verifyPhoneAuth(authId, { password });
        if (res.status === 'authorized') {
          haptic('success');
          onAuthorized(authId);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="display-font" style={{ margin: 0, fontSize: 24 }}>
          Подключение аккаунта
        </h2>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Назад
        </button>
      </div>

      {/* Honest MTProto disclosure */}
      <div
        className="card"
        style={{
          borderColor: 'rgba(255, 209, 122, 0.34)',
          background: 'rgba(255, 209, 122, 0.06)',
          display: 'flex',
          gap: 12,
        }}
      >
        <ShieldAlert size={20} color="#FFD17A" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#E9E4FA' }}>
          <strong>Честно о доступе:</strong> Telegram MTProto не поддерживает режим «только чтение» —
          временная сессия технически имеет широкие права аккаунта. Мы шифруем её (AES-256-GCM),
          не читаем и не сохраняем тексты сообщений и <strong>завершаем сессию через LogOut</strong>{' '}
          сразу после анализа.
        </div>
      </div>

      {/* Consent checkbox */}
      <label
        className="card"
        style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            haptic('selection');
            setConsent(e.target.checked);
          }}
          style={{ marginTop: 3, width: 18, height: 18, accentColor: '#A996FF' }}
        />
        <span style={{ fontSize: 13, lineHeight: 1.45 }}>
          Я понимаю объём доступа временной MTProto-сессии и даю согласие на подсчёт статистики
          своих исходящих сообщений.
        </span>
      </label>

      {/* Auth Method Switch */}
      <div className="year-selector">
        <button
          className={`year-btn ${tab === 'qr' ? 'active' : ''}`}
          onClick={() => setTab('qr')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <QrCode size={15} /> QR-код
        </button>
        <button
          className={`year-btn ${tab === 'phone' ? 'active' : ''}`}
          onClick={() => setTab('phone')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Smartphone size={15} /> С одного устройства
        </button>
      </div>

      {tab === 'qr' ? (
        <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {consent ? (
            <>
              {qrUrl ? <QrMatrix value={qrUrl} size={184} /> : <p>Получаем QR-код…</p>}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Открой в Telegram на другом устройстве: <strong>Настройки → Устройства → Подключить устройство</strong>.
              </div>
              <div style={{ fontSize: 12, color: ttl > 0 ? 'var(--accent-blue)' : 'var(--warning)' }}>
                {ttl > 0 ? `Код обновится через ${ttl} сек.` : 'Срок действия QR истёк'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={loadQr} disabled={loading}>
                  <RefreshCw size={15} /> Обновить QR
                </button>
                {demoMode && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      haptic('success');
                      onAuthorized('demo-qr-authorized');
                    }}
                  >
                    <CheckCircle2 size={16} /> Симулировать вход
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '24px 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Подтверди согласие выше, чтобы сгенерировать QR-код подключения.
            </div>
          )}
        </div>
      ) : (
        <form className="card" onSubmit={handlePhoneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Альтернативный вход через RECAP (это не системное окно Telegram). Коды и пароль 2FA не
            сохраняются и не попадают в логи.
          </div>

          {phoneStep === 'phone' && (
            <input
              className="input-field"
              type="tel"
              placeholder="+7 999 000 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!consent}
              required={!demoMode}
            />
          )}
          {phoneStep === 'code' && (
            <input
              className="input-field"
              type="text"
              inputMode="numeric"
              placeholder="Код подтверждения из Telegram"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          )}
          {phoneStep === '2fa' && (
            <input
              className="input-field"
              type="password"
              placeholder="Облачный пароль 2FA"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}

          <button className="btn btn-primary" type="submit" disabled={!consent || loading}>
            {demoMode
              ? 'Запустить демо-сканирование'
              : phoneStep === 'phone'
              ? 'Отправить код'
              : phoneStep === 'code'
              ? 'Подтвердить код'
              : 'Подтвердить 2FA'}
          </button>
        </form>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'rgba(255,107,138,0.4)', color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
};
