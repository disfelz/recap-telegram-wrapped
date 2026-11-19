import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ShieldCheck, ArrowRight, Play } from 'lucide-react';
import { haptic } from '../utils/telegram';

interface WelcomeScreenProps {
  selectedYear: number;
  availableYears: number[];
  onSelectYear: (year: number) => void;
  onStartConnect: () => void;
  hasSavedRecap: boolean;
  onOpenSavedRecap: () => void;
  onOpenDemoStories: () => void;
  demoEnabled: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  selectedYear,
  availableYears,
  onSelectYear,
  onStartConnect,
  hasSavedRecap,
  onOpenSavedRecap,
  onOpenDemoStories,
  demoEnabled,
}) => {
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="pill">
          <Sparkles size={13} /> RECAP
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Telegram Wrapped</span>
      </div>

      {/* Animated Orbital Emblem */}
      <div style={{ display: 'grid', placeItems: 'center', padding: '18px 0 8px' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          style={{
            width: 152,
            height: 152,
            borderRadius: '50%',
            border: '1px solid rgba(169, 150, 255, 0.3)',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#A996FF',
              boxShadow: '0 0 18px #A996FF',
            }}
          />
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 30% 30%, rgba(169,150,255,0.42), rgba(133,184,255,0.14) 60%, rgba(21,19,34,0.9))',
              border: '1px solid rgba(133, 184, 255, 0.4)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span className="display-font" style={{ fontSize: 24, fontWeight: 700 }}>
              {selectedYear}
            </span>
          </div>
        </motion.div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 className="display-font" style={{ margin: '0 0 10px', fontSize: 34, lineHeight: 1.06 }}>
          Твой год.
          <br />
          Твои сообщения.
          <br />
          <span style={{ color: 'var(--accent-purple)' }}>Твоя история.</span>
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
          Честная статистика только твоих отправленных сообщений в Telegram — без подписок на
          каналы и платных разблокировок.
        </p>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Выбери год для анализа
        </div>
        <div className="year-selector">
          {availableYears.map((y) => (
            <button
              key={y}
              className={`year-btn ${y === selectedYear ? 'active' : ''}`}
              onClick={() => {
                haptic('selection');
                onSelectYear(y);
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hasSavedRecap && (
          <button
            className="btn btn-primary"
            onClick={() => {
              haptic('success');
              onOpenSavedRecap();
            }}
          >
            Смотреть RECAP {selectedYear} <ArrowRight size={17} />
          </button>
        )}
        <button
          className={hasSavedRecap ? 'btn btn-secondary' : 'btn btn-primary'}
          onClick={() => {
            haptic('medium');
            onStartConnect();
          }}
        >
          {hasSavedRecap ? 'Начать новый анализ' : 'Узнать свой год'} <ArrowRight size={17} />
        </button>

        {demoEnabled && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              haptic('light');
              onOpenDemoStories();
            }}
          >
            <Play size={15} /> Открыть демо-историю ({selectedYear})
          </button>
        )}
      </div>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <ShieldCheck size={20} color="#85B8FF" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Тексты переписок не сохраняются, медиа не скачиваются, а временная сессия MTProto
          завершается сразу после подсчёта.
        </div>
      </div>
    </div>
  );
};
