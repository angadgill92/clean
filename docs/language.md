# The Clean language by example

Clean is a small functional language with Haskell-flavoured syntax that
compiles to JavaScript. This page walks through each construct and shows the
JavaScript the current compiler produces for it. All output below was produced
with `node bin/command.js file.cl -o out.js` and has the runtime prelude
trimmed off.

## Program structure

A file is a sequence of top-level statements separated by newlines. Each
statement is one of: a declaration, a function declaration, a `do` block or IO
declaration, a `defineProp` statement, a function call, a lambda or lambda
call, an `if` expression, or a comment. See `statementParser` in
`lib/parsers/statements.js` for the exact list and order.

An optional first line `include node-core` or `include browser-core` selects
the IO runtime that is prepended to the output (see
[io-and-do-blocks.md](io-and-do-blocks.md)). Without it, the output has no
`IO` class, so any IO code will fail at run time.

## Values and declarations

```
a = 25
s = 'single quotes only'
b = true
n = null
o = {a: 1, 'b': [1, 2]}
x = o.b[0]
r = /ab+c/g
```

```js
const a = 25;
const s = 'single quotes only';
...
const x = o.b[0];
```

Every top-level name becomes a `const`. Strings use single quotes and support
`\n`, `\t`, `\r` and `\'` escapes.

## Functions

Functions are declared by listing parameters after the name and are called by
juxtaposition. Parentheses only group.

```
add a b = a + b
three = add 1 2
sq = \x -> x * x
r = (\a b -> a + b) 2 3
```

```js
const add = (a, b) => a + b;
const three = add(1, 2);
const sq = x => x * x;
const r = ((a, b) => a + b)(2, 3);
```

A call with no arguments is written `f ()`. `print x` is special-cased to
`console.log(x)`.

## Pattern matching

Several clauses with literal (or empty-array) first arguments, followed by a
general clause, become one function with a `switch`:

```
factorial 1 = 1
factorial n = n * factorial (n - 1)

sum [] = 0
sum xs = xs.length
```

```js
const factorial = n => {
  switch (n) {
  case 1:
    return 1;
  default:
    return n * factorial(n - 1)
  }
};
const sum = xs => {
  switch (xs.length) {
  case 0:
    return 0;
  default:
    return xs.length
  }
};
```

The details and limitations are in [pattern-matching.md](pattern-matching.md).

## Expressions

| Clean | JavaScript |
| --- | --- |
| `if c then a else b` | `c ? a : b` |
| `let a = 1 b = 2 in a + b` | `((a, b) => a + b)(1, 2)` |
| `a ++ b` | `a + b` (string concatenation) |
| `a ^ b` | `a ** b` (exponentiation) |
| `a == b`, `a != b` | `a === b`, `a !== b` |
| `:type x` | `typeof x` |
| `-x`, `!x` | `-x`, `!x` |
| `a << b`, `a >> b`, `a >>> b`, `a & b`, `a \| b` | same |

Binary operator precedence and associativity live in
`lib/operatorPrecedence.js` and are described in [parser.md](parser.md).

## Objects

`defineProp obj 'key' value` at the top level compiles to an
`Object.defineProperty` call with `writable` and `configurable` set to `false`
(inside a `do` block they are `true`). The type checker blocks mutating array
methods such as `push` and `splice`.

## IO and `do` blocks

IO is modelled as a value of type `IO` that wraps a callback-taking function.
`do` blocks sequence IO actions, binding each result to names with `<-`:

```
include node-core

main = putLine 'Hello World!'

computer a = do
  g <- getLine 'enter value:'
  return (a ++ g)

doBlock = do
  c <- computer 'abcd'
  putLine c
```

```js
const main = IO.putLine('Hello World!').then(() => null)
const computer = a => IO.getLine('enter value:').map(g => [a + g]);
const doBlock = computer('abcd').bind(c => [
  c,
  IO.putLine(c)
]).then(() => [])
```

Note that `main` is not special at run time: nothing calls it. A top-level IO
declaration runs as soon as its `const` is evaluated, because the generated
code ends with `.then(...)`, which starts the chain. (`main` is special only to
the parser, see [io-and-do-blocks.md](io-and-do-blocks.md).)

Inside a `do` block you can also use:

- `let x = expr` to add scoped variables (several in one line: `let c = b + 25 d = 'x'`)
- `maybeErr`, `maybeTrue`, `maybeFalse`, `maybeNull`, `maybeUndefined` to stop the chain early: `maybeErr err (putLine err)`
- `IO (someNodeApi arg1 arg2)` to wrap a Node-style callback API as IO (the callback is added for you)
- `defineProp`, `delete obj.key`, and plain function calls
- `return a b` to make the block's result values available to a caller that binds it with `<-`

Built-in IO functions (`lib/ioMethods.js`): `putLine` and `getLine` (node), and
`get`, `del`, `getJSON`, `delJSON`, `getBlob`, `postJSON`, `putJSON`, `click`,
`change` (browser). DOM helpers `qs`, `getElemId` and `getElemTag` map to
`document.querySelector` and friends.

## Comments

`// line` and `/* block */` comments are kept and emitted in the output.
