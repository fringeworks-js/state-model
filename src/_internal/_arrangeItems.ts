import type { FilterFunction, SortFunction } from '@fringeworks/types';
import _mergeByPreviousOrder from './_mergeByPreviousOrder';

/**
 * `_arrangeItems` の引数
 */
export type ArrangeItemsParams<T> = {
  /** 今の上流の並び */
  readonly items: readonly T[];
  /** 絞り込みの条件 */
  readonly filter: FilterFunction<T> | undefined;
  /** 並べ替えの条件 */
  readonly sort: SortFunction<T> | undefined;
  /** どの要素が入るかを、前の結果のまま保つか（当て直さないモード） */
  readonly holdFilter: boolean;
  /** 並び順を、前の結果のまま保つか（当て直さないモード） */
  readonly holdSort: boolean;
  /** 前の結果（初めは undefined） */
  readonly previousOutput: readonly T[] | undefined;
  /** 要素を追うためのキー（行の id、グループのキー）。undefined なら追えないので、上流と条件に従う */
  readonly keyOf: (item: T) => unknown;
  /**
   * 上流に無い要素の、最新の中身を引く（上流の段が外した行を、元の一覧から引く）。
   * 省略した場合と undefined を返した場合は、その要素は消えたものとして扱う
   */
  readonly resolveMissing?: ((key: unknown) => T | undefined) | undefined;
  /** どの要素が入るかを保っていても入れる要素のキー（その段から足した行） */
  readonly pinnedKeys?: ReadonlySet<unknown> | undefined;
};

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function indexByKey<T>(
  items: readonly T[],
  keyOf: (item: T) => unknown,
): Map<unknown, number> {
  const map = new Map<unknown, number>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (key !== undefined && !map.has(key)) {
      map.set(key, index);
    }
  });
  return map;
}

/**
 * 形を変えない段の共通の処理: 要素を絞り込み・並べ替える
 *
 * - すぐ当て直すモードでは、条件をそのまま当てる。条件が無ければ、上流の順のまま
 * - 当て直さないモードでは、前の結果を写しとして保つ（条件が無くても保つ）
 *   - どの要素が入るかを保つ: 前の結果にあった要素だけを入れる。中身は今の上流のもので、上流に無ければ
 *     `resolveMissing` で引く（引けなければ消える）。その段から足した要素（`pinnedKeys`）は、条件を当てずに入れる。
 *     それ以外で上流に新しく入ってきた要素は入れない
 *   - 並び順を保つ: 前の結果にあった要素は前の順のまま並べ、それ以外は末尾に足す
 *   - どの要素が入るかだけを保つときは、並べ替えの条件で並べる。条件が無ければ上流の順に並べ、
 *     上流に無い要素は前の結果での位置に合わせて差し込む
 * - 結果の要素と順番が前と同じなら、前の配列を返す。上流の配列はそのまま返さない（派生モデルは自分の配列を返す）
 */
export default function _arrangeItems<T>({
  items,
  filter,
  sort,
  holdFilter,
  holdSort,
  previousOutput,
  keyOf,
  resolveMissing,
  pinnedKeys,
}: ArrangeItemsParams<T>): readonly T[] {
  const canHoldFilter = holdFilter && previousOutput !== undefined;
  const canHoldSort = holdSort && previousOutput !== undefined;

  // 入る要素: 上流にあるもの（上流の順）と、上流に無いもの
  let present: readonly T[];
  const absent: T[] = [];
  if (canHoldFilter) {
    const upstreamKeys = indexByKey(items, keyOf);
    const members = new Set<unknown>();
    const addMember = (key: unknown) => {
      if (key === undefined || members.has(key)) {
        return;
      }
      members.add(key);
      if (!upstreamKeys.has(key)) {
        const item = resolveMissing?.(key);
        if (item !== undefined) {
          absent.push(item);
        }
      }
    };
    for (const item of previousOutput) {
      addMember(keyOf(item));
    }
    for (const key of pinnedKeys ?? []) {
      addMember(key);
    }
    present = items.filter((item) => {
      const key = keyOf(item);
      return key === undefined ? !filter || filter(item) : members.has(key);
    });
  } else {
    present = filter ? items.filter((item) => filter(item)) : items;
  }

  let result: readonly T[];
  if (canHoldSort) {
    const previousOrder = indexByKey(previousOutput, keyOf);
    const kept: { item: T; index: number }[] = [];
    const added: T[] = [];
    for (const item of [...present, ...absent]) {
      const key = keyOf(item);
      const index = key === undefined ? undefined : previousOrder.get(key);
      if (index === undefined) {
        added.push(item);
      } else {
        kept.push({ item, index });
      }
    }
    kept.sort((a, b) => a.index - b.index);
    result = [...kept.map(({ item }) => item), ...added];
  } else if (sort) {
    result = [...present, ...absent].sort(sort);
  } else if (absent.length > 0 && previousOutput !== undefined) {
    result = _mergeByPreviousOrder(present, absent, previousOutput, keyOf);
  } else {
    result = present;
  }

  if (previousOutput !== undefined && sameItems(previousOutput, result)) {
    return previousOutput;
  }
  return result === items ? items.slice() : result;
}
