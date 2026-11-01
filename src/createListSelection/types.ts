import type { ListSource } from '../createDerivedList';
import type { FieldModel, ReadonlyModel, RecordId } from '../types';

/**
 * `createListSelection` のオプション
 */
export type ListSelectionOptions = {
  /**
   * 複数の行を選べるようにする（既定は単一選択）
   */
  multiple?: boolean;

  /**
   * 選んだ id を置くモデル。渡さなければ選択のモデルの中に持つ。
   * 制御（URL・親の state）にしたいときや、データの中の項目に選択を持たせたいときに、Field のモデルを渡す
   */
  selectedIds?: FieldModel<readonly string[], boolean>;
};

/**
 * 一覧の選択のモデル
 */
export interface ListSelection<
  E,
  S extends ListSource<E> = ListSource<E>,
> extends ReadonlyModel<readonly string[]> {
  /**
   * つないだ上流のモデル
   */
  readonly source: S;

  /**
   * 選択を丸ごと差し替える。前の選択を受け取る関数も渡せる
   */
  set(
    ids:
      readonly RecordId[] | ((prev: readonly string[]) => readonly RecordId[]),
  ): void;

  /**
   * 選ぶ。単一選択なら差し替え、複数選択なら足す。上流に無い id は選ばない
   */
  select(id: RecordId): void;

  /**
   * 外す
   */
  deselect(id: RecordId): void;

  /**
   * 選んでいれば外し、選んでいなければ選ぶ
   */
  toggle(id: RecordId): void;

  /**
   * 上流の行をすべて選ぶ（複数選択のときだけ）
   */
  selectAll(): void;

  /**
   * すべて外す
   */
  clear(): void;

  /**
   * 選んでいるか（上流に無い行は選んでいないものとして扱う）
   */
  has(id: RecordId): boolean;

  /**
   * 選んだ行を読むモデル（選んだ順）
   */
  records(): ReadonlyModel<readonly E[]>;

  /**
   * 上流に無い id を、選んだ id の置き場所から外す
   */
  removeMissing(): void;
}
