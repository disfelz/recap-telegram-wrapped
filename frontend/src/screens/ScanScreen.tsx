import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Pause, Play,
  Radio, RotateCcw, ShieldCheck, X,
} from 'lucide-react';
import type { ScanProgressPayload } from '../../../shared/types';
import { CountUp } from '../components/CountUp';
import { haptic } from '../utils/telegram';

interface Props {
  progress: ScanProgressPayload;
  onPause: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onResume: () => void;
  onOpenResults: () => void;
}

export const ScanScreen: React.FC<Props> = ({
  progress, onPause, onCancel, onResume, onOpenResults,
}) => {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const flood = progress.status === 'paused_flood_wait';
  const paused = progress.status === 'paused';
  const done = progress.status === 'completed' || progress.status === 'partial';
  const failed = progress.status === 'failed';
  const cancelled = progress.status === 'cancelled';
  const active = !done && !failed && !cancelled && !paused;
  const fullScan = progress.stage === 'full_scan';
  const total = Math.max(0, progress.totalEligibleDialogs || 0);
  const finished = Math.max(0, Math.min(total, progress.processedDialogs || 0));
  // Only completed chats count towards percentage. Never invent progress
  // from an estimate of how many messages a chat might contain.
  const pct = total > 0 ? Math.min(100, Math.round(finished / total * 100)) : done ? 100 : 0;
  const nextChat = total > 0 ? Math.min(total, finished + 1) : 0;
  const circumference = 2 * Math.PI * 89;
  const lastHeartbeat = progress.updatedAt ? Date.parse(progress.updatedAt) : NaN;
  const lastSeenSeconds = Number.isFinite(lastHeartbeat)
    ? Math.max(0, Math.floor((now - lastHeartbeat) / 1000)) : null;
  const fresh = lastSeenSeconds !== null && lastSeenSeconds < 20;
  const deadline = progress.floodWaitUntil ? Date.parse(progress.floodWaitUntil) : NaN;
  const secondsLeft = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const waitTime = secondsLeft === null ? null
    : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const heading = done
    ? progress.status === 'partial' ? 'Частичная статистика готова' : 'Анализ завершён'
    : paused ? 'Анализ приостановлен'
    : cancelled ? 'Анализ отменён'
    : failed ? 'Не удалось завершить анализ'
    : flood ? 'Telegram временно ограничил запросы'
    : !fullScan ? 'Получаем список доступных чатов'
    : total > 0 ? `Проверяем чат ${nextChat} из ${total}` : 'Подготавливаем точный подсчёт';

  const description = done
    ? progress.status === 'partial'
      ? 'Не все чаты удалось обработать. Показаны только проверенные сообщения.'
      : 'Все доступные чаты обработаны. Твой RECAP готов.'
    : paused ? 'Прогресс сохранён. Для продолжения потребуется снова войти в Telegram.'
    : cancelled ? 'Проверка остановлена. Сохранённые контрольные точки позволят начать с места остановки.'
    : failed ? progress.errorMessage || 'Сервис анализа сообщил об ошибке.'
    : flood ? `Ожидаем разрешения Telegram${waitTime ? ' • ' + waitTime : ''}. Уже посчитанные сообщения сохранены.`
    : !fullScan ? 'Ищем доступные личные диалоги и группы для выбранного года.'
    : 'Считаем только твои исходящие сообщения. Каждый чат обрабатывается по очереди.';

  const withBusy = async (fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <main className="screen flagship-scan recap-scan-v2">
      <header className="recap-scan-header">
        <span className="flagship-eyebrow">RECAP / {progress.year}</span>
        <h1>Анализ активности</h1>
        <p>Твоя история собирается из реальных данных.</p>
      </header>

      <div className="recap-scan-badges">
        <span className="recap-scan-badge connected"><Radio size={15} strokeWidth={2.2}/> MTProto подключён</span>
        <span className="recap-scan-badge secondary">
          {done ? (progress.status === 'partial' ? 'Частичная статистика' : 'Готово')
            : paused ? 'На паузе'
            : flood ? 'Пауза Telegram'
            : 'Промежуточная статистика'}
        </span>
      </div>

      <section className="recap-scan-progress-card" aria-label="Ход анализа">
        <div className="recap-scan-radar">
          <motion.div className="recap-scan-orb"
            animate={reduce || !active ? {} : { opacity: [.12, .3, .12], scale: [.9, 1.07, .9] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}/>
          <svg viewBox="0 0 240 240" role="img" aria-label={`Проверено ${pct}% чатов`}>
            <defs>
              <linearGradient id="recap-scan-gradient-v2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#B7A5FF"/>
                <stop offset="60%" stopColor="#A996FF"/>
                <stop offset="100%" stopColor="#85B8FF"/>
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="104" fill="none" stroke="rgba(169,150,255,.12)" strokeWidth="1"/>
            <circle cx="120" cy="120" r="89" fill="none" stroke="rgba(169,150,255,.13)" strokeWidth="6"/>
            <motion.circle cx="120" cy="120" r="89" fill="none" stroke="url(#recap-scan-gradient-v2)"
              strokeWidth="6" strokeLinecap="round" transform="rotate(-90 120 120)"
              strokeDasharray={circumference}
              initial={false} animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
              transition={{ duration: reduce ? 0 : .75, ease: 'easeOut' }}/>
            <circle cx="120" cy="120" r="76" fill="none" stroke="rgba(169,150,255,.16)"
              strokeWidth="1" strokeDasharray="3 8"/>
            <circle cx="120" cy="120" r="53" fill="none" stroke="rgba(169,150,255,.22)" strokeWidth="1.2"/>
            {pct > 0 && pct < 100 &&
              <circle cx="120" cy="31" r="4" fill="#85B8FF"
                transform={`rotate(${pct * 3.6} 120 120)`}/>}
          </svg>
          <div className="recap-scan-radar-center">
            <strong className="recap-scan-percent tabular"><CountUp value={pct} durationMs={450}/><span>%</span></strong>
            <span className="recap-scan-year">{progress.year} ГОД</span>
          </div>
        </div>
        <p className="recap-scan-current">{heading}</p>
        <p className="recap-scan-description">{description}</p>
        {active && (
          <div className="recap-scan-live-status" role="status">
            <span className={`flagship-signal-dot ${fresh ? 'online' : 'offline'}`}/>
            {lastSeenSeconds === null
              ? 'Подключаемся к сканеру…'
              : fresh
                ? `Данные от сканера • ${lastSeenSeconds} с назад`
                : `Нет свежих данных ${lastSeenSeconds} с • проверяем соединение`}
          </div>
        )}
      </section>

      <div className="recap-scan-stages" aria-label="Этапы анализа">
        <div className={`recap-scan-stage ${fullScan || done ? 'finished' : 'current'}`}>
          <div className="recap-scan-stage-top"><span>ЭТАП 1</span>{(fullScan || done) && <CheckCircle2 size={20}/>}</div>
          <strong>Быстрый предварительный обзор</strong>
        </div>
        <div className={`recap-scan-stage ${fullScan ? 'current' : ''}`}>
          <div className="recap-scan-stage-top"><span>ЭТАП 2</span>{done && <CheckCircle2 size={20}/>}</div>
          <strong>Точный подсчёт исходящих</strong>
        </div>
      </div>

      <div className="recap-scan-stats">
        <div className="recap-scan-stat">
          <span>ОБРАБОТАНО ЧАТОВ</span>
          <strong className="tabular"><CountUp value={finished}/><small> / {total || '—'}</small></strong>
        </div>
        <div className="recap-scan-stat">
          <span>ТВОИХ СООБЩЕНИЙ</span>
          <strong className="tabular purple"><CountUp value={Math.max(0, progress.outgoingFound || 0)}/></strong>
        </div>
      </div>

      {flood && <div className="recap-scan-notice"><Clock3 size={18}/>
        <span>Telegram попросил сделать паузу{waitTime ? ` на ${waitTime}` : ''}. Продолжим автоматически.</span>
      </div>}
      {progress.status === 'partial' && <div className="recap-scan-notice warning">
        <AlertTriangle size={18}/><span>Итоги неполные: часть чатов недоступна или не проверена.</span>
      </div>}
      {active && <div className="recap-scan-background"><ShieldCheck size={16}/>
        <span>Анализ идёт на сервере. Mini App можно закрыть, прогресс сохранится.</span>
      </div>}

      <div className="recap-scan-controls">
        {done ? <>
          <button className="btn btn-primary" onClick={() => { haptic('success'); onOpenResults(); }}>
            <CheckCircle2 size={19}/> Смотреть RECAP {progress.year}<ArrowRight size={17}/>
          </button>
          {progress.status === 'partial' && <button className="btn btn-secondary"
            onClick={() => { haptic('medium'); onResume(); }}><RotateCcw size={17}/> Продолжить анализ</button>}
        </> : paused || cancelled || failed ? (
          <button className="btn btn-primary" onClick={() => { haptic('medium'); onResume(); }}>
            <Play size={17}/> Продолжить с места остановки
          </button>
        ) : (
          <div className="recap-scan-control-grid">
            <button className="btn btn-secondary" disabled={busy}
              onClick={() => { haptic('medium'); void withBusy(onPause); }}><Pause size={18}/> Пауза</button>
            <button className="btn btn-danger" disabled={busy}
              onClick={() => { haptic('medium'); void withBusy(onCancel); }}><X size={20}/> Отменить</button>
          </div>
        )}
      </div>
      <p className="recap-scan-privacy">Тексты сообщений и медиа не сохраняются. Сессия завершится после анализа или остановки.</p>
    </main>
  );
};
