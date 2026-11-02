import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
  ReadonlyModel,
  RecordId,
  ValidationIssue,
  ValidationIssueInput,
  ValidationResult,
} from '../types';

/**
 * 検証のモデルにつなげるモデル（Field・Record・List のモデル。ルートでも下位でもよい）
 */
export type ModelValidationSource = ReadonlyModel<unknown> & {
  readonly kind: 'field' | 'record' | 'list';
};

/**
 * `createModelValidation` のオプション
 */
export type ModelValidationOptions<V> = {
  /**
   * つないだモデル全体の規則。Standard Schema（zod・valibot など）か、値を受け取って結果を返す関数。
   * 結果のパスは、つないだモデルからの相対パス
   */
  validate?: StandardSchemaV1 | ((value: V) => ValidationResult);
};

/**
 * `setIssues`・`setIssuesAt` のオプション
 */
export type SetIssuesOptions = {
  /**
   * そのパスの値が、入れたときと違う間は結果を読まない（サーバーのエラーを、直したら消えるようにする）
   */
  clearOnChange?: boolean;
};

/**
 * 検証のモデル
 *
 * パスは、つないだモデルからの相対的なキーと id のパス。省略すると、つないだモデル全体を指す
 */
export interface ModelValidation<
  M extends ModelValidationSource = ModelValidationSource,
> {
  /**
   * つないだモデル
   */
  readonly source: M;

  /**
   * そのパスちょうどの結果を読むモデル（同じパスなら同じオブジェクト）。
   * 規則の結果と、外から入れた結果をまとめたもの
   */
  issues(path?: readonly RecordId[]): ReadonlyModel<readonly ValidationIssue[]>;

  /**
   * そのパスか、その下のどこかに結果があるかを読むモデル（同じパスなら同じオブジェクト）
   */
  invalid(path?: readonly RecordId[]): ReadonlyModel<boolean>;

  /**
   * 外から入れる結果（サーバーのエラーなど）を、出どころごと丸ごと置き換える。
   * 結果のパスは、つないだモデルからの相対パス
   */
  setIssues(
    origin: string,
    issues: readonly ValidationIssueInput[],
    options?: SetIssuesOptions,
  ): void;

  /**
   * 外から入れる結果を、出どころの1つのパスだけ置き換える
   */
  setIssuesAt(
    origin: string,
    path: readonly RecordId[],
    issues: readonly ValidationIssue[],
    options?: SetIssuesOptions,
  ): void;

  /**
   * 外から入れた結果を消す。出どころを省略すると、すべての出どころの結果を消す
   */
  clearIssues(origin?: string): void;
}
