import { toString } from 'qrcode';

export async function qrSvg(text: string): Promise<string> {
  return toString(text, {
    type: 'svg',
    margin: 1,
    width: 192,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
