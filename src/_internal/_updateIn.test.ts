import _createIdOf from './_createIdOf';
import { createOrder, type Order } from './_fixtures';
import _getIn, { type Segment } from './_getIn';
import _updateIn from './_updateIn';
import { _createSetUpdater, _createUpdateRecordUpdater } from './_updaters';

const idOf = _createIdOf('lineId');
const key = (k: string): Segment => ({ type: 'key', key: k });
const id = (i: string): Segment => ({ type: 'id', id: i, idOf });

describe('_getIn', () => {
  it('パスをたどって読む。モデルが指すデータが無ければ undefined', () => {
    const order = createOrder();
    expect(_getIn(order, [key('lines'), id('L-2'), key('price')])).toBe(200);
    expect(
      _getIn(order, [key('lines'), id('L-9'), key('price')]),
    ).toBeUndefined();
    expect(_getIn(order, [key('billing'), key('zip')])).toBeUndefined();
  });
});

describe('_updateIn', () => {
  it('変わった所だけを作り直し、ほかは同じ参照のまま', () => {
    const order = createOrder();
    const result = _updateIn(
      order,
      [key('lines'), id('L-2'), key('price')],
      _createSetUpdater(999),
    );
    expect(result.ok).toBe(true);
    const next = (result as { data: Order }).data;
    expect(next).not.toBe(order);
    expect(next.lines).not.toBe(order.lines);
    expect(next.lines[1]).toEqual({ ...order.lines[1], price: 999 });
    expect(next.lines[0]).toBe(order.lines[0]);
    expect(next.lines[2]).toBe(order.lines[2]);
    expect(next.shipping).toBe(order.shipping);
    expect(order.lines[1]!.price).toBe(200);
  });

  it('変化が無ければ元のデータをそのまま返す', () => {
    const order = createOrder();
    const same = _updateIn(
      order,
      [key('lines'), id('L-2'), key('price')],
      _createSetUpdater(200),
    );
    expect(same).toEqual({ ok: true, data: order });
    const identity = _updateIn(order, [key('shipping')], (prev) => prev);
    expect(identity).toEqual({ ok: true, data: order });
  });

  it('直接の親が無ければ書かない。省略できる入れ子は丸ごとなら書く', () => {
    const order = createOrder();
    expect(
      _updateIn(order, [key('billing'), key('zip')], _createSetUpdater('1')).ok,
    ).toBe(false);
    expect(
      _updateIn(order, [key('lines'), id('L-9')], _createSetUpdater({})).ok,
    ).toBe(false);
    const whole = _updateIn(
      order,
      [key('billing')],
      _createSetUpdater({ zip: '1', address: 'x' }),
    );
    expect(whole.ok && (whole.data as Order).billing?.zip).toBe('1');
  });

  it('行の id の書き換え: 重複・有効でない id になるなら書かない', () => {
    const order = createOrder();
    const path = [key('lines'), id('L-1')];
    expect(
      _updateIn(order, path, _createUpdateRecordUpdater({ lineId: 'L-2' })).ok,
    ).toBe(false);
    expect(
      _updateIn(order, path, _createUpdateRecordUpdater({ lineId: undefined }))
        .ok,
    ).toBe(false);
    expect(
      _updateIn(order, path, _createUpdateRecordUpdater({ lineId: 'L-9' })).ok,
    ).toBe(true);
    // set で id が変わる場合も同じ確認が当たる
    expect(
      _updateIn(
        order,
        path,
        _createSetUpdater({ lineId: 'L-3', product: '', price: 0 }),
      ).ok,
    ).toBe(false);
  });
});
