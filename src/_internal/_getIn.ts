import type { IdOf } from './_createIdOf';
import _getListIndex from './_getListIndex';
import _isRecordLike from './_isRecordLike';

/**
 * 住所の1段を、たどり方つきで表したもの\
 * モデルは作るときに定義から決めて持つので、たどるときに定義を見なくてよい
 */
export type Segment =
  | { readonly type: 'key'; readonly key: string }
  | {
      readonly type: 'id';
      /** 有効でない id で指したときは undefined（どの行も指さない） */
      readonly id: string | undefined;
      readonly idOf: IdOf;
    };

/**
 * 住所の値を読む。指す先が無ければ undefined
 */
export default function _getIn(
  data: unknown,
  segments: readonly Segment[],
): unknown {
  let current = data;
  for (const segment of segments) {
    if (segment.type === 'key') {
      current = _isRecordLike(current) ? current[segment.key] : undefined;
    } else {
      if (!Array.isArray(current) || segment.id === undefined) {
        return undefined;
      }
      const index = _getListIndex(current, segment.idOf).indexById.get(
        segment.id,
      );
      current = index === undefined ? undefined : current[index];
    }
  }
  return current;
}
