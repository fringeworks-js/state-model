import type {
  ReadonlyModel,
  RecordId,
  RecordModel,
  RefreshMode,
  UnknownModel,
} from '../types';

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

  /**
   * 相対的なキーと id のパスで、下位のモデルを取り出す（最初の段は行の id）
   */
  at(path: readonly RecordId[]): UnknownModel;
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

  /**
   * 上流が変わったときに、絞り込みを当て直すか（既定は `'auto'`）。
   * `'manual'` なら、結果に入る行を保つ（条件から外れた行も残る。上流に足された行は条件を当てずに入れる）
   */
  filterRefresh?: RefreshMode;

  /**
   * 上流が変わったときに、並べ替えを当て直すか（既定は `'auto'`）。
   * `'manual'` なら、行の並び順を保つ（新しく入った行は末尾に足す）
   */
  sortRefresh?: RefreshMode;
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
   * 上流からの相対的なキーと id のパスで、下位のモデルを取り出す（上流に取り次ぐ。最初の段は行の id）。
   * 結果に含まれない行も指す。空のパスなら、データの場所を持つ上流の List のモデルを返す
   */
  at(path: readonly RecordId[]): UnknownModel;

  /**
   * 絞り込みの条件を差し替える。undefined を渡すと条件を外す
   */
  setFilter(filter: DerivedListOptions<E>['filter']): void;

  /**
   * 並べ替えの条件を差し替える。undefined を渡すと条件を外す（上流の順に戻る）
   */
  setSort(sort: DerivedListOptions<E>['sort']): void;

  /**
   * 絞り込みを当て直すかを差し替える
   */
  setFilterRefresh(filterRefresh: RefreshMode): void;

  /**
   * 並べ替えを当て直すかを差し替える
   */
  setSortRefresh(sortRefresh: RefreshMode): void;

  /**
   * 今の条件を当て直す（当て直さないモードで保っていた結果を、作り直す）
   */
  refresh(): void;
}
