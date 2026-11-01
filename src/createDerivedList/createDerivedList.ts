import _arrangeItems from '../_internal/_arrangeItems';
import _createDerivedModel, {
  type DerivedPrevious,
} from '../_internal/_createDerivedModel';
import type { IdOf } from '../_internal/_createIdOf';
import _createIdsModel from '../_internal/_createIdsModel';
import { _getListIdOf, _setListIdOf } from '../_internal/_listIdOf';
import type { RecordId } from '../types';
import type { DerivedList, DerivedListOptions, ListSource } from './types';

const EMPTY: readonly never[] = Object.freeze([]);

type State<E> = Required<
  Pick<DerivedListOptions<E>, 'filterRefresh' | 'sortRefresh'>
> &
  Pick<DerivedListOptions<E>, 'filter' | 'sort'>;

/**
 * 上流の行を、条件で絞り込み・並べ替える関数を作る（`_arrangeItems` を参照）
 *
 * 当て直さないモードでも、状態を差し替えた後（条件・モードの差し替え、`refresh()`）は当て直す
 */
function createArrange<E>(idOf: IdOf) {
  return (
    rows: readonly E[] | undefined,
    state: State<E>,
    previous:
      | DerivedPrevious<readonly E[] | undefined, State<E>, readonly E[]>
      | undefined,
  ): readonly E[] => {
    const stateChanged = previous !== undefined && previous.state !== state;
    return _arrangeItems({
      items: rows ?? EMPTY,
      filter: state.filter,
      sort: state.sort,
      holdFilter: !stateChanged && state.filterRefresh === 'manual',
      holdSort: !stateChanged && state.sortRefresh === 'manual',
      previousItems: previous && (previous.input ?? EMPTY),
      previousOutput: previous?.output,
      keyOf: idOf,
    });
  };
}

/**
 * 一覧を絞り込み・並べ替えた結果を持つ、標準の派生モデルを作る
 *
 * - 上流の行は書き換えず、結果の行は上流と同じ参照のまま返す
 * - 上流が変わると結果を作り直す。`filterRefresh`・`sortRefresh` を `'manual'` にすると、上流が変わっても
 *   当て直さず、`refresh()` か条件の差し替えで当て直す（入力画面で、編集した行が消えたり動いたりしないように）
 * - 条件は `setFilter`・`setSort` で差し替えられる
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ
 *
 * @param source 上流のモデル（`ListModel` か、別の `DerivedList`）
 * @param options 絞り込み・並べ替えの条件と、当て直すか
 * @returns 派生モデル
 */
export default function createDerivedList<
  E,
  S extends ListSource<E> = ListSource<E>,
>(
  source: S & ListSource<E>,
  options: DerivedListOptions<E> = {},
): DerivedList<E, S> {
  const idOf = _getListIdOf(source);
  const core = _createDerivedModel<
    readonly E[] | undefined,
    State<E>,
    readonly E[]
  >(
    source,
    {
      filter: options.filter,
      sort: options.sort,
      filterRefresh: options.filterRefresh ?? 'auto',
      sortRefresh: options.sortRefresh ?? 'auto',
    },
    createArrange<E>(idOf),
  );
  const idsModel = _createIdsModel(core.get, idOf, core.subscribe, true);
  const update = (values: Partial<State<E>>) =>
    core.setState({ ...core.getState(), ...values });

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
    at: (path: readonly RecordId[]) => source.at(path),
    setFilter: (filter) => update({ filter }),
    setSort: (sort) => update({ sort }),
    setFilterRefresh: (filterRefresh) => update({ filterRefresh }),
    setSortRefresh: (sortRefresh) => update({ sortRefresh }),
    refresh: () => update({}),
  };
  _setListIdOf(derived, idOf);
  return derived;
}
