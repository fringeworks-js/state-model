import {
  createOrder,
  lineDefinition,
  orderDefinition,
  type Line,
} from '../_internal/_fixtures';
import createRecordModel from '../createRecordModel';
import createDerivedList from './createDerivedList';
import type { DerivedListOptions } from './types';

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

    it('条件が無ければ、上流と同じ行を上流の順に返す。配列は上流とは別のもの', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines);
      expect(derived.get()).toEqual(lines.get());
      expect(derived.get()).not.toBe(lines.get());
    });

    it('条件を外したとき、結果の行と順番が前と同じなら前の配列のまま', () => {
      const { lines } = setup();
      // 何も除外しない絞り込み
      const derived = createDerivedList(lines, { filter: () => true });
      const filtered = derived.get();
      const listener = vi.fn();
      derived.subscribe(listener);
      derived.setFilter(undefined);
      expect(derived.get()).toBe(filtered);
      expect(listener).not.toHaveBeenCalled();
      // 上流が変わると作り直す（上流の配列にはならない）
      lines.record('L-1').field('price').set(1);
      expect(derived.get()).toEqual(lines.get());
      expect(derived.get()).not.toBe(lines.get());
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
        onDataChange: () => {},
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

    it('insert は元の一覧に取り次ぐ。すぐ当て直すモードでは条件を当てる', () => {
      const { lines } = setup();
      const derived = createDerivedList(createDerivedList(lines), {
        filter: (line) => line.price >= 200,
      });
      derived.insert([
        { lineId: 'L-4', product: '', price: 0 },
        { lineId: 'L-5', product: '', price: 500 },
      ]);
      expect(lines.ids().get()).toEqual(['L-1', 'L-2', 'L-3', 'L-4', 'L-5']);
      expect(derived.ids().get()).toEqual(['L-2', 'L-3', 'L-5']);
    });

    it('remove は上流に取り次ぐ', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, { sort: byPriceDesc });
      derived.remove(['L-3']);
      expect(lines.ids().get()).toEqual(['L-1', 'L-2']);
      expect(derived.ids().get()).toEqual(['L-2', 'L-1']);
    });

    it('at() は上流に取り次ぎ、最初の段は行の id。結果に含まれない行も指す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
      });
      expect(derived.at(['L-1', 'price'])).toBe(
        lines.record('L-1').field('price'),
      );
      expect(createDerivedList(derived).at(['L-2'])).toBe(lines.record('L-2'));
      // 空のパスなら、データの場所を持つ上流の List のモデル
      expect(derived.at([])).toBe(lines);
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

  describe('当て直さないモード（filterRefresh・sortRefresh）', () => {
    const lineIds = (rows: readonly Line[]) => rows.map((line) => line.lineId);

    it('絞り込みを当て直さない: 条件から外れた行も残り、中身は新しくなる。refresh() で当て直す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        filterRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      lines.record('L-2').field('price').set(1);
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      expect(derived.get()[0]!.price).toBe(1);
      // 条件に合うようになった行も、当て直すまで入らない
      lines.record('L-1').field('price').set(999);
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      derived.refresh();
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-3']);
    });

    it('並べ替えを当て直さない: 並べ替えのキーを編集しても動かない。refresh() で当て直す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        sort: byPriceDesc,
        sortRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-1']);
      lines.record('L-1').field('price').set(999);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-1']);
      derived.refresh();
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-3', 'L-2']);
    });

    it('絞り込みはすぐ当て直し、並べ替えは保つ（ToDo の例）', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price > 0,
        sort: byPriceDesc,
        sortRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-1']);
      lines.record('L-3').field('price').set(1);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-1']);
      lines.record('L-2').field('price').set(0);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-1']);
    });

    it('絞り込みは保ち、並べ替えはすぐ当て直す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        sort: byPrice,
        filterRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      lines.record('L-3').field('price').set(1);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2']);
    });

    it('ほかから足された行は当て直すまで入らず、消えた行は消える', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        sort: byPriceDesc,
        filterRefresh: 'manual',
        sortRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2']);
      lines.insert([{ lineId: 'L-4', product: '', price: 999 }]);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2']);
      lines.remove(['L-3']);
      expect(lineIds(derived.get())).toEqual(['L-2']);
      expect(derived.ids().get()).toEqual(['L-2']);
      derived.refresh();
      expect(lineIds(derived.get())).toEqual(['L-4', 'L-2']);
    });

    it('insert でこの段から足した行は、条件を当てずに末尾に入る。refresh() で条件を当てる', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        sort: byPriceDesc,
        filterRefresh: 'manual',
        sortRefresh: 'manual',
      });
      derived.get();
      derived.insert([{ lineId: 'L-4', product: '', price: 0 }]);
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-4']);
      // 足した後は、ほかの行と同じく保つ
      lines.record('L-4').field('product').set('X');
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2', 'L-4']);
      derived.refresh();
      expect(lineIds(derived.get())).toEqual(['L-3', 'L-2']);
    });

    it('insert で、すでにある id の行を足そうとしても、結果に入れない', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
        filterRefresh: 'manual',
      });
      derived.get();
      derived.insert([{ lineId: 'L-1', product: '', price: 0 }]);
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      expect(lines.ids().get()).toEqual(['L-1', 'L-2', 'L-3']);
    });

    it('条件やモードを差し替えると当て直す', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        sort: byPriceDesc,
        filterRefresh: 'manual',
        sortRefresh: 'manual',
      });
      lines.record('L-1').field('price').set(999);
      derived.setFilter((line) => line.price >= 200);
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-3', 'L-2']);

      lines.record('L-2').field('price').set(1);
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-3', 'L-2']);
      derived.setFilterRefresh('auto');
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-3']);
    });

    it('購読者がいなくても、モードを切り替えた時点の結果を保つ', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filter: (line) => line.price >= 200,
      });
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
      // 切り替えた後、読まないまま上流を変える
      derived.setFilterRefresh('manual');
      lines.record('L-2').field('price').set(1);
      expect(lineIds(derived.get())).toEqual(['L-2', 'L-3']);
    });

    it('条件が無くても、当て直さないモードなら結果を保つ', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        filterRefresh: 'manual',
        sortRefresh: 'manual',
      });
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-2', 'L-3']);
      lines.insert([{ lineId: 'L-4', product: '', price: 0 }]);
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-2', 'L-3']);
      derived.refresh();
      expect(lineIds(derived.get())).toEqual(['L-1', 'L-2', 'L-3', 'L-4']);
    });

    describe('段を重ねたとき', () => {
      function setupChain(options: DerivedListOptions<Line>) {
        const { lines } = setup();
        // システムの段: 価格が 200 以上を、価格の高い順に
        const system = createDerivedList(lines, {
          filter: (line) => line.price >= 200,
          sort: byPriceDesc,
        });
        const user = createDerivedList(system, options);
        return { lines, system, user };
      }

      it('上流の段が外した行も残り、中身は新しくなる。refresh() で外れる', () => {
        const { lines, user } = setupChain({ filterRefresh: 'manual' });
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2']);
        lines.record('L-2').field('price').set(1);
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2']);
        expect(user.get()[1]!.price).toBe(1);
        user.refresh();
        expect(lineIds(user.get())).toEqual(['L-3']);
      });

      it('上流の段が並べ直しても、この段に条件が無ければ保った順のまま動かない', () => {
        const { lines, user } = setupChain({ sortRefresh: 'manual' });
        user.get();
        lines.record('L-2').field('price').set(999);
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2']);
        user.refresh();
        expect(lineIds(user.get())).toEqual(['L-2', 'L-3']);
      });

      it('上流の段が外した行は、前の結果での位置に残る', () => {
        const { lines, user } = setupChain({ filterRefresh: 'manual' });
        lines.record('L-1').field('price').set(250);
        user.refresh();
        expect(lineIds(user.get())).toEqual(['L-3', 'L-1', 'L-2']);
        // L-1 が上流の段から外れ、L-2 が先頭に上がった
        lines.record('L-1').field('price').set(1);
        lines.record('L-2').field('price').set(999);
        expect(lineIds(user.get())).toEqual(['L-2', 'L-3', 'L-1']);
      });

      it('並べ替えだけを保つときは、上流の段が外した行は消える', () => {
        const { lines, user } = setupChain({ sortRefresh: 'manual' });
        user.get();
        lines.record('L-2').field('price').set(1);
        expect(lineIds(user.get())).toEqual(['L-3']);
      });

      it('この段から足した行は、上流の段の条件に合わなくても入る', () => {
        const { lines, user } = setupChain({ filterRefresh: 'manual' });
        user.get();
        user.insert([{ lineId: 'L-4', product: '', price: 0 }]);
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2', 'L-4']);
        expect(lines.ids().get()).toContain('L-4');
        user.refresh();
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2']);
      });

      it('上流の段を当て直しても、この段は保つ。この段を当て直すと上流の今の結果に合わせる', () => {
        const { lines, system, user } = setupChain({ filterRefresh: 'manual' });
        system.setFilterRefresh('manual');
        user.get();
        lines.record('L-1').field('price').set(999);
        lines.record('L-2').field('price').set(1);
        system.refresh();
        expect(lineIds(system.get())).toEqual(['L-1', 'L-3']);
        expect(lineIds(user.get())).toEqual(['L-3', 'L-2']);
        user.refresh();
        expect(lineIds(user.get())).toEqual(['L-1', 'L-3']);
      });

      it('すぐ当て直すモードでは、上流の段が外している行の編集で購読者を呼ばない', () => {
        const { lines, user } = setupChain({ sort: byPrice });
        const listener = vi.fn();
        user.subscribe(listener);
        lines.record('L-1').field('product').set('X');
        expect(listener).not.toHaveBeenCalled();
      });

      it('当て直さないモードでは、上流の段が外した行の編集も知らせる', () => {
        const { lines, user } = setupChain({ filterRefresh: 'manual' });
        const listener = vi.fn();
        user.subscribe(listener);
        lines.record('L-2').field('price').set(1);
        expect(listener).toHaveBeenCalledTimes(1);
        lines.record('L-2').field('product').set('X');
        expect(listener).toHaveBeenCalledTimes(2);
        expect(user.get()[1]!.product).toBe('X');
      });
    });

    it('当て直さないときも、変わった行は知らせる。id の並びは変わらない', () => {
      const { lines } = setup();
      const derived = createDerivedList(lines, {
        sort: byPriceDesc,
        sortRefresh: 'manual',
      });
      const listener = vi.fn();
      const idsListener = vi.fn();
      derived.subscribe(listener);
      derived.ids().subscribe(idsListener);
      lines.record('L-1').field('price').set(999);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(idsListener).not.toHaveBeenCalled();
    });
  });
});
