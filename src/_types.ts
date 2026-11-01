/**
 * 素のオブジェクトとして扱う値か（配列・関数・組み込みのオブジェクトを除く）
 */
export type IsPlainObject<V> = [V] extends [readonly unknown[]]
  ? false
  : [V] extends [(...args: never[]) => unknown]
    ? false
    : [V] extends [Date | RegExp | Map<unknown, unknown> | Set<unknown>]
      ? false
      : [V] extends [object]
        ? true
        : false;

/**
 * オブジェクトの配列の要素の型（List になれる配列でなければ never）
 */
export type ListItemOf<V> =
  NonNullable<V> extends readonly (infer E)[]
    ? IsPlainObject<E> extends true
      ? E
      : never
    : never;

/**
 * undefined・null になりうるか
 */
export type IsMaybe<V> = undefined extends V
  ? true
  : null extends V
    ? true
    : false;

/**
 * 2つの「無いかもしれない」を合わせる
 */
export type Or<A extends boolean, B extends boolean> = A extends true
  ? true
  : B;

/**
 * M が true なら undefined を足す
 */
export type MaybeMissing<V, M extends boolean> = M extends true
  ? V | undefined
  : V;

/**
 * ルートのモデルを作るときのオプション（名前は仮。値と操作の契約の名前と一緒に決める）
 *
 * - 非制御: `defaultData` を受け取って中に持つ
 * - 制御: `data` を参照し、書き込みは `onChangeData` でデータの持ち主に依頼する。データの持ち主が渡し直したデータは `receive` で受け取る
 */
export type ModelOptions<D> =
  { defaultData: D } | { data: D; onChangeData: (data: D) => void };

/**
 * 実行時に扱う定義（型を外したもの）
 */
export type AnyDefinition =
  | { kind?: 'field' }
  | { kind: 'record'; fields?: Record<string, AnyDefinition | undefined> }
  | {
      kind: 'list';
      id?: string | ((record: never) => unknown);
      record?: AnyDefinition;
    };

/**
 * モデルの種類
 */
export type ModelKind = 'field' | 'record' | 'list';
