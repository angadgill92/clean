# Type inference (`lib/typeInference.js`)

After parsing (and the pattern-matching rewrite), `cli.js` passes
`tree.body` to the type checker unless `-t` was given. The checker does not
change the generated code; it only decides whether to stop with a type error.

```
inferTypes(body) → body                      // all top-level declarations typed
                 → {error: true, id: 'b'}    // first declaration that failed
```

`cli.js` prints the error object as JSON and exits.

## What gets checked

Only **top-level `VariableDeclaration`s** (everything Clean compiles to
`const name = ...`). Top-level calls, `do` blocks, and `defineProp`
statements are not checked. For each declaration, in source order,
`declTypeExtract` computes a type and stores it in `globalTypes[name]`:

- if the value has `sType === 'IO'` (any `do` block or IO declaration), its
  type is `'IO'` and its contents are not inspected;
- otherwise its type is `exprType(init, {}, globalTypes, name)`.

When all declarations are done, the first name whose type is `null` is
reported. `null` is the checker's "type error" value.

`globalTypes` is pre-seeded with `Math` and `console` from
`inbuiltMethods.inbuiltObjects`. Global JS functions such as `parseInt`,
`String` and `require` are added on first use from `lib/jsFunctions.js`.

## Type representation

| Type | Representation |
| --- | --- |
| number, string, boolean, regexp | `'number'`, `'string'`, `'bool'`, `'regexp'` |
| IO | `'IO'` (opaque) |
| unknown yet | `'needsInference'` (`AST.NEEDS_INFERENCE`) |
| type error | `null` |
| array | `{type: 'array', elemTypes: {0: t0, ...}, commonType, isHomogeneous}` |
| object | `{type: 'object', propTypes: {key: t, ...}}` |
| function (in `globalTypes`) | `{type: 'function', paramTypes: [...], returnType}` |
| function (when looked up as a callee) | `[paramTypes, returnType]` tuple |

Literals already carry their type in `sType`, set by `estemplate` when they
were parsed. Binary expressions carry the operator's result type from
`operatorPrecedence.js` in `sType` as well.

`jsFunctions.js` uses `'boolean'` for `isFinite` and `isNaN` where the rest
of the checker uses `'bool'`, and `'object'` as a plain string for `Object`
and `RegExp`.

## How inference works

`exprType(expr, localTypeObj, globalTypes, id)` switches on the node type.
`localTypeObj` holds the types of the current function's parameters, and
`id` is the name of the declaration being checked (used to detect recursion).
Inference is a single greedy pass: an identifier whose type is
`needsInference` takes the first concrete type that something forces on it,
and that type is then fixed.

| Node | Rule |
| --- | --- |
| `Literal` | its `sType` |
| `Identifier` | look up in `localTypeObj`, then `globalTypes`; `null` if unknown |
| `BinaryExpression` | The operator's `sType` is the expected type. For arithmetic and `++`, uninferred identifier operands get that type. Both sides must agree and (except for comparisons) match the expected type. |
| `UnaryExpression` | `typeof` → string; `!` needs bool; `-` needs number. Parameters are not visible here (it looks up with an empty local scope), so `neg n = -n` is reported as an error. |
| `ArrowFunctionExpression` | Parameters start as `needsInference`; the body's type is the return type. Result: `{type: 'function', paramTypes, returnType}`. |
| `CallExpression` | Look up the callee's `[paramTypes, returnType]`, check each argument against its parameter type (inferring uninferred arguments), return `returnType`. Inline arrows (`let ... in`, lambda calls) type their parameters from the arguments and return the body's type. |
| `ConditionalExpression` | Test must be bool; both branches must have the same type. |
| `SwitchStatement` | From pattern matching: all case tests must agree, all case bodies must agree; records the function's type in `globalTypes`. |
| `ArrayExpression` | Element types; `commonType` is the shared type or `needsInference` (and `isHomogeneous: false`) if they differ. |
| `ObjectExpression` | Type of each property. |
| `MemberExpression` | See below. |
| `BlockStatement` | Type of the first statement only. |
| anything else | the node itself (treated as "fine") |

### Recursion

When a call's callee name equals the declaration being checked
(`factorial n = n * factorial (n - 1)`), `checkForRecursion` records a
provisional signature in `globalTypes` using the argument types and
`returnType: needsInference`, so the recursive call type-checks before the
function's own type is known.

### Member access and built-in methods

`memberExprType` turns `a.b[0].c` into a path `[a, b, 0, c]`, types the root,
then walks the path with `getTypeOfChild`:

- On objects, a property's type comes from `propTypes`.
- On arrays, a numeric subscript gives the element type.
- On strings, arrays, objects and regexps, known methods and properties come
  from `inbuiltMethods.inbuiltProps`, which gives each one's parameter types and
  return type.
- If the root's type is still unknown, a property name that belongs to exactly
  one type pins it down: calling `n.toUpperCase ()` makes `n` a string.
- Methods marked `isMutative` (`push`, `pop`, `shift`, `unshift`, `splice`)
  return `null`, so **mutating an array is a type error**.

## Examples

| Source | Result |
| --- | --- |
| `f n = n * 2` then `b = f 3` | ok: `n` inferred as number from `*` |
| `f n = n * 2` then `b = f 'x'` | error on `b` |
| `x = parseInt '3'` then `y = x ++ 'a'` | error on `y`: `++` expects strings |
| `f n = if n > 1 then 'a' else 2` | error on `f`: branches differ |
| `p xs = xs.push 1` | error on `p`: mutating method |
| `a = x` (undeclared `x`) | error on `a` |
| `a = foo 1` (undeclared `foo`) | error on `a` |

`test/src/typeErrors/typeError.cl` (`a = 1 + 'a'`) is the golden test for the
error path.

## Extending the checker

- New global JS function: add it to `lib/jsFunctions.js` with `paramTypes`
  and `returnType`.
- New method or property on a built-in type: add it to the right section of
  `inbuiltProps` in `lib/inbuiltMethods.js`, **and** to the
  `needsInference` section (with its `parentType`) if it should help infer an
  unknown receiver.
- New global object (like `Math`): add it to `inbuiltObjects`.
- New AST node type from the parser: add a case to `exprType`, or it will be
  silently accepted by the default branch.
