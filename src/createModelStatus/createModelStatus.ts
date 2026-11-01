import _combineModels from '../_internal/_combineModels';
import _createChildCache from '../_internal/_createChildCache';
import _createDerivedModel from '../_internal/_createDerivedModel';
import _createNotifier from '../_internal/_createNotifier';
import _getIn from '../_internal/_getIn';
import _isSameData from '../_internal/_isSameData';
import { _getModelSegments } from '../_internal/_modelSegments';
import _warn from '../_internal/_warn';
import type { ReadonlyModel, RecordId } from '../types';
import type { ModelStatus, ModelStatusSource } from './types';

const EMPTY_PATHS: readonly (readonly string[])[] = Object.freeze([]);

/**
 * 値を1つ持ち、変わったら知らせる小さなモデル（基準のデータと、触ったパスの一覧を持つ）
 */
function createStore<T>(initial: T) {
  const notifier = _createNotifier();
  let value = initial;
  const get = () => value;
  const model: ReadonlyModel<T> = {
    get,
    subscribe: (listener) =>
      notifier.subscribe(
        get,
        listener as Parameters<typeof notifier.subscribe>[1],
      ),
  };
  const set = (next: T) => {
    if (!Object.is(next, value)) {
      value = next;
      notifier.notify();
    }
  };
  return { model, set };
}

/**
 * パスを文字列の配列に揃える（id の数値は文字列にする）
 */
function normalizePath(path: readonly RecordId[]): readonly string[] {
  return path.map((step) => String(step));
}

/**
 * パスを、表のキーにする文字列にする
 */
function toKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function startsWith(path: readonly string[], prefix: readonly string[]) {
  return (
    path.length >= prefix.length &&
    prefix.every((step, index) => step === path[index])
  );
}

/**
 * 状態のモデル（変更済みか・触ったか）を作る
 *
 * - 変更済みか: 作ったときのデータを基準にし、パスごとに今の値と `Object.is` で比べる。
 *   構造の共有で、変わらない部分は同じ参照のまま残るので、親のパスは下のどこかが変わっていれば変更済みになる。
 *   保存した後などは `markClean()` で基準を置き直す
 * - 触ったか: UI が `touch(path)` で知らせる。そのパスか、その下のどこかを触っていれば true
 *
 * @param source つなぐモデル（Record・List のモデル。ルートでも下位でもよい）
 * @returns 状態のモデル
 */
export default function createModelStatus<M extends ModelStatusSource>(
  source: M,
): ModelStatus<M> {
  const sourceSegments = _getModelSegments(source);
  if (sourceSegments === undefined) {
    _warn(
      'createModelStatus needs a model of a data location (a root model or a child model), not a derived model.',
    );
  }
  const baseline = createStore<unknown>(source.get());
  const touchedPaths = createStore(EMPTY_PATHS);
  const dirtyCache = _createChildCache();
  const touchedCache = _createChildCache();

  const dirty = (path: readonly RecordId[] = []) => {
    const normalized = normalizePath(path);
    return dirtyCache.get(toKey(normalized), () => {
      const target = source.at(path);
      const segments = _getModelSegments(target) ?? [];
      // つないだモデルからの相対的なたどり方で、基準のデータの値を読む
      const relative = segments.slice(sourceSegments?.length ?? 0);
      const derived = _createDerivedModel<
        readonly [unknown, unknown],
        null,
        boolean
      >(
        _combineModels(target, baseline.model),
        null,
        ([current, base]) => !_isSameData(current, _getIn(base, relative)),
      );
      const model: ReadonlyModel<boolean> = {
        get: derived.get,
        subscribe: (listener) =>
          derived.subscribe(
            derived.get,
            listener as Parameters<typeof derived.subscribe>[1],
          ),
      };
      return model;
    });
  };

  const touched = (path: readonly RecordId[] = []) => {
    const normalized = normalizePath(path);
    return touchedCache.get(toKey(normalized), () => {
      const derived = _createDerivedModel<
        readonly (readonly string[])[],
        null,
        boolean
      >(touchedPaths.model, null, (paths) =>
        paths.some((touchedPath) => startsWith(touchedPath, normalized)),
      );
      const model: ReadonlyModel<boolean> = {
        get: derived.get,
        subscribe: (listener) =>
          derived.subscribe(
            derived.get,
            listener as Parameters<typeof derived.subscribe>[1],
          ),
      };
      return model;
    });
  };

  const markClean = () => baseline.set(source.get());
  const clearTouched = () => touchedPaths.set(EMPTY_PATHS);

  return {
    source,
    dirty,
    touched,
    touch: (path) => {
      const normalized = normalizePath(path);
      const current = touchedPaths.model.get();
      const key = toKey(normalized);
      if (!current.some((touchedPath) => toKey(touchedPath) === key)) {
        touchedPaths.set([...current, normalized]);
      }
    },
    markClean,
    clearTouched,
    reset: () => {
      markClean();
      clearTouched();
    },
  };
}
