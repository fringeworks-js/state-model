import createFieldModel from './createFieldModel';

describe('createFieldModel', () => {
  it('非制御: 値を中に持ち、変わったら知らせる', () => {
    const field = createFieldModel<number>({}, { defaultData: 1 });
    const listener = vi.fn();
    field.subscribe(listener);
    expect(field.kind).toBe('field');
    field.set((prev) => prev + 1);
    expect(field.get()).toBe(2);
    expect(listener).toHaveBeenCalledWith({ value: 2, previousValue: 1 });
  });

  it('制御: onChangeData に値を渡し、receive で受け取る', () => {
    const onChangeData = vi.fn();
    const field = createFieldModel<string>(
      { kind: 'field' },
      { data: 'a', onChangeData },
    );
    field.set('b');
    expect(onChangeData).toHaveBeenCalledWith('b');
    expect(field.get()).toBe('a');
    field.receive('b');
    expect(field.get()).toBe('b');
  });
});
