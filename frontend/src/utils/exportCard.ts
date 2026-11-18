import type { RecapStats } from '../../../shared/types';

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export type CardFormat = 'story' | 'square';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderRecapCardPng(
  stats: RecapStats,
  format: CardFormat,
  hideChatNames = true
): Promise<Blob> {
  const width = 1080;
  const height = format === 'story' ? 1920 : 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#09090F';
  ctx.fillRect(0, 0, width, height);

  // Ambient gradients
  const g1 = ctx.createRadialGradient(220, 260, 40, 220, 260, 560);
  g1.addColorStop(0, 'rgba(169, 150, 255, 0.34)');
  g1.addColorStop(1, 'rgba(9, 9, 15, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);

  const g2 = ctx.createRadialGradient(width - 180, height - 260, 40, width - 180, height - 260, 540);
  g2.addColorStop(0, 'rgba(133, 184, 255, 0.28)');
  g2.addColorStop(1, 'rgba(9, 9, 15, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, width, height);

  const pad = 76;

  // Header
  ctx.fillStyle = '#A996FF';
  ctx.font = '700 32px "Space Grotesk", sans-serif';
  ctx.fillText(`RECAP · TELEGRAM ${stats.year}`, pad, format === 'story' ? 140 : 108);

  if (stats.completionStatus === 'partial') {
    ctx.fillStyle = '#FFD17A';
    ctx.font = '600 24px "Manrope", sans-serif';
    ctx.fillText('ЧАСТИЧНАЯ СТАТИСТИКА', pad, format === 'story' ? 182 : 146);
  }

  // Hero Total Messages
  const heroY = format === 'story' ? 370 : 255;
  ctx.fillStyle = '#F7F5FF';
  ctx.font = '700 132px "Space Grotesk", sans-serif';
  ctx.fillText(stats.totalMessages.toLocaleString('ru-RU'), pad, heroY);

  ctx.fillStyle = '#9693AB';
  ctx.font = '500 34px "Manrope", sans-serif';
  ctx.fillText('отправленных сообщений за год', pad, heroY + 54);

  // Key metrics grid
  const peakMonthIdx = stats.byMonth.indexOf(Math.max(...stats.byMonth));
  const peakHourIdx = stats.byHour.indexOf(Math.max(...stats.byHour));
  const metrics = [
    { label: 'АКТИВНЫХ ДНЕЙ', value: `${stats.activeDays}` },
    { label: 'ЛУЧШАЯ СЕРИЯ', value: `${stats.longestStreakDays} дн.` },
    { label: 'ПИКОВЫЙ МЕСЯЦ', value: MONTHS_RU[peakMonthIdx] || '—' },
    { label: 'ЛЮБИМЫЙ ЧАС', value: `${String(peakHourIdx).padStart(2, '0')}:00` },
  ];

  const gridTop = format === 'story' ? 540 : 370;
  const cardW = (width - pad * 2 - 28) / 2;
  const cardH = format === 'story' ? 176 : 138;

  metrics.forEach((m, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = pad + col * (cardW + 28);
    const y = gridTop + row * (cardH + 24);

    roundRect(ctx, x, y, cardW, cardH, 28);
    ctx.fillStyle = 'rgba(21, 19, 34, 0.84)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(169, 150, 255, 0.24)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#9693AB';
    ctx.font = '600 22px "Manrope", sans-serif';
    ctx.fillText(m.label, x + 32, y + 52);

    ctx.fillStyle = '#F7F5FF';
    ctx.font = '700 48px "Space Grotesk", sans-serif';
    ctx.fillText(m.value, x + 32, y + (format === 'story' ? 124 : 108));
  });

  // Persona Card
  const personaTop = gridTop + cardH * 2 + 64;
  const personaH = format === 'story' ? 270 : 185;
  roundRect(ctx, pad, personaTop, width - pad * 2, personaH, 32);
  const pg = ctx.createLinearGradient(pad, personaTop, width - pad, personaTop + personaH);
  pg.addColorStop(0, 'rgba(169, 150, 255, 0.22)');
  pg.addColorStop(1, 'rgba(133, 184, 255, 0.16)');
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(169, 150, 255, 0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#85B8FF';
  ctx.font = '700 22px "Manrope", sans-serif';
  ctx.fillText('ХАРАКТЕР ОБЩЕНИЯ', pad + 36, personaTop + 56);

  ctx.fillStyle = '#F7F5FF';
  ctx.font = '700 50px "Space Grotesk", sans-serif';
  ctx.fillText(stats.persona.title, pad + 36, personaTop + 124);

  ctx.fillStyle = '#D7D3EC';
  ctx.font = '500 26px "Manrope", sans-serif';
  ctx.fillText(stats.persona.subtitle.slice(0, 56), pad + 36, personaTop + 170);

  // Story-only extra media & privacy-safe summary
  if (format === 'story') {
    const mediaTop = personaTop + personaH + 44;
    roundRect(ctx, pad, mediaTop, width - pad * 2, 260, 32);
    ctx.fillStyle = 'rgba(21, 19, 34, 0.84)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(169, 150, 255, 0.22)';
    ctx.stroke();

    ctx.fillStyle = '#9693AB';
    ctx.font = '700 22px "Manrope", sans-serif';
    ctx.fillText('МЕДИА И ФОРМАТЫ', pad + 36, mediaTop + 54);

    const mediaItems = [
      `Голосовые: ${stats.voiceCount.toLocaleString('ru-RU')}`,
      `Кружки: ${stats.videoNoteCount.toLocaleString('ru-RU')}`,
      `Фото: ${stats.photoCount.toLocaleString('ru-RU')}`,
      `Стикеры и GIF: ${stats.stickerAndGifCount.toLocaleString('ru-RU')}`,
    ];
    ctx.fillStyle = '#F7F5FF';
    ctx.font = '600 32px "Manrope", sans-serif';
    mediaItems.forEach((line, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      ctx.fillText(line, pad + 36 + col * 430, mediaTop + 125 + row * 68);
    });

    const topPeer = stats.topPrivateChats[0];
    if (topPeer) {
      ctx.fillStyle = '#9693AB';
      ctx.font = '500 24px "Manrope", sans-serif';
      const label = hideChatNames ? 'Личный чат #1 (имя скрыто)' : topPeer.displayLabel;
      ctx.fillText(
        `Главный диалог: ${label} · ${topPeer.sentMessages.toLocaleString('ru-RU')} сообщ.`,
        pad,
        mediaTop + 320
      );
    }
  }

  // Footer
  ctx.fillStyle = '#9693AB';
  ctx.font = '500 24px "Manrope", sans-serif';
  ctx.fillText('Твой год. Твои сообщения. Твоя история.', pad, height - 64);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось сформировать PNG'));
    }, 'image/png');
  });
}

export async function downloadOrShareCard(
  stats: RecapStats,
  format: CardFormat,
  hideChatNames: boolean
): Promise<void> {
  const blob = await renderRecapCardPng(stats, format, hideChatNames);
  const fileName = `RECAP-${stats.year}-${format === 'story' ? '1080x1920' : '1080x1080'}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `Мой RECAP ${stats.year}`,
        text: `${stats.totalMessages.toLocaleString('ru-RU')} отправленных сообщений в Telegram за ${stats.year} год.`,
        files: [file],
      });
      return;
    } catch {
      // Пользователь отменил share sheet — переходим к скачиванию
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
