import _normalizeId from './_normalizeId';

describe('_normalizeId', () => {
  it('文字列と有限の数値だけが有効で、数値は文字列に揃える', () => {
    expect(_normalizeId('a')).toBe('a');
    expect(_normalizeId('')).toBe('');
    expect(_normalizeId(3)).toBe('3');
    expect(_normalizeId(NaN)).toBeUndefined();
    expect(_normalizeId(Infinity)).toBeUndefined();
    expect(_normalizeId(undefined)).toBeUndefined();
    expect(_normalizeId(null)).toBeUndefined();
    expect(_normalizeId({})).toBeUndefined();
    expect(_normalizeId(true)).toBeUndefined();
  });
});
