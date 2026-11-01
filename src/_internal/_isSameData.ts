import { hasOwn } from '@fringeworks/utils';

/**
 * 素のオブジェクトか（`Object.prototype` か `null` を親に持つもの。`Date` などの組み込みのオブジェクトやクラスのインスタンスを除く）
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * 2つのデータの中身が同じか（変更済みかの判定に使う）
 *
 * - 参照が同じなら、すぐ同じとする（構造の共有で、変わっていない部分はここで止まる）
 * - 違えば、配列は要素ごとに、素のオブジェクトはキーごとに、同じ規則で比べ直す
 * - それ以外（数値・文字列・`Date` など）は `Object.is` で比べる
 */
export default function _isSameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, index) => _isSameData(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => hasOwn(b, key) && _isSameData(a[key], b[key]))
    );
  }
  return false;
}
