import _createIdOf from './_createIdOf';
import _getListIndex from './_getListIndex';

const idOf = _createIdOf('lineId');

describe('_getListIndex', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('重複は先にある方、有効でない id の行は含めず、警告する', () => {
    const list = [
      { lineId: 'A' },
      { lineId: 'B' },
      { lineId: 'A' },
      { lineId: undefined },
      { lineId: 1 },
      { lineId: '1' },
    ];
    const index = _getListIndex(list, idOf);
    expect(index.ids).toEqual(['A', 'B', '1']);
    expect(index.indexById.get('A')).toBe(0);
    expect(index.indexById.get('1')).toBe(4);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('同じ配列ならキャッシュを使い、作り直さない', () => {
    const list = [{ lineId: 'A' }];
    expect(_getListIndex(list, idOf)).toBe(_getListIndex(list, idOf));
  });

  it('同じ id の指定には同じ IdOf を返す', () => {
    expect(_createIdOf('lineId')).toBe(idOf);
    const fn = (record: { a: string }) => record.a;
    expect(_createIdOf(fn)).toBe(_createIdOf(fn));
  });
});
