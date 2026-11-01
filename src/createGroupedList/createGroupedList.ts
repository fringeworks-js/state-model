import _createDerivedModel from '../_internal/_createDerivedModel';
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

type ArrangeState<E, K> = Omit<GroupedListOptions<E, K>, 'groupBy'>;

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
 * - グループは上流での最初の出現順
 * - 中身（行の参照と順番）が前と同じグループは、前のオブジェクトを返す
 * - グループと順番が前と同じなら、前の配列を返す
 */
function createGroupRecords<E, K>(idOf: IdOf) {
  return (
    rows: readonly E[] | undefined,
    groupBy: GroupBy<E, K>,
    previous: readonly ListGroup<K, E>[] | undefined,
  ): readonly ListGroup<K, E>[] => {
    const keyOf = toKeyFunction(groupBy);
    const buckets = new Map<K, E[]>();
    for (const record of rows ?? []) {
      const key = keyOf(record);
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(record);
    }

    const previousByKey = new Map<K, ListGroup<K, E>>();
    for (const group of previous ?? []) {
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
    return previous !== undefined && sameItems(previous, groups)
      ? previous
      : groups;
  };
}

/**
 * 2段目: グループを絞り込み・並べ替える\
 * 条件が無ければ1段目の結果をそのまま返す。条件があり、結果のグループと順番が前と同じなら、前の配列を返す
 */
function arrangeGroups<E, K>(
  groups: readonly ListGroup<K, E>[],
  { filterGroups, sortGroups }: ArrangeState<E, K>,
  previous: readonly ListGroup<K, E>[] | undefined,
): readonly ListGroup<K, E>[] {
  // 条件が無ければ、1段目の結果（すべてのグループ）をそのまま返す（前の結果より優先する）
  if (!filterGroups && !sortGroups) {
    return groups;
  }
  let result: readonly ListGroup<K, E>[] = filterGroups
    ? groups.filter((group) => filterGroups(group))
    : groups;
  if (sortGroups) {
    result = (
      result === groups ? groups.slice() : (result as ListGroup<K, E>[])
    ).sort(sortGroups);
  }
  return previous !== undefined && sameItems(previous, result)
    ? previous
    : result;
}

/**
 * 一覧をグループに分けた、グループ化した派生モデルを作る
 *
 * - 行の絞り込み・並べ替えは上流（`createDerivedList`）で行い、グループの絞り込み・並べ替えはここで行う
 * - 中身が変わらないグループは、同じオブジェクトのまま返す
 * - 行の編集は `record(id)`（上流の行のモデル）で、削除は `remove(ids)` で上流に取り次ぐ
 *
 * 中は2段の派生モデル（グループに分ける段と、グループを絞り込み・並べ替える段）。
 * 1段目の結果がすべてのグループなので、絞り込まれたグループも同じオブジェクトのまま覚えておける
 *
 * @param source 上流のモデル（`ListModel` か `DerivedList`）
 * @param options グループの分け方と、グループの絞り込み・並べ替えの条件
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
    GroupBy<E, K>,
    readonly ListGroup<K, E>[]
  >(source, options.groupBy, createGroupRecords<E, K>(_getListIdOf(source)));
  const allGroups: ReadonlyModel<readonly ListGroup<K, E>[]> = {
    get: grouping.get,
    subscribe: (listener) =>
      grouping.subscribe(
        grouping.get,
        listener as Parameters<typeof grouping.subscribe>[1],
      ),
  };
  const arranging = _createDerivedModel<
    readonly ListGroup<K, E>[],
    ArrangeState<E, K>,
    readonly ListGroup<K, E>[]
  >(
    allGroups,
    { filterGroups: options.filterGroups, sortGroups: options.sortGroups },
    arrangeGroups,
  );

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
    setGroupBy: (groupBy) => grouping.setState(groupBy),
    setFilterGroups: (filterGroups) =>
      arranging.setState({ ...arranging.getState(), filterGroups }),
    setSortGroups: (sortGroups) =>
      arranging.setState({ ...arranging.getState(), sortGroups }),
  };
}
