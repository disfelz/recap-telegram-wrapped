import React, { useEffect, useState } from 'react';

interface CountUpProps {
  value: number;
  durationMs?: number;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({ value, durationMs = 750, className }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || durationMs <= 0) {
      setDisplay(value);
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return <span className={`tabular ${className || ''}`}>{display.toLocaleString('ru-RU')}</span>;
};
