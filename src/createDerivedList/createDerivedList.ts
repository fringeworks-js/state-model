import _createDerivedModel from '../_internal/_createDerivedModel';
import _createIdsModel from '../_internal/_createIdsModel';
import { _getListIdOf, _setListIdOf } from '../_internal/_listIdOf';
import type { RecordId } from '../types';
import type { DerivedList, DerivedListOptions, ListSource } from './types';

const EMPTY: readonly never[] = Object.freeze([]);

function sameItems<E>(a: readonly E[], b: readonly E[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * 上流の行を、条件で絞り込み・並べ替える\
 * 条件が無ければ上流の値をそのまま返す。条件があり、結果の行と順番が前と同じなら、前の配列を返す
 */
function arrange<E>(
  rows: readonly E[] | undefined,
  { filter, sort }: DerivedListOptions<E>,
  previous: readonly E[] | undefined,
): readonly E[] {
  const base = rows ?? EMPTY;
  // 条件が無ければ、上流の値をそのまま返す（前の結果より優先する）
  if (!filter && !sort) {
    return base;
  }
  let result: readonly E[] = filter
    ? base.filter((record) => filter(record))
    : base;
  if (sort) {
    result = (result === base ? base.slice() : (result as E[])).sort(sort);
  }
  if (previous !== undefined && sameItems(previous, result)) {
    return previous;
  }
  return result;
}

/**
 * 一覧を絞り込み・並べ替えた結果を持つ、標準の派生モデルを作る
 *
 * - 上流の行は書き換えず、結果の行は上流と同じ参照のまま返す
 * - 上流が変わると結果を作り直す。条件は `setFilter`・`setSort` で差し替えられる
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ
 *
 * @param source 上流のモデル（`ListModel` か、別の `DerivedList`）
 * @param options 絞り込み・並べ替えの条件
 * @returns 派生モデル
 */
export default function createDerivedList<
  E,
  S extends ListSource<E> = ListSource<E>,
>(
  source: S & ListSource<E>,
  options: DerivedListOptions<E> = {},
): DerivedList<E, S> {
  const core = _createDerivedModel<
    readonly E[] | undefined,
    DerivedListOptions<E>,
    readonly E[]
  >(source, { filter: options.filter, sort: options.sort }, arrange);
  const idOf = _getListIdOf(source);
  const idsModel = _createIdsModel(core.get, idOf, core.subscribe, true);

  const derived: DerivedList<E, S> = {
    source,
    get: core.get,
    subscribe: (listener) =>
      core.subscribe(
        core.get,
        listener as Parameters<typeof core.subscribe>[1],
      ),
    ids: () => idsModel,
    record: (id: RecordId) => source.record(id),
    remove: (ids: readonly RecordId[]) => source.remove(ids),
    setFilter: (filter) => core.setState({ ...core.getState(), filter }),
    setSort: (sort) => core.setState({ ...core.getState(), sort }),
  };
  _setListIdOf(derived, idOf);
  return derived;
}
