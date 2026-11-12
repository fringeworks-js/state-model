import _arrangeItems from '../_internal/_arrangeItems';
import _createDerivedModel, {
  type DerivedPrevious,
} from '../_internal/_createDerivedModel';
import type { IdOf } from '../_internal/_createIdOf';
import _createIdsModel from '../_internal/_createIdsModel';
import {
  _createHeldInput,
  _createRowLookup,
  _getOriginList,
  type HeldInput,
} from '../_internal/_heldInput';
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
 * - 当て直さないモードでも、状態を差し替えた後（条件・モードの差し替え、`refresh()`）は当て直す
 * - 上流の段が外した行は、元の一覧から最新の中身を引く
 * - `pinned` はこの段から足した行の id。結果に入れたら写しに含まれるので、結果を作るたびに空にする
 */
function createArrange<E>(idOf: IdOf, pinned: Set<string>) {
  return (
    input: HeldInput<E>,
    state: State<E>,
    previous: DerivedPrevious<HeldInput<E>, State<E>, readonly E[]> | undefined,
  ): readonly E[] => {
    const stateChanged = previous !== undefined && previous.state !== state;
    const holdFilter = !stateChanged && state.filterRefresh === 'manual';
    const result = _arrangeItems({
      items: input.rows ?? EMPTY,
      filter: state.filter,
      sort: state.sort,
      holdFilter,
      holdSort: !stateChanged && state.sortRefresh === 'manual',
      previousOutput: previous?.output,
      keyOf: idOf,
      resolveMissing:
        input.originRows && _createRowLookup(input.originRows, idOf),
      pinnedKeys: holdFilter ? pinned : undefined,
    });
    pinned.clear();
    return result;
  };
}

/**
 * 一覧を絞り込み・並べ替えた結果を持つ、標準の派生モデルを作る
 *
 * - 上流の行は書き換えず、結果の行は上流と同じ参照のまま返す。結果の配列は、条件が無くても上流の配列とは別のもの
 * - 上流が変わると結果を作り直す。`filterRefresh`・`sortRefresh` を `'manual'` にすると、上流が変わっても
 *   当て直した時点の行の集まりと順番を保ち、`refresh()` か条件の差し替えで当て直す
 *   （入力画面で、編集した行が消えたり動いたりしないように）。上流の段が外した行も残す
 * - 条件は `setFilter`・`setSort` で差し替えられる
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ。
 *   `insert(records)` は元の一覧に足し、絞り込みを当て直さないモードでも、この段の結果に入れる
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
  const origin = _getOriginList<E>(source);
  const pinned = new Set<string>();
  const isHoldingFilter = (): boolean =>
    core.getState().filterRefresh === 'manual';
  const core = _createDerivedModel<HeldInput<E>, State<E>, readonly E[]>(
    _createHeldInput(source, origin, isHoldingFilter),
    {
      filter: options.filter,
      sort: options.sort,
      filterRefresh: options.filterRefresh ?? 'auto',
      sortRefresh: options.sortRefresh ?? 'auto',
    },
    createArrange<E>(idOf, pinned),
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
    insert: (records: readonly E[]) => {
      if (origin === undefined) {
        return;
      }
      if (isHoldingFilter()) {
        // 元の一覧に無い id の行だけを、この段から足した行として覚える（すでにある行は足されない）
        const existing = new Set(origin.ids().get());
        for (const record of records) {
          const id = idOf(record);
          if (id !== undefined && !existing.has(id)) {
            pinned.add(id);
          }
        }
      }
      origin.insert(records);
    },
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
