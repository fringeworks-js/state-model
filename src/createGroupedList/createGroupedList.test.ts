import createDerivedList from '../createDerivedList';
import createListModel from '../createListModel';
import createGroupedList from './createGroupedList';

type Item = { id: string; category: string; price: number };

/**
 * 6行・3カテゴリー（I-1・I-4 が C-1、I-2・I-5 が C-2、I-3・I-6 が C-3）
 */
function createItems() {
  return createListModel<Item>(
    { kind: 'list', record: { kind: 'record' } },
    {
      defaultData: Array.from({ length: 6 }, (_, index) => ({
        id: `I-${index + 1}`,
        category: `C-${(index % 3) + 1}`,
        price: (index + 1) * 100,
      })),
    },
  );
}

const total = (records: readonly Item[]) =>
  records.reduce((sum, item) => sum + item.price, 0);
const keys = (groups: readonly { key: unknown }[]) =>
  groups.map((group) => group.key);

describe('createGroupedList', () => {
  describe('グループに分ける', () => {
    it('キーの名前で分け、上流での最初の出現順に並べる。行は上流と同じ参照', () => {
      const items = createItems();
      const grouped = createGroupedList(items, { groupBy: 'category' });
      const groups = grouped.get();
      expect(keys(groups)).toEqual(['C-1', 'C-2', 'C-3']);
      expect(groups[0]!.ids).toEqual(['I-1', 'I-4']);
      expect(groups[0]!.records[0]).toBe(items.get()[0]);
    });

    it('関数で分けられる', () => {
      const items = createItems();
      const grouped = createGroupedList(items, {
        groupBy: (item) => item.price >= 400,
      });
      const flags: boolean[] = keys(grouped.get()) as boolean[];
      expect(flags).toEqual([false, true]);
    });

    it('上流が空なら空の配列', () => {
      const items = createListModel<Item>(
        { kind: 'list', record: { kind: 'record' } },
        { defaultData: [] },
      );
      expect(createGroupedList(items, { groupBy: 'category' }).get()).toEqual(
        [],
      );
    });
  });

  describe('同一性', () => {
    it('中身が変わらないグループは同じオブジェクトのまま。変化が無ければ同じ配列', () => {
      const items = createItems();
      const grouped = createGroupedList(items, { groupBy: 'category' });
      const [c1, c2, c3] = grouped.get();
      items.record('I-2').field('price').set(999);
      const next = grouped.get();
      expect(next[0]).toBe(c1);
      expect(next[1]).not.toBe(c2);
      expect(next[2]).toBe(c3);
      expect(grouped.get()).toBe(next);
    });

    it('グループの条件を外すと、グループに分けただけの結果をそのまま返す', () => {
      const items = createItems();
      const plain = createGroupedList(items, { groupBy: 'category' }).get();
      const grouped = createGroupedList(items, {
        groupBy: 'category',
        filterGroups: () => true,
        sortGroups: () => 0,
      });
      const arranged = grouped.get();
      grouped.setFilterGroups(undefined);
      grouped.setSortGroups(undefined);
      const all = grouped.get();
      // 中身はグループに分けただけの結果と同じで、絞り込み・並べ替えた配列とは別の配列
      expect(all).not.toBe(arranged);
      expect(all.map((group) => group.ids)).toEqual(
        plain.map((group) => group.ids),
      );
      // グループのオブジェクトは使い回す
      expect(all[0]).toBe(arranged[0]);
    });

    it('グループの絞り込みで消えて戻ったグループも、中身が同じなら同じオブジェクト', () => {
      const items = createItems();
      const grouped = createGroupedList(items, { groupBy: 'category' });
      const c2 = grouped.get()[1]!;
      grouped.setFilterGroups((group) => group.key !== 'C-2');
      expect(keys(grouped.get())).toEqual(['C-1', 'C-3']);
      grouped.setFilterGroups(undefined);
      expect(grouped.get()[1]).toBe(c2);
    });
  });

  describe('レコードとグループの絞り込み・並べ替え', () => {
    it('レコードは上流、グループはグループ化した派生モデルで絞り込み・並べ替える', () => {
      const items = createItems();
      const visible = createDerivedList(items, {
        filter: (item) => item.price !== 100,
        sort: (a, b) => b.price - a.price,
      });
      const grouped = createGroupedList(visible, {
        groupBy: 'category',
        filterGroups: (group) => group.records.length >= 2,
        sortGroups: (a, b) => total(a.records) - total(b.records),
      });
      // I-1 が絞り込まれ、C-1 は1行だけになって消える。合計の小さい順
      expect(grouped.get().map((group) => [group.key, group.ids])).toEqual([
        ['C-2', ['I-5', 'I-2']],
        ['C-3', ['I-6', 'I-3']],
      ]);
    });

    it('条件を差し替え、購読者に知らせる', () => {
      const items = createItems();
      const grouped = createGroupedList(items, { groupBy: 'category' });
      const listener = vi.fn();
      grouped.subscribe(listener);
      grouped.setSortGroups((a, b) => total(b.records) - total(a.records));
      expect(keys(grouped.get())).toEqual(['C-3', 'C-2', 'C-1']);
      grouped.setGroupBy((item) => (item.price > 300 ? 'high' : 'low'));
      expect(keys(grouped.get())).toEqual(['high', 'low']);
      grouped.setSortGroups(undefined);
      expect(keys(grouped.get())).toEqual(['low', 'high']);
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('通知の範囲', () => {
    it('上流で絞り込まれた行の編集では、購読者を呼ばない', () => {
      const items = createItems();
      const visible = createDerivedList(items, {
        filter: (item) => item.category !== 'C-1',
      });
      const grouped = createGroupedList(visible, { groupBy: 'category' });
      const listener = vi.fn();
      grouped.subscribe(listener);
      items.record('I-1').field('price').set(1);
      expect(listener).not.toHaveBeenCalled();
      items.record('I-2').field('price').set(1);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('編集の取り次ぎ', () => {
    it('record(id) は上流の行のモデル。グループのキーを変えると、行が別のグループに移る', () => {
      const items = createItems();
      const grouped = createGroupedList(createDerivedList(items), {
        groupBy: 'category',
      });
      expect(grouped.record('I-1')).toBe(items.record('I-1'));
      grouped.record('I-1').field('category').set('C-2');
      // I-1 が C-2 に移り、上流での最初の出現順で C-2 が先頭になる
      expect(grouped.get().map((group) => [group.key, group.ids])).toEqual([
        ['C-2', ['I-1', 'I-2', 'I-5']],
        ['C-3', ['I-3', 'I-6']],
        ['C-1', ['I-4']],
      ]);
      grouped.remove(['I-4']);
      expect(keys(grouped.get())).toEqual(['C-2', 'C-3']);
    });

    it('source は上流のモデル', () => {
      const items = createItems();
      expect(createGroupedList(items, { groupBy: 'category' }).source).toBe(
        items,
      );
    });
  });
});
