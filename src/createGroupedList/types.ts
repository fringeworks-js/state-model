import type { ListSource } from '../createDerivedList';
import type { ReadonlyModel, RecordId, RecordModel } from '../types';

/**
 * グループ化した派生モデルの、1つのグループ
 */
export type ListGroup<K, E> = {
  /**
   * グループのキー（`groupBy` で取り出した値）
   */
  readonly key: K;

  /**
   * グループの行（上流での順）
   */
  readonly records: readonly E[];

  /**
   * グループの行の id の並び（id の無い行・重複した id の後の行は含めない）
   */
  readonly ids: readonly string[];
};

/**
 * グループの分け方: キーの名前か、行からキーを取り出す関数
 */
export type GroupBy<E, K> = (keyof E & string) | ((record: E) => K);

/**
 * `createGroupedList` のオプション
 */
export type GroupedListOptions<E, K> = {
  /**
   * グループの分け方。キーの名前か、行からキーを取り出す関数
   */
  groupBy: GroupBy<E, K>;

  /**
   * グループの絞り込みの条件。グループを受け取り、残すなら true を返す
   */
  filterGroups?: (group: ListGroup<K, E>) => boolean;

  /**
   * グループの並べ替えの条件。グループを2つ受け取る比較の関数（既定は上流での出現順）
   */
  sortGroups?: (a: ListGroup<K, E>, b: ListGroup<K, E>) => number;
};

/**
 * グループ化した派生モデル（一覧をグループに分けた結果）
 */
export interface GroupedList<
  K,
  E,
  S extends ListSource<E> = ListSource<E>,
> extends ReadonlyModel<readonly ListGroup<K, E>[]> {
  /**
   * つないだ上流のモデル
   */
  readonly source: S;

  /**
   * 上流の id の行の Record のモデル（上流から取り出したものと同じオブジェクト）
   */
  record(id: RecordId): RecordModel<E, true>;

  /**
   * id の行をすべて消す（上流に取り次ぐ）
   */
  remove(ids: readonly RecordId[]): void;

  /**
   * グループの分け方を差し替える
   */
  setGroupBy(groupBy: GroupBy<E, K>): void;

  /**
   * グループの絞り込みの条件を差し替える。undefined を渡すと条件を外す
   */
  setFilterGroups(filterGroups: GroupedListOptions<E, K>['filterGroups']): void;

  /**
   * グループの並べ替えの条件を差し替える。undefined を渡すと条件を外す（上流での出現順に戻る）
   */
  setSortGroups(sortGroups: GroupedListOptions<E, K>['sortGroups']): void;
}
