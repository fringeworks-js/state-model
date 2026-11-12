import _isSameData from './_isSameData';

describe('_isSameData', () => {
  it('参照が同じなら同じ', () => {
    const data = { a: [1] };
    expect(_isSameData(data, data)).toBe(true);
    expect(_isSameData(NaN, NaN)).toBe(true);
  });

  it('素のオブジェクトと配列は中身で比べる', () => {
    expect(
      _isSameData({ a: 1, b: [1, { c: 2 }] }, { a: 1, b: [1, { c: 2 }] }),
    ).toBe(true);
    expect(_isSameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(_isSameData([1, 2], [2, 1])).toBe(false);
    expect(_isSameData([1], [1, 2])).toBe(false);
  });

  it('キーが無いことと、値が undefined のキーとは別', () => {
    expect(_isSameData({ a: undefined }, {})).toBe(false);
    expect(_isSameData({ a: undefined }, { b: undefined })).toBe(false);
  });

  it('Date は時刻で比べる', () => {
    expect(_isSameData(new Date(0), new Date(0))).toBe(true);
    expect(_isSameData({ at: new Date(0) }, { at: new Date(0) })).toBe(true);
    expect(_isSameData(new Date(0), new Date(1))).toBe(false);
    expect(_isSameData(new Date(NaN), new Date(NaN))).toBe(true);
    expect(_isSameData(new Date(0), 0)).toBe(false);
  });

  it('Date 以外の組み込みのオブジェクトとクラスのインスタンスは参照で比べる', () => {
    class Point {
      readonly x: number;
      constructor(x: number) {
        this.x = x;
      }
    }
    expect(_isSameData(new Point(1), new Point(1))).toBe(false);
    expect(_isSameData(new Map(), new Map())).toBe(false);
    expect(_isSameData(0, '0')).toBe(false);
  });
});
