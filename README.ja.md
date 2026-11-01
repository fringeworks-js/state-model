# @fringeworks/state-model

`@fringeworks/state-model` は一覧・フォーム・入力欄の状態を List・Record・Field の決まった形で持ち、キーと id のパスで指して書き換えずに更新する、誰かにとっては便利なライブラリです。\
データは素のオブジェクト・配列のまま扱い、変更は変わった所だけを作り直した新しいデータになります。購読すると、自分が指すデータが変わったときだけ知らせを受け取れます。

**[English README is available here](./README.md)**

## 特徴

- **3種類のモデル**: 一覧は List、フォームは Record、単独の値は Field で扱います。Record の項目に List や Record を入れ子にできます
- **データは1か所**: ルートのモデルだけがデータにつながり、`list()`・`record()`・`field()` で取り出した下位のモデルから読み書きします。下位のモデルの読み書きは、ルートのモデルに取り次がれます
- **書き換えない**: 変更は変わった所だけを作り直し、変わらない Record は同じ参照のまま残します。React の `memo` や `useSyncExternalStore` とそのまま噛み合います
- **自分のデータだけを知らせる**: 購読は、そのモデルの値（参照）が変わったときだけ呼ばれます
- **制御・非制御**: React の制御・非制御コンポーネントと同じ考え方で、データをモデルの中に持つ形（非制御）と、利用者の state（React の `useState`・zustand・Redux など）を参照する形（制御）のどちらでも作れます
- **派生モデル**: 一覧を絞り込み・並べ替えた結果や、グループに分けた結果を、元のデータを加工せずに持てます。上流が変われば結果も作り直され、派生モデルの上に派生モデルを重ねることもできます
- **環境を問わない**: DOM も React も使いません。React からは [`@fringeworks/react-state-model`](https://github.com/fringeworks-js/react-state-model) で使います

## インストール

```sh
npm install @fringeworks/state-model
```

## モデルの種類と用語

| モデルの種類 | データ                                   | 主な使い道                   |
| ------------ | ---------------------------------------- | ---------------------------- |
| List         | id を持つ Record の配列                  | 一覧（表・リスト・チャート） |
| Record       | 項目を持つオブジェクト                   | フォーム                     |
| Field        | Record の中の1つの値（どんな値でもよい） | 入力欄                       |

| 用語               | 意味                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ルートのモデル     | `createListModel`・`createRecordModel`・`createFieldModel` で作るモデル。データにつながっているのはルートのモデルだけで、`receive()` を持つ                                                                       |
| 下位のモデル       | ルートのモデルから `list()`・`record()`・`field()`・`at()` で取り出したモデル。読み書きはルートのモデルに取り次がれる                                                                                             |
| キーと id のパス   | ルートのモデルのデータの中で値がどこにあるかを、Record のキーと List の id を順に並べた配列で表したもの（例: `['lines', 'L-3', 'price']`）。配列の添字は使わない。以下、単に「パス」とも書く                      |
| モデルが指すデータ | モデルのパスにある値。`get()` で読む                                                                                                                                                                              |
| データの持ち主     | 制御のときに `data` を渡した側（React の `useState`、zustand・Redux のストアなど）。データの持ち主が新しいデータを渡し直すまで、モデルのデータは変わらない                                                        |
| 反映待ちのデータ   | 制御のときに書いた変更のうち、データの持ち主がまだ渡し直していないもの                                                                                                                                            |
| 派生モデル         | 一覧のモデル（List のモデルや別の派生モデル）を基に、絞り込み・並べ替えた結果（`createDerivedList`）や、グループに分けた結果（`createGroupedList`）を返すモデル。元のデータは変えず、上流が変われば結果を作り直す |

## 使い方

### 定義を書き、ルートのモデルを作る

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

### 下位のモデルを取り出して読み書きする

```ts
const lines = order.list('lines');
const line = lines.record('L-3'); // id で行を指す
const price = line.field('price');

price.get(); // 1000
price.set(1200); // ルートのモデルのデータの、該当する所だけが作り直される
price.set((prev) => (prev ?? 0) + 100);

line.update({ product: 'Pen', price: 300 }); // 複数の項目をまとめて変える
lines.insert([{ lineId: 'L-4', product: 'Ink', price: 500 }]); // 末尾に足す
lines.remove(['L-1']);
```

- 同じルートのモデル・同じパスなら、いつでも同じオブジェクトが返ります（`lines.record('L-3') === lines.record('L-3')`）
- メソッドは取り出しても動きます（`onChange={price.set}` のように渡せます）

### 購読する

```ts
const unsubscribe = price.subscribe(({ value, previousValue }) => {
  console.log(previousValue, '→', value);
});
```

listener は、そのモデルの `get()` の値（参照）が変わったときだけ呼ばれます。ほかの行や項目が変わっても呼ばれません。一覧を描くときは、行の中身が変わっても変わらない `ids()`（id の並び）を購読し、行ごとに行のモデルを購読すると、変わった行だけを描き直せます。

### 絞り込み・並べ替える（派生モデル）

`createDerivedList` で、一覧のモデルを絞り込み・並べ替えた派生モデルを作ります。元の List のモデルの `get()` は元の並びのままです。

```ts
import { createDerivedList } from '@fringeworks/state-model';

const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0,
  sort: (a, b) => a.price - b.price,
});

visible.get(); // 絞り込み・並べ替えた行（行は元のデータと同じ参照）
visible.ids().get(); // 結果の id の並び

visible.setFilter((line) => line.product.includes('Pen')); // 条件を差し替える
visible.setSort(undefined); // 並べ替えを外す（元の順に戻る）

visible.record('L-3').field('price').set(1200); // 行の編集は元のデータに届く
visible.remove(['L-1']); // 削除も元の List に取り次ぐ
```

- 結果は、元のデータか条件が変わったときだけ作り直します。結果の行と順番が前と同じなら、前の配列を返し、購読者も呼びません（絞り込まれて見えない行を編集しても、一覧は描画し直しません）
- 派生モデルの上に、さらに派生モデルを作れます（`createDerivedList(visible, { ... })`）
- 行を足すときは、元の List のモデル（`visible.source` でたどれる）の `insert` を使います。絞り込みの条件に合わない行は、足しても結果には現れません

### グループに分ける（派生モデル）

`createGroupedList` で、一覧のモデルをグループに分けた派生モデルを作ります。行の絞り込み・並べ替えは上流の `createDerivedList` で、グループの絞り込み・並べ替えは `createGroupedList` で行います。

```ts
import { createDerivedList, createGroupedList } from '@fringeworks/state-model';

const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0, // 行の絞り込み
  sort: (a, b) => a.price - b.price, // 行の並べ替え（グループの中の順になる）
});
const grouped = createGroupedList(visible, {
  groupBy: 'category', // キーの名前か、行からキーを取り出す関数
  filterGroups: (group) => group.records.length >= 2, // グループの絞り込み
  sortGroups: (a, b) => total(b.records) - total(a.records), // グループの並べ替え
});

grouped.get(); // [{ key: 'Pen', records: [...], ids: ['L-3', ...] }, ...]
grouped.record('L-3').field('price').set(1200); // 行の編集は元のデータに届く
```

- グループは、既定では上流での最初の出現順に並びます。`sortGroups` を指定すると、グループを集計した値（合計・件数など）の順に並べられます
- `filterGroups`・`sortGroups` が受け取るグループの `records` は、上流で絞り込んだ後の行です
- 中身（行と順番）が変わらないグループは、同じオブジェクトのまま返します。グループの部品を `memo` にすれば、変わったグループだけが描画し直します
- 行のグループのキーを書き換えると、行は別のグループに移ります

### 編集しても当て直さない（入力画面）

派生モデルは、上流が変わるとすぐ絞り込み・並べ替えを当て直します。入力画面では、絞り込みの条件から外れる値を入力した瞬間に行が消えたり、並べ替えのキーを編集した瞬間に行が飛んだりします。`filterRefresh`・`sortRefresh` を `'manual'` にすると、上流が変わっても当て直さず、`refresh()` を呼ぶか条件を差し替えたときに当て直します。

```ts
const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0,
  sort: (a, b) => a.price - b.price,
  filterRefresh: 'manual', // 条件から外れた行も、当て直すまで残す
  sortRefresh: 'manual', // 並び順を、当て直すまで保つ
});

visible.refresh(); // 今の条件で当て直す
```

| 上流の変化                                     | 当て直さないモードでの動き                                           |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| 行の中身が変わった（編集）                     | 結果に入る行と並び順は保ち、行の中身は新しいものにする               |
| 行が消えた                                     | 結果からも消える                                                     |
| 行が足された                                   | 条件を当てずに末尾に足す（足した空の行が、絞り込みで消えずに見える） |
| 条件・モードを差し替えた、`refresh()` を呼んだ | 当て直す                                                             |

- 絞り込みと並べ替えは別々に選べます。「完了にした行はすぐ消すが、優先度を編集しても位置は動かさない」なら、`sortRefresh` だけを `'manual'` にします
- グループ化した派生モデルも同じオプションを持ちます。`filterRefresh` はグループ分け（`groupBy`）とグループの絞り込みを、`sortRefresh` はグループの並べ替えを受け持ちます。`'manual'` なら、グループのキーを書き換えた行も、当て直すまで元のグループに残ります。行が無くなったグループは消えます
- 「編集が終わったら当て直す」などのきっかけは、画面の側で `refresh()` を呼んで作ります

### 利用者の state を参照する（制御）

`data` と `onChangeData` を渡すと、モデルはデータを中に持たず、書き込みを `onChangeData` でデータの持ち主に依頼します。データの持ち主が新しいデータを渡し直したら、`receive` で受け取ります。

```ts
const order = createRecordModel(orderDefinition, {
  data: store.getState().order,
  onChangeData: (order) => store.setState({ order }),
});
store.subscribe((state) => order.receive(state.order));
```

- 書いた直後の `get()` は、データの持ち主が渡し直すまで古い値を返します。`get()` は常に、データの持ち主から受け取ったデータを返します
- 同じ処理の中で続けて書いても、前の変更は消えません。反映待ちのデータの上に、次の変更を積みます
- 反映待ちのデータは、`receive` で受け取ったとき、または次のマクロタスク（`setTimeout`）で捨てます。データの持ち主が変更を受け入れなかった場合も、次のタスクの書き込みには混ざりません

### パスの配列から指す

設定（JSON）やパスの表から使うときは、`at(path)` でキーと id のパスからモデルを作ります。モデルの種類は定義をたどって実行時に決めるので、戻り値は `kind` で絞り込みます。

```ts
const model = order.at(['lines', 'L-3', 'price']);
if (model.kind === 'field') {
  model.set(1200);
}
```

## 知っておくこと

- **id**: List の Record には id が要ります。id は文字列に揃えます（`3` と `'3'` は同じ id）。`ids()` とパスの id は文字列なので、数値の id を数値として使うときは `Number()` で戻します。有効な id は文字列と有限の数値だけです
- **id が無い行・重複した行**: データには残したまま、id で指せなくなります（`ids()` に含めず、`record(id)` で指せません）。重複した id は先にある行を指します。`remove` は同じ id の行をすべて消します。どちらも開発時に警告します
- **モデルが指すデータが無いとき**: `get()` は `undefined` を返します。書き込みは、直接の親があるときだけ行います（消えた行への書き込みは何もしません）。省略できる入れ子が無いときは、丸ごと `set` すれば書けます。List の行は `insert` でしか増えません
- **id の書き換え**: 行の id を書き換えると、その行を指していたモデルは、その後は何も指しません。別の行と重複する id や、有効でない id への書き換えは行いません
- **比べ方**: 変わったかどうかは `Object.is` で比べます。同じ値の `set` は何もしません。中身が同じでも、新しいオブジェクトを `set` すれば変化として扱います
- **関数の値**: `set` に渡した関数は「前の値から新しい値を作る関数」として扱うので、関数そのものを Field の値にはできません（React の `setState` と同じ）
- **定義に無いキー**: 呼んだメソッドがモデルの種類を決めます（定義に無いキーに `list()` を呼べば List として扱い、id は既定の `'id'` で読みます）。`at(path)` は定義が無い所をキーでたどるので、設定から List の行を指すには定義が要ります
- **開発時の警告**: 上の場面では `console.warn` で知らせます。`process.env.NODE_ENV` が `'production'` のときは出しません
- **扱わないもの**: サーバーからのデータの取得・キャッシュ・取得の状態（読み込み中など）は扱いません。React Query・SWR などで取得し、その結果をルートのモデルに渡してください
- **派生モデルの `record(id)`**: 結果に含まれない行（絞り込まれた行）も指します。元の List のモデルの `record(id)` と同じオブジェクトを返すので、絞り込みの条件が変わっても、編集中のフォームは行を指し続けます。結果に含まれるかは `ids()` で確かめます
- **絞り込み・並べ替えの関数**: 結果を作り直すたびに呼ばれます。行を書き換えず、同じ行には同じ答えを返す関数にしてください。並べ替えは安定で、同じ順位の行は元の順を保ちます
- **条件が無いとき**: 派生モデルは、絞り込み・並べ替えの条件が無ければ（外したときも）、上流の値をそのまま（同じ配列で）返します。グループ化した派生モデルは、`filterGroups`・`sortGroups` が無ければ、グループに分けただけの結果を返します。ただし、上流が無い（省略できる List が `undefined`）ときは、空の配列を返します
- **当て直さないモードで保つ結果**: 最後に作った結果を保ちます。購読者がいれば上流が変わるたびに結果を作るので、画面に表示している結果がそのまま保たれます
- **グループのキー**: キーは `Map` と同じ規則（SameValueZero）で比べます。React の `key` に使うときは、キーが文字列でなければ `String(group.key)` などで文字列にしてください
- **オプションの名前**: `data`・`defaultData`・`onChangeData` は 0.x の間に変わることがあります

## API

### `createRecordModel`

```ts
createRecordModel<T>(
  definition: RecordDefinition<T>,
  options: RecordModelOptions<T>,
): RecordModel<T> & ModelRoot<T>
```

Record のルートのモデルを作ります（フォームなど）。

| 引数         | 型                      | 説明                                   |
| ------------ | ----------------------- | -------------------------------------- |
| `definition` | `RecordDefinition<T>`   | Record の定義                          |
| `options`    | `RecordModelOptions<T>` | 下記のオプション（どちらかの形で渡す） |

| オプション     | 型                  | 説明                                                                 |
| -------------- | ------------------- | -------------------------------------------------------------------- |
| `defaultData`  | `T`                 | 非制御: 初めのデータ。モデルが中に持つ                               |
| `data`         | `T`                 | 制御: データの持ち主のデータ                                         |
| `onChangeData` | `(data: T) => void` | 制御: 書き込みをデータの持ち主に依頼する。新しいデータ全体を受け取る |

### `createListModel`

```ts
createListModel<E>(
  definition: ListDefinition<E>,
  options: ListModelOptions<E>,
): ListModel<E> & ModelRoot<readonly E[]>
```

List のルートのモデルを作ります（一覧など）。オプションは `createRecordModel` と同じで、データの型は `readonly E[]` です。

### `createFieldModel`

```ts
createFieldModel<V>(
  definition: FieldDefinition,
  options: FieldModelOptions<V>,
): FieldModel<V> & ModelRoot<V>
```

Field のルートのモデルを作ります（単独の入力など）。オプションは `createRecordModel` と同じで、データの型は `V` です。今の Field の定義に書けるものは `kind` だけなので、`{}` を渡します。

### `ReadonlyModel<V>`

読んで購読できるもの。3種類のモデルはこれを広げたもので、`ids()` の戻り値もこの型です。

| メソッド              | 説明                                               |
| --------------------- | -------------------------------------------------- |
| `get()`               | 値を読む。変化が無ければ同じ参照を返す             |
| `subscribe(listener)` | 値が変わったら listener を呼ぶ。解除する関数を返す |

#### `subscribe`

```ts
subscribe(listener: ModelListener<V>): () => void
```

`get()` の値（参照）が変わったら、listener に `{ value, previousValue }` を渡して呼びます。`value` は呼ぶ時点の `get()` の値、`previousValue` はその listener に前回渡した値（最初の通知では購読した時点の値）です。モデルが指すデータが消えたとき・また現れたときも、`undefined` との間の変化として知らせます。listener の中で書き込んだ変更は、今の通知を回し終えてから次の回で知らせます。

### `FieldModel<V>` / `RecordModel<T>` / `ListModel<E>`

3種類に共通のメンバー（`ReadonlyModel` のものに加えて）。

| メンバー     | 説明                                                   |
| ------------ | ------------------------------------------------------ |
| `kind`       | モデルの種類（`'field'`・`'record'`・`'list'`）        |
| `path`       | ルートのモデルからのキーと id のパス（凍結した配列）   |
| `set(value)` | 値を書く。前の値を受け取って新しい値を返す関数も渡せる |

`RecordModel` のメンバー。

| メソッド         | 説明                                                               |
| ---------------- | ------------------------------------------------------------------ |
| `update(values)` | 複数の項目をまとめて変える                                         |
| `field(key)`     | 項目の Field のモデル                                              |
| `record(key)`    | 入れ子の Record のモデル                                           |
| `list(key)`      | 入れ子の List のモデル                                             |
| `at(path)`       | このモデルからの相対的なキーと id のパスで、下位のモデルを取り出す |

`ListModel` のメンバー。

| メソッド          | 説明                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `insert(records)` | 末尾に足す                                                                              |
| `remove(ids)`     | id の行をすべて消す                                                                     |
| `record(id)`      | id の行の Record のモデル                                                               |
| `ids()`           | id の並びを読むモデル                                                                   |
| `at(path)`        | このモデルからの相対的なキーと id のパスで、下位のモデルを取り出す（最初の段は行の id） |

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

項目の下位のモデルを返します。`field()` はどのキーにも、`record()` は素のオブジェクトのキーに、`list()` はオブジェクトの配列のキーに使えます。省略できる項目（`billing?:`）のモデルは、`get()` が `undefined` を含みます。

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

#### `at`

```ts
at(path: readonly RecordId[]): UnknownModel
```

このモデルからの相対的なキーと id のパスで、下位のモデルを取り出します。定義をたどって、List の中では id、Record の中ではキーとして読みます。定義が無い所はキーでたどり（Record として扱う）、最後の段は Field にします。`list()` などでたどった場合と同じオブジェクトを返します（`line.at(['price'])` と `order.at(['lines', 'L-3', 'price'])` は同じもの）。空のパスなら、そのモデル自身を返します。Field のモデルは `at()` を持ちません。

### `ModelRoot<D>`

ルートのモデルだけが持つメンバー。

| メソッド        | 説明                                                 |
| --------------- | ---------------------------------------------------- |
| `receive(data)` | 制御のとき、データの持ち主から新しいデータを受け取る |

#### `receive`

```ts
receive(data: D, options?: ModelReceiveOptions): void
```

制御のとき、データの持ち主が渡し直したデータを受け取ります。反映待ちのデータを捨て、値が変わったモデルの購読者に知らせます。非制御のルートのモデルでは何もしません（開発時に警告します）。

| オプション | 型        | 説明                                                                                                                                                                                                        |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `silent?`  | `boolean` | データを受け取るが、購読者には知らせない。知らせていない変化は、次の `receive` で（データが同じでも）知らせる。React の描画の中で受け取り、描画の後に知らせるときに使う（react-state-model の hook が使う） |

### `createDerivedList`

```ts
createDerivedList<E, S extends ListSource<E>>(
  source: S,
  options?: DerivedListOptions<E>,
): DerivedList<E, S>
```

一覧のモデルを絞り込み・並べ替えた、派生モデルを作ります。

| 引数       | 型                      | 説明                                               |
| ---------- | ----------------------- | -------------------------------------------------- |
| `source`   | `S`                     | 上流のモデル（`ListModel` か、別の `DerivedList`） |
| `options?` | `DerivedListOptions<E>` | 下記のオプション                                   |

| オプション       | 型                       | 説明                                                                                           |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `filter?`        | `(record: E) => boolean` | 絞り込みの条件。行を受け取り、残すなら `true` を返す                                           |
| `sort?`          | `(a: E, b: E) => number` | 並べ替えの条件。`Array.prototype.sort` と同じ比較の関数                                        |
| `filterRefresh?` | `RefreshMode`            | 上流が変わったときに絞り込みを当て直すか（既定は `'auto'`）。`'manual'` なら結果に入る行を保つ |
| `sortRefresh?`   | `RefreshMode`            | 上流が変わったときに並べ替えを当て直すか（既定は `'auto'`）。`'manual'` なら並び順を保つ       |

### `DerivedList<E, S>`

標準の派生モデル。`ReadonlyModel<readonly E[]>` のメンバーに加えて、次のものを持ちます。

| メンバー                 | 説明                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `source`                 | つないだ上流のモデル                                                                                                                |
| `ids()`                  | 結果の id の並びを読むモデル                                                                                                        |
| `record(id)`             | 上流の id の行の Record のモデル                                                                                                    |
| `remove(ids)`            | id の行をすべて消す（上流に取り次ぐ）                                                                                               |
| `at(path)`               | 上流からの相対的なキーと id のパスで、下位のモデルを取り出す（上流に取り次ぐ。最初の段は行の id。空のパスなら上流の List のモデル） |
| `setFilter(filter)`      | 絞り込みの条件を差し替える                                                                                                          |
| `setSort(sort)`          | 並べ替えの条件を差し替える                                                                                                          |
| `setFilterRefresh(mode)` | 絞り込みを当て直すかを差し替える                                                                                                    |
| `setSortRefresh(mode)`   | 並べ替えを当て直すかを差し替える                                                                                                    |
| `refresh()`              | 今の条件で当て直す                                                                                                                  |

#### `ids`

```ts
ids(): ReadonlyModel<readonly string[]>
```

結果の id の並びを読むモデルを返します。結果の行が増える・減る・順番が変わるときだけ値が変わります。

#### `record`

```ts
record(id: RecordId): RecordModel<E, true>
```

上流の id の行の Record のモデルを返します。上流から取り出したものと同じオブジェクトで、結果に含まれない行も指します。

#### `remove`

```ts
remove(ids: readonly RecordId[]): void
```

id の行をすべて消します。上流に取り次ぎ、ルートのモデルのデータから消えます。

#### `setFilter` / `setSort`

```ts
setFilter(filter: ((record: E) => boolean) | undefined): void
setSort(sort: ((a: E, b: E) => number) | undefined): void
```

条件を差し替え、結果が変われば購読者に知らせます。`undefined` を渡すと条件を外します（並べ替えを外すと、上流の順に戻ります）。

#### `setFilterRefresh` / `setSortRefresh` / `refresh`

```ts
setFilterRefresh(mode: RefreshMode): void
setSortRefresh(mode: RefreshMode): void
refresh(): void
```

当て直すかを差し替えるか、今の条件で当て直します。どれも、呼んだ時点の条件で結果を作り直します。

### `createGroupedList`

```ts
createGroupedList<E, K, S extends ListSource<E>>(
  source: S,
  options: GroupedListOptions<E, K>,
): GroupedList<K, E, S>
```

一覧のモデルをグループに分けた、派生モデルを作ります。`groupBy` にキーの名前を渡したときは、キーの型（`K`）はその項目の型になります。

| 引数      | 型                         | 説明                                         |
| --------- | -------------------------- | -------------------------------------------- |
| `source`  | `S`                        | 上流のモデル（`ListModel` か `DerivedList`） |
| `options` | `GroupedListOptions<E, K>` | 下記のオプション                             |

| オプション       | 型                                                   | 説明                                                                                  |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `groupBy`        | `GroupBy<E, K>`                                      | グループの分け方。キーの名前か、行からキーを取り出す関数                              |
| `filterGroups?`  | `(group: ListGroup<K, E>) => boolean`                | グループの絞り込みの条件。グループを受け取り、残すなら `true` を返す                  |
| `sortGroups?`    | `(a: ListGroup<K, E>, b: ListGroup<K, E>) => number` | グループの並べ替えの条件（既定は上流での出現順）                                      |
| `filterRefresh?` | `RefreshMode`                                        | 上流が変わったときに、グループ分けとグループの絞り込みを当て直すか（既定は `'auto'`） |
| `sortRefresh?`   | `RefreshMode`                                        | 上流が変わったときに、グループの並べ替えを当て直すか（既定は `'auto'`）               |

### `GroupedList<K, E, S>`

グループ化した派生モデル。`ReadonlyModel<readonly ListGroup<K, E>[]>` のメンバーに加えて、次のものを持ちます。

| メンバー                        | 説明                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `source`                        | つないだ上流のモデル                                                           |
| `record(id)`                    | 上流の id の行の Record のモデル                                               |
| `remove(ids)`                   | id の行をすべて消す（上流に取り次ぐ）                                          |
| `at(path)`                      | 上流からの相対的なキーと id のパスで、下位のモデルを取り出す（上流に取り次ぐ） |
| `setGroupBy(groupBy)`           | グループの分け方を差し替える                                                   |
| `setFilterGroups(filterGroups)` | グループの絞り込みの条件を差し替える                                           |
| `setSortGroups(sortGroups)`     | グループの並べ替えの条件を差し替える                                           |
| `setFilterRefresh(mode)`        | グループ分けとグループの絞り込みを当て直すかを差し替える                       |
| `setSortRefresh(mode)`          | グループの並べ替えを当て直すかを差し替える                                     |
| `refresh()`                     | 今の条件で当て直す                                                             |

`record`・`remove` は `DerivedList` と同じです。`setFilterGroups`・`setSortGroups` に `undefined` を渡すと条件を外します（並べ替えを外すと、上流での出現順に戻ります）。

グループ（`ListGroup<K, E>`）は次のプロパティを持ちます。

| プロパティ | 型                  | 説明                                                                    |
| ---------- | ------------------- | ----------------------------------------------------------------------- |
| `key`      | `K`                 | グループのキー                                                          |
| `records`  | `readonly E[]`      | グループの行（上流での順）                                              |
| `ids`      | `readonly string[]` | グループの行の id の並び（id の無い行・重複した id の後の行は含めない） |

### 定義

| 定義                  | 形                              | 説明                                                                                      |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `FieldDefinition`     | `{ kind?: 'field' }`            | 値を入れる Field。`kind` を省略した定義はこれになる                                       |
| `RecordDefinition<T>` | `{ kind: 'record'; fields? }`   | `fields` は項目ごとの定義。書いていない項目は普通の値として扱う                           |
| `ListDefinition<E>`   | `{ kind: 'list'; id?; record }` | `id` は id のキーの名前か、行から id を取り出す関数（既定は `'id'`）。`record` は行の定義 |

定義は素のオブジェクトなので、JSON から作れます（`id` に関数を使う場合を除く）。

### 型

| 型                         | 説明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `FieldModel<V>`            | Field のモデル                                             |
| `RecordModel<T>`           | Record のモデル                                            |
| `ListModel<E>`             | List のモデル                                              |
| `ReadonlyModel<V>`         | 読んで購読できるもの                                       |
| `ModelRoot<D>`             | ルートのモデルだけが持つもの                               |
| `ModelReceiveOptions`      | `receive` のオプション                                     |
| `UnknownModel`             | `at()` が返すモデル（`kind` で絞り込む）                   |
| `ModelChangeEvent<V>`      | listener に渡すもの（`{ value, previousValue }`）          |
| `ModelListener<V>`         | listener                                                   |
| `ModelPath`                | キーと id のパス（`readonly string[]`）                    |
| `RecordId`                 | id として渡せる値（`string \| number`）                    |
| `FieldDefinition`          | Field の定義                                               |
| `RecordDefinition<T>`      | Record の定義                                              |
| `ListDefinition<E>`        | List の定義                                                |
| `DefinitionOf<V>`          | 値の型に合う定義（Field・Record・List のどれか）           |
| `FieldKeys<T>`             | `field()` に渡せるキー                                     |
| `RecordKeys<T>`            | `record()` に渡せるキー                                    |
| `ListKeys<T>`              | `list()` に渡せるキー                                      |
| `RecordModelOptions<T>`    | `createRecordModel` のオプション                           |
| `ListModelOptions<E>`      | `createListModel` のオプション                             |
| `FieldModelOptions<V>`     | `createFieldModel` のオプション                            |
| `DerivedList<E, S>`        | 標準の派生モデル                                           |
| `DerivedListOptions<E>`    | `createDerivedList` のオプション                           |
| `ListSource<E>`            | 派生モデルの上流になれる一覧（`ListModel`・`DerivedList`） |
| `RefreshMode`              | 派生モデルが上流の変化で当て直すか（`'auto'`・`'manual'`） |
| `GroupedList<K, E, S>`     | グループ化した派生モデル                                   |
| `GroupedListOptions<E, K>` | `createGroupedList` のオプション                           |
| `ListGroup<K, E>`          | グループ化した派生モデルの、1つのグループ                  |
| `GroupBy<E, K>`            | グループの分け方（キーの名前か、行からキーを取り出す関数） |
