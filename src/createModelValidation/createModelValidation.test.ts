import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createOrder, type Line, type Order } from '../_internal/_fixtures';
import createDerivedList from '../createDerivedList';
import createFieldModel from '../createFieldModel';
import createRecordModel from '../createRecordModel';
import type { RecordDefinition } from '../types';
import createModelValidation from './createModelValidation';

const lineDefinition: RecordDefinition<Line> = {
  kind: 'record',
  fields: {
    product: { validate: (product) => (product ? undefined : 'Required') },
    price: { validate: (price) => (price >= 0 ? undefined : 'Negative') },
  },
};

const orderDefinition: RecordDefinition<Order> = {
  kind: 'record',
  fields: {
    customer: { validate: (customer) => (customer ? undefined : 'Required') },
    tags: {},
    shipping: { kind: 'record', fields: { zip: {}, address: {} } },
    billing: {
      kind: 'record',
      fields: { zip: { validate: () => 'Billing zip' } },
      validate: () => 'Billing',
    },
    lines: {
      kind: 'list',
      id: 'lineId',
      record: lineDefinition,
      validate: (lines) =>
        lines.length > 0 ? undefined : [{ message: 'At least one line' }],
    },
  },
  validate: (order) =>
    order.shipping.zip === order.billing?.zip
      ? [{ path: ['billing', 'zip'], message: 'Same as shipping' }]
      : undefined,
};

function setup() {
  const order = createRecordModel(orderDefinition, {
    defaultData: createOrder(),
  });
  const validation = createModelValidation(order);
  return { order, validation };
}

function schema(
  validate: StandardSchemaV1['~standard']['validate'],
): StandardSchemaV1 {
  return { '~standard': { version: 1, vendor: 'test', validate } };
}

