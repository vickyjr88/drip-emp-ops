import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Apple's home-screen icon. Full-bleed background rather than the rounded
 * square icon.svg uses elsewhere -- iOS applies its own corner mask, so a
 * pre-rounded image just gets double-rounded with visible artifacts at the
 * corners.
 *
 * The wordmark's actual typeface (Libre Caslon Text) is bundled as a file
 * rather than loaded from Google Fonts at request time: the container this
 * runs in has no serif font installed, so Satori (the renderer behind
 * ImageResponse) silently falls back to its built-in sans-serif with no
 * error -- the mismatch only shows up by looking at the rendered icon.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const fontData = await readFile(join(process.cwd(), 'app/assets/libre-caslon-text-bold.ttf'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#06166e',
          color: '#f4f5fc',
          fontSize: 92,
          fontFamily: 'Libre Caslon Text',
          letterSpacing: -3,
        }}
      >
        DE
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Libre Caslon Text', data: fontData, weight: 700, style: 'normal' }],
    },
  );
}
