import type { ReadonlyModel } from '../types';
import _createNotifier, { type NotifierSubscribe } from './_createNotifier';

/**
 * 前に結果を作ったときの、上流の値・状態・結果
 */
export type DerivedPrevious<I, S, O> = {
  readonly input: I;
  readonly state: S;
  readonly output: O;
};

/**
 * 上流の値と状態から結果を作る純粋な関数
 *
 * previous は前に結果を作ったときの値（初めは undefined）。
 * 結果が前と同じなら previous.output を返すと、購読者を呼ばずに済む。
 * 状態は差し替えるたびに新しいオブジェクトになるので、previous.state と比べれば、状態を差し替えた後の作り直しかが分かる
 */
export type DerivedCompute<I, S, O> = (
  input: I,
  state: S,
  previous: DerivedPrevious<I, S, O> | undefined,
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
  let cache: DerivedPrevious<I, S, O> | undefined;

  const get = (): O => {
    const input = source.get();
    if (
      cache === undefined ||
      !Object.is(cache.input, input) ||
      cache.state !== state
    ) {
      cache = { input, state, output: compute(input, state, cache) };
    }
    return cache.output;
  };

  let subscriberCount = 0;
  let detach: (() => void) | undefined;
  const subscribe: NotifierSubscribe = (read, listener) => {
    if (subscriberCount === 0) {
      // 上流が変わったら、自分の購読者に読み直させる。結果が前と同じなら、notifier が listener を呼ばない
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
  /**
   * 状態を差し替える。同じ値でも差し替えとして扱うので、状態はオブジェクトにして毎回作り直す
   */
  const setState = (next: S) => {
    state = next;
    notifier.notify();
  };

  return { get, subscribe, getState, setState };
}
