import { lineDefinition, type Line } from '../_internal/_fixtures';
import createListModel from './createListModel';

const lines: Line[] = [
  { lineId: 'L-1', product: 'P1', price: 100 },
  { lineId: 'L-2', product: 'P2', price: 200 },
];

describe('createListModel', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('List を根にして読み書きする', () => {
    const list = createListModel(
      { kind: 'list', id: 'lineId', record: lineDefinition },
      { defaultData: lines },
    );
    expect(list.kind).toBe('list');
    expect(list.path).toEqual([]);
    expect(list.ids().get()).toEqual(['L-1', 'L-2']);
    list.record('L-2').field('price').set(999);
    list.insert([{ lineId: 'L-3', product: 'P3', price: 300 }]);
    list.remove(['L-1']);
    expect(list.get()).toEqual([
      { lineId: 'L-2', product: 'P2', price: 999 },
      { lineId: 'L-3', product: 'P3', price: 300 },
    ]);
    // 元のデータは書き換えない
    expect(lines[1]!.price).toBe(200);
  });

  it('id を関数で取り出せる', () => {
    const list = createListModel(
      {
        kind: 'list',
        id: (line) => `${line.lineId}/${line.product}`,
        record: lineDefinition,
      },
      { defaultData: lines },
    );
    expect(list.ids().get()).toEqual(['L-1/P1', 'L-2/P2']);
    expect(list.at(['L-1/P1', 'price']).get()).toBe(100);
  });

  it('重複した id は先にある方を指し、ids() に含めない', () => {
    const list = createListModel(
      { kind: 'list', id: 'lineId', record: lineDefinition },
      {
        defaultData: [
          { lineId: 'A', product: 'first', price: 1 },
          { lineId: 'A', product: 'second', price: 2 },
        ],
      },
    );
    expect(list.ids().get()).toEqual(['A']);
    expect(list.record('A').get()?.product).toBe('first');
    expect(warnSpy).toHaveBeenCalled();
  });
});
