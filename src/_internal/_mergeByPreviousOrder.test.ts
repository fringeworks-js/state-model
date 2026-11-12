import _mergeByPreviousOrder from './_mergeByPreviousOrder';

const keyOf = (item: string) => item;

describe('_mergeByPreviousOrder', () => {
  it('上流に無い要素が無ければ、上流の順のまま', () => {
    expect(_mergeByPreviousOrder(['b', 'a'], [], ['a', 'b'], keyOf)).toEqual([
      'b',
      'a',
    ]);
  });

  it('上流に無い要素は、前の並びで直前にあった要素の後ろに置く', () => {
    // 前は a, x, b, y。x と y が上流から外れ、上流では b, a の順になった
    expect(
      _mergeByPreviousOrder(
        ['b', 'a'],
        ['x', 'y'],
        ['a', 'x', 'b', 'y'],
        keyOf,
      ),
    ).toEqual(['b', 'y', 'a', 'x']);
  });

  it('直前に上流にある要素が無ければ先頭に置く', () => {
    expect(
      _mergeByPreviousOrder(['a'], ['x', 'y'], ['x', 'y', 'a'], keyOf),
    ).toEqual(['x', 'y', 'a']);
  });

  it('前の並びに無い要素は末尾に置く', () => {
    expect(
      _mergeByPreviousOrder(['a', 'b'], ['n', 'x'], ['a', 'x', 'b'], keyOf),
    ).toEqual(['a', 'x', 'b', 'n']);
  });
});
