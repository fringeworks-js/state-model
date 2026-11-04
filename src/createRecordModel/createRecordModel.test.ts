import {
  createOrder,
  orderDefinition,
  type Order,
} from '../_internal/_fixtures';
import type { ModelChangeEvent } from '../types';
import createRecordModel from './createRecordModel';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

function createUncontrolled() {
  return createRecordModel(orderDefinition, { defaultData: createOrder() });
}

describe('createRecordModel', () => {
  describe('モデル', () => {
    it('1段ずつたどって読み書きする', () => {
      const order = createUncontrolled();
      const price = order.list('lines').record('L-2').field('price');
      expect(price.get()).toBe(200);
      price.set(999);
      expect(price.get()).toBe(999);
      price.set((prev) => (prev ?? 0) + 1);
      expect(order.get().lines[1]!.price).toBe(1000);
      order.list('lines').record('L-1').update({ product: 'X' });
      expect(order.get().lines[0]!.product).toBe('X');
    });

    it('kind はモデルの種類を表す', () => {
      const order = createUncontrolled();
      expect(order.kind).toBe('record');
      expect(order.list('lines').kind).toBe('list');
      expect(order.field('customer').kind).toBe('field');
    });

    it('下位のモデルの at() は、そのモデルからの相対パスで指す', () => {
      const order = createUncontrolled();
      const lines = order.list('lines');
      const line = lines.record('L-2');
      expect(line.at(['price'])).toBe(line.field('price'));
      expect(lines.at(['L-2', 'price'])).toBe(line.field('price'));
      expect(order.record('shipping').at(['zip']).get()).toBe('100');
      expect(line.at([])).toBe(line);
    });

    it('同じパスなら同じオブジェクト。at() も同じものを返す', () => {
      const order = createUncontrolled();
      const line = order.list('lines').record('L-2');
      expect(order.list('lines').record('L-2')).toBe(line);
      expect(order.at(['lines', 'L-2'])).toBe(line);
      expect(order.list('lines').ids()).toBe(order.list('lines').ids());
      expect(order.at(['lines', 'L-2', 'price'])).toBe(line.field('price'));
      // 種類が違えば別のもの
      expect(order.record('shipping')).not.toBe(order.field('shipping'));
    });

    it('数値の id でも同じパス', () => {
      const order = createRecordModel<{ rows: { id: number }[] }>(
        {
          kind: 'record',
          fields: { rows: { kind: 'list', record: { kind: 'record' } } },
        },
        { defaultData: { rows: [{ id: 3 }] } },
      );
      const rows = order.list('rows');
      expect(rows.record(3)).toBe(rows.record('3'));
      expect(rows.ids().get()).toEqual(['3']);
    });

    it('メソッドは取り出しても動く', () => {
      const order = createUncontrolled();
      const { set, get } = order.record('shipping').field('zip');
      set('200');
      expect(get()).toBe('200');
    });

    it('path は凍結している', () => {
      const order = createUncontrolled();
      const path = order.list('lines').record('L-2').field('price').path;
      expect(path).toEqual(['lines', 'L-2', 'price']);
      expect(Object.isFrozen(path)).toBe(true);
    });

    it('モデルが指すデータが無ければ undefined。書き込みは何もせず警告する', () => {
      const order = createUncontrolled();
      const line = order.list('lines').record('L-2');
      order.list('lines').remove(['L-2']);
      expect(line.get()).toBeUndefined();
      const before = order.get();
      line.field('price').set(1);
      line.set({ lineId: 'L-2', product: '', price: 0 });
      expect(order.get()).toBe(before);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      // また足されれば、その行を指す
      order
        .list('lines')
        .insert([{ lineId: 'L-2', product: 'again', price: 1 }]);
      expect(line.get()?.product).toBe('again');
    });

    it('省略できる入れ子: 丸ごとなら書き、一部だけなら書かない', () => {
      const order = createUncontrolled();
      const billing = order.record('billing');
      billing.field('zip').set('1');
      billing.update({ zip: '1' });
      expect(order.get().billing).toBeUndefined();
      billing.set((prev) => prev ?? { zip: '1', address: 'x' });
      expect(order.get().billing).toEqual({ zip: '1', address: 'x' });
    });
  });

  describe('定義に書いていないキー', () => {
    it('呼び方で種類を決める。定義と食い違うときだけ警告する', () => {
      const order = createRecordModel<Order>(
        { kind: 'record' },
        { defaultData: { ...createOrder(), lines: [] } },
      );
      order.list('lines').insert([{ lineId: 'X', product: '', price: 0 }]);
      // 定義に id が無いので既定の 'id' で読み、lineId の行は「id の無い行」になる
      expect(order.list('lines').ids().get()).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockClear();
      const defined = createUncontrolled();
      (defined as unknown as { record(key: string): unknown }).record('lines');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('at(): 定義が無い所はキーでたどり、最後の段は Field', () => {
      const order = createRecordModel<Order>(
        { kind: 'record' },
        { defaultData: createOrder() },
      );
      const zip = order.at(['shipping', 'zip']);
      expect(zip.kind).toBe('field');
      expect(zip.get()).toBe('100');
      // 定義の無い List をたどると、指すデータが無く、警告する
      expect(order.at(['lines', 'L-1']).get()).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('購読の通知', () => {
    it('自分の部分が変わったときだけ呼ぶ', () => {
      const order = createUncontrolled();
      const lines = order.list('lines');
      const onPrice = vi.fn();
      const onCustomer = vi.fn();
      const onRoot = vi.fn();
      const onIds = vi.fn();
      lines.record('L-2').field('price').subscribe(onPrice);
      order.field('customer').subscribe(onCustomer);
      order.subscribe(onRoot);
      lines.ids().subscribe(onIds);

      lines.record('L-2').field('price').set(999);
      expect(onPrice).toHaveBeenCalledWith({ value: 999, previousValue: 200 });
      expect(onCustomer).not.toHaveBeenCalled();
      expect(onRoot).toHaveBeenCalledTimes(1);
      // 行の中身が変わっただけなら、id の並びは同じ配列のまま
      expect(onIds).not.toHaveBeenCalled();

      // 同じ値なら書き込まず、誰も呼ばれない
      lines.record('L-2').field('price').set(999);
      expect(onRoot).toHaveBeenCalledTimes(1);

      lines.insert([{ lineId: 'L-9', product: '', price: 0 }]);
      expect(onIds).toHaveBeenCalledTimes(1);
    });

    it('解除した listener は呼ばない', () => {
      const order = createUncontrolled();
      const listener = vi.fn();
      const unsubscribe = order.field('customer').subscribe(listener);
      unsubscribe();
      order.field('customer').set('Bob');
      expect(listener).not.toHaveBeenCalled();
    });

    it('モデルが指すデータが消えたときも普通の変化として知らせる', () => {
      const order = createUncontrolled();
      const line = order.list('lines').record('L-2');
      const events: ModelChangeEvent<unknown>[] = [];
      line.subscribe((event) => events.push(event));
      const removed = line.get();
      order.list('lines').remove(['L-2']);
      order.list('lines').insert([removed!]);
      expect(events).toEqual([
        { value: undefined, previousValue: removed },
        { value: removed, previousValue: undefined },
      ]);
    });

    it('通知の途中に書いても、後ろの listener に古い組が届かない', () => {
      const order = createUncontrolled();
      const price = order.list('lines').record('L-1').field('price');
      const received: [unknown, unknown][] = [];
      // 1番目の listener が、1 になったら 2 に書き直す
      price.subscribe(({ value }) => {
        if (value === 1) {
          price.set(2);
        }
      });
      price.subscribe(({ value, previousValue }) => {
        received.push([previousValue, value]);
        // 呼ばれた時点の get() と一致する
        expect(value).toBe(price.get());
      });
      price.set(1);
      expect(received).toEqual([[100, 2]]);
    });
  });

  describe('制御', () => {
    it('同期のストア: 書いた値がすぐ戻るので、続けて書いても消えない', () => {
      let state = createOrder();
      const listeners = new Set<() => void>();
      const store = {
        get: () => state,
        set: (next: Order) => {
          state = next;
          listeners.forEach((listener) => listener());
        },
      };
      const order = createRecordModel(orderDefinition, {
        data: store.get(),
        onDataChange: store.set,
      });
      listeners.add(() => order.receive(store.get()));

      order.field('customer').set('Bob');
      order.list('lines').record('L-1').field('price').set(1);
      expect(store.get().customer).toBe('Bob');
      expect(store.get().lines[0]!.price).toBe(1);
      expect(order.get()).toBe(store.get());
    });

    it('反映が遅れるデータの持ち主: 同じ処理の中なら、反映待ちのデータの上に積む', () => {
      const changes: Order[] = [];
      const order = createRecordModel(orderDefinition, {
        data: createOrder(),
        onDataChange: (next) => changes.push(next),
      });
      order.field('customer').set('Bob');
      order.list('lines').record('L-1').field('price').set(1);
      // get() は外から受け取ったデータのまま
      expect(order.get().customer).toBe('Alice');
      const last = changes[changes.length - 1]!;
      expect(last.customer).toBe('Bob');
      expect(last.lines[0]!.price).toBe(1);
    });

    it('反映が遅れるデータの持ち主: マイクロタスクを挟んで続けて書いても消えない', async () => {
      const changes: Order[] = [];
      const order = createRecordModel(orderDefinition, {
        data: createOrder(),
        onDataChange: (next) => changes.push(next),
      });
      order.field('customer').set('Bob');
      await Promise.resolve();
      order.list('lines').record('L-1').field('price').set(1);
      const last = changes[changes.length - 1]!;
      expect(last.customer).toBe('Bob');
      expect(last.lines[0]!.price).toBe(1);
    });

    it('データの持ち主が受け入れなかった変更は、次のタスクの書き込みに混ざらない', async () => {
      const changes: Order[] = [];
      const order = createRecordModel(orderDefinition, {
        data: createOrder(),
        onDataChange: (next) => changes.push(next), // 受け取るだけで、渡し直さない
      });
      order.field('customer').set('Bob');
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.list('lines').record('L-1').field('price').set(1);
      const last = changes[changes.length - 1]!;
      expect(last.customer).toBe('Alice');
      expect(last.lines[0]!.price).toBe(1);
    });

    it('receive で受け取ると反映待ちのデータを捨て、変わった所の購読者にだけ知らせる', () => {
      const initial = createOrder();
      const changes: Order[] = [];
      const order = createRecordModel(orderDefinition, {
        data: initial,
        onDataChange: (next) => changes.push(next),
      });
      const onShipping = vi.fn();
      const onLines = vi.fn();
      order.record('shipping').subscribe(onShipping);
      order.list('lines').subscribe(onLines);

      order.field('customer').set('Bob');
      order.receive({ ...initial, lines: [] });
      expect(onLines).toHaveBeenCalledTimes(1);
      expect(onShipping).not.toHaveBeenCalled();
      // 受け取った後の書き込みは、受け取ったデータの上に作る
      order.field('orderId').set('O-2');
      expect(changes[changes.length - 1]!.customer).toBe('Alice');
    });

    it('silent で受け取ると知らせず、次の receive で（データが同じでも）知らせる', () => {
      const initial = createOrder();
      const order = createRecordModel(orderDefinition, {
        data: initial,
        onDataChange: () => {},
      });
      const onCustomer = vi.fn();
      const onShipping = vi.fn();
      order.field('customer').subscribe(onCustomer);
      order.record('shipping').subscribe(onShipping);

      const next = { ...initial, customer: 'Bob' };
      order.receive(next, { silent: true });
      expect(order.get()).toBe(next);
      expect(onCustomer).not.toHaveBeenCalled();

      order.receive(next);
      expect(onCustomer).toHaveBeenCalledWith({
        value: 'Bob',
        previousValue: 'Alice',
      });
      expect(onShipping).not.toHaveBeenCalled();

      // 知らせた後は、同じデータなら知らせない
      order.receive(next);
      expect(onCustomer).toHaveBeenCalledTimes(1);
    });

    it('同じデータを受け取ったときは知らせない', () => {
      const initial = createOrder();
      const order = createRecordModel(orderDefinition, {
        data: initial,
        onDataChange: () => {},
      });
      const listener = vi.fn();
      order.subscribe(listener);
      order.receive(initial);
      expect(listener).not.toHaveBeenCalled();
    });

    it('非制御のルートのモデルは receive で受け取らず、警告する', () => {
      const order = createUncontrolled();
      const before = order.get();
      order.receive(createOrder());
      expect(order.get()).toBe(before);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
