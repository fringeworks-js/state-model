import type { ModelChangeEvent } from '../types';

type Subscription = {
  readonly read: () => unknown;
  readonly listener: (event: ModelChangeEvent<unknown>) => void;
  /** その listener に前回渡した値（最初は購読した時点の値） */
  last: unknown;
  active: boolean;
};

/**
 * 購読の通知
 *
 * - ルートのモデルのデータが変わったら、購読ごとに read し直し、Object.is で違えば呼ぶ。
 *   データは変わった所だけ作り直すので、参照を比べるだけで、変わったモデルの購読だけを選べる
 * - 値は呼ぶ時点で read する。通知の途中に起きた変更は、今の回を終えてから次の回で知らせる
 */
export default function _createNotifier() {
  const subscriptions = new Set<Subscription>();
  let notifying = false;
  let again = false;

  function subscribe(
    read: () => unknown,
    listener: (event: ModelChangeEvent<unknown>) => void,
  ): () => void {
    const subscription: Subscription = {
      read,
      listener,
      last: read(),
      active: true,
    };
    subscriptions.add(subscription);
    return () => {
      subscription.active = false;
      subscriptions.delete(subscription);
    };
  }

  function notify(): void {
    if (notifying) {
      again = true;
      return;
    }
    notifying = true;
    try {
      do {
        again = false;
        // 回の途中で増えた購読は、次の回から対象にする
        for (const subscription of [...subscriptions]) {
          if (!subscription.active) {
            continue;
          }
          const value = subscription.read();
          if (Object.is(value, subscription.last)) {
            continue;
          }
          const previousValue = subscription.last;
          subscription.last = value;
          subscription.listener({ value, previousValue });
        }
      } while (again);
    } finally {
      notifying = false;
    }
  }

  return { subscribe, notify };
}

/**
 * 通知の購読（読む関数と listener を受け取り、解除する関数を返す）
 */
export type NotifierSubscribe = ReturnType<typeof _createNotifier>['subscribe'];
