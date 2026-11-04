import _createRootModel from '../_internal/_createRootModel';
import type { AnyDefinition, ModelOptions } from '../_types';
import type { ModelRoot, RecordDefinition, RecordModel } from '../types';
import type { RecordModelOptions } from './types';

/**
 * Record のルートのモデルを作る（フォームなど）
 *
 * - 非制御: `{ defaultData }` を渡すと、データを中に持つ
 * - 制御: `{ data, onDataChange }` を渡すと、書き込みを `onDataChange` でデータの持ち主に依頼する。
 *   データの持ち主が新しいデータを渡し直したら `receive` で受け取る
 *
 * @param definition Record の定義
 * @param options データの持ち方
 * @returns ルートのモデル
 */
export default function createRecordModel<T>(
  definition: RecordDefinition<T>,
  options: RecordModelOptions<T>,
): RecordModel<T> & ModelRoot<T> {
  return _createRootModel(
    definition as AnyDefinition,
    options as ModelOptions<unknown>,
  ) as RecordModel<T> & ModelRoot<T>;
}
