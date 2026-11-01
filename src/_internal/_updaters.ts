import type { IdOf } from './_createIdOf';
import _getListIndex from './_getListIndex';
import _isRecordLike from './_isRecordLike';
import _normalizeId from './_normalizeId';
import { Skip, type Updater } from './_updateIn';
import _warn from './_warn';

/**
 * set: 値か、前の値を受け取る関数
 */
export function _createSetUpdater(value: unknown): Updater {
  return typeof value === 'function'
    ? (prev) => (value as (prev: unknown) => unknown)(prev)
    : () => value;
}

/**
 * Record の update: 変わったキーだけを反映する\
 * 値が undefined のキーは undefined にする。Record が無ければ書かない
 */
export function _createUpdateRecordUpdater(
  values: Readonly<Record<string, unknown>>,
): Updater {
  return (prev) => {
    if (!_isRecordLike(prev)) {
      return new Skip(
        'Cannot update part of a missing record. Set the whole record first.',
      );
    }
    let next: Record<string, unknown> | undefined;
    for (const key of Object.keys(values)) {
      const value = values[key];
      if (!Object.is(prev[key], value)) {
        next ??= { ...prev };
        next[key] = value;
      }
    }
    return next ?? prev;
  };
}

/**
 * List の insert: 末尾に足す\
 * id がすでにあるもの・有効でないものは足さずに警告する。List が無ければ空の List を作る
 */
export function _createInsertUpdater(
  idOf: IdOf,
  records: readonly unknown[],
): Updater {
  return (prev) => {
    if (prev !== undefined && !Array.isArray(prev)) {
      return new Skip('Cannot insert into a value that is not a list.');
    }
    const base: readonly unknown[] = prev ?? [];
    const existing = _getListIndex(base, idOf).indexById;
    const added: unknown[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      const id = idOf(record);
      if (id === undefined) {
        _warn('A record without a valid id was not inserted.');
      } else if (existing.has(id) || seen.has(id)) {
        _warn(
          `A record with the id "${id}" already exists. It was not inserted.`,
        );
      } else {
        seen.add(id);
        added.push(record);
      }
    }
    return added.length === 0 ? prev : [...base, ...added];
  };
}

/**
 * List の remove: 指定した id の行をすべて消す（重複している行も消す）
 */
export function _createRemoveUpdater(
  idOf: IdOf,
  ids: readonly unknown[],
): Updater {
  const targets = new Set(
    ids.map(_normalizeId).filter((id) => id !== undefined),
  );
  return (prev) => {
    if (!Array.isArray(prev) || targets.size === 0) {
      return prev;
    }
    const next = prev.filter((record) => {
      const id = idOf(record);
      return id === undefined || !targets.has(id);
    });
    return next.length === prev.length ? prev : next;
  };
}
