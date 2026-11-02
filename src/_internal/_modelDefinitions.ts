import type { AnyDefinition } from '../_types';

/**
 * データの場所のモデル（ルートのモデル・下位のモデル）から、そのモデルの定義を引く表
 */
const registry = new WeakMap<object, AnyDefinition | undefined>();

/**
 * モデルの定義を登録する（定義が無い所のモデルは undefined）
 */
export function _setModelDefinition(
  model: object,
  definition: AnyDefinition | undefined,
): void {
  registry.set(model, definition);
}

/**
 * モデルの定義を引く。定義が無い所のモデルや、データの場所のモデルでなければ undefined
 */
export function _getModelDefinition(model: object): AnyDefinition | undefined {
  return registry.get(model);
}
