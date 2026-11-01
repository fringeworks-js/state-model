# @fringeworks/state-model

`@fringeworks/state-model` は一覧・フォーム・入力欄の状態を List・Record・Field の決まった形で持ち、住所で指して書き換えずに更新する、誰かにとっては便利なライブラリです。\
データは素のオブジェクト・配列のまま扱い、変更は変わった所だけを作り直した新しいデータになります。購読すると、自分の部分が変わったときだけ知らせを受け取れます。

**[English README is available here](./README.md)**

## 特徴

- **3つの層**: 一覧は List（id を持つ Record の配列）、フォームは Record（項目を持つオブジェクト）、単独の値は Field。Record の項目に List や Record を入れ子にできます
- **データは1か所**: 根のモデルだけがデータを持ち、`list()`・`record()`・`field()` で一部分を切り出して読み書きします。一部分の読み書きは根に取り次がれます
- **書き換えない**: 変更は変わった所だけを作り直し、変わらない Record は同じ参照のまま残します。React の `memo` や `useSyncExternalStore` とそのまま噛み合います
- **自分の部分だけを知らせる**: 購読は、そのモデルの値（参照）が変わったときだけ呼ばれます
- **制御・非制御**: データを中に持つ形と、利用者の state（React の `useState`・zustand・Redux など）を参照する形のどちらでも作れます
- **環境を問わない**: DOM も React も使いません。React からは [`@fringeworks/react-state-model`](https://github.com/fringeworks-js/react-state-model) で使います

## インストール

```sh
npm install @fringeworks/state-model
```

## 使い方

### 定義を書き、根のモデルを作る

データの型は利用者が書き、定義はそれに合っているかを型で確かめます。定義が要るのは、入れ子と List の id がある所だけです。

```ts
import {
  createRecordModel,
  type RecordDefinition,
} from '@fringeworks/state-model';

type Line = { lineId: string; product: string; price: number };
type Order = {
  customer: string;
  tags: string[]; // 値の配列は List ではなく、配列を値に持つ Field
  shipping: { zip: string; address: string };
  lines: Line[];
};

const orderDefinition: RecordDefinition<Order> = {
  kind: 'record',
  fields: {
    shipping: { kind: 'record' },
    lines: { kind: 'list', id: 'lineId', record: { kind: 'record' } },
  },
};

const order = createRecordModel(orderDefinition, { defaultData: initialOrder });
```

### 一部分を切り出して読み書きする

```ts
const lines = order.list('lines');
const line = lines.record('L-3'); // id で行を指す
const price = line.field('price');

price.get(); // 1000
price.set(1200); // 根のデータの該当する所だけが作り直される
price.set((prev) => (prev ?? 0) + 100);

line.update({ product: 'Pen', price: 300 }); // 複数の項目をまとめて変える
lines.insert([{ lineId: 'L-4', product: 'Ink', price: 500 }]); // 末尾に足す
lines.remove(['L-1']);
```

- 同じ根・同じ住所なら、いつでも同じオブジェクトが返ります（`lines.record('L-3') === lines.record('L-3')`）
- メソッドは取り出しても動きます（`onChange={price.set}` のように渡せます）

### 購読する

```ts
const unsubscribe = price.subscribe(({ value, previousValue }) => {
  console.log(previousValue, '→', value);
});
```

listener は、そのモデルの `get()` の値（参照）が変わったときだけ呼ばれます。ほかの行や項目が変わっても呼ばれません。一覧を描くときは、行の中身が変わっても変わらない `ids()`（id の並び）を購読し、行ごとに行のモデルを購読すると、変わった行だけを描き直せます。

### 利用者の state を参照する（制御）

`data` と `onChangeData` を渡すと、モデルはデータを中に持たず、書き込みを `onChangeData` で持ち主に依頼します。持ち主が新しいデータを渡し直したら、`receive` で受け取ります。

```ts
const order = createRecordModel(orderDefinition, {
  data: store.getState().order,
  onChangeData: (order) => store.setState({ order }),
});
store.subscribe((state) => order.receive(state.order));
```

- 書いた直後の `get()` は、持ち主が渡し直すまで古い値を返します。`get()` は常に外から受け取ったデータを返します
- 同じ処理の中で続けて書いても、前の変更は消えません。まだ渡し直されていない変更（反映待ちのデータ）の上に、次の変更を積みます
- 反映待ちのデータは、`receive` で受け取ったとき、または次のマクロタスク（`setTimeout`）で捨てます。持ち主が変更を受け入れなかった場合も、次のタスクの書き込みには混ざりません

### 住所の配列から指す

設定（JSON）や住所の表から使うときは、`at(path)` で住所の配列からモデルを作ります。層は定義をたどって実行時に決めるので、戻り値は `kind` で絞り込みます。

```ts
const model = order.at(['lines', 'L-3', 'price']);
if (model.kind === 'field') {
  model.set(1200);
}
```

## 知っておくこと

- **id**: List の Record には id が要ります。id は文字列に揃えます（`3` と `'3'` は同じ id）。`ids()` と住所の id は文字列なので、数値の id を数値として使うときは `Number()` で戻します。有効な id は文字列と有限の数値だけです
- **id が無い行・重複した行**: データには残したまま、id で指せなくなります（`ids()` に含めず、`record(id)` で指せません）。重複した id は先にある行を指します。`remove` は同じ id の行をすべて消します。どちらも開発時に警告します
- **指す先が無いとき**: `get()` は `undefined` を返します。書き込みは、直接の親があるときだけ行います（消えた行への書き込みは何もしません）。省略できる入れ子が無いときは、丸ごと `set` すれば書けます。List の行は `insert` でしか増えません
- **id の書き換え**: 行の id を書き換えると、その行を指していたモデルはその後は何も指しません。別の行と重複する id や、有効でない id への書き換えは行いません
- **比べ方**: 変わったかどうかは `Object.is` で比べます。同じ値の `set` は何もしません。中身が同じでも、新しいオブジェクトを `set` すれば変化として扱います
- **関数の値**: `set` に渡した関数は「前の値から新しい値を作る関数」として扱うので、関数そのものを Field の値にはできません（React の `setState` と同じ）
- **定義に無いキー**: 呼んだメソッドが種類を決めます（定義に無いキーに `list()` を呼べば List として扱い、id は既定の `'id'` で読みます）。`at(path)` は定義が無い所をキーでたどるので、設定から List の行を指すには定義が要ります
- **開発時の警告**: 上の場面では `console.warn` で知らせます。`process.env.NODE_ENV` が `'production'` のときは出しません
- **扱わないもの**: サーバーからのデータの取得・キャッシュ・取得の状態（読み込み中など）は扱いません。React Query・SWR などで取得し、その結果を根に渡してください
- **オプションの名前**: `data`・`defaultData`・`onChangeData` は 0.x の間に変わることがあります

## API

### `createRecordModel`

```ts
createRecordModel<T>(
  definition: RecordDefinition<T>,
  options: RecordModelOptions<T>,
): RecordModel<T> & ModelRoot<T>
```

Record を根にしたモデルを作ります（フォームなど）。

| 引数         | 型                      | 説明                                   |
| ------------ | ----------------------- | -------------------------------------- |
| `definition` | `RecordDefinition<T>`   | Record の定義                          |
| `options`    | `RecordModelOptions<T>` | 下記のオプション（どちらかの形で渡す） |

| オプション     | 型                  | 説明                                                         |
| -------------- | ------------------- | ------------------------------------------------------------ |
| `defaultData`  | `T`                 | 非制御: 初めのデータ。モデルが中に持つ                       |
| `data`         | `T`                 | 制御: 持ち主のデータ                                         |
| `onChangeData` | `(data: T) => void` | 制御: 書き込みを持ち主に依頼する。新しいデータ全体を受け取る |

### `createListModel`

```ts
createListModel<E>(
  definition: ListDefinition<E>,
  options: ListModelOptions<E>,
): ListModel<E> & ModelRoot<readonly E[]>
```

List を根にしたモデルを作ります（一覧など）。オプションは `createRecordModel` と同じで、データの型は `readonly E[]` です。

### `createFieldModel`

```ts
createFieldModel<V>(
  definition: FieldDefinition,
  options: FieldModelOptions<V>,
): FieldModel<V> & ModelRoot<V>
```

Field を根にしたモデルを作ります（単独の入力など）。オプションは `createRecordModel` と同じで、データの型は `V` です。今の Field の定義に書けるものは `kind` だけなので、`{}` を渡します。

### `ReadonlyModel<V>`

読んで購読できるもの。3層のモデルはこれを広げたもので、`ids()` の戻り値もこの型です。

| メソッド              | 説明                                               |
| --------------------- | -------------------------------------------------- |
| `get()`               | 値を読む。変化が無ければ同じ参照を返す             |
| `subscribe(listener)` | 値が変わったら listener を呼ぶ。解除する関数を返す |

#### `subscribe`

```ts
subscribe(listener: ModelListener<V>): () => void
```

`get()` の値（参照）が変わったら、listener に `{ value, previousValue }` を渡して呼びます。`value` は呼ぶ時点の `get()` の値、`previousValue` はその listener に前回渡した値（最初の通知では購読した時点の値）です。指す先が消えたとき・また現れたときも、`undefined` との間の変化として知らせます。listener の中で書き込んだ変更は、今の通知を回し終えてから次の回で知らせます。

### `FieldModel<V>` / `RecordModel<T>` / `ListModel<E>`

3層に共通のメンバー（`ReadonlyModel` のものに加えて）。

| メンバー     | 説明                                                   |
| ------------ | ------------------------------------------------------ |
| `kind`       | 層（`'field'`・`'record'`・`'list'`）                  |
| `path`       | 根からの住所（凍結した配列）                           |
| `set(value)` | 値を書く。前の値を受け取って新しい値を返す関数も渡せる |

`RecordModel` のメンバー。

| メソッド         | 説明                       |
| ---------------- | -------------------------- |
| `update(values)` | 複数の項目をまとめて変える |
| `field(key)`     | 項目の Field のモデル      |
| `record(key)`    | 入れ子の Record のモデル   |
| `list(key)`      | 入れ子の List のモデル     |

`ListModel` のメンバー。

| メソッド          | 説明                      |
| ----------------- | ------------------------- |
| `insert(records)` | 末尾に足す                |
| `remove(ids)`     | id の行をすべて消す       |
| `record(id)`      | id の行の Record のモデル |
| `ids()`           | id の並びを読むモデル     |

#### `update`

```ts
update(values: Partial<T>): void
```

変わったキーだけを反映します。値が `undefined` のキーは `undefined` にし、渡さなかったキーは変えません。前の値に依存する変更は `set((prev) => ...)` で書きます。

#### `field` / `record` / `list`

```ts
field<K extends FieldKeys<T>>(key: K): FieldModel<T[K]>
record<K extends RecordKeys<T>>(key: K): RecordModel<NonNullable<T[K]>>
list<K extends ListKeys<T>>(key: K): ListModel<NonNullable<T[K]>[number]>
```

項目のモデルを返します。`field()` はどのキーにも、`record()` は素のオブジェクトのキーに、`list()` はオブジェクトの配列のキーに使えます。省略できる項目（`billing?:`）のモデルは、`get()` が `undefined` を含みます。

#### `insert`

```ts
insert(records: readonly E[]): void
```

末尾に足します。id がすでにある行や、id が有効でない行は足さず、開発時に警告します。List が無ければ（省略できる List）、空の List を作って足します。

#### `remove`

```ts
remove(ids: readonly RecordId[]): void
```

id の行をすべて消します（重複している行も消します）。無い id は無視します。

#### `record`（`ListModel`）

```ts
record(id: RecordId): RecordModel<E, true>
```

id の行の Record のモデルを返します。行は消えることがあるので、`get()` は常に `undefined` を含みます。

#### `ids`

```ts
ids(): ReadonlyModel<readonly string[]>
```

id の並びを読むモデルを返します。行が増える・減る・順番が変わるときだけ値が変わり、行の中身が変わっただけなら同じ配列を返します。

### `ModelRoot<D>`

根のモデルだけが持つメンバー。

| メソッド        | 説明                                 |
| --------------- | ------------------------------------ |
| `at(path)`      | 住所の配列からモデルを作る           |
| `receive(data)` | 制御のとき、持ち主のデータを受け取る |

#### `at`

```ts
at(path: readonly RecordId[]): UnknownModel
```

住所の配列からモデルを作ります。定義をたどって、List の中では id、Record の中ではキーとして読みます。定義が無い所はキーでたどり（Record として扱う）、最後の段は Field にします。`list()` などでたどった場合と同じオブジェクトを返します。

#### `receive`

```ts
receive(data: D): void
```

制御のとき、持ち主が渡し直したデータを受け取ります。反映待ちのデータを捨て、値が変わったモデルの購読者に知らせます。非制御の根では何もしません（開発時に警告します）。

### 定義

| 定義                  | 形                              | 説明                                                                                      |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `FieldDefinition`     | `{ kind?: 'field' }`            | 値を入れる Field。`kind` を省略した定義はこれになる                                       |
| `RecordDefinition<T>` | `{ kind: 'record'; fields? }`   | `fields` は項目ごとの定義。書いていない項目は普通の値として扱う                           |
| `ListDefinition<E>`   | `{ kind: 'list'; id?; record }` | `id` は id のキーの名前か、行から id を取り出す関数（既定は `'id'`）。`record` は行の定義 |

定義は素のオブジェクトなので、JSON から作れます（`id` に関数を使う場合を除く）。

### 型

| 型                      | 説明                                              |
| ----------------------- | ------------------------------------------------- |
| `FieldModel<V>`         | Field のモデル                                    |
| `RecordModel<T>`        | Record のモデル                                   |
| `ListModel<E>`          | List のモデル                                     |
| `ReadonlyModel<V>`      | 読んで購読できるもの                              |
| `ModelRoot<D>`          | 根のモデルだけが持つもの                          |
| `UnknownModel`          | `at()` が返すモデル（`kind` で絞り込む）          |
| `ModelChangeEvent<V>`   | listener に渡すもの（`{ value, previousValue }`） |
| `ModelListener<V>`      | listener                                          |
| `ModelPath`             | 住所（`readonly string[]`）                       |
| `RecordId`              | id として渡せる値（`string \| number`）           |
| `FieldDefinition`       | Field の定義                                      |
| `RecordDefinition<T>`   | Record の定義                                     |
| `ListDefinition<E>`     | List の定義                                       |
| `DefinitionOf<V>`       | 値の型に合う定義（Field・Record・List のどれか）  |
| `FieldKeys<T>`          | `field()` に渡せるキー                            |
| `RecordKeys<T>`         | `record()` に渡せるキー                           |
| `ListKeys<T>`           | `list()` に渡せるキー                             |
| `RecordModelOptions<T>` | `createRecordModel` のオプション                  |
| `ListModelOptions<E>`   | `createListModel` のオプション                    |
| `FieldModelOptions<V>`  | `createFieldModel` のオプション                   |
