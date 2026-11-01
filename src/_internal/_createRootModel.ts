import type { AnyDefinition, ModelKind, ModelOptions } from '../_types';
import type {
  ModelRoot,
  ReadonlyModel,
  RecordId,
  UnknownModel,
} from '../types';
import _createChildCache from './_createChildCache';
import _createIdOf, { type IdOf } from './_createIdOf';
import _createNotifier from './_createNotifier';
import _getIn, { type Segment } from './_getIn';
import _getListIndex from './_getListIndex';
import _normalizeId from './_normalizeId';
import _updateIn, { type Updater } from './_updateIn';
import {
  _createInsertUpdater,
  _createRemoveUpdater,
  _createSetUpdater,
  _createUpdateRecordUpdater,
} from './_updaters';
import _warn from './_warn';

/**
 * 反映待ちのデータが無いことを表す
 */
const NONE = Symbol('none');

/**
 * 根の中身: データの置き場所（制御・非制御）と通知
 */
type RootCore = {
  read(): unknown;
  write(segments: readonly Segment[], updater: Updater): void;
  subscribe: ReturnType<typeof _createNotifier>['subscribe'];
};

/**
 * 子のモデルを作るメソッドを、名前で引けるようにしたもの（at() でたどるため）
 */
type Traversable = Record<string, (key: RecordId) => object>;

const EMPTY_IDS: readonly string[] = Object.freeze([]);

function kindOf(definition: AnyDefinition | undefined): ModelKind | undefined {
  return definition === undefined ? undefined : (definition.kind ?? 'field');
}

function fieldDefinitionOf(
  definition: AnyDefinition | undefined,
  key: string,
): AnyDefinition | undefined {
  return definition?.kind === 'record' ? definition.fields?.[key] : undefined;
}

function formatPath(path: readonly RecordId[]): string {
  return `[${path.join(', ')}]`;
}

/**
 * 定義があり、呼び方と食い違うときだけ警告する
 */
