import type { Segment } from './_getIn';
import _getListIndex from './_getListIndex';
import _isRecordLike from './_isRecordLike';

/**
 * 書き込みを行わないことを表す（理由は警告に使う）
 */
export class Skip {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
}

/**
 * 前の値から新しい値を作る関数。書き込まないときは Skip を返す
 */
export type Updater = (prev: unknown) => unknown;

/**
 * 住所の値を作り直した結果
 */
export type UpdateResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly reason: string };

/**
 * 住所の値を作り直した、新しいデータを返す（書き換えない）
 *
 * - 変わった所だけを作り直し、ほかは同じ参照のまま残す
 * - 変化が無ければ、元のデータをそのまま返す
 * - 直接の親が無ければ書かない。List の行は id で見つからなければ書かない
 * - 行の id が変わり、別の行の id と重複する・有効でなくなるときは書かない
 */
export default function _updateIn(
  data: unknown,
  segments: readonly Segment[],
  updater: Updater,
): UpdateResult {
  return updateAt(data, segments, 0, updater);
}

function updateAt(
  current: unknown,
  segments: readonly Segment[],
  depth: number,
  updater: Updater,
): UpdateResult {
  if (depth === segments.length) {
    const next = updater(current);
    if (next instanceof Skip) {
      return { ok: false, reason: next.reason };
    }
    return { ok: true, data: Object.is(next, current) ? current : next };
  }

  const segment = segments[depth]!;
  if (segment.type === 'key') {
    if (!_isRecordLike(current)) {
      return {
        ok: false,
        reason: `The parent of "${segment.key}" is missing.`,
      };
    }
    const child = current[segment.key];
    const result = updateAt(child, segments, depth + 1, updater);
    if (!result.ok || result.data === child) {
      return result.ok ? { ok: true, data: current } : result;
    }
    return { ok: true, data: { ...current, [segment.key]: result.data } };
  }

  if (!Array.isArray(current)) {
    return {
      ok: false,
      reason: `The list of the record "${segment.id}" is missing.`,
    };
  }
  const listIndex = _getListIndex(current, segment.idOf);
  const index =
    segment.id === undefined ? undefined : listIndex.indexById.get(segment.id);
  if (index === undefined) {
    return { ok: false, reason: `The record "${segment.id}" is missing.` };
  }
  const row: unknown = current[index];
  const result = updateAt(row, segments, depth + 1, updater);
  if (!result.ok || result.data === row) {
    return result.ok ? { ok: true, data: current } : result;
  }
  const nextId = segment.idOf(result.data);
  if (nextId === undefined) {
    return {
      ok: false,
      reason: `The id of the record "${segment.id}" would become invalid.`,
    };
  }
  if (nextId !== segment.id && listIndex.indexById.has(nextId)) {
    return {
      ok: false,
      reason: `The id of the record "${segment.id}" would duplicate "${nextId}".`,
    };
  }
  const next = current.slice();
  next[index] = result.data;
  return { ok: true, data: next };
}
