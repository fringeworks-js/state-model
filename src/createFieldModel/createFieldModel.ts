import _createRootModel from '../_internal/_createRootModel';
import type { AnyDefinition, ModelOptions } from '../_types';
import type { FieldDefinition, FieldModel, ModelRoot } from '../types';
import type { FieldModelOptions } from './types';

/**
 * Field のルートのモデルを作る（単独の入力など）
 *
 * - 非制御: `{ defaultData }` を渡すと、データを中に持つ
 * - 制御: `{ data, onChangeData }` を渡すと、書き込みを `onChangeData` でデータの持ち主に依頼する。
 *   データの持ち主が新しいデータを渡し直したら `receive` で受け取る
 *
 * @param definition Field の定義
 * @param options データの持ち方
 * @returns ルートのモデル
 */
export default function createFieldModel<V>(
  definition: FieldDefinition<V>,
  options: FieldModelOptions<V>,
): FieldModel<V> & ModelRoot<V> {
  return _createRootModel(
    definition as AnyDefinition,
    options as ModelOptions<unknown>,
  ) as FieldModel<V> & ModelRoot<V>;
}
