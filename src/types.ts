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

  /**
   * このモデルからの相対的なキーと id のパスで、下位のモデルを取り出す。
   * モデルの種類は定義をたどって実行時に決める（戻り値は `kind` で絞り込む）
   */
  at(path: readonly RecordId[]): UnknownModel;
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

  /**
   * このモデルからの相対的なキーと id のパスで、下位のモデルを取り出す。
   * モデルの種類は定義をたどって実行時に決める（戻り値は `kind` で絞り込む）
   */
  at(path: readonly RecordId[]): UnknownModel;
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
   * 外からデータを受け取る（制御のとき）。データの持ち主が渡し直したデータを受け取り、変わった所の購読者に知らせる
   *
   * `silent` を指定すると、データは受け取るが購読者には知らせない。知らせていない変化は、次の `receive` で
   * （データが同じでも）知らせる。React の描画の中で受け取り、描画の後に知らせるときに使う
   */
  receive(data: D, options?: ModelReceiveOptions): void;
}

/**
 * `receive` のオプション
 */
export type ModelReceiveOptions = {
  /**
   * データを受け取るが、購読者には知らせない（次の `receive` で知らせる）
   */
  silent?: boolean;
};

// ---------------------------------------------------------------------------
// 検証の結果
// ---------------------------------------------------------------------------

/**
 * 検証の結果の1つ（Standard Schema の issue と同じ最小の形）\
 * 利用者が足したプロパティ（翻訳用のコードなど）は、そのまま保つ
 */
export type ValidationIssue = {
  readonly message: string;
  readonly [key: string]: unknown;
};

/**
 * 規則が返す・外から入れる、検証の結果の1つ\
 * `path` は、規則を書いた所（入れるときはつないだモデル）からの相対的なキーと id のパス。省略すると、その所自身
 */
export type ValidationIssueInput = ValidationIssue & {
  readonly path?: readonly RecordId[];
};

/**
 * 規則が返すもの
 *
 * - 文字列: その所自身の結果のメッセージ1つ
 * - 配列: 結果の一覧（パスを付けると、下の所の結果にできる）
 * - `undefined`・空の配列: 問題なし
 */
export type ValidationResult =
  string | readonly ValidationIssueInput[] | undefined;

// ---------------------------------------------------------------------------
// 定義
// ---------------------------------------------------------------------------

/**
 * Field の定義
 */
export interface FieldDefinition<V = unknown> {
  kind?: 'field';
  /**
   * 値の規則（検証のモデルが使う）。値が無いとき（省略できる項目など）は `undefined` を受け取る
   */
  validate?: (value: V) => ValidationResult;
}

/**
 * Record の定義
 */
export interface RecordDefinition<T> {
  kind: 'record';
  fields?: { [K in keyof T]?: DefinitionOf<T[K]> };
  /**
   * Record の規則（検証のモデルが使う）。項目をまたぐ検査を書く。結果のパスは Record からの相対パス。
   * Record が無いとき（省略できる入れ子など）は呼ばない
   */
  validate?: (record: T) => ValidationResult;
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
  /**
   * List の規則（検証のモデルが使う）。行をまたぐ検査（件数・重複など）を書く。結果のパスは List からの相対パス（最初の段は行の id）。
   * List が無いとき（省略できる List）は呼ばない
   */
  validate?: (records: readonly E[]) => ValidationResult;
} & ListIdOption<E>;

/**
 * 値の型に合う定義（Field・Record・List のどれか）
 */
export type DefinitionOf<V> =
  | FieldDefinition<V>
  | (IsPlainObject<NonNullable<V>> extends true
      ? RecordDefinition<NonNullable<V>>
      : never)
  | ([ListItemOf<V>] extends [never] ? never : ListDefinition<ListItemOf<V>>);

// ---------------------------------------------------------------------------
// 派生モデル
// ---------------------------------------------------------------------------

/**
 * 派生モデルが、上流が変わったときに条件を当て直すか
 *
 * - `'auto'`: すぐ当て直す
 * - `'manual'`: 当て直さず、前の結果を保つ（`refresh()` か、条件を差し替えたときに当て直す）
 */
export type RefreshMode = 'auto' | 'manual';
