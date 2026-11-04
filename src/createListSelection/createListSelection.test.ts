import createDerivedList from '../createDerivedList';
import createFieldModel from '../createFieldModel';
import createListModel from '../createListModel';
import createListSelection from './createListSelection';

type Item = { id: string; price: number };

function createItems() {
  return createListModel<Item>(
    { kind: 'list', record: { kind: 'record' } },
    {
      defaultData: [
        { id: 'A', price: 100 },
        { id: 'B', price: 200 },
        { id: 'C', price: 300 },
      ],
    },
  );
}

describe('createListSelection', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('単一選択', () => {
    it('select は差し替える。toggle で外す', () => {
      const items = createItems();
      const selection = createListSelection(items);
      selection.select('A');
      selection.select('B');
      expect(selection.get()).toEqual(['B']);
      expect(selection.has('B')).toBe(true);
      expect(selection.has('A')).toBe(false);
      selection.toggle('B');
      expect(selection.get()).toEqual([]);
    });

    it('selectAll は何もせず警告し、set に複数渡すと最初の1つだけ選ぶ', () => {
      const items = createItems();
      const selection = createListSelection(items);
      selection.selectAll();
      expect(selection.get()).toEqual([]);
      selection.set(['C', 'A']);
      expect(selection.get()).toEqual(['C']);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('複数選択', () => {
    it('選んだ順に足し、外し、全部選び、全部外す', () => {
      const items = createItems();
      const selection = createListSelection(items, { multiple: true });
      selection.select('C');
      selection.select('A');
      expect(selection.get()).toEqual(['C', 'A']);
      selection.deselect('C');
      expect(selection.get()).toEqual(['A']);
      selection.selectAll();
      expect(selection.get()).toEqual(['A', 'B', 'C']);
      selection.clear();
      expect(selection.get()).toEqual([]);
    });

    it('records() は選んだ行を選んだ順で返し、行の中身の変化も映す', () => {
      const items = createItems();
      const selection = createListSelection(items, { multiple: true });
      selection.set(['C', 'A']);
      expect(
        selection
          .records()
          .get()
          .map((item) => item.id),
      ).toEqual(['C', 'A']);
      items.record('A').field('price').set(1);
      expect(selection.records().get()[1]!.price).toBe(1);
      expect(selection.records()).toBe(selection.records());
    });

    it('set に前の選択を受け取る関数を渡せる', () => {
      const items = createItems();
      const selection = createListSelection(items, { multiple: true });
      selection.set(['A']);
      selection.set((prev) => [...prev, 'B']);
      expect(selection.get()).toEqual(['A', 'B']);
    });
  });

  describe('上流に無い行', () => {
    it('上流に無い id は選ばず、警告する', () => {
      const items = createItems();
      const selection = createListSelection(items);
      selection.select('Z');
      expect(selection.get()).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('消えた行は読めなくなるが、同じ id で戻れば選択も戻る。removeMissing で置き場所から外す', () => {
      const items = createItems();
      const selectedIds = createFieldModel<readonly string[]>(
        {},
        { defaultData: [] },
      );
      const selection = createListSelection(items, {
        multiple: true,
        selectedIds,
      });
      selection.set(['A', 'B']);
      items.remove(['A']);
      expect(selection.get()).toEqual(['B']);
      expect(selectedIds.get()).toEqual(['A', 'B']);
      items.insert([{ id: 'A', price: 1 }]);
      expect(selection.get()).toEqual(['A', 'B']);
      items.remove(['A']);
      selection.removeMissing();
      expect(selectedIds.get()).toEqual(['B']);
    });

    it('派生モデルにつなぐと、見えている行の中で選んだものだけを読む', () => {
      const items = createItems();
      const visible = createDerivedList(items, {
        filter: (item) => item.price >= 200,
      });
      const selectedIds = createFieldModel<readonly string[]>(
        {},
        { defaultData: ['A', 'B'] },
      );
      const ofAll = createListSelection(items, { multiple: true, selectedIds });
      const ofVisible = createListSelection(visible, {
        multiple: true,
        selectedIds,
      });
      expect(ofAll.get()).toEqual(['A', 'B']);
      expect(ofVisible.get()).toEqual(['B']);
      visible.setFilter(undefined);
      expect(ofVisible.get()).toEqual(['A', 'B']);
    });
  });

  describe('通知と置き場所', () => {
    it('選択が変わったら知らせ、上流の関係の無い変化では知らせない', () => {
      const items = createItems();
      const selection = createListSelection(items, { multiple: true });
      const listener = vi.fn();
      selection.subscribe(listener);
      selection.select('A');
      expect(listener).toHaveBeenCalledWith({
        value: ['A'],
        previousValue: [],
      });
      items.record('B').field('price').set(1);
      expect(listener).toHaveBeenCalledTimes(1);
      // 同じ id を選んでも、置き場所は変わらず知らせない
      selection.select('A');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('置き場所を共有すると、別々の選択のモデルから同じ選択を操作できる', () => {
      const items = createItems();
      const selectedIds = createFieldModel<readonly string[]>(
        {},
        { defaultData: [] },
      );
      const a = createListSelection(items, { selectedIds });
      const b = createListSelection(items, { selectedIds });
      a.select('C');
      expect(b.get()).toEqual(['C']);
    });

    it('制御の置き場所なら、書き込みを持ち主に依頼し、続けて書いても前の変更を消さない', () => {
      const items = createItems();
      const changes: (readonly string[])[] = [];
      const selectedIds = createFieldModel<readonly string[]>(
        {},
        { data: [], onDataChange: (ids) => changes.push(ids) },
      );
      const selection = createListSelection(items, {
        multiple: true,
        selectedIds,
      });
      selection.select('A');
      selection.select('B');
      expect(changes[changes.length - 1]).toEqual(['A', 'B']);
      // 持ち主が渡し直すまで、選択は変わらない
      expect(selection.get()).toEqual([]);
    });
  });
});
