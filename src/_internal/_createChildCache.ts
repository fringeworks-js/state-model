/**
 * 子のモデルのキャッシュ\
 * WeakRef で持ち、誰も持っていなければ回収されてよい。回収されたものの項目は FinalizationRegistry で消す
 */
export default function _createChildCache() {
  const map = new Map<string, WeakRef<object>>();
  const registry = new FinalizationRegistry<string>((key) => {
    const ref = map.get(key);
    if (ref && ref.deref() === undefined) {
      map.delete(key);
    }
  });
  return {
    get<P extends object>(key: string, create: () => P): P {
      const cached = map.get(key)?.deref();
      if (cached) {
        return cached as P;
      }
      const model = create();
      map.set(key, new WeakRef(model));
      registry.register(model, key);
      return model;
    },
    /** キャッシュの項目の数（テストで回収を確かめるため） */
    get size() {
      return map.size;
    },
  };
}
