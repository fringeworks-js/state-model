# @fringeworks/state-model

`@fringeworks/state-model` is a library some will find handy, for holding the state of lists, forms, and inputs in a fixed shape (List, Record, and Field) and updating it by path without mutation.\
Data stays as plain objects and arrays, and a change produces new data in which only the changed parts are rebuilt. Subscribers are notified only when their own part changes.

**[日本語のREADMEはこちら](./README.ja.md)**

## Features

- **Three layers**: a List is a list (an array of records with ids), a Record is a form (an object with fields), and a Field is a single value. Lists and records can be nested in the fields of a record
- **Data in one place**: only the root model holds the data. `list()`, `record()`, and `field()` cut out parts to read and write, and reads and writes on a part go to the root
- **No mutation**: a change rebuilds only the changed parts and keeps unchanged records as the same references. This fits React's `memo` and `useSyncExternalStore` as is
- **Notifies only your part**: a listener is called only when the value (reference) of its model changes
- **Controlled and uncontrolled**: a model can hold the data itself or refer to your state (React's `useState`, zustand, Redux, and so on)
- **Any environment**: it uses neither the DOM nor React. From React, use it with [`@fringeworks/react-state-model`](https://github.com/fringeworks-js/react-state-model)

## Installation

```sh
npm install @fringeworks/state-model
```

## Usage

### Writing a definition and creating a root model

You write the type of the data, and the type system checks that the definition matches it. A definition is needed only where there is nesting or a list id.

```ts
import {
  createRecordModel,
  type RecordDefinition,
} from '@fringeworks/state-model';

type Line = { lineId: string; product: string; price: number };
type Order = {
  customer: string;
  tags: string[]; // An array of values is not a List but a Field whose value is an array
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

### Reading and writing parts

```ts
const lines = order.list('lines');
const line = lines.record('L-3'); // Points to a record by id
const price = line.field('price');

price.get(); // 1000
price.set(1200); // Only the affected parts of the root data are rebuilt
price.set((prev) => (prev ?? 0) + 100);

line.update({ product: 'Pen', price: 300 }); // Changes several fields at once
lines.insert([{ lineId: 'L-4', product: 'Ink', price: 500 }]); // Appends to the end
lines.remove(['L-1']);
```

- The same root and the same path always return the same object (`lines.record('L-3') === lines.record('L-3')`)
- Methods work when detached (you can pass them as `onChange={price.set}`)

### Subscribing

```ts
const unsubscribe = price.subscribe(({ value, previousValue }) => {
  console.log(previousValue, '→', value);
});
```

A listener is called only when the value (reference) returned by `get()` of its model changes. Changes to other records or fields do not call it. When rendering a list, subscribe to `ids()` (the order of ids), which does not change when only the content of a record changes, and subscribe to each record's model per row. Then only the changed rows are rendered again.

### Referring to your state (controlled)

When you pass `data` and `onChangeData`, the model does not hold the data and asks the owner to apply each write through `onChangeData`. When the owner passes new data back, the model takes it with `receive`.

```ts
const order = createRecordModel(orderDefinition, {
  data: store.getState().order,
  onChangeData: (order) => store.setState({ order }),
});
store.subscribe((state) => order.receive(state.order));
```

- Right after a write, `get()` returns the old value until the owner passes the data back. `get()` always returns the data received from outside
- Consecutive writes in the same task do not lose earlier changes. The next change is applied on top of the changes not yet passed back (pending data)
- Pending data is discarded when data is received with `receive`, or in the next macrotask (`setTimeout`). If the owner does not accept a change, it is not mixed into writes in later tasks

### Pointing by a path array

When you use the model from settings (JSON) or a table of paths, create a model from a path array with `at(path)`. The layer is decided at run time by following the definition, so narrow the result with `kind`.

```ts
const model = order.at(['lines', 'L-3', 'price']);
if (model.kind === 'field') {
  model.set(1200);
}
```

## Things to know

- **Ids**: the records of a List need ids. Ids are normalized to strings (`3` and `'3'` are the same id). Ids in `ids()` and in paths are strings, so convert them with `Number()` when you use numeric ids as numbers. Only strings and finite numbers are valid ids
- **Records without an id or with a duplicate id**: they stay in the data but cannot be reached by id (they are not in `ids()`, and `record(id)` cannot point to them). A duplicate id points to the first record. `remove` removes all records with the id. Both cases are warned about during development
- **When a part is missing**: `get()` returns `undefined`. A write happens only when the direct parent exists (writing to a removed record does nothing). An optional nested record that is missing can be written by `set` as a whole. Records are added to a List only by `insert`
- **Changing an id**: when the id of a record changes, the models that pointed to it point to nothing afterwards. A change to an id that duplicates another record's id, or to an invalid id, is not applied
- **Comparison**: changes are detected with `Object.is`. Setting the same value does nothing. Setting a new object is a change even if its content is the same
- **Function values**: a function passed to `set` is treated as a function that creates the new value from the previous one, so a function itself cannot be the value of a Field (as with React's `setState`)
- **Keys not in the definition**: the method you call decides the kind (calling `list()` on a key not in the definition treats it as a List and reads ids from the default `'id'`). `at(path)` follows keys where there is no definition, so a definition is needed to point to list records from settings
- **Warnings during development**: the cases above are reported with `console.warn`, except when `process.env.NODE_ENV` is `'production'`
- **Out of scope**: fetching, caching, and the fetch status (loading and so on) of server data. Fetch with React Query, SWR, or similar, and pass the result to a root model
- **Option names**: `data`, `defaultData`, and `onChangeData` may change during 0.x

## API

### `createRecordModel`

```ts
createRecordModel<T>(
  definition: RecordDefinition<T>,
  options: RecordModelOptions<T>,
): RecordModel<T> & ModelRoot<T>
```

Creates a model whose root is a Record (a form and so on).

| Parameter    | Type                    | Description                               |
| ------------ | ----------------------- | ----------------------------------------- |
| `definition` | `RecordDefinition<T>`   | Definition of the record                  |
| `options`    | `RecordModelOptions<T>` | Options below (pass one of the two forms) |

| Option         | Type                | Description                                                              |
| -------------- | ------------------- | ------------------------------------------------------------------------ |
| `defaultData`  | `T`                 | Uncontrolled: the initial data, held by the model                        |
| `data`         | `T`                 | Controlled: the owner's data                                             |
| `onChangeData` | `(data: T) => void` | Controlled: asks the owner to apply a write. Receives the whole new data |

### `createListModel`

```ts
createListModel<E>(
  definition: ListDefinition<E>,
  options: ListModelOptions<E>,
): ListModel<E> & ModelRoot<readonly E[]>
```

Creates a model whose root is a List (a list and so on). The options are the same as `createRecordModel`, and the type of the data is `readonly E[]`.

### `createFieldModel`

```ts
createFieldModel<V>(
  definition: FieldDefinition,
  options: FieldModelOptions<V>,
): FieldModel<V> & ModelRoot<V>
```

Creates a model whose root is a Field (a single input and so on). The options are the same as `createRecordModel`, and the type of the data is `V`. A Field definition currently has only `kind`, so pass `{}`.

### `ReadonlyModel<V>`

Something you can read and subscribe to. The models of the three layers extend it, and `ids()` returns this type.

| Method                | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `get()`               | Reads the value. Returns the same reference if nothing changed                  |
| `subscribe(listener)` | Calls the listener when the value changes. Returns a function that unsubscribes |

#### `subscribe`

```ts
subscribe(listener: ModelListener<V>): () => void
```

When the value (reference) of `get()` changes, calls the listener with `{ value, previousValue }`. `value` is the value of `get()` at the time of the call, and `previousValue` is the value last passed to that listener (in the first notification, the value at the time of subscribing). When the part a model points to disappears or appears again, it is notified as a change from or to `undefined`. A change written inside a listener is notified in the next round, after the current notification finishes.

### `FieldModel<V>` / `RecordModel<T>` / `ListModel<E>`

Members common to the three layers (in addition to those of `ReadonlyModel`).

| Member       | Description                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `kind`       | The layer (`'field'`, `'record'`, or `'list'`)                                                 |
| `path`       | Path from the root (a frozen array)                                                            |
| `set(value)` | Writes a value. Also accepts a function that receives the previous value and returns a new one |

Members of `RecordModel`.

| Method           | Description                    |
| ---------------- | ------------------------------ |
| `update(values)` | Changes several fields at once |
| `field(key)`     | Model of a field               |
| `record(key)`    | Model of a nested record       |
| `list(key)`      | Model of a nested list         |

Members of `ListModel`.

| Method            | Description                       |
| ----------------- | --------------------------------- |
| `insert(records)` | Appends to the end                |
| `remove(ids)`     | Removes all records with the ids  |
| `record(id)`      | Model of the record with the id   |
| `ids()`           | Model that reads the order of ids |

#### `update`

```ts
update(values: Partial<T>): void
```

Applies only the keys whose values changed. A key whose value is `undefined` is set to `undefined`, and keys not passed are left unchanged. Write changes that depend on the previous value with `set((prev) => ...)`.

#### `field` / `record` / `list`

```ts
field<K extends FieldKeys<T>>(key: K): FieldModel<T[K]>
record<K extends RecordKeys<T>>(key: K): RecordModel<NonNullable<T[K]>>
list<K extends ListKeys<T>>(key: K): ListModel<NonNullable<T[K]>[number]>
```

Returns the model of a field. `field()` accepts any key, `record()` a key of a plain object, and `list()` a key of an array of objects. For an optional field (`billing?:`), `get()` of the model includes `undefined`.

#### `insert`

```ts
insert(records: readonly E[]): void
```

Appends to the end. Records whose id already exists or is invalid are not added, and a warning is shown during development. If the list is missing (an optional list), an empty list is created and the records are added to it.

#### `remove`

```ts
remove(ids: readonly RecordId[]): void
```

Removes all records with the ids (including duplicates). Ids that do not exist are ignored.

#### `record` (`ListModel`)

```ts
record(id: RecordId): RecordModel<E, true>
```

Returns the model of the record with the id. A record may be removed, so `get()` always includes `undefined`.

#### `ids`

```ts
ids(): ReadonlyModel<readonly string[]>
```

Returns a model that reads the order of ids. Its value changes only when records are added, removed, or reordered. When only the content of a record changes, it returns the same array.

### `ModelRoot<D>`

Members only the root model has.

| Method          | Description                            |
| --------------- | -------------------------------------- |
| `at(path)`      | Creates a model from a path array      |
| `receive(data)` | Takes the owner's data when controlled |

#### `at`

```ts
at(path: readonly RecordId[]): UnknownModel
```

Creates a model from a path array. Following the definition, each step is read as an id inside a List and as a key inside a Record. Where there is no definition, it follows keys (treating the value as a Record), and the last step becomes a Field. It returns the same object as following the path with `list()` and the like.

#### `receive`

```ts
receive(data: D): void
```

When controlled, takes the data the owner passed back. Discards pending data and notifies the subscribers of models whose values changed. On an uncontrolled root, it does nothing (and warns during development).

### Definitions

| Definition            | Shape                           | Description                                                                                                                                  |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldDefinition`     | `{ kind?: 'field' }`            | A Field that holds a value. A definition without `kind` is this                                                                              |
| `RecordDefinition<T>` | `{ kind: 'record'; fields? }`   | `fields` holds a definition per field. Fields not written are treated as plain values                                                        |
| `ListDefinition<E>`   | `{ kind: 'list'; id?; record }` | `id` is the name of the id key or a function that extracts the id from a record (defaults to `'id'`). `record` is the definition of a record |

Definitions are plain objects, so they can be created from JSON (unless `id` is a function).

### Types

| Type                    | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `FieldModel<V>`         | Model of a Field                                                     |
| `RecordModel<T>`        | Model of a Record                                                    |
| `ListModel<E>`          | Model of a List                                                      |
| `ReadonlyModel<V>`      | Something you can read and subscribe to                              |
| `ModelRoot<D>`          | Members only the root model has                                      |
| `UnknownModel`          | Model returned by `at()` (narrow it with `kind`)                     |
| `ModelChangeEvent<V>`   | What a listener receives (`{ value, previousValue }`)                |
| `ModelListener<V>`      | A listener                                                           |
| `ModelPath`             | A path (`readonly string[]`)                                         |
| `RecordId`              | A value accepted as an id (`string \| number`)                       |
| `FieldDefinition`       | Definition of a Field                                                |
| `RecordDefinition<T>`   | Definition of a Record                                               |
| `ListDefinition<E>`     | Definition of a List                                                 |
| `DefinitionOf<V>`       | Definition that matches the type of a value (Field, Record, or List) |
| `FieldKeys<T>`          | Keys accepted by `field()`                                           |
| `RecordKeys<T>`         | Keys accepted by `record()`                                          |
| `ListKeys<T>`           | Keys accepted by `list()`                                            |
| `RecordModelOptions<T>` | Options of `createRecordModel`                                       |
| `ListModelOptions<E>`   | Options of `createListModel`                                         |
| `FieldModelOptions<V>`  | Options of `createFieldModel`                                        |
