import type { StandardSchemaV1 } from '@standard-schema/spec';
import _combineModels from '../_internal/_combineModels';
import _createChildCache from '../_internal/_createChildCache';
import _createDerivedModel, {
  type DerivedCompute,
} from '../_internal/_createDerivedModel';
import _createIdOf from '../_internal/_createIdOf';
import type { NotifierSubscribe } from '../_internal/_createNotifier';
import _createStore from '../_internal/_createStore';
import _getListIndex from '../_internal/_getListIndex';
import _isRecordLike from '../_internal/_isRecordLike';
import _isSameData from '../_internal/_isSameData';
import { _getModelDefinition } from '../_internal/_modelDefinitions';
import { _getModelSegments } from '../_internal/_modelSegments';
import _warn from '../_internal/_warn';
import type { AnyDefinition } from '../_types';
import type {
  ReadonlyModel,
  RecordId,
  ValidationIssue,
  ValidationIssueInput,
} from '../types';
import type {
  ModelValidation,
  ModelValidationOptions,
  ModelValidationSource,
  SetIssuesOptions,
} from './types';

/**
 * パス（文字列の配列）に付いた、1つの結果
 */
type Found = {
  readonly path: readonly string[];
  readonly issue: ValidationIssue;
};

/**
 * 外から入れた、1つのパスの結果
 */
type Report = {
  readonly path: readonly string[];
  readonly issues: readonly ValidationIssue[];
  /** clearOnChange のとき、入れたときのそのパスの値 */
  readonly base?: { readonly value: unknown };
};

/**
 * 外から入れた結果の全体（出どころ → パスのキー → 結果）
 */
type Reports = ReadonlyMap<string, ReadonlyMap<string, Report>>;

/**
 * パスのキー → そのパスちょうどの結果
 */
type IssueTable = ReadonlyMap<
  string,
  { readonly path: readonly string[]; readonly issues: ValidationIssue[] }
>;

const EMPTY_FOUND: readonly Found[] = Object.freeze([]);
const EMPTY_ISSUES: readonly ValidationIssue[] = Object.freeze([]);

/**
 * 定義の規則の結果のキャッシュ（Record・List の値 → 定義 → その値からの相対的な結果）\
 * 構造の共有で、変わっていない Record・List は同じ参照のまま残るので、変わった枝の規則だけを走らせる
 */
const ruleCache = new WeakMap<object, WeakMap<object, readonly Found[]>>();

function normalizePath(path: readonly RecordId[]): readonly string[] {
  return path.map((step) => String(step));
}

function toKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function startsWith(path: readonly string[], prefix: readonly string[]) {
  return (
    path.length >= prefix.length &&
    prefix.every((step, index) => step === path[index])
  );
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * 結果の `path` を外し、読む口で返す形にする（足したプロパティは保つ）
 */
function toIssue(input: ValidationIssueInput): ValidationIssue {
  const { path: _path, ...issue } = input;
  return issue;
}

/**
 * 規則が返したもの（文字列・結果の配列・undefined）を、相対的な結果の一覧にする
 */
function toFound(result: unknown): readonly Found[] {
  if (result === undefined) {
    return EMPTY_FOUND;
  }
  if (typeof result === 'string') {
    return [{ path: [], issue: { message: result } }];
  }
  if (isThenable(result)) {
    _warn(
      'A validation rule returned a Promise. Rules must be synchronous; set the results of asynchronous validation with setIssues.',
    );
    return EMPTY_FOUND;
  }
  if (!Array.isArray(result)) {
    _warn('A validation rule returned an unsupported value.');
    return EMPTY_FOUND;
  }
  return (result as readonly ValidationIssueInput[]).map((input) => ({
    path: normalizePath(input.path ?? []),
    issue: toIssue(input),
  }));
}

function prefixed(step: string, found: readonly Found[]): readonly Found[] {
  return found.map(({ path, issue }) => ({ path: [step, ...path], issue }));
}

function runRule(
  validate: ((value: never) => unknown) | undefined,
  value: unknown,
): readonly Found[] {
  return validate ? toFound(validate(value as never)) : EMPTY_FOUND;
}

/**
 * 定義の規則を、値とその下に当てる（結果のパスは、その値からの相対パス）
 *
 * - Field の規則は、値が無くても呼ぶ（必須の検査のため）
 * - Record・List の規則とその下は、値が Record・List のときだけ当てる
 * - List の行は、id で指せる行だけに当てる
 */
function evaluateRules(
  definition: AnyDefinition | undefined,
  value: unknown,
): readonly Found[] {
  if (definition === undefined) {
    return EMPTY_FOUND;
  }
  if (definition.kind === undefined || definition.kind === 'field') {
    return runRule(definition.validate, value);
  }
  if (
    definition.kind === 'record' ? !_isRecordLike(value) : !Array.isArray(value)
  ) {
    return EMPTY_FOUND;
  }
  const target = value as object;
  let byDefinition = ruleCache.get(target);
  const cached = byDefinition?.get(definition);
  if (cached) {
    return cached;
  }

  const found: Found[] = [...runRule(definition.validate, value)];
  if (definition.kind === 'record') {
    const record = value as Record<string, unknown>;
    for (const [key, fieldDefinition] of Object.entries(
      definition.fields ?? {},
    )) {
      found.push(...prefixed(key, evaluateRules(fieldDefinition, record[key])));
    }
  } else if (definition.kind === 'list') {
    const list = value as readonly unknown[];
    const index = _getListIndex(list, _createIdOf(definition.id), true);
    for (const id of index.ids) {
      const row = list[index.indexById.get(id)!];
      found.push(...prefixed(id, evaluateRules(definition.record, row)));
    }
  }

  if (!byDefinition) {
    byDefinition = new WeakMap();
    ruleCache.set(target, byDefinition);
  }
  byDefinition.set(definition, found);
  return found;
}

/**
 * Standard Schema の結果のパス（配列の添字を含む）を、キーと id のパスに変える
 *
 * 定義で List とした配列の添字は、その行の id にする。
 * id で指せない行や、定義の無い配列（値の配列の Field など）に入るところで止め、そこまでのパスにする
 */
function toIdPath(
  data: unknown,
  definition: AnyDefinition | undefined,
  rawPath: readonly (PropertyKey | StandardSchemaV1.PathSegment)[],
): readonly string[] {
  const path: string[] = [];
  let current = data;
  let currentDefinition = definition;
  for (const segment of rawPath) {
    const key = typeof segment === 'object' ? segment.key : segment;
    if (typeof key === 'symbol') {
      break;
    }
    if (currentDefinition?.kind === 'list') {
      const index = Number(key);
      if (!Array.isArray(current) || !Number.isInteger(index)) {
        break;
      }
      const idOf = _createIdOf(currentDefinition.id);
      const row: unknown = current[index];
      const id = idOf(row);
      if (
        id === undefined ||
        _getListIndex(current, idOf, true).indexById.get(id) !== index
      ) {
        break;
      }
      path.push(id);
      current = row;
      currentDefinition = currentDefinition.record;
      continue;
    }
    if (Array.isArray(current)) {
      break;
    }
    const step = String(key);
    path.push(step);
    current = _isRecordLike(current) ? current[step] : undefined;
    currentDefinition =
      currentDefinition?.kind === 'record'
        ? currentDefinition.fields?.[step]
        : undefined;
  }
  return path;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === 'object' && value !== null && '~standard' in value;
}

/**
 * つないだモデル全体の規則（オプションの validate）を当てる
 */
function evaluateOption(
  validate: NonNullable<ModelValidationOptions<unknown>['validate']>,
  definition: AnyDefinition | undefined,
  value: unknown,
): readonly Found[] {
  if (!isStandardSchema(validate)) {
    return toFound(validate(value));
  }
  const result = validate['~standard'].validate(value);
  if (isThenable(result)) {
    _warn(
      'The schema validated asynchronously. Schemas must be synchronous; set the results of asynchronous validation with setIssues.',
    );
    return EMPTY_FOUND;
  }
  const { issues } = result as StandardSchemaV1.Result<unknown>;
  if (!issues) {
    return EMPTY_FOUND;
  }
  return issues.map(({ path, ...issue }) => ({
    path: toIdPath(value, definition, path ?? []),
    issue,
  }));
}

/**
 * データの中で、相対的なキーと id のパスをたどる。
 * 途中の Record・行が無ければ exists が false（最後の段の値が undefined なのは、あるものとする）
 */
function resolvePath(
  data: unknown,
  definition: AnyDefinition | undefined,
  path: readonly string[],
): { readonly exists: boolean; readonly value: unknown } {
  let current = data;
  let currentDefinition = definition;
  for (const step of path) {
    if (currentDefinition?.kind === 'list') {
      if (!Array.isArray(current)) {
        return { exists: false, value: undefined };
      }
      const index = _getListIndex(
        current,
        _createIdOf(currentDefinition.id),
        true,
      ).indexById.get(step);
      if (index === undefined) {
        return { exists: false, value: undefined };
      }
      current = current[index];
      currentDefinition = currentDefinition.record;
      continue;
    }
    if (!_isRecordLike(current)) {
      return { exists: false, value: undefined };
    }
    current = current[step];
    currentDefinition =
      currentDefinition?.kind === 'record'
        ? currentDefinition.fields?.[step]
        : undefined;
  }
  return { exists: true, value: current };
}

function toReadonlyModel<O>(derived: {
  get: () => O;
  subscribe: NotifierSubscribe;
}): ReadonlyModel<O> {
  return {
    get: derived.get,
    subscribe: (listener) =>
      derived.subscribe(
        derived.get,
        listener as Parameters<typeof derived.subscribe>[1],
      ),
  };
}

/**
 * 検証のモデルを作る
 *
 * - 規則の結果: 定義の `validate` と、オプションの `validate`（Standard Schema か関数）を、今のデータに当てた結果。
 *   データから導くので、いつも今のデータに対する結果になる（読まれたときだけ作り直す）
 * - 外から入れた結果: `setIssues`・`setIssuesAt` で、出どころの名前ごとに置く（サーバーのエラーなど）。
 *   今のデータに無いパスの結果は読まない（同じ id の行が戻れば、また読める）
 * - いつ結果を見せるかは UI が決める
 *
 * @param source つなぐモデル（Field・Record・List のモデル。ルートでも下位でもよい）
 * @param options オプション
 * @returns 検証のモデル
 */
export default function createModelValidation<M extends ModelValidationSource>(
  source: M,
  options?: ModelValidationOptions<
    M extends ReadonlyModel<infer V> ? V : unknown
  >,
): ModelValidation<M> {
  if (_getModelSegments(source) === undefined) {
    _warn(
      'createModelValidation needs a model of a data location (a root model or a child model), not a derived model.',
    );
  }
  const definition = _getModelDefinition(source);
  const optionValidate = options?.validate as
    ModelValidationOptions<unknown>['validate'] | undefined;
  const reports = _createStore<Reports>(new Map());

  // オプションの規則の結果は、データが同じなら使い回す（外から入れた結果だけが変わったとき）
  let lastOption: { data: unknown; found: readonly Found[] } | undefined;
  const evaluateWhole = (data: unknown): readonly Found[] => {
    const found = [...evaluateRules(definition, data)];
    if (
      optionValidate !== undefined &&
      (source.kind === 'field' || data !== undefined)
    ) {
      if (lastOption === undefined || !Object.is(lastOption.data, data)) {
        lastOption = {
          data,
          found: evaluateOption(optionValidate, definition, data),
        };
      }
      found.push(...lastOption.found);
    }
    return found;
  };

  const table = _createDerivedModel<
    readonly [unknown, Reports],
    null,
    IssueTable
  >(_combineModels(source, reports.model), null, ([data, current]) => {
    const result = new Map<
      string,
      { path: readonly string[]; issues: ValidationIssue[] }
    >();
    const add = (path: readonly string[], issue: ValidationIssue) => {
      const key = toKey(path);
      const entry = result.get(key);
      if (entry) {
        entry.issues.push(issue);
      } else {
        result.set(key, { path, issues: [issue] });
      }
    };
    for (const { path, issue } of evaluateWhole(data)) {
      add(path, issue);
    }
    for (const byPath of current.values()) {
      for (const report of byPath.values()) {
        const resolved = resolvePath(data, definition, report.path);
        if (
          !resolved.exists ||
          (report.base && !_isSameData(resolved.value, report.base.value))
        ) {
          continue;
        }
        for (const issue of report.issues) {
          add(report.path, issue);
        }
      }
    }
    return result;
  });
  const tableModel = toReadonlyModel(table);

  const issuesCache = _createChildCache();
  const invalidCache = _createChildCache();

  const issues = (path: readonly RecordId[] = []) => {
    const key = toKey(normalizePath(path));
    return issuesCache.get(key, () => {
      const compute: DerivedCompute<
        IssueTable,
        null,
        readonly ValidationIssue[]
      > = (current, _state, previous) => {
        const next = current.get(key)?.issues ?? EMPTY_ISSUES;
        // 作り直した結果が前と同じ中身なら、前の配列を返す（購読者を呼ばない）
        return previous && _isSameData(previous.output, next)
          ? previous.output
          : next;
      };
      return toReadonlyModel(_createDerivedModel(tableModel, null, compute));
    });
  };

  const invalid = (path: readonly RecordId[] = []) => {
    const normalized = normalizePath(path);
    return invalidCache.get(toKey(normalized), () =>
      toReadonlyModel(
        _createDerivedModel(tableModel, null, (current: IssueTable) =>
          [...current.values()].some((entry) =>
            startsWith(entry.path, normalized),
          ),
        ),
      ),
    );
  };

  const toReport = (
    path: readonly string[],
    reportIssues: readonly ValidationIssue[],
    setOptions: SetIssuesOptions | undefined,
  ): Report => {
    if (!setOptions?.clearOnChange) {
      return { path, issues: reportIssues };
    }
    const { value } = resolvePath(source.get(), definition, path);
    return { path, issues: reportIssues, base: { value } };
  };

  const replaceOrigin = (
    origin: string,
    byPath: ReadonlyMap<string, Report> | undefined,
  ) => {
    const current = reports.model.get();
    if (byPath === undefined && !current.has(origin)) {
      return;
    }
    const next = new Map(current);
    if (byPath === undefined) {
      next.delete(origin);
    } else {
      next.set(origin, byPath);
    }
    reports.set(next);
  };

  return {
    source,
    issues,
    invalid,
    setIssues: (origin, inputs, setOptions) => {
      const grouped = new Map<
        string,
        { path: readonly string[]; issues: ValidationIssue[] }
      >();
      for (const input of inputs) {
        const path = normalizePath(input.path ?? []);
        const key = toKey(path);
        const entry = grouped.get(key);
        if (entry) {
          entry.issues.push(toIssue(input));
        } else {
          grouped.set(key, { path, issues: [toIssue(input)] });
        }
      }
      const byPath = new Map<string, Report>();
      for (const [key, entry] of grouped) {
        byPath.set(key, toReport(entry.path, entry.issues, setOptions));
      }
      replaceOrigin(origin, byPath.size > 0 ? byPath : undefined);
    },
    setIssuesAt: (origin, path, pathIssues, setOptions) => {
      const normalized = normalizePath(path);
      const key = toKey(normalized);
      const current = reports.model.get().get(origin);
      if (pathIssues.length === 0 && !current?.has(key)) {
        return;
      }
      const byPath = new Map(current);
      if (pathIssues.length === 0) {
        byPath.delete(key);
      } else {
        byPath.set(
          key,
          toReport(normalized, pathIssues.map(toIssue), setOptions),
        );
      }
      replaceOrigin(origin, byPath.size > 0 ? byPath : undefined);
    },
    clearIssues: (origin) => {
      if (origin !== undefined) {
        replaceOrigin(origin, undefined);
      } else if (reports.model.get().size > 0) {
        reports.set(new Map());
      }
    },
  };
}
