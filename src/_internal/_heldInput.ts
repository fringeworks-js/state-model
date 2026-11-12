import type { ListModel, ReadonlyModel } from '../types';
import type { DerivedSource } from './_createDerivedModel';
import type { IdOf } from './_createIdOf';

/**
 * 当て直さないモードを持つ派生モデルが、結果を作るときに受け取る値
 */
export type HeldInput<E> = {
  /** 上流の行 */
  readonly rows: readonly E[] | undefined;
  /**
   * 元の一覧の行。当て直さないモードで、上流が外した行の最新の中身を引くのに使う。
   * 上流が元の一覧そのもののときと、当て直さないモードでないときは undefined
   */
  readonly originRows: readonly E[] | undefined;
};

/**
 * 上流のモデルを一覧のモデルとして扱うための型（派生モデルが受け取る上流の、必要な部分だけ）
 */
type ListLike = {
  at(path: readonly never[]): { readonly kind: string };
};

/**
 * 派生モデルの段のすぐ下にある List のモデル（元の一覧）を返す
 *
 * `at([])` は、データの場所を持つ上流の List のモデルを返す（派生モデルを重ねても、元の一覧まで取り次がれる）
 */
export function _getOriginList<E>(
  source: ListLike,
): ListModel<E, true> | undefined {
  const model = source.at([]);
  return model.kind === 'list'
    ? (model as unknown as ListModel<E, true>)
    : undefined;
}

/**
 * 上流の行と、必要なときだけ元の一覧の行を組にしたモデルを作る
 *
 * - 元の一覧の行は、`isWatching()` が真のとき（当て直さないモードのとき）だけ読む。
 *   すぐ当て直すモードでは、元の一覧が変わっても上流が変わらなければ結果を作り直さない
 * - 上流か元の一覧が変わったら知らせる。組は、どちらも前と同じなら同じオブジェクトを返す
 *
 * @param source 上流のモデル
 * @param origin 元の一覧。上流と同じなら読まない
 * @param isWatching 元の一覧の行を読むか
 */
export function _createHeldInput<E>(
  source: ReadonlyModel<readonly E[] | undefined>,
  origin: ReadonlyModel<readonly E[] | undefined> | undefined,
  isWatching: () => boolean,
): DerivedSource<HeldInput<E>> {
  const separateOrigin =
    origin !== undefined && origin !== source ? origin : undefined;
  let cache: HeldInput<E> | undefined;
  const get = (): HeldInput<E> => {
    const rows = source.get();
    const originRows =
      separateOrigin !== undefined && isWatching()
        ? separateOrigin.get()
        : undefined;
    if (
      cache === undefined ||
      cache.rows !== rows ||
      cache.originRows !== originRows
    ) {
      cache = { rows, originRows };
    }
    return cache;
  };
  return {
    get,
    subscribe: (listener: () => void) => {
      const unsubscribeSource = source.subscribe(listener);
      const unsubscribeOrigin = separateOrigin?.subscribe(listener);
      return () => {
        unsubscribeSource();
        unsubscribeOrigin?.();
      };
    },
  };
}

/**
 * 元の一覧の行を id で引く関数を作る。表は初めて引いたときに作る（上流が外した行があるときだけ費用がかかる）
 */
export function _createRowLookup<E>(
  originRows: readonly E[],
  idOf: IdOf,
): (id: unknown) => E | undefined {
  let map: Map<string, E> | undefined;
  return (id) => {
    if (map === undefined) {
      map = new Map();
      for (const row of originRows) {
        const rowId = idOf(row);
        if (rowId !== undefined && !map.has(rowId)) {
          map.set(rowId, row);
        }
      }
    }
    return typeof id === 'string' ? map.get(id) : undefined;
  };
}
