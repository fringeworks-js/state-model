import _normalizeId from './_normalizeId';

/**
 * 行から id を取り出す関数（文字列に揃えたもの。有効でなければ undefined）
 */
export type IdOf = (record: unknown) => string | undefined;

const idOfByKey = new Map<string, IdOf>();
const idOfByFunction = new WeakMap<(record: never) => unknown, IdOf>();

/**
 * List の定義の `id`（キーの名前か、取り出す関数）から IdOf を作る\
 * 同じ指定には同じ関数を返す（索引のキャッシュのキーにするため）
 */
export default function _createIdOf(
  option: string | ((record: never) => unknown) = 'id',
): IdOf {
  if (typeof option === 'string') {
    let idOf = idOfByKey.get(option);
    if (!idOf) {
      idOf = (record) =>
        typeof record === 'object' && record !== null
          ? _normalizeId((record as Record<string, unknown>)[option])
          : undefined;
      idOfByKey.set(option, idOf);
    }
    return idOf;
  }
  let idOf = idOfByFunction.get(option);
  if (!idOf) {
    idOf = (record) => _normalizeId(option(record as never));
    idOfByFunction.set(option, idOf);
  }
  return idOf;
}
