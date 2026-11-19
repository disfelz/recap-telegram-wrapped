import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share2, X } from 'lucide-react';
import type { RecapStats } from '../../../shared/types';
import { renderRecapCardPng, type CardFormat } from '../utils/exportCard';
import { haptic } from '../utils/telegram';

interface Props {
  stats: RecapStats;
  format: CardFormat;
  onClose: () => void;
  requestedAction?: 'download' | 'share';
}

/**
 * Telegram's in-app WebView may ignore `<a download>` for blob: URLs.
 * Keep the generated image visible so long-press → Save is always an option.
 * Native file sharing is invoked synchronously inside the button gesture.
 */
export const CardExportDialog: React.FC<Props> = ({ stats, format, onClose, requestedAction = 'download' }) => {
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setPreview(null);
    setError('');
    setNotice('');
    renderRecapCardPng(stats, format, true).then((blob) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      const resolution = format === 'story' ? '1080x1920' : '1080x1080';
      const file = new File([blob], `RECAP-${stats.year}-${resolution}.png`, { type: 'image/png' });
      setPreview({ url, file });
    }).catch(() => {
      if (!cancelled) setError('Не удалось создать картинку. Закрой окно и попробуй снова.');
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [stats, format]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const canShare = Boolean(preview && typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [preview.file] }));

  async function share() {
    if (!preview) return;
    if (!canShare) {
      setNotice('На этом устройстве передача файла недоступна. Нажми «Скачать PNG» или удерживай изображение, чтобы сохранить.');
      return;
    }
    try {
      // No async work before navigator.share — requires a fresh user gesture.
      await navigator.share({ files: [preview.file], title: `Мой RECAP ${stats.year}` });
      haptic('success');
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') {
        setNotice('Telegram не открыл меню отправки. Попробуй скачать PNG или удерживай изображение.');
      }
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
    setNotice('Если Telegram не сохранил файл, удерживай изображение и выбери «Сохранить изображение».');
  }

  return createPortal(
    <div className="recap-export-overlay" role="presentation" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <section className="recap-export-dialog" role="dialog" aria-modal="true" aria-label="Сохранение открытки RECAP" onClick={(e) => e.stopPropagation()}>
        <header className="recap-export-head">
          <div><span className="ref-overline">RECAP / {stats.year}</span><h2>{requestedAction === 'share' ? 'Поделиться открыткой' : 'Сохранить открытку'}</h2></div>
          <button type="button" className="recap-export-close" aria-label="Закрыть просмотр" onClick={onClose}><X size={20} /></button>
        </header>
        {preview ? <img className="recap-export-preview" src={preview.url} alt={`Открытка RECAP ${stats.year} в формате PNG`} draggable={false} /> :
          <div className="recap-export-loading" role="status">{error || 'Создаём открытку…'}</div>}
        <p className="recap-export-hint">На Android можно удерживать картинку и выбрать «Сохранить изображение».</p>
        <div className="recap-export-actions">
          <button type="button" className="btn btn-primary" disabled={!preview} onClick={() => void share()}><Share2 size={17}/> Сохранить / отправить</button>
          <button type="button" className="btn btn-secondary" disabled={!preview} onClick={download}><Download size={17}/> Скачать PNG</button>
        </div>
        {(notice || error) && <p className="recap-export-notice" role="status">{notice || error}</p>}
      </section>
    </div>,
    document.body
  );
};
