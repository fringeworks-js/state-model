import type { ModelListener, ReadonlyModel } from '../types';
import _createDerivedModel from './_createDerivedModel';

/**
 * 購読の数を数えられる上流
 */
function createSource(initial: number) {
  let value = initial;
  const listeners = new Set<ModelListener<number>>();
  const source: ReadonlyModel<number> = {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const set = (next: number) => {
    const previousValue = value;
    value = next;
    listeners.forEach((listener) => listener({ value, previousValue }));
  };
  return { source, set, listeners };
}

describe('_createDerivedModel', () => {
  it('上流の値か状態が変わったときだけ作り直す', () => {
    const { source, set } = createSource(1);
    const compute = vi.fn((input: number, state: number) => input * state);
    const derived = _createDerivedModel<number, number, number>(
      source,
      10,
      compute,
    );
    expect(derived.get()).toBe(10);
    expect(derived.get()).toBe(10);
    expect(compute).toHaveBeenCalledTimes(1);
    set(2);
    expect(derived.get()).toBe(20);
    derived.setState(100);
    expect(derived.get()).toBe(200);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('前の上流の値・状態・結果を compute に渡す', () => {
    const { source, set } = createSource(1);
    const compute = vi.fn(
      (
        input: number,
        _state: null,
        previous: { input: number; output: number } | undefined,
      ) => previous?.output ?? input,
    );
    const derived = _createDerivedModel(source, null, compute);
    derived.get();
    set(2);
    expect(derived.get()).toBe(1);
    expect(compute).toHaveBeenLastCalledWith(2, null, {
      input: 1,
      state: null,
      output: 1,
    });
  });

  it('購読者がいる間だけ上流を購読する', () => {
    const { source, set, listeners } = createSource(1);
    const derived = _createDerivedModel(source, 1, (input) => input);
    expect(listeners.size).toBe(0);
    const listener = vi.fn();
    const unsubscribeA = derived.subscribe(derived.get, listener);
    const unsubscribeB = derived.subscribe(derived.get, () => {});
    expect(listeners.size).toBe(1);
    set(2);
    expect(listener).toHaveBeenCalledWith({ value: 2, previousValue: 1 });

    unsubscribeA();
    unsubscribeA(); // 2回呼んでも数を減らしすぎない
    expect(listeners.size).toBe(1);
    unsubscribeB();
    expect(listeners.size).toBe(0);
  });

  it('状態を変えたら購読者に知らせる。結果が同じなら呼ばない', () => {
    const { source } = createSource(1);
    const derived = _createDerivedModel(source, 1, (input, state: number) =>
      state > 0 ? input : -input,
    );
    const listener = vi.fn();
    derived.subscribe(derived.get, listener);
    derived.setState(2);
    expect(listener).not.toHaveBeenCalled();
    derived.setState(-1);
    expect(listener).toHaveBeenCalledWith({ value: -1, previousValue: 1 });
  });
});
