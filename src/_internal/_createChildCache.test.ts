import _createChildCache from './_createChildCache';

const gc = (globalThis as { gc?: () => void }).gc;

describe('_createChildCache', () => {
  it('同じキーなら同じものを返す', () => {
    const cache = _createChildCache();
    const model = cache.get('a', () => ({}));
    expect(cache.get('a', () => ({}))).toBe(model);
    expect(cache.get('b', () => ({}))).not.toBe(model);
  });

  // vitest.config.ts の execArgv で --expose-gc を渡している
  it.skipIf(!gc)(
    '誰も持っていないものは回収され、キャッシュから消える',
    async () => {
      const cache = _createChildCache();
      (() => {
        for (let index = 0; index < 1000; index++) {
          cache.get(`x-${index}`, () => ({}));
        }
      })();
      expect(cache.size).toBe(1000);
      // 持っているものは、同じものが返る
      const held = cache.get('held', () => ({}));
      for (let round = 0; round < 5 && cache.size > 1; round++) {
        gc!();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(cache.size).toBeLessThanOrEqual(1);
      expect(cache.get('held', () => ({}))).toBe(held);
    },
  );
});
