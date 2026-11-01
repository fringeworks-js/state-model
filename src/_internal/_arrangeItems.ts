/**
 * `_arrangeItems` の引数
 */
export type ArrangeItemsParams<T> = {
  /** 今の上流の並び */
  readonly items: readonly T[];
  /** 絞り込みの条件 */
  readonly filter: ((item: T) => boolean) | undefined;
  /** 並べ替えの条件 */
  readonly sort: ((a: T, b: T) => number) | undefined;
  /** どの要素が入るかを、前の結果のまま保つか（当て直さないモード） */
  readonly holdFilter: boolean;
  /** 並び順を、前の結果のまま保つか（当て直さないモード） */
  readonly holdSort: boolean;
  /** 前に結果を作ったときの上流の並び（初めは undefined） */
  readonly previousItems: readonly T[] | undefined;
  /** 前の結果（初めは undefined） */
  readonly previousOutput: readonly T[] | undefined;
  /** 要素を追うためのキー（行の id、グループのキー）。undefined なら追えないので、毎回新しい要素として扱う */
  readonly keyOf: (item: T) => unknown;
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
 * - 条件が無ければ、上流の並びをそのまま返す
 * - すぐ当て直すモードでは、条件をそのまま当てる
 * - 当て直さないモードでは、前の結果を保つ
 *   - どの要素が入るかを保つ: 前の結果にあった要素は残す（中身は今の上流のもの）。上流から消えた要素は消える。
 *     上流に新しく足された要素は、条件を当てずに入れる
 *   - 並び順を保つ: 前の結果にあった要素は前の順のまま並べ、それ以外は上流の順で末尾に足す
 * - 結果の要素と順番が前と同じなら、前の配列を返す
 */
export default function _arrangeItems<T>({
  items,
  filter,
  sort,
  holdFilter,
  holdSort,
  previousItems,
  previousOutput,
  keyOf,
}: ArrangeItemsParams<T>): readonly T[] {
  // 条件が無ければ、上流の値をそのまま返す（前の結果より優先する）
  if (!filter && !sort) {
    return items;
  }

  const hold =
    previousItems !== undefined &&
    previousOutput !== undefined &&
    ((filter !== undefined && holdFilter) || (sort !== undefined && holdSort));
  let result: readonly T[];
  if (!hold) {
    result = filter ? items.filter((item) => filter(item)) : items;
    if (sort) {
      result = (result === items ? items.slice() : (result as T[])).sort(sort);
    }
  } else {
    const previousInputKeys = indexByKey(previousItems, keyOf);
    const previousOrder = indexByKey(previousOutput, keyOf);
    const isNew = (key: unknown) =>
      key === undefined || !previousInputKeys.has(key);

    let members: readonly T[];
    if (filter && holdFilter) {
      members = items.filter((item) => {
        const key = keyOf(item);
        return isNew(key) || previousOrder.has(key);
      });
    } else {
      members = filter ? items.filter((item) => filter(item)) : items;
    }

    if (sort && holdSort) {
      const kept: { item: T; index: number }[] = [];
      const added: T[] = [];
      for (const item of members) {
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
      result = (members === items ? items.slice() : (members as T[])).sort(
        sort,
      );
    } else {
      result = members;
    }
  }

  if (previousOutput !== undefined && sameItems(previousOutput, result)) {
    return previousOutput;
  }
  return result;
}