describe('createModelValidation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('定義の規則', () => {
    it('Field の規則の結果を、そのパスで読む。データから導くので、直せば消える', () => {
      const { order, validation } = setup();
      expect(validation.issues(['customer']).get()).toEqual([]);
      order.field('customer').set('');
      expect(validation.issues(['customer']).get()).toEqual([
        { message: 'Required' },
      ]);
      order.field('customer').set('Bob');
      expect(validation.issues(['customer']).get()).toEqual([]);
    });

    it('行の定義の規則は、すべての行に当たり、結果のパスは行の id で表す', () => {
      const { order, validation } = setup();
      order.list('lines').record('L-2').field('price').set(-1);
      order.list('lines').record('L-3').field('product').set('');
      expect(validation.issues(['lines', 'L-2', 'price']).get()).toEqual([
        { message: 'Negative' },
      ]);
      expect(validation.issues(['lines', 'L-3', 'product']).get()).toEqual([
        { message: 'Required' },
      ]);
      expect(validation.issues(['lines', 'L-1', 'price']).get()).toEqual([]);
    });

    it('Record の規則は項目をまたぐ検査を書け、結果のパスは Record からの相対パス（親の規則の結果が先）', () => {
      const { order, validation } = setup();
      order.record('billing').set({ zip: '999', address: 'Osaka' });
      expect(validation.issues(['billing', 'zip']).get()).toEqual([
        { message: 'Billing zip' },
      ]);
      order.record('billing').field('zip').set('100');
      expect(validation.issues(['billing', 'zip']).get()).toEqual([
        { message: 'Same as shipping' },
        { message: 'Billing zip' },
      ]);
    });

    it('List の規則の結果は、List のパスに付く', () => {
      const { order, validation } = setup();
      order.list('lines').remove(['L-1', 'L-2', 'L-3']);
      expect(validation.issues(['lines']).get()).toEqual([
        { message: 'At least one line' },
      ]);
    });

    it('省略できる入れ子が無いときは、その Record の規則も下の規則も当てない', () => {
      const { validation } = setup();
      expect(validation.issues(['billing']).get()).toEqual([]);
      expect(validation.issues(['billing', 'zip']).get()).toEqual([]);
      expect(validation.invalid().get()).toBe(false);
    });

    it('変わっていない行の規則は走らせない', () => {
      const validate = vi.fn((price: number) =>
        price >= 0 ? undefined : 'Negative',
      );
      const order = createRecordModel(
        {
          kind: 'record',
          fields: {
            lines: {
              kind: 'list',
              id: 'lineId',
              record: { kind: 'record', fields: { price: { validate } } },
            },
          },
        } satisfies RecordDefinition<Order>,
        { defaultData: createOrder(3) },
      );
      const validation = createModelValidation(order);
      validation.invalid().get();
      expect(validate).toHaveBeenCalledTimes(3);
      order.list('lines').record('L-2').field('price').set(-1);
      validation.invalid().get();
      expect(validate).toHaveBeenCalledTimes(4);
    });

    it('規則が Promise を返したら、警告して無視する', () => {
      const order = createFieldModel<string>(
        { validate: (() => Promise.resolve('x')) as never },
        { defaultData: '' },
      );
      const validation = createModelValidation(order);
      expect(validation.issues().get()).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('読む口', () => {
    it('invalid は、そのパスか下のどこかに結果があれば true', () => {
      const { order, validation } = setup();
      expect(validation.invalid().get()).toBe(false);
      order.list('lines').record('L-2').field('price').set(-1);
      expect(validation.invalid(['lines', 'L-2', 'price']).get()).toBe(true);
      expect(validation.invalid(['lines', 'L-2']).get()).toBe(true);
      expect(validation.invalid(['lines']).get()).toBe(true);
      expect(validation.invalid().get()).toBe(true);
      expect(validation.invalid(['lines', 'L-1']).get()).toBe(false);
      expect(validation.invalid(['customer']).get()).toBe(false);
    });

    it('同じパスなら同じオブジェクトを返す（id は文字列に揃える）', () => {
      const { validation } = setup();
      expect(validation.issues(['lines', 'L-1'])).toBe(
        validation.issues(['lines', 'L-1']),
      );
      expect(validation.invalid()).toBe(validation.invalid([]));
    });

    it('結果が変わらなければ同じ配列を返し、購読者を呼ばない', () => {
      const { order, validation } = setup();
      const listener = vi.fn();
      validation.issues(['customer']).subscribe(listener);
      order.field('customer').set('');
      const first = validation.issues(['customer']).get();
      order.list('lines').record('L-1').field('price').set(1);
      expect(validation.issues(['customer']).get()).toBe(first);
      expect(listener).toHaveBeenCalledTimes(1);
      order.field('customer').set('Bob');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('オプションの規則', () => {
    it('関数を渡すと、つないだモデル全体に当てる', () => {
      const order = createRecordModel(orderDefinition, {
        defaultData: createOrder(),
      });
      const validation = createModelValidation(order, {
        validate: (data) =>
          data.tags.length > 1 ? [{ path: ['tags'], message: 'Too many' }] : [],
      });
      expect(validation.issues(['tags']).get()).toEqual([]);
      order.field('tags').set(['a', 'b']);
      expect(validation.issues(['tags']).get()).toEqual([
        { message: 'Too many' },
      ]);
    });

    it('Standard Schema の結果のパスの添字を、行の id に変える', () => {
      const order = createRecordModel(orderDefinition, {
        defaultData: createOrder(),
      });
      const validation = createModelValidation(order, {
        validate: schema(() => ({
          issues: [
            { message: 'Bad price', path: ['lines', 1, 'price'] },
            { message: 'Bad tag', path: ['tags', 0] },
            { message: 'Bad zip', path: [{ key: 'shipping' }, { key: 'zip' }] },
            { message: 'Whole' },
          ],
        })),
      });
      expect(validation.issues(['lines', 'L-2', 'price']).get()).toEqual([
        { message: 'Bad price' },
      ]);
      // 値の配列の Field の要素は指せないので、Field に付ける
      expect(validation.issues(['tags']).get()).toEqual([
        { message: 'Bad tag' },
      ]);
      expect(validation.issues(['shipping', 'zip']).get()).toEqual([
        { message: 'Bad zip' },
      ]);
      expect(validation.issues().get()).toEqual([{ message: 'Whole' }]);
    });

    it('Standard Schema で、id で指せない行の結果は List に付ける', () => {
      const data = createOrder();
      const order = createRecordModel(orderDefinition, {
        defaultData: {
          ...data,
          lines: [...data.lines, { ...data.lines[0]!, lineId: 'L-1' }],
        },
      });
      const validation = createModelValidation(order, {
        validate: schema(() => ({
          issues: [{ message: 'Duplicate', path: ['lines', 3, 'price'] }],
        })),
      });
      expect(validation.issues(['lines']).get()).toEqual([
        { message: 'Duplicate' },
      ]);
    });

    it('Standard Schema が非同期なら、警告して無視する', () => {
      const order = createRecordModel(orderDefinition, {
        defaultData: createOrder(),
      });
      const validation = createModelValidation(order, {
        validate: schema(() =>
          Promise.resolve({ issues: [{ message: 'Async' }] }),
        ),
      });
      expect(validation.issues().get()).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('外から入れる結果', () => {
    it('出どころごとに置き、規則の結果とまとめて読む。setIssues は出どころを丸ごと置き換える', () => {
      const { order, validation } = setup();
      order.field('customer').set('');
      validation.setIssues('server', [
        { path: ['customer'], message: 'Server' },
        { path: ['lines', 'L-1', 'price'], message: 'Too high', code: 'max' },
      ]);
      validation.setIssues('other', [{ message: 'Other' }]);
      expect(validation.issues(['customer']).get()).toEqual([
        { message: 'Required' },
        { message: 'Server' },
      ]);
      // 足したプロパティは保ち、path は外す
      expect(validation.issues(['lines', 'L-1', 'price']).get()).toEqual([
        { message: 'Too high', code: 'max' },
      ]);
      validation.setIssues('server', [{ path: ['customer'], message: 'New' }]);
      expect(validation.issues(['lines', 'L-1', 'price']).get()).toEqual([]);
      expect(validation.issues().get()).toEqual([{ message: 'Other' }]);
    });

    it('setIssuesAt は1つのパスだけ置き換え、空の配列で消す', () => {
      const { validation } = setup();
      validation.setIssuesAt('view', ['customer'], [{ message: 'A' }]);
      validation.setIssuesAt('view', ['orderId'], [{ message: 'B' }]);
      validation.setIssuesAt('view', ['customer'], []);
      expect(validation.issues(['customer']).get()).toEqual([]);
      expect(validation.issues(['orderId']).get()).toEqual([{ message: 'B' }]);
    });

    it('clearIssues は出どころを、省略するとすべてを消す', () => {
      const { validation } = setup();
      validation.setIssues('a', [{ message: 'A' }]);
      validation.setIssues('b', [{ message: 'B' }]);
      validation.clearIssues('a');
      expect(validation.issues().get()).toEqual([{ message: 'B' }]);
      validation.clearIssues();
      expect(validation.invalid().get()).toBe(false);
    });

    it('規則の結果が変わっても、外から入れた結果は残る', () => {
      const { order, validation } = setup();
      validation.setIssues('server', [{ path: ['customer'], message: 'S' }]);
      order.field('customer').set('');
      order.field('customer').set('Bob');
      expect(validation.issues(['customer']).get()).toEqual([{ message: 'S' }]);
    });

    it('clearOnChange なら、値が入れたときと違う間は読まない（戻せばまた読む）', () => {
      const { order, validation } = setup();
      validation.setIssues('server', [{ path: ['customer'], message: 'S' }], {
        clearOnChange: true,
      });
      expect(validation.invalid().get()).toBe(true);
      order.field('customer').set('Bob');
      expect(validation.issues(['customer']).get()).toEqual([]);
      order.field('customer').set('Alice');
      expect(validation.issues(['customer']).get()).toEqual([{ message: 'S' }]);
    });

    it('データから消えた行の結果は読まない。同じ id の行が戻れば、また読む', () => {
      const { order, validation } = setup();
      validation.setIssues('server', [
        { path: ['lines', 'L-2', 'price'], message: 'S' },
      ]);
      const removed = order.list('lines').record('L-2').get()!;
      order.list('lines').remove(['L-2']);
      expect(validation.invalid(['lines']).get()).toBe(false);
      order.list('lines').insert([removed]);
      expect(validation.issues(['lines', 'L-2', 'price']).get()).toEqual([
        { message: 'S' },
      ]);
    });
  });

  describe('つなぐモデル', () => {
    it('下位のモデルにつなぐと、パスはそのモデルからの相対パス', () => {
      const { order } = setup();
      const line = order.list('lines').record('L-2');
      const validation = createModelValidation(line);
      line.field('price').set(-1);
      expect(validation.issues(['price']).get()).toEqual([
        { message: 'Negative' },
      ]);
      validation.setIssues('server', [{ path: ['product'], message: 'S' }]);
      expect(validation.invalid().get()).toBe(true);
    });

    it('Field のモデルにつなげる', () => {
      const keyword = createFieldModel<string>(
        { validate: (value) => (value.length >= 2 ? undefined : 'Too short') },
        { defaultData: 'a' },
      );
      const validation = createModelValidation(keyword);
      expect(validation.issues().get()).toEqual([{ message: 'Too short' }]);
      keyword.set('ab');
      expect(validation.invalid().get()).toBe(false);
    });

    it('派生モデルにつなぐと警告する', () => {
      const { order } = setup();
      createModelValidation(createDerivedList(order.list('lines')) as never);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  it('定義の規則の引数に、値の型が付く', () => {
    const definition: RecordDefinition<Order> = {
      kind: 'record',
      fields: {
        customer: {
          validate: (customer) => {
            expectTypeOf(customer).toEqualTypeOf<string>();
            return undefined;
          },
        },
        billing: {
          kind: 'record',
          validate: (billing) => {
            expectTypeOf(billing).toEqualTypeOf<{
              zip: string;
              address: string;
            }>();
            return undefined;
          },
        },
      },
    };
    expect(definition.kind).toBe('record');
  });
});
