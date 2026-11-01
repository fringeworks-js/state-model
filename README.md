# @fringeworks/state-model

`@fringeworks/state-model` is a library some will find handy, for holding the state of lists, forms, and inputs in a fixed shape (List, Record, and Field) and updating it by a path of keys and ids without mutation.\
Data stays as plain objects and arrays, and a change produces new data in which only the changed parts are rebuilt. Subscribers are notified only when the data their model points to changes.

**[日本語のREADMEはこちら](./README.ja.md)**

## Features

- **Three model kinds**: a List for lists, a Record for forms, and a Field for single values. Lists and records can be nested in the fields of a record
- **Data in one place**: only the root model is connected to the data. You read and write through child models taken out with `list()`, `record()`, and `field()`, and their reads and writes go to the root model
- **No mutation**: a change rebuilds only the changed parts and keeps unchanged records as the same references. This fits React's `memo` and `useSyncExternalStore` as is
- **Notifies only your data**: a listener is called only when the value (reference) of its model changes
- **Controlled and uncontrolled**: in the same sense as React's controlled and uncontrolled components, a model can hold the data itself (uncontrolled) or refer to your state (controlled; React's `useState`, zustand, Redux, and so on)
- **Derived models**: hold a filtered and sorted result, or a grouped result, of a list without changing the original data. The result is rebuilt when the source changes, and derived models can be stacked on derived models
- **Any environment**: it uses neither the DOM nor React. From React, use it with [`@fringeworks/react-state-model`](https://github.com/fringeworks-js/react-state-model)

## Installation

```sh
npm install @fringeworks/state-model
```

## Model kinds and terms

| Model kind | Data                                          | Typical use                   |
| ---------- | --------------------------------------------- | ----------------------------- |
| List       | An array of records with ids                  | Lists (tables, lists, charts) |
| Record     | An object with fields                         | Forms                         |
| Field      | A single value in a record (can be any value) | Inputs                        |

| Term                       | Meaning                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root model                 | A model created with `createListModel`, `createRecordModel`, or `createFieldModel`. Only the root model is connected to the data, and it has `receive()`                                                                                                              |
| Child model                | A model taken out of the root model with `list()`, `record()`, `field()`, or `at()`. Its reads and writes go to the root model                                                                                                                                        |
| Path of keys and ids       | An array that tells where a value is in the data of the root model, listing record keys and list ids in order (e.g. `['lines', 'L-3', 'price']`). Array indexes are never used. Also called just "path" below                                                         |
| The data a model points to | The value at the model's path, read with `get()`                                                                                                                                                                                                                      |
| Data owner                 | When controlled, the side that passes `data` (React's `useState`, a zustand or Redux store, and so on). The model's data does not change until the data owner passes new data back                                                                                    |
| Pending data               | When controlled, the written changes that the data owner has not passed back yet                                                                                                                                                                                      |
| Derived model              | A model that returns a filtered and sorted result (`createDerivedList`) or a grouped result (`createGroupedList`) based on a list model (a List model or another derived model). It does not change the original data and rebuilds the result when its source changes |

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

### Taking out child models to read and write

```ts
const lines = order.list('lines');
const line = lines.record('L-3'); // Points to a record by id
const price = line.field('price');

price.get(); // 1000
price.set(1200); // Only the affected parts of the root model's data are rebuilt
price.set((prev) => (prev ?? 0) + 100);

line.update({ product: 'Pen', price: 300 }); // Changes several fields at once
lines.insert([{ lineId: 'L-4', product: 'Ink', price: 500 }]); // Appends to the end
lines.remove(['L-1']);
```

- The same root model and the same path always return the same object (`lines.record('L-3') === lines.record('L-3')`)
- Methods work when detached (you can pass them as `onChange={price.set}`)

### Subscribing

```ts
const unsubscribe = price.subscribe(({ value, previousValue }) => {
  console.log(previousValue, '→', value);
});
```

A listener is called only when the value (reference) returned by `get()` of its model changes. Changes to other records or fields do not call it. When rendering a list, subscribe to `ids()` (the order of ids), which does not change when only the content of a record changes, and subscribe to each record's model per row. Then only the changed rows are rendered again.

### Filtering and sorting (derived models)

`createDerivedList` creates a derived model that filters and sorts a list model. `get()` of the original List model keeps the original order.

```ts
import { createDerivedList } from '@fringeworks/state-model';

const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0,
  sort: (a, b) => a.price - b.price,
});

visible.get(); // The filtered and sorted records (the same references as in the original data)
visible.ids().get(); // The order of ids in the result

visible.setFilter((line) => line.product.includes('Pen')); // Replaces the condition
visible.setSort(undefined); // Removes sorting (back to the original order)

visible.record('L-3').field('price').set(1200); // Edits reach the original data
visible.remove(['L-1']); // Removal is passed to the original List too
```

- The result is rebuilt only when the original data or a condition changes. If the records and their order are the same as before, the previous array is returned and subscribers are not called (editing a record that is filtered out does not render the list again)
- You can create a derived model on top of a derived model (`createDerivedList(visible, { ... })`)
- To add records, use `insert` of the original List model (reachable through `visible.source`). A record that does not match the filter does not appear in the result

### Grouping (derived models)

`createGroupedList` creates a derived model that groups a list model. Filter and sort records with `createDerivedList` upstream, and filter and sort groups with `createGroupedList`.

```ts
import { createDerivedList, createGroupedList } from '@fringeworks/state-model';

const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0, // Filters records
  sort: (a, b) => a.price - b.price, // Sorts records (the order within each group)
});
const grouped = createGroupedList(visible, {
  groupBy: 'category', // A key name, or a function that extracts the key from a record
  filterGroups: (group) => group.records.length >= 2, // Filters groups
  sortGroups: (a, b) => total(b.records) - total(a.records), // Sorts groups
});

grouped.get(); // [{ key: 'Pen', records: [...], ids: ['L-3', ...] }, ...]
grouped.record('L-3').field('price').set(1200); // Edits reach the original data
```

- By default, groups are ordered by their first appearance in the source. With `sortGroups`, you can order groups by aggregated values (totals, counts, and so on)
- The `records` of a group passed to `filterGroups` and `sortGroups` are the records after filtering upstream
- A group whose content (records and their order) does not change is returned as the same object. If group components are `memo`, only the changed groups are rendered again
- Changing the group key of a record moves the record to another group

### Selecting

`createListSelection` creates a selection model for a list. A selection does not change records, so it is a separate model from derived models, connected to a list (a List model or a derived model).

```ts
import { createListSelection } from '@fringeworks/state-model';

const selection = createListSelection(order.list('lines'), { multiple: true });

selection.toggle('L-3');
selection.get(); // The selected ids (in the order selected)
selection.records().get(); // The selected records
order.list('lines').remove(selection.get()); // Removes the selected records
```

- Pass one selection model to components such as a table and a chart to share the selection. Create one per component for separate selections
- The selected ids are kept in a model (`selectedIds`, a Field model whose value is an array of ids). If none is passed, the selection model keeps them itself. To keep them in the URL or the parent's state, pass a controlled Field model. Passing the same model lets separate selection models operate the same selection
- Reading (`get()`, `has()`, `records()`) returns only ids in the source. If records with the same ids come back after reloading data, the selection comes back too. Ids not in the source that remain where the ids are kept can be removed with `removeMissing()`
- What you can read depends on which list the selection is connected to. Usually connect it to the List model (the data location); the selection of records hidden by a filter can still be read. Connected to a derived model, only the selected records among the visible ones can be read (ids of hidden records remain where the ids are kept, so the selection comes back when the filter is removed)

### Knowing whether values are dirty or touched

`createModelStatus` creates a status model connected to a model. For every path under it, you can read whether the value is dirty and whether it is touched.

```ts
import { createModelStatus } from '@fringeworks/state-model';

const status = createModelStatus(order);

status.dirty().get(); // Whether anything in the form is dirty
status.dirty(['lines', 'L-3']).get(); // Whether line L-3 is dirty
status.touch(['customer']); // Marks it as touched (the UI calls it, e.g. when focus leaves)
status.touched(['lines']).get(); // Whether anything in the lines is touched
status.markClean(); // Makes the current data the baseline, e.g. after saving
```

- **Dirty**: the data at creation is the baseline, and each path's current value is compared with it. The same reference counts as the same; otherwise plain objects and arrays are compared by content (other values with `Object.is`). Reverting a field to its original value also makes the record and the whole form clean again. Unchanged parts keep the same references, so only changed branches are compared
- **Touched**: the state side cannot know when focus leaves. The UI decides when a value counts as touched and calls `touch(path)`. A parent path is `true` if anything under it is touched
- `dirty(path)` and `touched(path)` return models that read booleans, and the same path returns the same object. Subscribers are notified only when the value changes
- When controlled, call `markClean()` to reset the baseline after reloading data following a save

### Not reapplying on edits (input screens)

A derived model reapplies filtering and sorting as soon as its source changes. On an input screen, a record disappears the moment you enter a value that no longer matches the filter, and jumps the moment you edit its sort key. With `filterRefresh` and `sortRefresh` set to `'manual'`, the model does not reapply when the source changes, and reapplies when you call `refresh()` or replace a condition.

```ts
const visible = createDerivedList(order.list('lines'), {
  filter: (line) => line.price > 0,
  sort: (a, b) => a.price - b.price,
  filterRefresh: 'manual', // Keeps records that no longer match until reapplied
  sortRefresh: 'manual', // Keeps the order until reapplied
});

visible.refresh(); // Reapplies the current conditions
```

| Change in the source                                        | Behavior when not reapplying                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A record's content changed (edited)                         | Keeps which records are in the result and their order, with the new content                           |
| A record was removed                                        | It is removed from the result too                                                                     |
| A record was added                                          | Appended at the end without the conditions (an added empty record is visible instead of filtered out) |
| A condition or mode was replaced, or `refresh()` was called | Reapplies                                                                                             |

- Filtering and sorting are chosen separately. To remove completed items immediately but not move items whose priority is edited, set only `sortRefresh` to `'manual'`
- Grouped derived models have the same options. `filterRefresh` covers grouping (`groupBy`) and group filtering, and `sortRefresh` covers group sorting. With `'manual'`, a record whose group key is changed stays in its group until reapplied. A group with no records left disappears
- Triggers such as "reapply when editing ends" are made on the UI side by calling `refresh()`

### Referring to your state (controlled)

When you pass `data` and `onChangeData`, the model does not hold the data and asks the data owner to apply each write through `onChangeData`. When the data owner passes new data back, the model takes it with `receive`.

```ts
const order = createRecordModel(orderDefinition, {
  data: store.getState().order,
  onChangeData: (order) => store.setState({ order }),
});
store.subscribe((state) => order.receive(state.order));
```

- Right after a write, `get()` returns the old value until the data owner passes the data back. `get()` always returns the data received from the data owner
- Consecutive writes in the same task do not lose earlier changes. The next change is applied on top of the pending data
- Pending data is discarded when data is received with `receive`, or in the next macrotask (`setTimeout`). If the data owner does not accept a change, it is not mixed into writes in later tasks

### Pointing by a path array

When you use the model from settings (JSON) or a table of paths, create a model from a path of keys and ids with `at(path)`. The model kind is decided at run time by following the definition, so narrow the result with `kind`.

```ts
const model = order.at(['lines', 'L-3', 'price']);
if (model.kind === 'field') {
  model.set(1200);
}
```

## Things to know

- **Ids**: the records of a List need ids. Ids are normalized to strings (`3` and `'3'` are the same id). Ids in `ids()` and in paths are strings, so convert them with `Number()` when you use numeric ids as numbers. Only strings and finite numbers are valid ids
- **Records without an id or with a duplicate id**: they stay in the data but cannot be reached by id (they are not in `ids()`, and `record(id)` cannot point to them). A duplicate id points to the first record. `remove` removes all records with the id. Both cases are warned about during development
- **When the data a model points to is missing**: `get()` returns `undefined`. A write happens only when the direct parent exists (writing to a removed record does nothing). An optional nested record that is missing can be written by `set` as a whole. Records are added to a List only by `insert`
- **Changing an id**: when the id of a record changes, the models that pointed to it point to nothing afterwards. A change to an id that duplicates another record's id, or to an invalid id, is not applied
- **Comparison**: changes are detected with `Object.is`. Setting the same value does nothing. Setting a new object is a change even if its content is the same
- **Function values**: a function passed to `set` is treated as a function that creates the new value from the previous one, so a function itself cannot be the value of a Field (as with React's `setState`)
- **Keys not in the definition**: the method you call decides the model kind (calling `list()` on a key not in the definition treats it as a List and reads ids from the default `'id'`). `at(path)` follows keys where there is no definition, so a definition is needed to point to list records from settings
- **Warnings during development**: the cases above are reported with `console.warn`, except when `process.env.NODE_ENV` is `'production'`
- **Out of scope**: fetching, caching, and the fetch status (loading and so on) of server data. Fetch with React Query, SWR, or similar, and pass the result to the root model
- **`record(id)` of a derived model**: it also points to records not in the result (filtered out). It returns the same object as `record(id)` of the original List model, so a form being edited keeps pointing to its record even if the filter changes. Use `ids()` to check whether a record is in the result
- **Filter and sort functions**: they are called every time the result is rebuilt. Do not change records in them, and return the same answer for the same records. Sorting is stable, and records that compare equal keep the original order
- **Without conditions**: when a derived model has no filter or sort condition (including after removing them), it returns the source value as is (the same array). A grouped derived model without `filterGroups` and `sortGroups` returns the result of grouping only. However, when the source is missing (an optional List that is `undefined`), it returns an empty array
- **The result kept when not reapplying**: the last result built is kept. With subscribers, the result is built every time the source changes, so the result on screen is kept as is
- **Group keys**: keys are compared by the same rule as `Map` (SameValueZero). When you use a key as a React `key`, convert it to a string with `String(group.key)` or similar if it is not a string
- **Option names**: `data`, `defaultData`, and `onChangeData` may change during 0.x

## API

### `createRecordModel`

```ts
createRecordModel<T>(
  definition: RecordDefinition<T>,
  options: RecordModelOptions<T>,
): RecordModel<T> & ModelRoot<T>
```

Creates a root model of the Record kind (a form and so on).

| Parameter    | Type                    | Description                               |
| ------------ | ----------------------- | ----------------------------------------- |
| `definition` | `RecordDefinition<T>`   | Definition of the record                  |
| `options`    | `RecordModelOptions<T>` | Options below (pass one of the two forms) |

| Option         | Type                | Description                                                                   |
| -------------- | ------------------- | ----------------------------------------------------------------------------- |
| `defaultData`  | `T`                 | Uncontrolled: the initial data, held by the model                             |
| `data`         | `T`                 | Controlled: the data owner's data                                             |
| `onChangeData` | `(data: T) => void` | Controlled: asks the data owner to apply a write. Receives the whole new data |

### `createListModel`

```ts
createListModel<E>(
  definition: ListDefinition<E>,
  options: ListModelOptions<E>,
): ListModel<E> & ModelRoot<readonly E[]>
```

Creates a root model of the List kind (a list and so on). The options are the same as `createRecordModel`, and the type of the data is `readonly E[]`.

### `createFieldModel`

```ts
createFieldModel<V>(
  definition: FieldDefinition,
  options: FieldModelOptions<V>,
): FieldModel<V> & ModelRoot<V>
```

Creates a root model of the Field kind (a single input and so on). The options are the same as `createRecordModel`, and the type of the data is `V`. A Field definition currently has only `kind`, so pass `{}`.

### `ReadonlyModel<V>`

Something you can read and subscribe to. The three model kinds extend it, and `ids()` returns this type.

| Method                | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `get()`               | Reads the value. Returns the same reference if nothing changed                  |
| `subscribe(listener)` | Calls the listener when the value changes. Returns a function that unsubscribes |

#### `subscribe`

```ts
subscribe(listener: ModelListener<V>): () => void
```

When the value (reference) of `get()` changes, calls the listener with `{ value, previousValue }`. `value` is the value of `get()` at the time of the call, and `previousValue` is the value last passed to that listener (in the first notification, the value at the time of subscribing). When the data a model points to disappears or appears again, it is notified as a change from or to `undefined`. A change written inside a listener is notified in the next round, after the current notification finishes.

### `FieldModel<V>` / `RecordModel<T>` / `ListModel<E>`

Members common to the three model kinds (in addition to those of `ReadonlyModel`).

| Member       | Description                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `kind`       | The model kind (`'field'`, `'record'`, or `'list'`)                                            |
| `path`       | Path of keys and ids from the root model (a frozen array)                                      |
| `set(value)` | Writes a value. Also accepts a function that receives the previous value and returns a new one |

Members of `RecordModel`.

| Method           | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `update(values)` | Changes several fields at once                                           |
| `field(key)`     | Model of a field                                                         |
| `record(key)`    | Model of a nested record                                                 |
| `list(key)`      | Model of a nested list                                                   |
| `at(path)`       | Takes out a child model by a path of keys and ids relative to this model |

Members of `ListModel`.

| Method            | Description                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `insert(records)` | Appends to the end                                                                                       |
| `remove(ids)`     | Removes all records with the ids                                                                         |
| `record(id)`      | Model of the record with the id                                                                          |
| `ids()`           | Model that reads the order of ids                                                                        |
| `at(path)`        | Takes out a child model by a path of keys and ids relative to this model (the first step is a record id) |

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

Returns the child model of a field. `field()` accepts any key, `record()` a key of a plain object, and `list()` a key of an array of objects. For an optional field (`billing?:`), `get()` of the model includes `undefined`.

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

#### `at`

```ts
at(path: readonly RecordId[]): UnknownModel
```

Takes out a child model by a path of keys and ids relative to this model. Following the definition, each step is read as an id inside a List and as a key inside a Record. Where there is no definition, it follows keys (treating the value as a Record), and the last step becomes a Field. It returns the same object as following the path with `list()` and the like (`line.at(['price'])` and `order.at(['lines', 'L-3', 'price'])` are the same). An empty path returns the model itself. Field models do not have `at()`.

### `ModelRoot<D>`

Members only the root model has.

| Method          | Description                                         |
| --------------- | --------------------------------------------------- |
| `receive(data)` | When controlled, takes new data from the data owner |

#### `receive`

```ts
receive(data: D, options?: ModelReceiveOptions): void
```

When controlled, takes the data the data owner passed back. Discards pending data and notifies the subscribers of models whose values changed. On an uncontrolled root model, it does nothing (and warns during development).

| Option    | Type      | Description                                                                                                                                                                                                                                |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `silent?` | `boolean` | Takes the data but does not notify subscribers. Changes not notified yet are notified by the next `receive` (even with the same data). Used to take data during a React render and notify after it (the hooks of react-state-model use it) |

### `createDerivedList`

```ts
createDerivedList<E, S extends ListSource<E>>(
  source: S,
  options?: DerivedListOptions<E>,
): DerivedList<E, S>
```

Creates a derived model that filters and sorts a list model.

| Parameter  | Type                    | Description                                               |
| ---------- | ----------------------- | --------------------------------------------------------- |
| `source`   | `S`                     | The source model (a `ListModel` or another `DerivedList`) |
| `options?` | `DerivedListOptions<E>` | Options below                                             |

| Option           | Type                     | Description                                                                                                                    |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `filter?`        | `(record: E) => boolean` | The filter. Receives a record and returns `true` to keep it                                                                    |
| `sort?`          | `(a: E, b: E) => number` | The sort order. A compare function, as in `Array.prototype.sort`                                                               |
| `filterRefresh?` | `RefreshMode`            | Whether to reapply the filter when the source changes (defaults to `'auto'`). `'manual'` keeps which records are in the result |
| `sortRefresh?`   | `RefreshMode`            | Whether to reapply the sort order when the source changes (defaults to `'auto'`). `'manual'` keeps the order                   |

### `DerivedList<E, S>`

The standard derived model. In addition to the members of `ReadonlyModel<readonly E[]>`, it has the following.

| Member                   | Description                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                 | The connected source model                                                                                                                                  |
| `ids()`                  | Model that reads the order of ids in the result                                                                                                             |
| `record(id)`             | Model of the source's record with the id                                                                                                                    |
| `remove(ids)`            | Removes all records with the ids (passed to the source)                                                                                                     |
| `at(path)`               | Takes out a child model by a path relative to the source (passed to the source; the first step is a record id; an empty path returns the source List model) |
| `setFilter(filter)`      | Replaces the filter                                                                                                                                         |
| `setSort(sort)`          | Replaces the sort order                                                                                                                                     |
| `setFilterRefresh(mode)` | Replaces whether to reapply the filter                                                                                                                      |
| `setSortRefresh(mode)`   | Replaces whether to reapply the sort order                                                                                                                  |
| `refresh()`              | Reapplies the current conditions                                                                                                                            |

#### `ids`

```ts
ids(): ReadonlyModel<readonly string[]>
```

Returns a model that reads the order of ids in the result. Its value changes only when records in the result are added, removed, or reordered.

#### `record`

```ts
record(id: RecordId): RecordModel<E, true>
```

Returns the model of the source's record with the id. It is the same object as taken out of the source, and it also points to records not in the result.

#### `remove`

```ts
remove(ids: readonly RecordId[]): void
```

Removes all records with the ids. The call is passed to the source, and the records are removed from the root model's data.

#### `setFilter` / `setSort`

```ts
setFilter(filter: ((record: E) => boolean) | undefined): void
setSort(sort: ((a: E, b: E) => number) | undefined): void
```

Replaces a condition and notifies subscribers if the result changes. Passing `undefined` removes the condition (removing the sort order returns to the source's order).

#### `setFilterRefresh` / `setSortRefresh` / `refresh`

```ts
setFilterRefresh(mode: RefreshMode): void
setSortRefresh(mode: RefreshMode): void
refresh(): void
```

Replaces whether to reapply, or reapplies the current conditions. Each of them rebuilds the result with the conditions at that time.

### `createGroupedList`

```ts
createGroupedList<E, K, S extends ListSource<E>>(
  source: S,
  options: GroupedListOptions<E, K>,
): GroupedList<K, E, S>
```

Creates a derived model that groups a list model. When `groupBy` is a key name, the key type (`K`) is the type of that field.

| Parameter | Type                       | Description                                       |
| --------- | -------------------------- | ------------------------------------------------- |
| `source`  | `S`                        | The source model (a `ListModel` or `DerivedList`) |
| `options` | `GroupedListOptions<E, K>` | Options below                                     |

| Option           | Type                                                 | Description                                                                                    |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `groupBy`        | `GroupBy<E, K>`                                      | How to group. A key name, or a function that extracts the key from a record                    |
| `filterGroups?`  | `(group: ListGroup<K, E>) => boolean`                | The group filter. Receives a group and returns `true` to keep it                               |
| `sortGroups?`    | `(a: ListGroup<K, E>, b: ListGroup<K, E>) => number` | The group sort order (defaults to the order of first appearance in the source)                 |
| `filterRefresh?` | `RefreshMode`                                        | Whether to reapply grouping and group filtering when the source changes (defaults to `'auto'`) |
| `sortRefresh?`   | `RefreshMode`                                        | Whether to reapply group sorting when the source changes (defaults to `'auto'`)                |

### `GroupedList<K, E, S>`

The grouped derived model. In addition to the members of `ReadonlyModel<readonly ListGroup<K, E>[]>`, it has the following.

| Member                          | Description                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `source`                        | The connected source model                                                      |
| `record(id)`                    | Model of the source's record with the id                                        |
| `remove(ids)`                   | Removes all records with the ids (passed to the source)                         |
| `at(path)`                      | Takes out a child model by a path relative to the source (passed to the source) |
| `setGroupBy(groupBy)`           | Replaces how to group                                                           |
| `setFilterGroups(filterGroups)` | Replaces the group filter                                                       |
| `setSortGroups(sortGroups)`     | Replaces the group sort order                                                   |
| `setFilterRefresh(mode)`        | Replaces whether to reapply grouping and group filtering                        |
| `setSortRefresh(mode)`          | Replaces whether to reapply group sorting                                       |
| `refresh()`                     | Reapplies the current conditions                                                |

`record` and `remove` are the same as in `DerivedList`. Passing `undefined` to `setFilterGroups` or `setSortGroups` removes the condition (removing the sort order returns to the order of first appearance in the source).

A group (`ListGroup<K, E>`) has the following properties.

| Property  | Type                | Description                                                                                    |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `key`     | `K`                 | The group key                                                                                  |
| `records` | `readonly E[]`      | The records of the group (in the source's order)                                               |
| `ids`     | `readonly string[]` | The order of ids of the group's records (without records lacking an id or with a duplicate id) |

### `createListSelection`

```ts
createListSelection<E, S extends ListSource<E>>(
  source: S,
  options?: ListSelectionOptions,
): ListSelection<E, S>
```

Creates a selection model for a list.

| Option         | Type                                     | Description                                                                                   |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `multiple?`    | `boolean`                                | Allows selecting multiple records (single selection by default)                               |
| `selectedIds?` | `FieldModel<readonly string[], boolean>` | A model that keeps the selected ids. If none is passed, the selection model keeps them itself |

### `ListSelection<E, S>`

A selection model for a list.

| Member                  | Description                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get()` / `subscribe()` | The selected ids (only those in the source, in the order selected)                                                                                       |
| `set(ids)`              | Replaces the whole selection (also accepts a function that receives the previous selection)                                                              |
| `select(id)`            | Selects. Replaces the selection for a single selection, adds for a multiple selection. Ids not in the source are not selected (warns during development) |
| `deselect(id)`          | Deselects                                                                                                                                                |
| `toggle(id)`            | Deselects if selected, selects otherwise                                                                                                                 |
| `selectAll()`           | Selects all records of the source (multiple selections only; does nothing and warns for single selections)                                               |
| `clear()`               | Deselects all                                                                                                                                            |
| `has(id)`               | Whether the record is selected                                                                                                                           |
| `records()`             | A model that reads the selected records (in the order selected)                                                                                          |
| `removeMissing()`       | Removes ids not in the source from where the selected ids are kept                                                                                       |
| `source`                | The connected source model                                                                                                                               |

### `createModelStatus`

```ts
createModelStatus<M extends ModelStatusSource>(source: M): ModelStatus<M>
```

Creates a status model (dirty and touched). It connects to a Record or List model (a root or a child model). It cannot connect to derived models.

### `ModelStatus<M>`

A status model. `path` is a path of keys and ids relative to the connected model; if omitted, it refers to the whole connected model.

| Member           | Description                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `dirty(path?)`   | A model that reads whether the value is dirty (the same path returns the same object)                |
| `touched(path?)` | A model that reads whether the value is touched (`true` if the path or anything under it is touched) |
| `touch(path)`    | Marks it as touched                                                                                  |
| `markClean()`    | Makes the current data the baseline. Everything becomes clean                                        |
| `clearTouched()` | Clears all touched marks                                                                             |
| `reset()`        | Both `markClean()` and `clearTouched()`                                                              |
| `source`         | The connected model                                                                                  |

### Definitions

| Definition            | Shape                           | Description                                                                                                                                  |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldDefinition`     | `{ kind?: 'field' }`            | A Field that holds a value. A definition without `kind` is this                                                                              |
| `RecordDefinition<T>` | `{ kind: 'record'; fields? }`   | `fields` holds a definition per field. Fields not written are treated as plain values                                                        |
| `ListDefinition<E>`   | `{ kind: 'list'; id?; record }` | `id` is the name of the id key or a function that extracts the id from a record (defaults to `'id'`). `record` is the definition of a record |

Definitions are plain objects, so they can be created from JSON (unless `id` is a function).

### Types

| Type                       | Description                                                                   |
| -------------------------- | ----------------------------------------------------------------------------- |
| `FieldModel<V>`            | Model of a Field                                                              |
| `RecordModel<T>`           | Model of a Record                                                             |
| `ListModel<E>`             | Model of a List                                                               |
| `ReadonlyModel<V>`         | Something you can read and subscribe to                                       |
| `ModelRoot<D>`             | Members only the root model has                                               |
| `ModelReceiveOptions`      | Options of `receive`                                                          |
| `UnknownModel`             | Model returned by `at()` (narrow it with `kind`)                              |
| `ModelChangeEvent<V>`      | What a listener receives (`{ value, previousValue }`)                         |
| `ModelListener<V>`         | A listener                                                                    |
| `ModelPath`                | A path of keys and ids (`readonly string[]`)                                  |
| `RecordId`                 | A value accepted as an id (`string \| number`)                                |
| `FieldDefinition`          | Definition of a Field                                                         |
| `RecordDefinition<T>`      | Definition of a Record                                                        |
| `ListDefinition<E>`        | Definition of a List                                                          |
| `DefinitionOf<V>`          | Definition that matches the type of a value (Field, Record, or List)          |
| `FieldKeys<T>`             | Keys accepted by `field()`                                                    |
| `RecordKeys<T>`            | Keys accepted by `record()`                                                   |
| `ListKeys<T>`              | Keys accepted by `list()`                                                     |
| `RecordModelOptions<T>`    | Options of `createRecordModel`                                                |
| `ListModelOptions<E>`      | Options of `createListModel`                                                  |
| `FieldModelOptions<V>`     | Options of `createFieldModel`                                                 |
| `DerivedList<E, S>`        | The standard derived model                                                    |
| `DerivedListOptions<E>`    | Options of `createDerivedList`                                                |
| `ListSource<E>`            | A list that can be the source of a derived model (`ListModel`, `DerivedList`) |
| `RefreshMode`              | Whether a derived model reapplies on source changes (`'auto'`, `'manual'`)    |
| `ListSelection<E, S>`      | A selection model for a list                                                  |
| `ListSelectionOptions`     | Options of `createListSelection`                                              |
| `ModelStatus<M>`           | A status model (dirty and touched)                                            |
| `ModelStatusSource`        | A model a status model can connect to (a Record or List model)                |
| `GroupedList<K, E, S>`     | The grouped derived model                                                     |
| `GroupedListOptions<E, K>` | Options of `createGroupedList`                                                |
| `ListGroup<K, E>`          | A group of the grouped derived model                                          |
| `GroupBy<E, K>`            | How to group (a key name, or a function that extracts the key from a record)  |
