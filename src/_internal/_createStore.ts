import type { ReadonlyModel } from '../types';
import _createNotifier from './_createNotifier';

/**
 * 値を1つ持ち、変わったら知らせる小さなモデル（子機能が、データとは別に持つ値の置き場所）
 */
export default function _createStore<T>(initial: T) {
  const notifier = _createNotifier();
  let value = initial;
  const get = () => value;
  const model: ReadonlyModel<T> = {
    get,
    subscribe: (listener) =>
      notifier.subscribe(
        get,
        listener as Parameters<typeof notifier.subscribe>[1],
      ),
  };
  const set = (next: T) => {
    if (!Object.is(next, value)) {
      value = next;
      notifier.notify();
    }
  };
  return { model, set };
}
