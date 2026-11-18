import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  Share2,
  Eye,
  EyeOff,
  Mic,
  Video,
  Image as ImageIcon,
  Flame,
  Sparkles,
} from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { CountUp } from '../components/CountUp';
import { downloadOrShareCard } from '../utils/exportCard';
import { haptic } from '../utils/telegram';

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface StoriesScreenProps {
  stats: RecapStats;
  hideChatNames: boolean;
  onToggleHideNames: () => void;
  onClose: () => void;
}

const TOTAL_SLIDES = 12;

export const StoriesScreen: React.FC<StoriesScreenProps> = ({
  stats,
  hideChatNames,
  onToggleHideNames,
  onClose,
}) => {
  const [slide, setSlide] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const next = () => {
    haptic('light');
    setSlide((s) => (s < TOTAL_SLIDES - 1 ? s + 1 : s));
  };
  const prev = () => {
    haptic('light');
    setSlide((s) => (s > 0 ? s - 1 : s));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (slide === 11) {
      const t = setTimeout(() => {
        setRevealed(true);
        haptic('success');
      }, 280);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
    }
  }, [slide]);

  const peakMonthIdx = stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const peakWeekdayIdx = stats.byWeekday.indexOf(Math.max(...stats.byWeekday));
  const peakHourIdx = stats.byHour.indexOf(Math.max(...stats.byHour));
  const maxMonthVal = Math.max(...stats.byMonth, 1);
  const maxWeekdayVal = Math.max(...stats.byWeekday, 1);

  const voiceMinutes =
    stats.voiceTotalDurationSec !== null ? Math.round(stats.voiceTotalDurationSec / 60) : null;

  const handleExport = async (fmt: 'story' | 'square') => {
    try {
      setExporting(true);
      haptic('medium');
      await downloadOrShareCard(stats, fmt, hideChatNames);
    } finally {
      setExporting(false);
    }
  };

  const renderSlide = () => {
    switch (slide) {
      case 0:
        return (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <span className="pill" style={{ marginBottom: 18 }}>
              <Sparkles size={13} /> RECAP {stats.year}
            </span>
            <h1 className="display-font" style={{ fontSize: 64, margin: '8px 0', lineHeight: 0.95 }}>
              {stats.year}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.55 }}>
              Твой год в Telegram — только реальные исходящие сообщения и чистый ритм общения.
            </p>
            {stats.completionStatus === 'partial' && (
              <div style={{ marginTop: 16, color: 'var(--warning)', fontSize: 13 }}>
                Частичная статистика (не все чаты были доступны)
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              02 · МАСШТАБ ГОДА
            </div>
            <div className="display-font" style={{ fontSize: 60, fontWeight: 700, margin: '14px 0 8px' }}>
              <CountUp value={stats.totalMessages} />
            </div>
            <p style={{ fontSize: 17, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
              сообщений ты отправил за {stats.year} год.
            </p>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>АКТИВНЫХ ДНЕЙ</div>
                <div className="display-font tabular" style={{ fontSize: 28, fontWeight: 700 }}>
                  {stats.activeDays}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>В СРЕДНЕМ В ДЕНЬ</div>
                <div className="display-font tabular" style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-purple)' }}>
                  {Math.round(stats.totalMessages / Math.max(stats.activeDays, 1))}
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 700 }}>
              03 · САМЫЙ АКТИВНЫЙ МЕСЯЦ
            </div>
            <h2 className="display-font" style={{ fontSize: 44, margin: '10px 0 4px' }}>
              {MONTHS_FULL[peakMonthIdx]}
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 26px', fontSize: 15 }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {stats.byMonth[peakMonthIdx].toLocaleString('ru-RU')}
              </strong>{' '}
              отправленных сообщений за месяц.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 5, alignItems: 'end', height: 164 }}>
              {stats.byMonth.map((v, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(8, (v / maxMonthVal) * 130)}px` }}
                    transition={{ duration: 0.55, delay: i * 0.03 }}
                    style={{
                      width: '100%',
                      borderRadius: 6,
                      background: i === peakMonthIdx
                        ? 'linear-gradient(180deg, #A996FF, #85B8FF)'
                        : 'rgba(247,245,255,0.16)',
                    }}
                  />
                  <span style={{ fontSize: 9, color: i === peakMonthIdx ? '#F7F5FF' : 'var(--text-secondary)' }}>
                    {MONTHS_SHORT[i][0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              04 · РИТМ НЕДЕЛИ
            </div>
            <h2 className="display-font" style={{ fontSize: 40, margin: '10px 0 6px' }}>
              {WEEKDAYS_FULL[peakWeekdayIdx]}
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 22px', fontSize: 15 }}>
              В этот день ты пишешь чаще всего — {stats.byWeekday[peakWeekdayIdx].toLocaleString('ru-RU')} сообщений.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.byWeekday.map((v, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 56px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: i === peakWeekdayIdx ? '#F7F5FF' : 'var(--text-secondary)' }}>
                    {WEEKDAYS[i]}
                  </span>
                  <div style={{ height: 10, borderRadius: 99, background: 'rgba(247,245,255,0.08)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(v / maxWeekdayVal) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.04 }}
                      style={{
                        height: '100%',
                        borderRadius: 99,
                        background: i === peakWeekdayIdx ? '#A996FF' : 'rgba(133,184,255,0.45)',
                      }}
                    />
                  </div>
                  <span className="tabular" style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {v.toLocaleString('ru-RU')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 700 }}>
              05 · ЛЮБИМОЕ ВРЕМЯ ОБЩЕНИЯ
            </div>
            <div
              className="display-font tabular"
              style={{
                fontSize: 66,
                fontWeight: 700,
                margin: '18px 0 8px',
                background: 'linear-gradient(135deg, #A996FF, #85B8FF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {String(peakHourIdx).padStart(2, '0')}:00
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 0 20px' }}>
              Пиковый час по часовому поясу {stats.timezone}: {stats.byHour[peakHourIdx].toLocaleString('ru-RU')} сообщений.
            </p>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-around', fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Ночь (00–05)</div>
                <strong className="tabular">{stats.byHour.slice(0, 6).reduce((a, b) => a + b, 0).toLocaleString('ru-RU')}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>День (12–17)</div>
                <strong className="tabular">{stats.byHour.slice(12, 18).reduce((a, b) => a + b, 0).toLocaleString('ru-RU')}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Вечер (18–23)</div>
                <strong className="tabular">{stats.byHour.slice(18, 24).reduce((a, b) => a + b, 0).toLocaleString('ru-RU')}</strong>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              06 · ГОЛОСОВЫЕ СООБЩЕНИЯ
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 8px' }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, background: 'rgba(169,150,255,0.16)', display: 'grid', placeItems: 'center' }}>
                <Mic size={26} color="#A996FF" />
              </div>
              <div className="display-font" style={{ fontSize: 52, fontWeight: 700 }}>
                <CountUp value={stats.voiceCount} />
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 0 22px' }}>
              {voiceMinutes !== null
                ? `Общая длительность по метаданным — около ${voiceMinutes.toLocaleString('ru-RU')} минут.`
                : 'Длительность голосовых не возвращена в метаданных Telegram.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 56 }}>
              {Array.from({ length: 28 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: `${18 + ((idx * 17) % 38)}px`,
                    borderRadius: 99,
                    background: idx % 3 === 0 ? '#A996FF' : 'rgba(133,184,255,0.4)',
                  }}
                />
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 700 }}>
              07 · ВИДЕОСООБЩЕНИЯ (КРУЖКИ)
            </div>
            <div
              style={{
                width: 170,
                height: 170,
                borderRadius: '50%',
                margin: '22px auto',
                border: '3px solid #85B8FF',
                background: 'radial-gradient(circle, rgba(133,184,255,0.22), rgba(21,19,34,0.9))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Video size={26} color="#85B8FF" />
              <div className="display-font" style={{ fontSize: 44, fontWeight: 700 }}>
                <CountUp value={stats.videoNoteCount} />
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
              кружков записано и отправлено за {stats.year} год.
            </p>
          </div>
        );

      case 7:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              08 · ВИЗУАЛЬНЫЙ ЯЗЫК
            </div>
            <h2 className="display-font" style={{ fontSize: 34, margin: '10px 0 18px' }}>
              Фото, видео и реакции
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card">
                <ImageIcon size={18} color="#A996FF" />
                <div className="display-font" style={{ fontSize: 32, fontWeight: 700, marginTop: 10 }}>
                  <CountUp value={stats.photoCount} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>фотографий</div>
              </div>
              <div className="card">
                <Video size={18} color="#85B8FF" />
                <div className="display-font" style={{ fontSize: 32, fontWeight: 700, marginTop: 10 }}>
                  <CountUp value={stats.videoCount} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>видеофайлов</div>
              </div>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>СТИКЕРЫ И GIF</div>
              <div className="display-font" style={{ fontSize: 38, fontWeight: 700, color: 'var(--accent-purple)' }}>
                <CountUp value={stats.stickerAndGifCount} />
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 700 }}>
                09 · ГЛАВНЫЕ ПЕРЕПИСКИ
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHideNames();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(247,245,255,0.08)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                  padding: '5px 10px',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {hideChatNames ? <Eye size={13} /> : <EyeOff size={13} />}
                {hideChatNames ? 'Показать имена' : 'Скрыть имена'}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '8px 0 14px' }}>
              Рейтинг строго по твоим отправленным сообщениям.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.topPrivateChats.slice(0, 4).map((c, idx) => (
                <div key={c.chatHash} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
                  <div>
                    <span style={{ color: 'var(--accent-purple)', fontWeight: 700, marginRight: 10 }}>
                      0{idx + 1}
                    </span>
                    <strong>{hideChatNames ? `Личный чат #${idx + 1}` : c.displayLabel}</strong>
                  </div>
                  <span className="tabular" style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>
                    {c.sentMessages.toLocaleString('ru-RU')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 9:
        return (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 700 }}>
              10 · САМАЯ ДЛИННАЯ СЕРИЯ
            </div>
            <div style={{ margin: '18px auto 8px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Flame size={42} color="#A996FF" />
              <span className="display-font" style={{ fontSize: 64, fontWeight: 700 }}>
                <CountUp value={stats.longestStreakDays} />
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>дней подряд на связи</div>
            {stats.longestStreakRange && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginTop: 10 }}>
                {stats.longestStreakRange.start} — {stats.longestStreakRange.end}
              </p>
            )}
          </div>
        );

      case 10:
        return (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 700 }}>
              11 · ХАРАКТЕР ОБЩЕНИЯ
            </div>
            <h2 className="display-font" style={{ fontSize: 38, margin: '12px 0 10px', lineHeight: 1.06 }}>
              {stats.persona.title}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.55 }}>
              {stats.persona.subtitle}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '18px 0' }}>
              {stats.persona.traits.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
            <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Определено прозрачными правилами по часам, доле аудио, медиа и групповых чатов — без
              чтения и ИИ-анализа текстов переписок.
            </div>
          </div>
        );

      case 11:
      default:
        return (
          <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.92, rotateX: 12 }}
              animate={{ opacity: revealed ? 1 : 0.4, scale: revealed ? 1 : 0.96, rotateX: 0 }}
              transition={{ duration: 0.55 }}
              className="card"
              style={{
                background:
                  'linear-gradient(155deg, rgba(169,150,255,0.22), rgba(21,19,34,0.96) 45%, rgba(133,184,255,0.18))',
                borderColor: 'rgba(169,150,255,0.45)',
                padding: 22,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--accent-purple)', fontWeight: 700 }}>
                <span>RECAP · {stats.year}</span>
                <span>{stats.completionStatus === 'partial' ? 'ЧАСТИЧНАЯ' : 'VERIFIED'}</span>
              </div>
              <div className="display-font tabular" style={{ fontSize: 44, fontWeight: 700, margin: '10px 0 2px' }}>
                {stats.totalMessages.toLocaleString('ru-RU')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                отправленных сообщений · {stats.persona.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>Пик: <strong>{MONTHS_FULL[peakMonthIdx]}</strong></div>
                <div>Серия: <strong>{stats.longestStreakDays} дн.</strong></div>
                <div>Голосовые: <strong>{stats.voiceCount}</strong></div>
                <div>Кружки: <strong>{stats.videoNoteCount}</strong></div>
              </div>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                className="btn btn-primary"
                disabled={exporting}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport('story');
                }}
              >
                <Share2 size={15} /> 1080×1920
              </button>
              <button
                className="btn btn-secondary"
                disabled={exporting}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport('square');
                }}
              >
                <Download size={15} /> 1080×1080
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>
              По умолчанию имена собеседников и личные ID скрыты на экспортируемой карточке.
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className="story-fullscreen"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (delta < -40) next();
        else if (delta > 40) prev();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX - rect.left < rect.width * 0.34) prev();
        else next();
      }}
    >
      <div className="story-bars" style={{ gridTemplateColumns: `repeat(${TOTAL_SLIDES}, 1fr)` }}>
        {Array.from({ length: TOTAL_SLIDES }).map((_, idx) => (
          <div key={idx} className="story-bar-track">
            <div
              className="story-bar-fill"
              style={{ width: idx <= slide ? '100%' : '0%', transition: 'width 0.25s ease' }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {slide + 1} / {TOTAL_SLIDES}
        </span>
        <button
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 99,
            border: '1px solid var(--border)',
            background: 'rgba(247,245,255,0.06)',
            color: 'var(--text-primary)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderSlide()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
