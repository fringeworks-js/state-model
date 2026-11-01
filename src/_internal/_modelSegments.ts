import type { Segment } from './_getIn';

/**
 * データの場所のモデル（ルートのモデル・下位のモデル）から、ルートのデータの中のたどり方を引く表
 */
const registry = new WeakMap<object, readonly Segment[]>();

/**
 * モデルの、ルートのデータの中のたどり方を登録する
 */
export function _setModelSegments(
  model: object,
  segments: readonly Segment[],
): void {
  registry.set(model, segments);
}

/**
 * モデルの、ルートのデータの中のたどり方を引く。データの場所のモデルでなければ undefined
 */
export function _getModelSegments(
  model: object,
): readonly Segment[] | undefined {
  return registry.get(model);
}
