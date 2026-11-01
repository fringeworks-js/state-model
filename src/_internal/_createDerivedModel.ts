import type { ReadonlyModel } from '../types';
import _createNotifier, { type NotifierSubscribe } from './_createNotifier';

/**
 * 上流の値と状態から結果を作る純粋な関数\
 * previous は前に返した結果（初めは undefined）。結果が前と同じなら previous を返すと、購読者を呼ばずに済む
 */
export type DerivedCompute<I, S, O> = (
  input: I,
  state: S,
  previous: O | undefined,
) => O;

/**
 * 派生モデルの仕組み: 上流の購読、状態の保持、作り直しの判断、通知
 *
 * - 結果は、上流の値（参照）か状態が変わったときだけ作り直す
 * - 上流は、自分に購読者がいる間だけ購読する（購読者がいなければ、上流から派生モデルへの参照が残らない）
 *
 * @param source 上流のモデル
 * @param initialState 初めの状態
 * @param compute 上流の値と状態から結果を作る純粋な関数
 */
export default function _createDerivedModel<I, S, O>(
  source: ReadonlyModel<I>,
  initialState: S,
  compute: DerivedCompute<I, S, O>,
) {
  const notifier = _createNotifier();
  let state = initialState;
  let version = 0;
  let cache:
    | { readonly input: I; readonly version: number; readonly output: O }
    | undefined;

  const get = (): O => {
    const input = source.get();
    if (
      cache === undefined ||
      !Object.is(cache.input, input) ||
      cache.version !== version
    ) {
      cache = { input, version, output: compute(input, state, cache?.output) };
    }
    return cache.output;
  };

  let subscriberCount = 0;
  let detach: (() => void) | undefined;
  const subscribe: NotifierSubscribe = (read, listener) => {
    if (subscriberCount === 0) {
      detach = source.subscribe(() => notifier.notify());
    }
    subscriberCount++;
    const unsubscribe = notifier.subscribe(read, listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      unsubscribe();
      subscriberCount--;
      if (subscriberCount === 0) {
        detach?.();
        detach = undefined;
      }
    };
  };

  const getState = () => state;
  const setState = (next: S) => {
    state = next;
    version++;
    notifier.notify();
  };

  return { get, subscribe, getState, setState };
}
