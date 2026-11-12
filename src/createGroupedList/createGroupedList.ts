import _arrangeItems from '../_internal/_arrangeItems';
import _createDerivedModel, {
  type DerivedPrevious,
} from '../_internal/_createDerivedModel';
import type { IdOf } from '../_internal/_createIdOf';
import _getListIndex from '../_internal/_getListIndex';
import {
  _createHeldInput,
  _createRowLookup,
  _getOriginList,
  type HeldInput,
} from '../_internal/_heldInput';
import { _getListIdOf } from '../_internal/_listIdOf';
import _mergeByPreviousOrder from '../_internal/_mergeByPreviousOrder';
import type { ListSource } from '../createDerivedList';
import type { ReadonlyModel, RecordId } from '../types';
import type {
  GroupBy,
  GroupedList,
  GroupedListOptions,
  ListGroup,
} from './types';

/**
 * グループ化した派生モデルの状態（2つの段で共有する）
 */
type State<E, K> = Required<
  Pick<GroupedListOptions<E, K>, 'groupBy' | 'filterRefresh' | 'sortRefresh'>
> &
  Pick<GroupedListOptions<E, K>, 'filterGroups' | 'sortGroups'>;

/**
 * 1段目の結果: すべてのグループと、それを作ったときの状態（2段目に状態を渡すため）
 */
type Grouping<E, K> = {
  readonly groups: readonly ListGroup<K, E>[];
  readonly state: State<E, K>;
  /** この派生モデルの `insert` で足した行が入ったグループのキー（`groupKeyOf` で揃えたもの）。2段目が保っていても入れる */
  readonly pinnedKeys: ReadonlySet<unknown>;
};

const NO_KEYS: ReadonlySet<unknown> = new Set();

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * キーが undefined のグループも、キーで追えるようにするための代わりの値
 */
const UNDEFINED_KEY = Symbol('undefined');

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * 2段目でグループを追うためのキー
 */
function groupKeyOf<K>(key: K): unknown {
  return key === undefined ? UNDEFINED_KEY : key;
}

function toKeyFunction<E, K>(groupBy: GroupBy<E, K>): (record: E) => K {
  return typeof groupBy === 'function'
    ? groupBy
    : (record) => record[groupBy] as K;
}

/**
 * 1段目: 上流の行をグループに分ける
 *
 * - グループは上流での最初の出現順。グループの中の行は上流の順
 * - グループ分けを当て直さないモードでは、当て直した時点の行を、そのとき入っていたグループに残す
 *   （グループのキーを書き換えた行も動かない）。上流の段が外した行も、元の一覧から最新の中身を引いて残し、
 *   前の並びでの位置に合わせて差し込む。上流に新しく入ってきた行は、当て直すまで入れない。行の無いグループは作らない
 * - `pinned` はこの派生モデルの `insert` で足した行の id。当て直さないモードでも今のキーのグループに入れ、
 *   入ったグループのキーを結果に添える。結果に入れば写しに含まれるので、結果を作るたびに空にする
 * - 中身（行の参照と順番）が前と同じグループは、前のオブジェクトを返す
 * - グループと状態が前と同じなら、前の結果を返す
 */
