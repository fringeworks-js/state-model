/**
 * Record としてキーでたどれる値か（配列は List なのでキーではたどらない）
 */
export default function _isRecordLike(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
