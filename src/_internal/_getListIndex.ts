import type { IdOf } from './_createIdOf';
import _warn from './_warn';

/**
 * List の索引
 */
export type ListIndex = {
  /** 有効で、重複していない id の並び */
  readonly ids: readonly string[];
  /** id から添字を引く表（重複は先にある方） */
  readonly indexById: ReadonlyMap<string, number>;
};

const indexCache = new WeakMap<readonly unknown[], Map<IdOf, ListIndex>>();

/**
 * List の索引を作る。配列と IdOf ごとにキャッシュする
 *
 * - id が重複している行は、先にある方だけを含める
 * - id が有効でない行は含めない
 * - どちらも、データには残したまま開発時に警告する
 */
export default function _getListIndex(
  list: readonly unknown[],
  idOf: IdOf,
): ListIndex {
  let byIdOf = indexCache.get(list);
  if (!byIdOf) {
    byIdOf = new Map();
    indexCache.set(list, byIdOf);
  }
  const cached = byIdOf.get(idOf);
  if (cached) {
    return cached;
  }

  const ids: string[] = [];
  const indexById = new Map<string, number>();
  let invalidCount = 0;
  const duplicates: string[] = [];
  list.forEach((record, index) => {
    const id = idOf(record);
    if (id === undefined) {
      invalidCount++;
    } else if (indexById.has(id)) {
      duplicates.push(id);
    } else {
      indexById.set(id, index);
      ids.push(id);
    }
  });
  if (invalidCount > 0) {
    _warn(
      `${invalidCount} record(s) in a list have no valid id. They cannot be reached by id.`,
    );
  }
  if (duplicates.length > 0) {
    _warn(
      `Duplicate ids in a list (${duplicates.join(', ')}). Only the first record with each id is reached.`,
    );
  }

  const index: ListIndex = { ids, indexById };
  byIdOf.set(idOf, index);
  return index;
}
