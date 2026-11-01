import _arrangeItems from '../_internal/_arrangeItems';
import _createDerivedModel, {
  type DerivedPrevious,
} from '../_internal/_createDerivedModel';
import type { IdOf } from '../_internal/_createIdOf';
import _getListIndex from '../_internal/_getListIndex';
import { _getListIdOf } from '../_internal/_listIdOf';
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
};

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * キーが undefined のグループも、キーで追えるようにするための代わりの値
 */
const UNDEFINED_KEY = Symbol('undefined');

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
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
 * - グループ分けを当て直さないモードでは、前に入っていたグループに行を残す（グループのキーを書き換えた行も動かない）。
 *   上流に新しく足された行は、今のキーのグループに入れる。行の無いグループは作らない
 * - 中身（行の参照と順番）が前と同じグループは、前のオブジェクトを返す
 * - グループと状態が前と同じなら、前の結果を返す
 */
function createGroupRecords<E, K>(idOf: IdOf) {
  return (
    rows: readonly E[] | undefined,
    state: State<E, K>,
    previous:
      | DerivedPrevious<readonly E[] | undefined, State<E, K>, Grouping<E, K>>
      | undefined,
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
    const groupKeyOf = (record: E): K => {
      const id = hold ? idOf(record) : undefined;
      return id !== undefined && previousKeyById.has(id)
        ? (previousKeyById.get(id) as K)
        : keyOf(record);
    };

    const buckets = new Map<K, E[]>();
    for (const record of rows ?? EMPTY) {
      const key = groupKeyOf(record);
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
    };
  };
}

/**
 * 2段目: グループを絞り込み・並べ替える（`_arrangeItems` を参照）
 *
 * 当て直さないモードでも、状態を差し替えた後（条件・モードの差し替え、`refresh()`）は当て直す
 */
function arrangeGroups<E, K>(
  { groups, state }: Grouping<E, K>,
  _: null,
  previous:
    | DerivedPrevious<Grouping<E, K>, null, readonly ListGroup<K, E>[]>
    | undefined,
): readonly ListGroup<K, E>[] {
  const stateChanged = previous !== undefined && previous.input.state !== state;
  return _arrangeItems({
    items: groups,
    filter: state.filterGroups,
    sort: state.sortGroups,
    holdFilter: !stateChanged && state.filterRefresh === 'manual',
    holdSort: !stateChanged && state.sortRefresh === 'manual',
    previousItems: previous?.input.groups,
    previousOutput: previous?.output,
    keyOf: (group) => (group.key === undefined ? UNDEFINED_KEY : group.key),
  });
}

/**
 * 一覧をグループに分けた、グループ化した派生モデルを作る
 *
 * - 行の絞り込み・並べ替えは上流（`createDerivedList`）で行い、グループの絞り込み・並べ替えはここで行う
 * - 中身が変わらないグループは、同じオブジェクトのまま返す
 * - `filterRefresh`・`sortRefresh` を `'manual'` にすると、上流が変わっても当て直さず、
 *   `refresh()` か条件の差し替えで当て直す（入力画面で、編集した行が別のグループに移ったりしないように）
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ
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
  const grouping = _createDerivedModel<
    readonly E[] | undefined,
    State<E, K>,
    Grouping<E, K>
  >(
    source,
    {
      groupBy: options.groupBy,
      filterGroups: options.filterGroups,
      sortGroups: options.sortGroups,
      filterRefresh: options.filterRefresh ?? 'auto',
      sortRefresh: options.sortRefresh ?? 'auto',
    },
    createGroupRecords<E, K>(_getListIdOf(source)),
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
    at: (path: readonly RecordId[]) => source.at(path),
    setGroupBy: (groupBy) => update({ groupBy }),
    setFilterGroups: (filterGroups) => update({ filterGroups }),
    setSortGroups: (sortGroups) => update({ sortGroups }),
    setFilterRefresh: (filterRefresh) => update({ filterRefresh }),
    setSortRefresh: (sortRefresh) => update({ sortRefresh }),
    refresh: () => update({}),
  };
}