function checkKind(
  definition: AnyDefinition | undefined,
  kind: ModelKind,
  path: readonly string[],
): void {
  const defined = kindOf(definition);
  if (defined !== undefined && defined !== kind) {
    _warn(`${formatPath(path)} is defined as ${defined}, but used as ${kind}.`);
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * モデルを作る。メソッドは this に頼らない（取り出しても動く）
 */
function createModel(
  root: RootCore,
  kind: ModelKind,
  segments: readonly Segment[],
  path: readonly string[],
  definition: AnyDefinition | undefined,
): object {
  const frozenPath = Object.freeze(path);
  const children = _createChildCache();
  const get = () => _getIn(root.read(), segments);
  const set = (value: unknown) =>
    root.write(segments, _createSetUpdater(value));
  const subscribe: ReadonlyModel<unknown>['subscribe'] = (listener) =>
    root.subscribe(get, listener);
  const base = { kind, path: frozenPath, get, set, subscribe };

  if (kind === 'field') {
    return base;
  }

  if (kind === 'record') {
    const child = (childKind: ModelKind, key: string) =>
      children.get(`${childKind}\u0000${key}`, () => {
        const childDefinition = fieldDefinitionOf(definition, key);
        const childPath = [...path, key];
        if (childKind !== 'field') {
          checkKind(childDefinition, childKind, childPath);
        }
        return createModel(
          root,
          childKind,
          [...segments, { type: 'key', key }],
          childPath,
          childDefinition,
        );
      });
    return {
      ...base,
      update: (values: Record<string, unknown>) =>
        root.write(segments, _createUpdateRecordUpdater(values)),
      field: (key: string) => child('field', key),
      record: (key: string) => child('record', key),
      list: (key: string) => child('list', key),
    };
  }

  const listDefinition = definition?.kind === 'list' ? definition : undefined;
  const idOf: IdOf = _createIdOf(listDefinition?.id);
  // 並びが同じなら前に返した配列を返すため、最後に返した配列を覚えておく
  let lastIds = EMPTY_IDS;
  const getIds = () => {
    const list = get();
    const ids = Array.isArray(list) ? _getListIndex(list, idOf).ids : EMPTY_IDS;
    if (!sameIds(ids, lastIds)) {
      lastIds = ids;
    }
    return lastIds;
  };
  const idsModel: ReadonlyModel<readonly string[]> = {
    get: getIds,
    subscribe: (listener) =>
      root.subscribe(getIds, listener as Parameters<RootCore['subscribe']>[1]),
  };
  return {
    ...base,
    insert: (records: readonly unknown[]) =>
      root.write(segments, _createInsertUpdater(idOf, records)),
    remove: (ids: readonly RecordId[]) =>
      root.write(segments, _createRemoveUpdater(idOf, ids)),
    record: (id: RecordId) => {
      const normalized = _normalizeId(id);
      if (normalized === undefined) {
        _warn(`Tried to reach a record with an invalid id (${String(id)}).`);
      }
      return children.get(`id\u0000${normalized}`, () =>
        createModel(
          root,
          'record',
          [...segments, { type: 'id', id: normalized, idOf }],
          [...path, normalized ?? ''],
          listDefinition?.record,
        ),
      );
    },
    ids: () => children.get('ids', () => idsModel),
  };
}

/**
 * 住所の配列からモデルを作る
 *
 * - 定義をたどって層を決める。List の中では id、Record の中ではキー
 * - 定義が無い所はキーでたどり（Record として扱う）、最後の段は Field にする
 */
function at(
  rootModel: object,
  rootKind: ModelKind,
  rootDefinition: AnyDefinition,
  path: readonly RecordId[],
): UnknownModel {
  let model = rootModel as Traversable;
  let kind: ModelKind = rootKind;
  let definition: AnyDefinition | undefined = rootDefinition;
  path.forEach((step, index) => {
    const last = index === path.length - 1;
    if (kind === 'list') {
      model = model.record!(step) as Traversable;
      kind = 'record';
      definition = definition?.kind === 'list' ? definition.record : undefined;
      return;
    }
    if (kind === 'field') {
      _warn(`${formatPath(path)} goes below a field.`);
    }
    const key = String(step);
    const childDefinition = fieldDefinitionOf(definition, key);
    let childKind = kindOf(childDefinition);
    if (childKind === undefined) {
      childKind = last ? 'field' : 'record';
    } else if (childKind === 'field' && !last) {
      _warn(`${formatPath(path)} goes below a field in the definition.`);
      childKind = 'record';
    }
    model = model[childKind]!(key) as Traversable;
    if (childDefinition === undefined && !last) {
      warnIfList(model as unknown as ReadonlyModel<unknown>, path);
    }
    kind = childKind;
    definition = childDefinition;
  });
  return model as unknown as UnknownModel;
}

function warnIfList(
  model: ReadonlyModel<unknown>,
  path: readonly RecordId[],
): void {
  if (Array.isArray(model.get())) {
    _warn(
      `${formatPath(path)} goes through a list without a definition. A definition is required to reach records of a list by path.`,
    );
  }
}

/**
 * 根のモデルを作る（非制御・制御）
 *
 * 制御のときは、書き込みを「反映待ちのデータ」に積み、onChangeData で持ち主に渡す。
 * 反映待ちのデータは、外から受け取ったとき（receive）か、次のマクロタスクで捨てる
 */
export default function _createRootModel(
  definition: AnyDefinition,
  options: ModelOptions<unknown>,
): object {
  const notifier = _createNotifier();
  const controlled = 'onChangeData' in options;
  let data: unknown = controlled ? options.data : options.defaultData;
  let pending: unknown = NONE;
  let resetScheduled = false;

  const core: RootCore = {
    read: () => data,
    write(segments, updater) {
      const base = pending === NONE ? data : pending;
      const result = _updateIn(base, segments, updater);
      if (!result.ok) {
        _warn(`Nothing was written: ${result.reason}`);
        return;
      }
      if (result.data === base) {
        return;
      }
      if (!controlled) {
        data = result.data;
        notifier.notify();
        return;
      }
      pending = result.data;
      if (!resetScheduled) {
        resetScheduled = true;
        setTimeout(() => {
          resetScheduled = false;
          pending = NONE;
        }, 0);
      }
      options.onChangeData(result.data);
    },
    subscribe: notifier.subscribe,
  };

  const rootKind = kindOf(definition) ?? 'field';
  const rootModel = createModel(core, rootKind, [], [], definition);

  const rootOnly: ModelRoot<unknown> = {
    at: (path) => at(rootModel, rootKind, definition, path),
    receive: (next) => {
      if (!controlled) {
        _warn('An uncontrolled model does not receive data.');
        return;
      }
      pending = NONE;
      if (Object.is(next, data)) {
        return;
      }
      data = next;
      notifier.notify();
    },
  };
  return Object.assign(rootModel, rootOnly);
}
