import React, { useState } from 'react';
import { Trash2, Shield, Globe, Database } from 'lucide-react';
import { haptic } from '../utils/telegram';

const TIMEZONES = [
  'Europe/Moscow',
  'Europe/Kaliningrad',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Asia/Vladivostok',
  'UTC',
];

interface SettingsScreenProps {
  timezone: string;
  hideChatNames: boolean;
  demoMode: boolean;
  demoAllowed: boolean;
  onChangeTimezone: (tz: string) => void;
  onToggleHideNames: () => void;
  onToggleDemoMode: () => void;
  onDeleteAll: () => Promise<void>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  timezone,
  hideChatNames,
  demoMode,
  demoAllowed,
  onChangeTimezone,
  onToggleHideNames,
  onToggleDemoMode,
  onDeleteAll,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteAll();
      haptic('success');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 className="display-font" style={{ margin: 0, fontSize: 24 }}>
        Настройки и приватность
      </h2>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <Globe size={16} color="#85B8FF" /> Часовой пояс расчёта года
        </div>
        <select
          className="input-field"
          value={timezone}
          onChange={(e) => onChangeTimezone(e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz} style={{ background: '#151322', color: '#F7F5FF' }}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Скрывать имена на карточке</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            При экспорте PNG собеседники и личные ID маскируются.
          </div>
        </div>
        <input
          type="checkbox"
          checked={hideChatNames}
          onChange={onToggleHideNames}
          style={{ width: 20, height: 20, accentColor: '#A996FF' }}
        />
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
            <Database size={15} color="#A996FF" /> Режим демонстрационных данных
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {demoMode
              ? 'Включён изолированный Demo-режим (без обращения к MTProto).'
              : 'Демонстрация отключена. Live API работает только после отдельной авторизации.'}
          </div>
        </div>
        <input
          type="checkbox"
          checked={demoMode}
          disabled={!demoAllowed}
          onChange={onToggleDemoMode}
          style={{ width: 20, height: 20, accentColor: '#A996FF' }}
        />
      </div>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Shield size={18} color="#85B8FF" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          RECAP хранит только обезличенные счётчики активности в Cloudflare D1. Тексты сообщений и
          медиафайлы не сохраняются, а временная MTProto-сессия завершается сразу после сканирования.
        </div>
      </div>

      {!confirmDelete ? (
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} /> Удалить все сохранённые данные
        </button>
      ) : (
        <div className="card" style={{ borderColor: 'rgba(255,107,138,0.45)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
            Удалить всю сохранённую статистику RECAP, настройки и отозвать активные сессии?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Удаляем...' : 'Удалить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
