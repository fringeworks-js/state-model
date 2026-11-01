import { createOrder, orderDefinition } from '../_internal/_fixtures';
import createDerivedList from '../createDerivedList';
import createRecordModel from '../createRecordModel';
import createModelStatus from './createModelStatus';

function setup() {
  const order = createRecordModel(orderDefinition, {
    defaultData: createOrder(),
  });
  const status = createModelStatus(order);
  return { order, status };
}

describe('createModelStatus', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('変更済みか', () => {
    it('作ったときのデータを基準に、パスごとに比べる。親のパスは下のどこかが変われば変更済み', () => {
      const { order, status } = setup();
      expect(status.dirty().get()).toBe(false);
      order.list('lines').record('L-2').field('price').set(999);
      expect(status.dirty(['lines', 'L-2', 'price']).get()).toBe(true);
      expect(status.dirty(['lines', 'L-2']).get()).toBe(true);
      expect(status.dirty(['lines']).get()).toBe(true);
      expect(status.dirty().get()).toBe(true);
      // 変わっていない所は変更済みでない
      expect(status.dirty(['lines', 'L-1']).get()).toBe(false);
      expect(status.dirty(['customer']).get()).toBe(false);
    });

    it('元の値に戻せば変更済みでなくなる（値の Field）', () => {
      const { order, status } = setup();
      order.field('customer').set('Bob');
      expect(status.dirty(['customer']).get()).toBe(true);
      order.field('customer').set('Alice');
      expect(status.dirty(['customer']).get()).toBe(false);
    });

    it('行の項目を元に戻すと、行・一覧・全体も変更済みでなくなる（中身で比べる）', () => {
      const { order, status } = setup();
      const price = order.list('lines').record('L-2').field('price');
      const listener = vi.fn();
      status.dirty().subscribe(listener);
      price.set(999);
      expect(status.dirty(['lines', 'L-2']).get()).toBe(true);
      price.set(200);
      expect(status.dirty(['lines', 'L-2']).get()).toBe(false);
      expect(status.dirty(['lines']).get()).toBe(false);
      expect(status.dirty().get()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('値が配列の Field を、同じ中身で作り直しても変更済みにならない', () => {
      const { order, status } = setup();
      order.field('tags').set(['a']);
      expect(status.dirty(['tags']).get()).toBe(false);
      order.field('tags').set(['a', 'b']);
      expect(status.dirty(['tags']).get()).toBe(true);
    });

    it('markClean で基準を置き直す', () => {
      const { order, status } = setup();
      order.field('customer').set('Bob');
      status.markClean();
      expect(status.dirty().get()).toBe(false);
      order.field('customer').set('Alice');
      expect(status.dirty(['customer']).get()).toBe(true);
    });

    it('行を足す・消すと、一覧と、その行のパスが変更済みになる', () => {
      const { order, status } = setup();
      order.list('lines').insert([{ lineId: 'L-9', product: '', price: 0 }]);
      expect(status.dirty(['lines']).get()).toBe(true);
      expect(status.dirty(['lines', 'L-9']).get()).toBe(true);
      status.markClean();
      order.list('lines').remove(['L-1']);
      expect(status.dirty(['lines', 'L-1']).get()).toBe(true);
    });

    it('変わったときだけ知らせる。同じパスなら同じモデル', () => {
      const { order, status } = setup();
      const dirty = status.dirty(['lines', 'L-2']);
      expect(status.dirty(['lines', 'L-2'])).toBe(dirty);
      const listener = vi.fn();
      dirty.subscribe(listener);
      order.list('lines').record('L-1').field('price').set(1);
      expect(listener).not.toHaveBeenCalled();
      order.list('lines').record('L-2').field('price').set(1);
      order.list('lines').record('L-2').field('price').set(2);
      expect(listener).toHaveBeenCalledTimes(1);
      status.markClean();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('下位のモデルにつなぐと、そのモデルからの相対パスで読む', () => {
      const { order } = setup();
      const line = order.list('lines').record('L-2');
      const lineStatus = createModelStatus(line);
      line.field('price').set(1);
      expect(lineStatus.dirty(['price']).get()).toBe(true);
      expect(lineStatus.dirty(['product']).get()).toBe(false);
      expect(lineStatus.dirty().get()).toBe(true);
    });

    it('数値の id でも同じパス', () => {
      const model = createRecordModel<{ rows: { id: number; v: number }[] }>(
        {
          kind: 'record',
          fields: { rows: { kind: 'list', record: { kind: 'record' } } },
        },
        { defaultData: { rows: [{ id: 3, v: 1 }] } },
      );
      const status = createModelStatus(model);
      expect(status.dirty(['rows', 3])).toBe(status.dirty(['rows', '3']));
    });
  });

  describe('触ったか', () => {
    it('touch で触ったことにし、そのパスと親のパスで true になる', () => {
      const { status } = setup();
      expect(status.touched(['lines']).get()).toBe(false);
      status.touch(['lines', 'L-2', 'price']);
      expect(status.touched(['lines', 'L-2', 'price']).get()).toBe(true);
      expect(status.touched(['lines', 'L-2']).get()).toBe(true);
      expect(status.touched(['lines']).get()).toBe(true);
      expect(status.touched().get()).toBe(true);
      expect(status.touched(['lines', 'L-1']).get()).toBe(false);
      expect(status.touched(['customer']).get()).toBe(false);
    });

    it('同じパスを何度触っても1回だけ知らせ、clearTouched で外す', () => {
      const { status } = setup();
      const listener = vi.fn();
      status.touched(['customer']).subscribe(listener);
      status.touch(['customer']);
      status.touch(['customer']);
      expect(listener).toHaveBeenCalledTimes(1);
      status.clearTouched();
      expect(status.touched(['customer']).get()).toBe(false);
    });

    it('reset は変更済みと触ったことの両方を外す', () => {
      const { order, status } = setup();
      order.field('customer').set('Bob');
      status.touch(['customer']);
      status.reset();
      expect(status.dirty().get()).toBe(false);
      expect(status.touched().get()).toBe(false);
    });
  });

  it('派生モデルにはつなげない（開発時に警告する）', () => {
    const { order } = setup();
    const derived = createDerivedList(order.list('lines'));
    // @ts-expect-error 派生モデルは kind を持たない
    createModelStatus(derived);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
