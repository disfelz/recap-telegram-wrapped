import React from 'react';
import { Play, TrendingUp, TrendingDown } from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { haptic } from '../utils/telegram';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

interface AnalyticsScreenProps {
  stats: RecapStats;
  prevYearStats?: RecapStats;
  availableYears: number[];
  selectedYear: number;
  hideChatNames: boolean;
  onSelectYear: (year: number) => void;
  onOpenStories: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  stats,
  prevYearStats,
  availableYears,
  selectedYear,
  hideChatNames,
  onSelectYear,
  onOpenStories,
}) => {
  const maxMonth = Math.max(...stats.byMonth, 1);
  const maxHour = Math.max(...stats.byHour, 1);
  const yoyDiff =
    prevYearStats && prevYearStats.totalMessages > 0
      ? Math.round(((stats.totalMessages - prevYearStats.totalMessages) / prevYearStats.totalMessages) * 100)
      : null;

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="display-font" style={{ margin: 0, fontSize: 24 }}>
          Аналитика
        </h2>
        <button
          onClick={() => {
            haptic('light');
            onOpenStories();
          }}
          className="pill"
          style={{ cursor: 'pointer' }}
        >
          <Play size={12} /> Stories
        </button>
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

      {/* Summary & YoY comparison */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ВСЕГО ОТПРАВЛЕНО</span>
          {yoyDiff !== null && (
            <span
              className="tabular"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 700,
                color: yoyDiff >= 0 ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {yoyDiff >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {yoyDiff >= 0 ? `+${yoyDiff}%` : `${yoyDiff}%`} к {selectedYear - 1}
            </span>
          )}
        </div>
        <div className="display-font tabular" style={{ fontSize: 40, fontWeight: 700, marginTop: 4 }}>
          {stats.totalMessages.toLocaleString('ru-RU')}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
          Активных дней: {stats.activeDays} · Серия: {stats.longestStreakDays} дн. ·{' '}
          {stats.completionStatus === 'completed' ? 'Полный расчёт' : 'Частичная статистика'}
        </div>
      </div>

      {/* Monthly bars */}
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          ПО МЕСЯЦАМ
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 5, alignItems: 'end', height: 118 }}>
          {stats.byMonth.map((v, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(6, (v / maxMonth) * 90)}px`,
                  borderRadius: 5,
                  background: 'linear-gradient(180deg, #A996FF, rgba(133,184,255,0.45))',
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{MONTHS[i][0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 24-hour activity */}
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          АКТИВНОСТЬ ПО ЧАСАМ ({stats.timezone})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, alignItems: 'end', height: 76 }}>
          {stats.byHour.map((v, h) => (
            <div
              key={h}
              title={`${h}:00 — ${v}`}
              style={{
                height: `${Math.max(6, (v / maxHour) * 70)}px`,
                borderRadius: 3,
                background: h >= 22 || h <= 3 ? '#A996FF' : 'rgba(133,184,255,0.55)',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Top private & group chats */}
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          ТОП ЛИЧНЫХ ЧАТОВ (ТОЛЬКО ИСХОДЯЩИЕ)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.topPrivateChats.slice(0, 5).map((c, idx) => (
            <div key={c.chatHash} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{hideChatNames ? `Личный чат #${idx + 1}` : c.displayLabel}</span>
              <strong className="tabular" style={{ color: 'var(--accent-purple)' }}>
                {c.sentMessages.toLocaleString('ru-RU')}
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          ТОП ГРУППОВЫХ ЧАТОВ
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.topGroupChats.slice(0, 5).map((c, idx) => (
            <div key={c.chatHash} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{hideChatNames ? `Группа #${idx + 1}` : c.displayLabel}</span>
              <strong className="tabular" style={{ color: 'var(--accent-blue)' }}>
                {c.sentMessages.toLocaleString('ru-RU')}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
