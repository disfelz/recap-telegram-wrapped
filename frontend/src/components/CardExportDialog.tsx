import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Send, X } from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { recapApi } from '../api/client';
import { renderRecapCardPreview, type CardFormat } from '../utils/exportCard';
import { haptic } from '../utils/telegram';

interface Props {
  stats: RecapStats;
  format: CardFormat;
  onClose: () => void;
  requestedAction?: 'download' | 'share';
}

export const CardExportDialog: React.FC<Props> = ({ stats, format, onClose, requestedAction = 'download' }) => {
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError('');
    setNotice('');
    setSent(false);
    renderRecapCardPreview(stats, format, true).then(({ blob, dataUrl }) => {
      if (cancelled) return;
      if (blob.size > 5 * 1024 * 1024) throw new Error('Открытка превышает 5 МБ. Попробуй другой формат.');
      const resolution = format === 'story' ? '1080x1920' : '1080x1080';
      const file = new File([blob], `RECAP-${stats.year}-${resolution}.png`, { type: 'image/png' });
      setPreview({ url: dataUrl, file });
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось создать открытку.');
    });
    return () => { cancelled = true; };
  }, [stats, format]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  async function sendToBot() {
    if (!preview || sending || sent) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      await recapApi.sendExport(preview.file, format, stats.year);
      setSent(true);
      setNotice('Отправлено в чат с ботом ✓');
      haptic('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить открытку. Попробуй снова.');
    } finally {
      setSending(false);
    }
  }

  function download() {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview.url;
    link.download = preview.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice('Скачивание зависит от браузера. На телефоне надёжнее отправить открытку в чат с ботом.');
  }

  return createPortal(
    <div className="recap-export-overlay" role="presentation" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <section className="recap-export-dialog" role="dialog" aria-modal="true" aria-label="Экспорт открытки RECAP" onClick={(e) => e.stopPropagation()}>
        <header className="recap-export-head">
          <div><span className="ref-overline">RECAP / {stats.year}</span><h2>{requestedAction === 'share' ? 'Поделиться открыткой' : 'Сохранить открытку'}</h2></div>
          <button type="button" className="recap-export-close" aria-label="Закрыть просмотр" onClick={onClose}><X size={20} /></button>
        </header>
        {preview ? <img className="recap-export-preview" src={preview.url} alt={`Открытка RECAP ${stats.year} в формате PNG`} draggable={false} /> :
          <div className="recap-export-loading" role="status">{error || 'Создаём открытку…'}</div>}
        <p className="recap-export-hint">Отправим PNG в личный чат с ботом — оттуда его можно сохранить в галерею.</p>
        <div className="recap-export-actions">
          <button type="button" className="btn btn-primary" disabled={!preview || sending || sent} onClick={() => void sendToBot()}>
            <Send size={17}/> {sending ? 'Отправляем…' : sent ? 'Отправлено ✓' : 'Отправить в чат с ботом'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={!preview || sending} onClick={download}><Download size={17}/> Скачать PNG</button>
        </div>
        {(notice || error) && <p className="recap-export-notice" role="status">{error || notice}</p>}
      </section>
    </div>,
    document.body
  );
};
