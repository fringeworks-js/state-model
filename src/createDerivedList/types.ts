import type { ReadonlyModel, RecordId, RecordModel } from '../types';

/**
 * 派生モデルの上流になれる一覧（`ListModel`・`DerivedList`）
 */
export interface ListSource<E> extends ReadonlyModel<readonly E[] | undefined> {
  /**
   * id の並び
   */
  ids(): ReadonlyModel<readonly string[]>;

  /**
   * id の行の Record のモデル
   */
  record(id: RecordId): RecordModel<E, true>;

  /**
   * id の行をすべて消す
   */
  remove(ids: readonly RecordId[]): void;
}

/**
 * `createDerivedList` のオプション
 */
export type DerivedListOptions<E> = {
  /**
   * 絞り込みの条件。行を受け取り、残すなら true を返す
   */
  filter?: (record: E) => boolean;

  /**
   * 並べ替えの条件。`Array.prototype.sort` と同じ比較の関数
   */
  sort?: (a: E, b: E) => number;
};

/**
 * 標準の派生モデル（一覧を絞り込み・並べ替えた結果）
 */
export interface DerivedList<
  E,
  S extends ListSource<E> = ListSource<E>,
> extends ReadonlyModel<readonly E[]> {
  /**
   * つないだ上流のモデル
   */
  readonly source: S;

  /**
   * 結果の id の並び。結果の行の並びが変わったときだけ値が変わる
   */
  ids(): ReadonlyModel<readonly string[]>;

  /**
   * 上流の id の行の Record のモデル（上流から取り出したものと同じオブジェクト。結果に含まれない行も指す）
   */
  record(id: RecordId): RecordModel<E, true>;

  /**
   * id の行をすべて消す（上流に取り次ぐ）
   */
  remove(ids: readonly RecordId[]): void;

  /**
   * 絞り込みの条件を差し替える。undefined を渡すと条件を外す
   */
  setFilter(filter: DerivedListOptions<E>['filter']): void;

  /**
   * 並べ替えの条件を差し替える。undefined を渡すと条件を外す（上流の順に戻る）
   */
  setSort(sort: DerivedListOptions<E>['sort']): void;
}
