import _combineModels from '../_internal/_combineModels';
import _createChildCache from '../_internal/_createChildCache';
import _createDerivedModel from '../_internal/_createDerivedModel';
import _createStore from '../_internal/_createStore';
import _getIn from '../_internal/_getIn';
import _isSameData from '../_internal/_isSameData';
import { _getModelSegments } from '../_internal/_modelSegments';
import _warn from '../_internal/_warn';
import type { ReadonlyModel, RecordId } from '../types';
import type { ModelStatus, ModelStatusSource } from './types';

/**
 * パスを、表のキーにする文字列にする（id の数値は文字列にする）
 */
function toKey(path: readonly RecordId[]): string {
  return JSON.stringify(path.map((step) => String(step)));
}

/**
 * 状態のモデル（変更済みか）を作る
 *
 * 作ったときのデータを基準にし、パスごとに今の値と比べる（参照が同じならすぐ同じとし、違えば中身で比べる）。
 * 構造の共有で、変わらない部分は同じ参照のまま残るので、比べ直すのは変わった枝だけで済む。
 * 保存した後などは `markClean()` で基準を置き直す
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
  const baseline = _createStore<unknown>(source.get());
  const dirtyCache = _createChildCache();

  const dirty = (path: readonly RecordId[] = []) =>
    dirtyCache.get(toKey(path), () => {
      const target = source.at(path);
      const segments = _getModelSegments(target) ?? [];
      // つないだモデルからの相対的なたどり方で、基準のデータの値を読む。
      // 行は id で引くので、並びが変わっても同じ id の行どうしを比べる
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

  return {
    source,
    dirty,
    markClean: () => baseline.set(source.get()),
  };
}
