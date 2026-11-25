# IO and `do` blocks

This is the most intricate part of the compiler. It has two halves: a small
runtime library that defines the `IO` type, and the parser in
`lib/parsers/io.js` that compiles `do` blocks into method chains on that type.

## The runtime (`lib/include/`)

When a file starts with `include node-core` or `include browser-core`, the CLI
pastes `core.js` plus the chosen `<lib>.js` in front of the generated code (see
[architecture.md](architecture.md#2-resolve-the-include)).

### `IOCore` (`core.js`)

An `IOCore` wraps a function that takes a callback, like most Node APIs:

```js
new IOCore(cb => fs.readFile(path, 'utf8', cb))
```

Nothing runs until `then` is called. The methods are:

| Method | What it does |
| --- | --- |
| `then(cb)` | Start the action; call `cb(...results)` when it completes. |
| `map(fn)` | When the action completes, call `fn(...results)`. If `fn` returns `undefined`, **stop** (the next callback is never called). If it returns an array, spread it as the next results; otherwise pass it as a single result. |
| `bind(fn)` | When the action completes, call `fn(...results)` (trimmed to `fn.length` arguments). `fn` must return an array `[...carry, nextIO]`. Run `nextIO`, and pass `...carry, ...nextIOResults` on. If `fn` returns `undefined`, stop. |
| `IOCore.createIO(f)` | `new IOCore(f)`. Used by `IO (someApi args)`. |
| `IOCore.timer(s)` | An IO that fires every `s` seconds, with a `clear()` method. |

Two things to know:

- `map` and `bind` **mutate** the IO they are called on (they replace
  `this.then`) and return `this`. An IO value is a recipe that is built up in
  place, not an immutable value.
- Returning `undefined` from a `map`/`bind` callback is the early-exit
  mechanism. The `maybe*` statements compile to `if (...) { handler; return }`
  for exactly this reason.

### `node-core.js` and `browser-core.js`

Each defines `class IO extends IOCore` with static helpers, then the CLI adds
`global.IO = IO` or `window.IO = IO`.

- Node: `getLine(prompt)` (readline) and `putLine(...values)` (logs on the
  next tick and passes the values on).
- Browser: `get`, `del`, `getJSON`, `delJSON`, `getBlob`, `postJSON`,
  `putJSON` (XHR, passing an `Error` on failure), `click(elem)` and
  `change(elem)` (DOM events).

The names the parser treats as IO functions are listed in `lib/ioMethods.js`
(`staticIOMethods`). A call to one of them compiles to `IO.<name>(...)`.

## How a `do` block compiles

### The core idea: carry the scope in arrays

A `do` block is a sequence of IO actions where later lines can use names bound
on earlier lines. Instead of nesting a closure per line, the compiler emits a
flat chain of `.bind` calls, and each callback returns **every name in scope
so far** followed by the next IO. `IOCore.bind` then passes those values, plus
the new results, to the next callback as arguments. So scope is threaded
through the argument lists:

```
data = do
  a <- getLine 'first: '
  b <- getLine 'second: '
  putLine a b
```

```js
const data = IO.getLine('first: ')
  .bind(a => [a, IO.getLine('second: ')])       // in scope after: a, b
  .bind((a, b) => [a, b, IO.putLine(a, b)])     // in scope after: a, b, (putLine's results)
  .then(() => [])
```

(Output reformatted for reading.) The parser tracks the in-scope names on a
`nextParams` field of the node it is building.

### Statement by statement

`ioBodyParser(input, parentObj, bindBody, mapBody)` parses one line at a time
and continues with the next. To keep long blocks from overflowing the stack,
the per-line helpers return `continueBody(...args)` rather than calling it
again, and `ioBodyParser` runs the steps in a loop (a trampoline); the step
function is `ioBodyStep`. Its state:

- `parentObj`: the IO expression built so far (`{}` at the start of the block),
  with `nextParams` = names in scope.
- `mapBody.stmts`: pure statements (lets, `maybe*` checks, `defineProp`,
  `delete`, function calls) collected since the last IO step. They are emitted
  as the body of the next callback, before its `return [...]`.
- `mapBody.propagate`: names introduced by `let` that must be carried forward.
- `bindBody`: bare IO names referenced as statements (for example a line that
  is just `computeFact`), chained on at the end.

For each line it tries, in order:

| Line | Parser | Compiles to |
| --- | --- | --- |
| newline (end of line) | `maybeFinalStmt` | If the next line is indented, continue (and pick up `return a b` if present). Otherwise finish the block with `makeFinalStmt`. |
| `x y <- action` | `maybeBindStmt` → `bindStmt` | First line: `action` becomes `parentObj`. Later lines: `parentObj.bind((inScope) => { ...stmts; return [inScope, ...lets, action] })`. `action` may be a function call, a built-in IO call, a DOM call, a bare IO name (called with no args), or `IO (api args)`, which becomes `IO.createIO(cb => api(args, cb))`. |
| `defineProp obj 'k' v` | `maybeDefineStmt` | Collected into `mapBody.stmts` (writable, configurable). |
| `delete obj.k` | `maybeDeleteStmt` | Collected. |
| `let a = 1 b = 2` | `maybeLetStmt` | `let` declarations collected; names added to `propagate`. |
| `maybeErr e (handler)` etc. | `maybeStmtParser` | `if (e instanceof Error) { handler.then(() => null); return }`, collected. `maybeTrue`/`False`/`Null`/`Undefined` compare with `== true` etc. |
| `f x` | `maybeFuncCallStmt` | Collected. |
| `putLine x` (IO call, no binding) | `ioStmtParser` | A `bind` whose callback returns the scope plus the IO, so its results are not named. First line: the call itself. |
| `someIO` (bare name) | `maybeIOCallStmt` | Added to `bindBody`. |

The statements that only make sense after an IO step (`defineProp`, `let`,
`maybe*`, calls) are only tried when `parentObj` is non-empty.

### Ending the block

When a newline is not followed by indentation, `makeFinalStmt` closes the
chain:

- **No `return`**: append `.then(callback)`. Any pending `mapBody.stmts` go in
  that callback. Calling `then` starts the IO, so the block **runs as soon as
  this expression is evaluated**.
- **With `return a b`**: append `.map((inScope) => [a, b])` and wrap the whole
  thing in `() => ...`. Nothing runs; the result is a thunk that produces an
  IO whose results are `a, b`, ready to be bound by another block
  (`x y <- thatBlock`).

### Where a block can appear

| Form | Parser | Result |
| --- | --- | --- |
| `name = do ...` | `ioParser` → `ioDecl` | `const name = <chain>`; runs at load time unless it ends in `return` |
| `name args = do ...` | `doFuncParser` | `const name = (args) => <chain>` (a function returning an IO) |
| `do ...` at top level | `doBlockParser` | An expression statement; runs at load time |
| `main = putLine 'x'` | `ioParser` | `const main = IO.putLine('x').then(() => null)` |
| `main = someIO` | `ioParser` | `const main = someIO().then(() => null)` |
| `x = f ()` | `ioParser` | `const x = f()` (not started; marked `sType: 'IO'`) unless `x` is `main`, which is started |

`main` is only special in those last rows: `name = someIdentifier` and
`name = f ()` are started with `.then` only when `name` is `main`. Nothing calls
`main` at run time; it starts because its declaration calls `.then`.

Every IO node gets `sType = 'IO'`, which the type checker treats as an opaque
type and skips. See [type-inference.md](type-inference.md).

## A full example

```
include node-core
fs = require 'fs'

main = do
  err data <- IO (fs.readFile process.argv[2] 'utf8')
  maybeErr err (putLine err)
  err1 <- IO (fs.writeFile process.argv[3] data)
  maybeErr err1 (putLine err1)
```

```js
const fs = require('fs');
const main = IO.createIO(cb => fs.readFile(process.argv[2], 'utf8', cb)).bind((err, data) => {
  if (err instanceof Error) {
    (IO.putLine(err).then(() => null))
    return
  }
  return [
    err,
    data,
    IO.createIO(cb => fs.writeFile(process.argv[3], data, cb))
  ]
}).then((err, data, err1) => {
  if (err1 instanceof Error) {
    (IO.putLine(err1).then(() => null))
    return
  }
})
```

`test/src/ioLets.cl` and its golden file are the best reference for how
`let`, `defineProp`, `delete`, `maybe*` and `return` interact; compile it with
`-o` and read the output alongside the parser.
