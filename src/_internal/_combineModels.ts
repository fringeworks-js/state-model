import type { ReadonlyModel } from '../types';

/**
 * 2つのモデルを、値の組を読むモデルにまとめる（派生モデルの仕組みの上流に、2つのモデルを渡すため）
 *
 * - 値の組は、どちらかの値（参照）が変わったときだけ新しくなる
 * - 購読すると、両方のモデルを購読する
 */
export default function _combineModels<A, B>(
  a: ReadonlyModel<A>,
  b: ReadonlyModel<B>,
): ReadonlyModel<readonly [A, B]> {
  let last: readonly [A, B] | undefined;
  const get = (): readonly [A, B] => {
    const valueA = a.get();
    const valueB = b.get();
    if (
      last === undefined ||
      !Object.is(last[0], valueA) ||
      !Object.is(last[1], valueB)
    ) {
      last = [valueA, valueB];
    }
    return last;
  };
  return {
    get,
    subscribe: (listener) => {
      let previousValue = get();
      const notify = () => {
        const value = get();
        if (value !== previousValue) {
          const event = { value, previousValue };
          previousValue = value;
          listener(event);
        }
      };
      const unsubscribeA = a.subscribe(notify);
      const unsubscribeB = b.subscribe(notify);
      return () => {
        unsubscribeA();
        unsubscribeB();
      };
    },
  };
}