function createGroupRecords<E, K>(idOf: IdOf, pinned: Set<string>) {
  return (
    input: HeldInput<E>,
    state: State<E, K>,
    previous:
      DerivedPrevious<HeldInput<E>, State<E, K>, Grouping<E, K>> | undefined,
  ): Grouping<E, K> => {
    const keyOf = toKeyFunction(state.groupBy);
    const hold =
      previous !== undefined &&
      previous.state === state &&
      state.filterRefresh === 'manual';

    // 当て直さないモードで、前に行が入っていたグループ（id の無い行・新しく足された行は、今のキーで分ける）
    const previousKeyById = new Map<string, K>();
    if (hold) {
      for (const group of previous.output.groups) {
        for (const id of group.ids) {
          previousKeyById.set(id, group.key);
        }
      }
    }
    const recordKeyOf = (record: E): K => {
      const id = hold ? idOf(record) : undefined;
      return id !== undefined && previousKeyById.has(id)
        ? (previousKeyById.get(id) as K)
        : keyOf(record);
    };

    // 当て直さないモードでは、前に入っていた行（id の無い行は除けないので、それも）と、この派生モデルから足した行だけを、
    // 前の並びに合わせて並べる（足した行は前の並びに無いので、上流にあれば上流の順、無ければ末尾）
    let rows: readonly E[] = input.rows ?? EMPTY;
    if (hold) {
      const present = rows.filter((record) => {
        const id = idOf(record);
        return id === undefined || previousKeyById.has(id) || pinned.has(id);
      });
      const presentIds = new Set(present.map(idOf));
      const lookup =
        input.originRows && _createRowLookup(input.originRows, idOf);
      const absent: E[] = [];
      for (const id of [...previousKeyById.keys(), ...pinned]) {
        const record = presentIds.has(id) ? undefined : lookup?.(id);
        if (record !== undefined) {
          absent.push(record);
          presentIds.add(id);
        }
      }
      rows = _mergeByPreviousOrder(
        present,
        absent,
        previous.output.groups.flatMap((group) => group.records),
        idOf,
      );
    }

    const buckets = new Map<K, E[]>();
    const pinnedKeys = new Set<unknown>();
    for (const record of rows) {
      const key = recordKeyOf(record);
      if (hold && pinned.size > 0 && pinned.has(idOf(record) ?? '')) {
        pinnedKeys.add(groupKeyOf(key));
      }
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(record);
    }

    const previousByKey = new Map<K, ListGroup<K, E>>();
    for (const group of previous?.output.groups ?? EMPTY) {
      previousByKey.set(group.key, group);
    }
    const groups: ListGroup<K, E>[] = [];
    for (const [key, records] of buckets) {
      const old = previousByKey.get(key);
      groups.push(
        old !== undefined && sameItems(old.records, records)
          ? old
          : { key, records, ids: _getListIndex(records, idOf, true).ids },
      );
    }

    pinned.clear();
    if (
      previous !== undefined &&
      previous.output.state === state &&
      sameItems(previous.output.groups, groups)
    ) {
      return previous.output;
    }
    return {
      groups:
        previous !== undefined && sameItems(previous.output.groups, groups)
          ? previous.output.groups
          : groups,
      state,
      pinnedKeys: pinnedKeys.size > 0 ? pinnedKeys : NO_KEYS,
    };
  };
}

/**
 * 2段目: グループを絞り込み・並べ替える（`_arrangeItems` を参照）
 *
 * 当て直さないモードでも、状態を差し替えた後（条件・モードの差し替え、`refresh()`）は当て直す
 */
function arrangeGroups<E, K>(
  { groups, state, pinnedKeys }: Grouping<E, K>,
  _: null,
  previous:
    | DerivedPrevious<Grouping<E, K>, null, readonly ListGroup<K, E>[]>
    | undefined,
): readonly ListGroup<K, E>[] {
  const stateChanged = previous !== undefined && previous.input.state !== state;
  const holdFilter = !stateChanged && state.filterRefresh === 'manual';
  return _arrangeItems({
    items: groups,
    filter: state.filterGroups,
    sort: state.sortGroups,
    holdFilter,
    holdSort: !stateChanged && state.sortRefresh === 'manual',
    previousOutput: previous?.output,
    keyOf: (group) => groupKeyOf(group.key),
    pinnedKeys: holdFilter ? pinnedKeys : undefined,
  });
}

