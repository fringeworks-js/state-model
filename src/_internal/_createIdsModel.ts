import type { ReadonlyModel } from '../types';
import type { IdOf } from './_createIdOf';
import type { NotifierSubscribe } from './_createNotifier';
import _getListIndex from './_getListIndex';

const EMPTY_IDS: readonly string[] = Object.freeze([]);

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * 一覧の id の並びを読むモデルを作る（`ids()` の戻り値）
 *
 * - id が有効でない行と、重複した id の後の行は含めない
 * - 並びが同じなら、前に返した配列を返す
 *
 * @param getList 一覧の配列を読む関数（配列でなければ空の並びとして扱う）
 * @param idOf 行から id を取り出す関数
 * @param subscribe 一覧を持つものの購読（読む関数と listener を受け取る）
 * @param quiet id の無い行・重複した行を警告しない（派生モデルなど、上流ですでに警告しているもの）
 */
export default function _createIdsModel(
  getList: () => unknown,
  idOf: IdOf,
  subscribe: NotifierSubscribe,
  quiet = false,
): ReadonlyModel<readonly string[]> {
  // 並びが同じなら前に返した配列を返すため、最後に返した配列を覚えておく
  let lastIds = EMPTY_IDS;
  const get = () => {
    const list = getList();
    const ids = Array.isArray(list)
      ? _getListIndex(list, idOf, quiet).ids
      : EMPTY_IDS;
    if (!sameIds(ids, lastIds)) {
      lastIds = ids;
    }
    return lastIds;
  };
  return {
    get,
    subscribe: (listener) =>
      subscribe(get, listener as Parameters<NotifierSubscribe>[1]),
  };
}
