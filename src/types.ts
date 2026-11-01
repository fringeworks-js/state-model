import type {
  IsMaybe,
  IsPlainObject,
  ListItemOf,
  MaybeMissing,
  Or,
} from './_types';

/**
 * List の Record の id として渡せる値\
 * 中では文字列に揃える（`3` と `'3'` は同じ id）
 */
export type RecordId = string | number;

/**
 * キーと id のパス\
 * ルートのモデルのデータの中で値がどこにあるかを、Record のキーと List の id を順に並べた配列で表したもの。id は文字列に揃える
 */
export type ModelPath = readonly string[];

/**
 * `list()` に渡せるキー（オブジェクトの配列を持つキー）
 */
export type ListKeys<T> = {
  [K in keyof T]-?: [ListItemOf<T[K]>] extends [never] ? never : K;
}[keyof T] &
  string;

/**
 * `record()` に渡せるキー（素のオブジェクトを持つキー）
 */
export type RecordKeys<T> = {
  [K in keyof T]-?: IsPlainObject<NonNullable<T[K]>> extends true ? K : never;
}[keyof T] &
  string;

/**
 * `field()` に渡せるキー（すべてのキー）
 */
export type FieldKeys<T> = keyof T & string;

// ---------------------------------------------------------------------------
// 読む・購読する
// ---------------------------------------------------------------------------

/**
 * 購読の listener に渡すもの
 */
export type ModelChangeEvent<V> = {
  /** listener を呼ぶ時点の `get()` の値 */
  readonly value: V;
  /** その listener に前回渡した値（最初の通知では、購読した時点の値） */
  readonly previousValue: V;
};

/**
 * 購読の listener
 */
export type ModelListener<V> = (event: ModelChangeEvent<V>) => void;

/**
 * 読んで購読できるもの\
 * `ListModel` などの土台で、`ids()` の戻り値もこの型
 */
export interface ReadonlyModel<V> {
  /**
   * 値を読む。変化が無ければ同じ参照を返す
   */
  get(): V;

  /**
   * 購読する。`get()` の値（参照）が変わったら listener を呼ぶ
   * @returns 購読を解除する関数
   */
  subscribe(listener: ModelListener<V>): () => void;
}

// ---------------------------------------------------------------------------
// 3種類のモデル
// ---------------------------------------------------------------------------

/**
 * 3種類に共通の口（読む・書く・購読する）\
 * M が true のときは、モデルが指すデータが無いかもしれない（`get()` が undefined を含む）
 */
interface ModelBase<V, M extends boolean> extends ReadonlyModel<
  MaybeMissing<V, M>
> {
  /**
   * ルートのモデルからのキーと id のパス（凍結している）
   */
  readonly path: ModelPath;

  /**
   * 書く。前の値を受け取って新しい値を返す関数も渡せる
   */
  set(value: V | ((prev: MaybeMissing<V, M>) => V)): void;
}

/**
 * Field のモデル
 */
export interface FieldModel<V, M extends boolean = false> extends ModelBase<
  V,
  M
> {
  readonly kind: 'field';
}

/**
 * Record のモデル
 */
export interface RecordModel<T, M extends boolean = false> extends ModelBase<
  T,
  M
> {
  readonly kind: 'record';

  /**
   * 複数の Field をまとめて変える。変わったキーだけを反映する
   */
  update(values: Partial<T>): void;

  /**
   * Field のモデル
   */
  field<K extends FieldKeys<T>>(key: K): FieldModel<T[K], M>;

  /**
   * 入れ子の Record のモデル
   */
  record<K extends RecordKeys<T>>(
    key: K,
  ): RecordModel<NonNullable<T[K]>, Or<M, IsMaybe<T[K]>>>;

  /**
   * 入れ子の List のモデル
   */
  list<K extends ListKeys<T>>(
    key: K,
  ): ListModel<ListItemOf<T[K]>, Or<M, IsMaybe<T[K]>>>;
}

/**
 * List のモデル
 */
export interface ListModel<E, M extends boolean = false> extends ModelBase<
  readonly E[],
  M
> {
  readonly kind: 'list';

  /**
   * 末尾に足す。id がすでにあるもの・有効でないものは足さない
   */
  insert(records: readonly E[]): void;

  /**
   * id の行をすべて消す
   */
  remove(ids: readonly RecordId[]): void;

  /**
   * id の行の Record のモデル（行が消えているかもしれないので、常に「無いかもしれない」）
   */
  record(id: RecordId): RecordModel<E, true>;

  /**
   * id の並び。行の中身が変わっただけなら同じ配列を返す
   */
  ids(): ReadonlyModel<readonly string[]>;
}

/**
 * キーと id のパスから作ったモデル（型は推論しない。`kind` で絞り込む）
 */
export type UnknownModel =
  | FieldModel<unknown, true>
  | RecordModel<Record<string, unknown>, true>
  | ListModel<Record<string, unknown>, true>;

/**
 * ルートのモデルだけが持つもの
 */
export interface ModelRoot<D> {
  /**
   * キーと id のパスからモデルを作る。モデルの種類は定義をたどって実行時に決める
   */
  at(path: readonly RecordId[]): UnknownModel;

  /**
   * 外からデータを受け取る（制御のとき）。データの持ち主が渡し直したデータを受け取り、変わった所の購読者に知らせる
   */
  receive(data: D): void;
}

// ---------------------------------------------------------------------------
// 定義
// ---------------------------------------------------------------------------

/**
 * Field の定義
 */
export interface FieldDefinition {
  kind?: 'field';
}

/**
 * Record の定義
 */
export interface RecordDefinition<T> {
  kind: 'record';
  fields?: { [K in keyof T]?: DefinitionOf<T[K]> };
}

/**
 * List の id の指定。要素に id のキーがあるときだけ省略できる
 */
type ListIdOption<E> = 'id' extends keyof E
  ? { id?: (keyof E & string) | ((record: E) => unknown) }
  : { id: (keyof E & string) | ((record: E) => unknown) };

/**
 * List の定義
 */
export type ListDefinition<E> = {
  kind: 'list';
  record: RecordDefinition<E>;
} & ListIdOption<E>;

/**
 * 値の型に合う定義（Field・Record・List のどれか）
 */
export type DefinitionOf<V> =
  | FieldDefinition
  | (IsPlainObject<NonNullable<V>> extends true
      ? RecordDefinition<NonNullable<V>>
      : never)
  | ([ListItemOf<V>] extends [never] ? never : ListDefinition<ListItemOf<V>>);
