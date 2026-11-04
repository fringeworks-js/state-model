import _createIdOf, { type IdOf } from './_createIdOf';

/**
 * 一覧のモデル（List のモデル・派生モデル）から、行の id の取り出し方を引く表\
 * 表で持つ理由は `_modelSegments` と同じ（派生モデル・選択のモデルが、上流と同じ id の取り出し方を使うため）
 */
const registry = new WeakMap<object, IdOf>();

/**
 * 一覧のモデルの、行の id の取り出し方を登録する
 */
export function _setListIdOf(model: object, idOf: IdOf): void {
  registry.set(model, idOf);
}

/**
 * 一覧のモデルの、行の id の取り出し方を引く。登録されていなければ既定の `'id'` で読む
 */
export function _getListIdOf(model: object): IdOf {
  return registry.get(model) ?? _createIdOf();
}
