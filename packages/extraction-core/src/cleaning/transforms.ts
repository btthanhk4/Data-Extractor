import type { TransformOp } from '@swde/shared';
import { normalizeText } from '@swde/shared';

export function applyTransform(value: string, op: TransformOp): string {
  switch (op) {
    case 'uppercase':
      return value.toLocaleUpperCase();
    case 'lowercase':
      return value.toLocaleLowerCase();
    case 'titlecase':
      return value
        .toLocaleLowerCase()
        .replace(
          /(^|[\s\-/(])(\p{L})/gu,
          (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase(),
        );
    case 'collapseWhitespace':
      return normalizeText(value);
    case 'numbersOnly': {
      const match = value.match(/[-+]?\d[\d.,]*/);
      return match ? match[0] : '';
    }
    case 'stripCurrency':
      return value.replace(/[$€£¥₹₩₫₽₺₴₦฿₱₪]|\b(USD|EUR|GBP|VND|JPY|INR)\b/gi, '').trim();
    default:
      return value;
  }
}
