import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrMatrixProps {
  value: string;
  size?: number;
}

export const QrMatrix: React.FC<QrMatrixProps> = ({ value, size = 188 }) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: { dark: '#09090F', light: '#F7F5FF' },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      style={{
        width: size + 24,
        height: size + 24,
        padding: 12,
        borderRadius: 20,
        background: '#F7F5FF',
        display: 'grid',
        placeItems: 'center',
        margin: '0 auto',
        boxShadow: '0 14px 40px rgba(169, 150, 255, 0.22)',
      }}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
};
