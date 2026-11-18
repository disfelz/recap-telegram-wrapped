import React from 'react';
import { motion } from 'motion/react';
import { Activity, Clock, PauseCircle, PlayCircle, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ScanProgressPayload } from '../../../shared/types';

interface ScanScreenProps {
  progress: ScanProgressPayload;
  onCancel: () => void;
  onResume: () => void;
  onOpenResults: () => void;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({
  progress,
  onCancel,
  onResume,
  onOpenResults,
}) => {
  const pct =
    progress.totalEligibleDialogs > 0
      ? Math.min(100, Math.round((progress.processedDialogs / progress.totalEligibleDialogs) * 100))
      : 0;

  const isFlood = progress.status === 'paused_flood_wait';
  const isDone = progress.status === 'completed' || progress.status === 'partial';
  const isCancelled = progress.status === 'cancelled';

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="pill">
          <Activity size={13} />
          {progress.stage === 'quick_preview' ? 'Стадия 1 · Обзор диалогов' : 'Стадия 2 · Точный подсчёт'}
        </span>
        <span className="tabular" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {progress.year}
        </span>
      </div>

      {/* Animated scanner ring */}
      <div className="card" style={{ textAlign: 'center', padding: '28px 18px' }}>
        <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto 18px' }}>
          <svg width="132" height="132" viewBox="0 0 132 132">
            <circle cx="66" cy="66" r="56" stroke="rgba(247,245,255,0.1)" strokeWidth="8" fill="none" />
            <motion.circle
              cx="66"
              cy="66"
              r="56"
              stroke="url(#scanGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={352}
              animate={{ strokeDashoffset: 352 - (352 * pct) / 100 }}
              transition={{ duration: 0.45 }}
              transform="rotate(-90 66 66)"
            />
            <defs>
              <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#A996FF" />
                <stop offset="100%" stopColor="#85B8FF" />
              </linearGradient>
            </defs>
          </svg>
          <div
            className="display-font tabular"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {progress.totalEligibleDialogs > 0 ? `${pct}%` : '—'}
          </div>
        </div>

        <h2 className="display-font" style={{ margin: '0 0 6px', fontSize: 22 }}>
          {progress.status === 'completed'
            ? 'Анализ завершён'
            : progress.status === 'partial'
            ? 'Частичная статистика'
            : isFlood
            ? 'Пауза Telegram (FloodWait)'
            : isCancelled
            ? 'Сканирование остановлено'
            : 'Считаем твои сообщения'}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {isFlood
            ? 'Telegram временно ограничил частоту запросов. Прогресс сохранён, анализ продолжится автоматически.'
            : progress.status === 'partial'
            ? 'Часть диалогов оказалась недоступна или скан был прерван — показаны только подтверждённые цифры.'
            : 'Считаются строго твои исходящие сообщения без загрузки медиафайлов.'}
        </p>
      </div>

      {/* Real-time counters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>ОБРАБОТАНО ЧАТОВ</div>
          <div className="display-font tabular" style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            {progress.processedDialogs}
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {' '}
              / {progress.totalEligibleDialogs || '—'}
            </span>
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>ТВОИХ СООБЩЕНИЙ</div>
          <div
            className="display-font tabular"
            style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: 'var(--accent-purple)' }}
          >
            {progress.outgoingFound.toLocaleString('ru-RU')}
          </div>
        </div>
      </div>

      {isFlood && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderColor: 'rgba(255,209,122,0.4)',
            color: 'var(--warning)',
            fontSize: 13,
          }}
        >
          <Clock size={18} /> Соблюдаем паузу Telegram — прогресс не потерян.
        </div>
      )}

      {progress.status === 'partial' && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderColor: 'rgba(255,209,122,0.4)',
            color: 'var(--warning)',
            fontSize: 13,
          }}
        >
          <AlertTriangle size={18} /> Статус: Частичная статистика (не все чаты завершены).
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isDone ? (
          <>
            <button className="btn btn-primary" onClick={onOpenResults}>
              <CheckCircle2 size={17} /> Смотреть RECAP {progress.year}
            </button>
            {progress.status === 'partial' && (
              <button className="btn btn-secondary" onClick={onResume}>
                <PlayCircle size={17} /> Досканировать после авторизации
              </button>
            )}
          </>
        ) : isCancelled ? (
          <button className="btn btn-primary" onClick={onResume}>
            <PlayCircle size={17} /> Продолжить с места остановки
          </button>
        ) : (
          <button className="btn btn-danger" onClick={onCancel}>
            {isFlood ? <PauseCircle size={17} /> : <XCircle size={17} />} Отменить и завершить сессию
          </button>
        )}
      </div>
    </div>
  );
};
