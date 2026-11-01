import type { ReadonlyModel, RecordId, UnknownModel } from '../types';

/**
 * 状態のモデルにつなげるモデル（Record・List のモデル。ルートでも下位でもよい）
 */
export type ModelStatusSource = ReadonlyModel<unknown> & {
  readonly kind: 'record' | 'list';
  at(path: readonly RecordId[]): UnknownModel;
};

/**
 * 状態のモデル（変更済みか・触ったか）
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
   * 基準のデータと今のデータの、そのパスの値を `Object.is` で比べる。親のパスは、下のどこかが変わっていれば変更済み
   */
  dirty(path?: readonly RecordId[]): ReadonlyModel<boolean>;

  /**
   * 触ったかを読むモデル（同じパスなら同じオブジェクト）。そのパスか、その下のどこかを触っていれば true
   */
  touched(path?: readonly RecordId[]): ReadonlyModel<boolean>;

  /**
   * 触ったことにする（UI が、フォーカスが外れたときなどに呼ぶ）
   */
  touch(path: readonly RecordId[]): void;

  /**
   * 基準のデータを今のデータに置き直す（保存した後など）。変更済みはすべて外れる
   */
  markClean(): void;

  /**
   * 触ったことをすべて外す
   */
  clearTouched(): void;

  /**
   * `markClean()` と `clearTouched()` の両方
   */
  reset(): void;
}
