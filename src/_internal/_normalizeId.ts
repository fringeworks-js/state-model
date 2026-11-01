/**
 * id を文字列に揃える\
 * 有効なのは文字列と有限の数値だけで、それ以外は undefined
 */
export default function _normalizeId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
