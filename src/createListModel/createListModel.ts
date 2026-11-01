import _createRootModel from '../_internal/_createRootModel';
import type { AnyDefinition, ModelOptions } from '../_types';
import type { ListDefinition, ListModel, ModelRoot } from '../types';
import type { ListModelOptions } from './types';

/**
 * List を根にしたモデルを作る（一覧など）
 *
 * - 非制御: `{ defaultData }` を渡すと、データを中に持つ
 * - 制御: `{ data, onChangeData }` を渡すと、書き込みを `onChangeData` で持ち主に依頼する。
 *   持ち主が新しいデータを渡し直したら `receive` で受け取る
 *
 * @param definition List の定義
 * @param options データの持ち方
 * @returns 根のモデル
 */
export default function createListModel<E>(
  definition: ListDefinition<E>,
  options: ListModelOptions<E>,
): ListModel<E> & ModelRoot<readonly E[]> {
  return _createRootModel(
    definition as AnyDefinition,
    options as ModelOptions<unknown>,
  ) as ListModel<E> & ModelRoot<readonly E[]>;
}