/**
 * 一覧をグループに分けた、グループ化した派生モデルを作る
 *
 * - 行の絞り込み・並べ替えは上流（`createDerivedList`）で行い、グループの絞り込み・並べ替えはここで行う
 * - 中身が変わらないグループは、同じオブジェクトのまま返す
 * - `filterRefresh`・`sortRefresh` を `'manual'` にすると、上流が変わっても当て直した時点のグループ分けと
 *   グループの集まり・並びを保ち、`refresh()` か条件の差し替えで当て直す（入力画面で、編集した行が別のグループに移ったりしないように）
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ。
 *   `insert(records)` は元の一覧に足し、グループ分けを当て直さないモードでも、今のキーのグループに入れる
 *
 * 中は2段の派生モデル（グループに分ける段と、グループを絞り込み・並べ替える段）。
 * 1段目の結果がすべてのグループなので、絞り込まれたグループも同じオブジェクトのまま覚えておける。
 * 状態は1段目に持ち、結果に添えて2段目に渡す（状態を差し替えたときに、1回で両方の段を作り直すため）
 *
 * @param source 上流のモデル（`ListModel` か `DerivedList`）
 * @param options グループの分け方と、グループの絞り込み・並べ替えの条件、当て直すか
 * @returns 派生モデル
 */
export default function createGroupedList<
  E,
  G extends keyof E & string,
  S extends ListSource<E> = ListSource<E>,
>(
  source: S & ListSource<E>,
  options: GroupedListOptions<E, E[G]> & { groupBy: G },
): GroupedList<E[G], E, S>;
export default function createGroupedList<
  E,
  K,
  S extends ListSource<E> = ListSource<E>,
>(
  source: S & ListSource<E>,
  options: GroupedListOptions<E, K> & { groupBy: (record: E) => K },
): GroupedList<K, E, S>;
export default function createGroupedList<E, K>(
  source: ListSource<E>,
  options: GroupedListOptions<E, K>,
): GroupedList<K, E> {
  const idOf = _getListIdOf(source);
  const origin = _getOriginList<E>(source);
  const pinned = new Set<string>();
  const isHoldingFilter = (): boolean =>
    grouping.getState().filterRefresh === 'manual';
  const grouping = _createDerivedModel<
    HeldInput<E>,
    State<E, K>,
    Grouping<E, K>
  >(
    _createHeldInput(source, origin, isHoldingFilter),
    {
      groupBy: options.groupBy,
      filterGroups: options.filterGroups,
      sortGroups: options.sortGroups,
      filterRefresh: options.filterRefresh ?? 'auto',
      sortRefresh: options.sortRefresh ?? 'auto',
    },
    createGroupRecords<E, K>(idOf, pinned),
  );
  const allGroups: ReadonlyModel<Grouping<E, K>> = {
    get: grouping.get,
    subscribe: (listener) =>
      grouping.subscribe(
        grouping.get,
        listener as Parameters<typeof grouping.subscribe>[1],
      ),
  };
  const arranging = _createDerivedModel<
    Grouping<E, K>,
    null,
    readonly ListGroup<K, E>[]
  >(allGroups, null, arrangeGroups);
  const update = (values: Partial<State<E, K>>) =>
    grouping.setState({ ...grouping.getState(), ...values });

  return {
    source,
    get: arranging.get,
    subscribe: (listener) =>
      arranging.subscribe(
        arranging.get,
        listener as Parameters<typeof arranging.subscribe>[1],
      ),
    record: (id: RecordId) => source.record(id),
    remove: (ids: readonly RecordId[]) => source.remove(ids),
    insert: (records: readonly E[]) => {
      if (origin === undefined) {
        return;
      }
      if (isHoldingFilter()) {
        // 元の一覧に無い id の行だけを、この派生モデルから足した行として覚える（すでにある行は足されない）
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
    setGroupBy: (groupBy) => update({ groupBy }),
    setFilterGroups: (filterGroups) => update({ filterGroups }),
    setSortGroups: (sortGroups) => update({ sortGroups }),
    setFilterRefresh: (filterRefresh) => update({ filterRefresh }),
    setSortRefresh: (sortRefresh) => update({ sortRefresh }),
    refresh: () => update({}),
  };
}
