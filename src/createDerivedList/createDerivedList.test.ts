import {
  createOrder,
  lineDefinition,
  orderDefinition,
  type Line,
} from '../_internal/_fixtures';
import createRecordModel from '../createRecordModel';
import createDerivedList from './createDerivedList';

const byPrice = (a: Line, b: Line) => a.price - b.price;
const byPriceDesc = (a: Line, b: Line) => b.price - a.price;

function setup() {
  const order = createRecordModel(orderDefinition, {
    defaultData: createOrder(),
  });
  const lines = order.list('lines');
  return { order, lines };
}

describe('createDerivedList', () => {
  describe('結果', () => {
    it('絞り込み・並べ替えた行を返す。行は上流と同じ参照で、上流は変えない', () => {
      const { lines } = setup();
      const before = lines.get();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        sort: byPriceDesc,
      });
      expect(derived.get().map((line) => line.lineId)).toEqual(['L-3', 'L-2']);
      expect(derived.get()[0]).toBe(before[2]);
      expect(lines.get()).toBe(before);
    });

    it('条件が無ければ、上流の配列をそのまま返す', () => {
      const { lines } = setup();
      expect(createDerivedList(lines).get()).toBe(lines.get());
    });

    it('条件を外すと、上流の配列をそのまま返す（前の結果と中身が同じでも、上流の配列を優先する）', () => {
      const { lines } = setup();
      // 何も除外しない絞り込み
      const derived = createDerivedList(lines, { filter: () => true });
      const filtered = derived.get();
      expect(filtered).not.toBe(lines.get());
      derived.setFilter(undefined);
      expect(derived.get()).toBe(lines.get());
      // 上流が変わった後も、上流の配列のまま
      lines.record('L-1').field('price').set(1);
      expect(derived.get()).toBe(lines.get());
    });

    it('上流が無い（省略できる List）ときは空の配列', () => {
      const model = createRecordModel<{ lines?: Line[] }>(
        {
          kind: 'record',
          fields: {
            lines: { kind: 'list', id: 'lineId', record: lineDefinition },
          },
        },
        { defaultData: {} },
      );
      const derived = createDerivedList(model.list('lines'), { sort: byPrice });
      expect(derived.get()).toEqual([]);
      expect(derived.ids().get()).toEqual([]);
    });

    it('並べ替えは安定で、同じ値の行は上流の順を保つ', () => {
      const { lines } = setup();
      lines.record('L-3').field('price').set(100);
      const derived = createDerivedList(lines, { sort: byPrice });
      expect(derived.get().map((line) => line.lineId)).toEqual([
        'L-1',
        'L-3',
        'L-2',
      ]);
    });

    it('変化が無ければ同じ参照を返す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, { sort: byPrice });
      expect(derived.get()).toBe(derived.get());
    });
  });

  describe('上流の変化', () => {
    it('上流が変わると結果を作り直し、購読者に知らせる', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, { sort: byPriceDesc });
      const listener = vi.fn();
      derived.subscribe(listener);
      lines.record('L-1').field('price').set(999);
      expect(derived.get()[0]!.lineId).toBe('L-1');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('結果の行と順番が前と同じなら、前の配列のままで知らせない', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
      });
      const before = derived.get();
      const listener = vi.fn();
      derived.subscribe(listener);
      // 絞り込まれて見えない行を編集する
      lines.record('L-1').field('product').set('X');
      expect(derived.get()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
    });

    it('制御のルートのモデルが受け取ったデータも反映する', () => {
      const initial = createOrder();
      const order = createRecordModel(orderDefinition, {
        data: initial,
        onChangeData: () => {},
      });
      const derived = createDerivedList(order.list('lines'), { sort: byPrice });
      const listener = vi.fn();
      derived.subscribe(listener);
      order.receive({ ...initial, lines: [initial.lines[2]!] });
      expect(derived.get()).toEqual([initial.lines[2]]);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('条件の差し替え', () => {
    it('setFilter・setSort で条件を差し替え、購読者に知らせる。undefined で条件を外す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines);
      const listener = vi.fn();
      derived.subscribe(listener);

      derived.setSort(byPriceDesc);
      expect(derived.get().map((line) => line.lineId)).toEqual([
        'L-3',
        'L-2',
        'L-1',
      ]);
      derived.setFilter((line) => line.price < 300);
      expect(derived.get().map((line) => line.lineId)).toEqual(['L-2', 'L-1']);
      expect(listener).toHaveBeenCalledTimes(2);

      derived.setFilter(undefined);
      derived.setSort(undefined);
      expect(derived.get()).toEqual(lines.get());
    });

    it('メソッドは取り出しても動く', () => {
      const { lines } = setup();
      const { setFilter, get } = createDerivedList(lines);
      setFilter((line) => line.lineId === 'L-2');
      expect(get().map((line) => line.lineId)).toEqual(['L-2']);
    });
  });

  describe('ids', () => {
    it('結果の id の並び。行の中身が変わっただけなら同じ配列で、並びが変わると変わる', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, { sort: byPriceDesc });
      const ids = derived.ids();
      expect(derived.ids()).toBe(ids);
      expect(ids.get()).toEqual(['L-3', 'L-2', 'L-1']);
      const listener = vi.fn();
      ids.subscribe(listener);

      const before = ids.get();
      lines.record('L-2').field('product').set('X');
      expect(ids.get()).toBe(before);
      expect(listener).not.toHaveBeenCalled();

      lines.record('L-1').field('price').set(999);
      expect(ids.get()).toEqual(['L-1', 'L-3', 'L-2']);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('編集の取り次ぎ', () => {
    it('record(id) は上流の行のモデルを返す。結果に含まれない行も指す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
      });
      expect(derived.record('L-2')).toBe(lines.record('L-2'));
      expect(derived.record('L-1')).toBe(lines.record('L-1'));
      derived.record('L-1').field('price').set(500);
      expect(lines.record('L-1').field('price').get()).toBe(500);
      expect(derived.ids().get()).toContain('L-1');
    });

    it('remove は上流に取り次ぐ', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, { sort: byPriceDesc });
      derived.remove(['L-3']);
      expect(lines.ids().get()).toEqual(['L-1', 'L-2']);
      expect(derived.ids().get()).toEqual(['L-2', 'L-1']);
    });

    it('source は上流のモデル', () => {
      const { lines } = setup();
      expect(createDerivedList(lines).source).toBe(lines);
    });
  });

  describe('つなげる', () => {
    it('派生モデルの上に派生モデルを作れる。上流の条件の変化も伝わる', () => {
      const { lines } = setup();
      const filtered = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
      });
      const sorted = createDerivedList(filtered, { sort: byPriceDesc });
      const listener = vi.fn();
      sorted.subscribe(listener);
      expect(sorted.ids().get()).toEqual(['L-3', 'L-2']);

      filtered.setFilter(undefined);
      expect(sorted.ids().get()).toEqual(['L-3', 'L-2', 'L-1']);
      expect(listener).toHaveBeenCalledTimes(1);

      // 行のモデルと削除は、ルートのモデルまで届く
      expect(sorted.record('L-1')).toBe(lines.record('L-1'));
      sorted.remove(['L-3']);
      expect(lines.ids().get()).toEqual(['L-1', 'L-2']);
    });
  });
});
