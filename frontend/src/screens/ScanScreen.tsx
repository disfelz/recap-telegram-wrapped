import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Pause, Play, Radio, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { ScanProgressPayload } from '../../../shared/types';
import { haptic } from '../utils/telegram';

interface Props {
  progress: ScanProgressPayload;
  onPause: () => void | Promise<void>;
  onUnpause: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onResume: () => void;
  onOpenResults: () => void;
}

export const ScanScreen: React.FC<Props> = ({ progress, onPause, onUnpause, onCancel, onResume, onOpenResults }) => {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const isFlood = progress.status === 'paused_flood_wait';
  const isPaused = progress.status === 'paused_user';
  const isDone = progress.status === 'completed' || progress.status === 'partial';
  const isCancelled = progress.status === 'cancelled';
  const isFailed = progress.status === 'failed';
  const active = !isDone && !isCancelled && !isFailed;
  const total = Math.max(0, progress.totalEligibleDialogs);
  const processed = Math.min(total || Number.MAX_SAFE_INTEGER, Math.max(0, progress.processedDialogs));
  const pct = total > 0 ? Math.min(100, Math.round(processed / total * 100)) : isDone ? 100 : 0;
  const circumference = 2 * Math.PI * 79;
  const deadline = progress.floodWaitUntil ? Date.parse(progress.floodWaitUntil) : NaN;
  const remaining = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const updatedAt = progress.updatedAt ? Date.parse(progress.updatedAt) : NaN;
  const connectionFresh = !Number.isFinite(updatedAt) || now - updatedAt < 30000;
  const stageTwo = progress.stage === 'full_scan';
  const stageOneComplete = stageTwo || isDone;
  const countdown = remaining === null ? null :
    String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const detail = isPaused ? 'Сканирование поставлено на паузу. Прогресс сохранён — можно продолжить с этого места.' :
    isFlood ? 'Telegram временно ограничил запросы. Подсчёт продолжится автоматически' + (countdown ? ' через ' + countdown : '') + '.' :
    progress.status === 'completed' ? 'Готово! Все доступные диалоги обработаны.' :
    progress.status === 'partial' ? 'Анализ завершён не полностью. Покажем только проверенную статистику.' :
    isCancelled ? 'Сканирование отменено. Уже собранный прогресс можно использовать при новом входе.' :
    isFailed ? (progress.errorMessage || 'Во время анализа возникла ошибка. Можно продолжить с сохранённого места.') :
    progress.status === 'queued' || progress.status === 'auth_pending' ? 'Подключаем Telegram и подготавливаем диалоги…' :
    !stageTwo ? 'Быстрый обзор диалогов. Подготавливаем точный подсчёт.' :
    'Считаем твои исходящие сообщения. Данные обновляются по мере обработки чатов.';

  const runAction = async (action: () => void | Promise<void>) => {
    if (pending) return;
    haptic('medium');
    setPending(true);
    try { await action(); } finally { setPending(false); }
  };

  return <main className="screen flagship-scan">
    <header className="flagship-scan-heading">
      <span className="flagship-eyebrow">RECAP / {progress.year}</span>
      <h1>Анализ активности</h1>
      <p>Твоя история собирается из реальных данных Telegram.</p>
    </header>

    <div className="recap-scan-badges" role="status" aria-live="polite">
      <span className={'recap-scan-badge recap-scan-badge-connection' + (!connectionFresh || !active ? ' muted' : '')}>
        <Radio size={15}/>{isPaused ? 'Подключение на паузе' : active && connectionFresh ? 'MTProto подключён' : active ? 'Проверяем подключение' : 'Сессия завершена'}
      </span>
      <span className="recap-scan-badge recap-scan-badge-soft">
        {isDone ? progress.status === 'partial' ? 'Частичная статистика' : 'Готово' :
          isPaused ? 'Пауза' : isFlood ? 'Пауза Telegram' : 'Предварительные данные'}
      </span>
    </div>

    <section className="recap-scan-progress-card" aria-label="Прогресс анализа">
      <div className="flagship-scan-radar">
        <motion.div className="flagship-scan-pulse"
          animate={reduceMotion || isPaused || isDone ? {} : { scale: [.96, 1.06, .96], opacity: [.13, .30, .13] }}
          transition={{ repeat: Infinity, duration: 3.8, ease: 'easeInOut' }}/>
        <svg viewBox="0 0 200 200" role="img" aria-label={'Завершено ' + pct + ' процентов'} className="flagship-scan-ring">
          <defs>
            <linearGradient id="recap-scan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A996FF"/><stop offset="100%" stopColor="#85B8FF"/>
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="89" fill="none" stroke="rgba(169,150,255,.13)" strokeWidth="1"/>
          <circle cx="100" cy="100" r="79" fill="none" stroke="rgba(169,150,255,.12)" strokeWidth="6"/>
          <motion.circle cx="100" cy="100" r="79" fill="none" stroke="url(#recap-scan-gradient)" strokeWidth="6"
            strokeLinecap="round" transform="rotate(-90 100 100)" strokeDasharray={circumference}
            initial={false} animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
            transition={{ duration: reduceMotion ? 0 : .7, ease: 'easeOut' }}/>
          <circle cx="100" cy="100" r="64" fill="none" stroke="rgba(169,150,255,.13)" strokeWidth="1" strokeDasharray="2 7"/>
          <circle cx="100" cy="100" r="44" fill="none" stroke="rgba(169,150,255,.16)" strokeWidth="1"/>
        </svg>
        <div className="flagship-scan-radar-value">
          <strong className="tabular">{pct}%</strong>
          <span>{progress.year} ГОД</span>
        </div>
      </div>
      <p className="recap-scan-progress-caption" role="status">{detail}</p>
    </section>

    <div className="recap-scan-stages" aria-label="Этапы анализа">
      <div className={'recap-scan-stage ' + (stageOneComplete ? 'completed' : 'current')}>
        <div className="recap-scan-stage-top"><span>ЭТАП 1</span>{stageOneComplete && <CheckCircle2 size={19}/>}</div>
        <strong>Быстрый предварительный обзор</strong>
      </div>
      <div className={'recap-scan-stage ' + (stageTwo ? 'current' : 'upcoming')}>
        <div className="recap-scan-stage-top"><span>ЭТАП 2</span>{isDone && <CheckCircle2 size={19}/>}</div>
        <strong>Точный подсчёт исходящих</strong>
      </div>
    </div>

    <div className="flagship-scan-metrics">
      <div><span>ОБРАБОТАНО ЧАТОВ</span>
        <strong className="tabular">{progress.processedDialogs.toLocaleString('ru-RU')}<small> / {total || '—'}</small></strong>
      </div>
      <div><span>ТВОИХ СООБЩЕНИЙ</span>
        <strong className="tabular">{progress.outgoingFound.toLocaleString('ru-RU')}</strong>
      </div>
    </div>

    {isFlood && <div className="flagship-flood-card">
      <div className="flagship-flood-title"><Clock3 size={18}/><strong>Telegram ограничил частоту запросов</strong></div>
      <p>{countdown ? 'Автоматическое возобновление через ' + countdown + '.' : 'Ожидаем снятия ограничения.'} Прогресс сохранён.</p>
    </div>}
    {progress.status === 'partial' && <div className="flagship-partial-note"><AlertTriangle size={18}/>
      <span>Результат неполный. Недоступные диалоги не учитываются.</span></div>}
    <div className="flagship-scan-actions">
      {isDone ? <div className="recap-scan-action-primary">
        <button className="btn btn-primary" onClick={() => { haptic('success'); onOpenResults(); }}>
          <CheckCircle2 size={17}/> Смотреть RECAP {progress.year}<ArrowRight size={16}/>
        </button>
        {progress.status === 'partial' && <button className="btn btn-secondary" onClick={() => { haptic('medium'); onResume(); }}>
          <RotateCcw size={17}/> Продолжить подсчёт
        </button>}
      </div> : isCancelled || isFailed ?
        <button className="btn btn-primary" onClick={() => { haptic('medium'); onResume(); }}>
          <RotateCcw size={17}/> Продолжить с сохранённого места
        </button> :
        <div className="recap-scan-action-row">
          <button className="btn recap-scan-pause-btn" disabled={pending}
            onClick={() => { void runAction(isPaused ? onUnpause : onPause); }}>
            {isPaused ? <Play size={19}/> : <Pause size={19}/>}
            {pending ? 'Подождите…' : isPaused ? 'Продолжить' : 'Пауза'}
          </button>
          <button className="btn recap-scan-cancel-btn" disabled={pending}
            onClick={() => { void runAction(onCancel); }}><X size={20}/> Отменить</button>
        </div>}
      <p className="flagship-scan-privacy"><ShieldCheck size={14}/>
        Тексты сообщений не сохраняются. Медиафайлы не скачиваются.</p>
    </div>
  </main>;
};
