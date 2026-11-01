import type { ModelOptions } from '../_types';

/**
 * `createListModel` のオプション（`data` / `defaultData` / `onChangeData` の名前は仮）
 */
export type ListModelOptions<E> = ModelOptions<readonly E[]>;
