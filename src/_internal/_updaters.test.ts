import _createIdOf from './_createIdOf';
import {
  _createInsertUpdater,
  _createRemoveUpdater,
  _createSetUpdater,
  _createUpdateRecordUpdater,
} from './_updaters';

const idOf = _createIdOf('lineId');

describe('_updaters', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('set: 値か、前の値を受け取る関数', () => {
    expect(_createSetUpdater(1)(0)).toBe(1);
    expect(_createSetUpdater((prev: number) => prev + 1)(1)).toBe(2);
  });

  it('update: 変わったキーだけ。変化が無ければ元のまま。Record が無ければ書かない', () => {
    const record = { a: 1, b: 2 };
    const update = (values: Record<string, unknown>) =>
      _createUpdateRecordUpdater(values)(record);
    expect(update({ a: 1 })).toBe(record);
    expect(update({ a: 3 })).toEqual({ a: 3, b: 2 });
    expect(update({ b: undefined })).toEqual({ a: 1, b: undefined });
    expect(_createUpdateRecordUpdater({ a: 1 })(undefined)).toHaveProperty(
      'reason',
    );
  });

  it('insert: 重複・有効でない id は足さずに警告。List が無ければ作る', () => {
    const list = [{ lineId: 'A' }];
    const insert = _createInsertUpdater(idOf, [
      { lineId: 'A' },
      { lineId: 'B' },
      { lineId: 'B' },
      { lineId: null },
    ]);
    expect(insert(list)).toEqual([{ lineId: 'A' }, { lineId: 'B' }]);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(_createInsertUpdater(idOf, [{ lineId: 'A' }])(undefined)).toEqual([
      { lineId: 'A' },
    ]);
    expect(_createInsertUpdater(idOf, [{ lineId: 'A' }])(list)).toBe(list);
  });

  it('remove: 同じ id の行をすべて消す。無い id なら元のまま', () => {
    const list = [{ lineId: 'A' }, { lineId: 'B' }, { lineId: 'A' }];
    expect(_createRemoveUpdater(idOf, ['A'])(list)).toEqual([{ lineId: 'B' }]);
    expect(_createRemoveUpdater(idOf, ['Z'])(list)).toBe(list);
    const numeric = [{ lineId: 3 }];
    expect(_createRemoveUpdater(idOf, [3])(numeric)).toEqual([]);
    expect(_createRemoveUpdater(idOf, ['3'])(numeric)).toEqual([]);
  });
});
