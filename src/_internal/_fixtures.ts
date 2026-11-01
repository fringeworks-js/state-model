import type { RecordDefinition } from '../types';

/**
 * テストで使うデータと定義
 */
export type Line = { lineId: string; product: string; price: number };

export type Order = {
  orderId: string;
  customer: string;
  tags: string[];
  shipping: { zip: string; address: string };
  billing?: { zip: string; address: string };
  lines: Line[];
};

export const lineDefinition: RecordDefinition<Line> = {
  kind: 'record',
  fields: { product: {}, price: {} },
};

export const orderDefinition: RecordDefinition<Order> = {
  kind: 'record',
  fields: {
    customer: {},
    tags: {},
    shipping: { kind: 'record', fields: { zip: {}, address: {} } },
    lines: { kind: 'list', id: 'lineId', record: lineDefinition },
  },
};

export function createOrder(lineCount = 3): Order {
  return {
    orderId: 'O-1',
    customer: 'Alice',
    tags: ['a'],
    shipping: { zip: '100', address: 'Tokyo' },
    lines: Array.from({ length: lineCount }, (_, index) => ({
      lineId: `L-${index + 1}`,
      product: `P${index + 1}`,
      price: (index + 1) * 100,
    })),
  };
}
