import _combineModels from '../_internal/_combineModels';
import _createDerivedModel from '../_internal/_createDerivedModel';
import _getListIndex from '../_internal/_getListIndex';
import { _getListIdOf } from '../_internal/_listIdOf';
import _normalizeId from '../_internal/_normalizeId';
import _warn from '../_internal/_warn';
import type { ListSource } from '../createDerivedList';
import createFieldModel from '../createFieldModel';
import type { ReadonlyModel, RecordId } from '../types';
import type { ListSelection, ListSelectionOptions } from './types';

const EMPTY: readonly never[] = Object.freeze([]);

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * 選んだ id の配列から、id を引く表（has のため。配列ごとにキャッシュする）
 */
const idSetCache = new WeakMap<readonly string[], ReadonlySet<string>>();

function toIdSet(ids: readonly string[]): ReadonlySet<string> {
  let set = idSetCache.get(ids);
  if (set === undefined) {
    set = new Set(ids);
    idSetCache.set(ids, set);
  }
  return set;
}

/**
 * id を文字列に揃える。有効でない id は除く
 */
function normalizeIds(ids: readonly RecordId[]): string[] {
  const result: string[] = [];
  for (const id of ids) {
    const normalized = _normalizeId(id);
    if (normalized !== undefined && !result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

/**
 * 一覧の選択のモデルを作る
 *
 * - 選んだ id は、置き場所のモデル（`selectedIds`。渡さなければ中に持つ）に持つ
 * - 読むとき（`get()`・`has()`・`records()`）は、上流にある id だけを返す。データを取り直して同じ id の行が戻れば、選択も戻る
 * - 上流に List のモデルをつなげば、絞り込みで見えなくなった行の選択も読める。派生モデルにつなげば、見えている行の中で選んだものだけを読める
 *
 * @param source 上流のモデル（`ListModel` か、派生モデル）
 * @param options 単一・複数選択と、選んだ id の置き場所
 * @returns 選択のモデル
 */
export default function createListSelection<
  E,
  S extends ListSource<E> = ListSource<E>,
>(
  source: S & ListSource<E>,
  options: ListSelectionOptions = {},
): ListSelection<E, S> {
  const multiple = options.multiple ?? false;
  const storage =
    options.selectedIds ??
    createFieldModel<readonly string[]>({}, { defaultData: EMPTY });
  const idOf = _getListIdOf(source);

  // 選んだ id のうち、上流にあるもの（選んだ順）
  const selected = _createDerivedModel<
    readonly [readonly string[] | undefined, readonly string[]],
    null,
    readonly string[]
  >(
    _combineModels(storage, source.ids()),
    null,
    ([stored = EMPTY, ids], _, previous) => {
      const present = toIdSet(ids);
      const result = stored.every((id) => present.has(id))
        ? stored
        : stored.filter((id) => present.has(id));
      return previous !== undefined && sameItems(previous.output, result)
        ? previous.output
        : result;
    },
  );
  const selectedModel: ReadonlyModel<readonly string[]> = {
    get: selected.get,
    subscribe: (listener) =>
      selected.subscribe(
        selected.get,
        listener as Parameters<typeof selected.subscribe>[1],
      ),
  };

  // 選んだ行（選んだ順）
  const records = _createDerivedModel<
    readonly [readonly string[], readonly E[] | undefined],
    null,
    readonly E[]
  >(
    _combineModels(selectedModel, source),
    null,
    ([ids, rows = EMPTY], _, previous) => {
      const { indexById } = _getListIndex(rows, idOf, true);
      const result = ids.flatMap((id) => {
        const index = indexById.get(id);
        return index === undefined ? [] : [rows[index]!];
      });
      return previous !== undefined && sameItems(previous.output, result)
        ? previous.output
        : result;
    },
  );
  const recordsModel: ReadonlyModel<readonly E[]> = {
    get: records.get,
    subscribe: (listener) =>
      records.subscribe(
        records.get,
        listener as Parameters<typeof records.subscribe>[1],
      ),
  };

  /**
   * 置き場所の id を、前の値から作り直す（続けて書いても前の変更を消さないよう、前の値を受け取る形で書く）
   */
  const update = (next: (stored: readonly string[]) => readonly string[]) =>
    storage.set((prev) => next(prev ?? EMPTY));
  const inSource = (id: string) => toIdSet(source.ids().get()).has(id);
  const limit = (ids: readonly string[]): readonly string[] => {
    if (!multiple && ids.length > 1) {
      _warn(
        'Multiple ids were given to a single selection. Only the first one is selected.',
      );
      return ids.slice(0, 1);
    }
    return ids;
  };

  const select = (id: RecordId) => {
    const normalized = _normalizeId(id);
    if (normalized === undefined || !inSource(normalized)) {
      _warn(
        `The record "${String(id)}" is not in the source. It was not selected.`,
      );
      return;
    }
    update((stored) => {
      if (!multiple) {
        return stored.length === 1 && stored[0] === normalized
          ? stored
          : [normalized];
      }
      return stored.includes(normalized) ? stored : [...stored, normalized];
    });
  };
  const deselect = (id: RecordId) => {
    const normalized = _normalizeId(id);
    update((stored) =>
      normalized !== undefined && stored.includes(normalized)
        ? stored.filter((value) => value !== normalized)
        : stored,
    );
  };

  return {
    source,
    get: selectedModel.get,
    subscribe: selectedModel.subscribe,
    set: (ids) =>
      update((stored) => {
        const visible = selected.get();
        const next = typeof ids === 'function' ? ids(visible) : ids;
        const normalized = limit(normalizeIds(next));
        return sameItems(stored, normalized) ? stored : normalized;
      }),
    select,
    deselect,
    toggle: (id) => {
      const normalized = _normalizeId(id);
      if (normalized !== undefined && selected.get().includes(normalized)) {
        deselect(normalized);
      } else {
        select(id);
      }
    },
    selectAll: () => {
      if (!multiple) {
        _warn('selectAll() is available only for multiple selections.');
        return;
      }
      update((stored) => {
        const missing = source
          .ids()
          .get()
          .filter((id) => !stored.includes(id));
        return missing.length === 0 ? stored : [...stored, ...missing];
      });
    },
    clear: () => update((stored) => (stored.length === 0 ? stored : [])),
    has: (id) => {
      const normalized = _normalizeId(id);
      return (
        normalized !== undefined && toIdSet(selected.get()).has(normalized)
      );
    },
    records: () => recordsModel,
    removeMissing: () =>
      update((stored) => {
        const present = toIdSet(source.ids().get());
        return stored.every((id) => present.has(id))
          ? stored
          : stored.filter((id) => present.has(id));
      }),
  };
}
