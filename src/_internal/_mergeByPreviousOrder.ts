/**
 * 上流の順に並んだ要素に、上流に無い要素を、前の並びでの位置に合わせて差し込む
 *
 * 当て直さないモードで、上流の段が外した要素を結果に残すときに使う（上流に無いので、上流の順では位置が決まらない）。
 *
 * - 上流に無い要素は、前の並びで直前にあった「上流にある要素」の後ろに置く。直前に無ければ先頭に置く
 * - 前の並びに無い要素（その段から足した行など）は、末尾に置く
 *
 * @param present 上流にある要素（上流の順）
 * @param absent 上流に無い要素
 * @param previousOrder 前の結果の並び
 * @param keyOf 要素を追うためのキー
 * @returns 並べた要素
 */
export default function _mergeByPreviousOrder<T>(
  present: readonly T[],
  absent: readonly T[],
  previousOrder: readonly T[],
  keyOf: (item: T) => unknown,
): T[] {
  if (absent.length === 0) {
    return present.slice();
  }
  const presentKeys = new Set<unknown>();
  for (const item of present) {
    presentKeys.add(keyOf(item));
  }
  const absentByKey = new Map<unknown, T>();
  for (const item of absent) {
    absentByKey.set(keyOf(item), item);
  }

  // 上流にある要素のキー（先頭は START）ごとに、その後ろに置く要素
  const START = {};
  const attached = new Map<unknown, T[]>();
  let anchor: unknown = START;
  for (const item of previousOrder) {
    const key = keyOf(item);
    const absentItem = absentByKey.get(key);
    if (absentItem !== undefined) {
      let list = attached.get(anchor);
      if (list === undefined) {
        list = [];
        attached.set(anchor, list);
      }
      list.push(absentItem);
      absentByKey.delete(key);
    } else if (presentKeys.has(key)) {
      anchor = key;
    }
  }

  const result: T[] = [...(attached.get(START) ?? [])];
  for (const item of present) {
    result.push(item);
    const key = keyOf(item);
    const list = attached.get(key);
    if (list !== undefined) {
      result.push(...list);
      attached.delete(key);
    }
  }
  result.push(...absentByKey.values());
  return result;
}
