import type { ReadonlyModel, RecordId, UnknownModel } from '../types';

/**
 * 状態のモデルにつなげるモデル（Record・List のモデル。ルートでも下位でもよい）
 */
export type ModelStatusSource = ReadonlyModel<unknown> & {
  readonly kind: 'record' | 'list';
  at(path: readonly RecordId[]): UnknownModel;
};

/**
 * 状態のモデル（変更済みか）
 *
 * パスは、つないだモデルからの相対的なキーと id のパス。省略すると、つないだモデル全体を指す
 */
export interface ModelStatus<M extends ModelStatusSource = ModelStatusSource> {
  /**
   * つないだモデル
   */
  readonly source: M;

  /**
   * 変更済みかを読むモデル（同じパスなら同じオブジェクト）。
   * 基準のデータと今のデータの、そのパスの値を比べる（参照が同じならすぐ同じとし、違えば中身で比べる）。
   * 親のパスは、下のどこかが変わっていれば変更済み
   */
  dirty(path?: readonly RecordId[]): ReadonlyModel<boolean>;

  /**
   * 基準のデータを今のデータに置き直す（保存した後など）。変更済みはすべて外れる
   */
  markClean(): void;
}
