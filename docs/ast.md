# The AST

The parser produces an [ESTree](https://github.com/estree/estree) `Program`
directly. ESTree is the JavaScript AST format `escodegen` prints, so the tree
Clean builds is already a JavaScript program; later passes only reshape it.

## Building nodes: `lib/estemplate.js`

Parsers never write node objects by hand. They call constructors in
`estemplate.js`, and node type strings come from the constants in
`lib/astTypes.js` (`AST.CALL_EXPRESSION`, ...) rather than literals. The
constructors you will meet most:

| Constructor | Produces | Used for |
| --- | --- | --- |
| `ast()` | `Program` | the root |
| `literal`, `stringLiteral`, `boolLiteral`, `nullLiteral`, `regex` | `Literal` with an `sType` | literals |
| `identifier` | `Identifier` | names |
| `declaration(id, val)` | `const id = val` | `a = 1`, IO declarations |
| `letDecl(id, val)` | `let id = val` | `let` inside `do` blocks |
| `funcDeclaration(id, params, body)` | `const id = (params) => body` | function declarations, `do` functions |
| `lambda(params, body)` | arrow function wrapped in an `ExpressionStatement` | `\x -> ...`, IO callbacks |
| `lambdaCall`, `letExpression` | immediately-invoked arrow | `(\x -> ...) 1`, `let ... in` |
| `fnCall(callee, args)` | `CallExpression` (or `console.log` for `print`) | calls |
| `memberExpression`, `subscriptExpression` | `MemberExpression` wrapped in an `ExpressionStatement` | `a.b`, `a[0]` |
| `binaryExpression(l, op, r)` | `BinaryExpression` with `sType` from the operator table; maps `^`→`**`, `++`→`+`, `==`→`===`, `!=`→`!==` | operators |
| `ifthenelse` | `ConditionalExpression` in an `ExpressionStatement` | `if/then/else` |
| `ifStmt(test, consequent)` | `if (test) { consequent; return }` | `maybe*` in `do` blocks |
| `array`, `object`, `objectProperty` | literals | |
| `defineProp(obj, key, val, mutable)` | `Object.defineProperty(...)` call | `defineProp` |
| `ioCall`, `ioFunc` | `IO.<name>(args)` | built-in IO functions |
| `ioBind`, `ioMap`, `ioThen`, `defaultIOThen` | `<io>.bind(cb)`, `.map(cb)`, `.then(cb)`, `.then(() => null)` | `do` blocks |
| `comment(type, value)` | `{type: 'Line' \| 'Block', value}` | comments |

### `ExpressionStatement` wrapping and `extractExpr`

Several constructors wrap their result in an `ExpressionStatement`
(`lambda`, `memberExpression`, `ifthenelse`, and calls at the end of a line).
This lets the same node stand alone as a top-level statement. Every
constructor that *embeds* a child runs it through `extractExpr`, which unwraps
an `ExpressionStatement` back to its `expression`. If you build nodes, do the
same: pass children through `extractExpr` (or use the constructors) so you
never end up with a statement where an expression is expected.

## Clean's extra fields

ESTree nodes are plain objects, and `escodegen` ignores fields it does not
know. Clean uses that to carry its own data on the nodes:

| Field | On | Meaning |
| --- | --- | --- |
| `sType` | literals, binary expressions, IO nodes | Clean type: `'number'`, `'string'`, `'bool'`, `'regexp'`, `'IO'`, `'needsInference'` (`AST.NEEDS_INFERENCE`), or an object like `{type: 'array', elemTypes, commonType, isHomogeneous}`. Read by [type inference](type-inference.md). |
| `nextParams` | `ioCall`, `ioBind`, `ioMap` nodes and parser-internal IO state | The names in scope after this step of a `do` block. Used only while parsing `do` blocks; see [io-and-do-blocks.md](io-and-do-blocks.md). |
| `ioParams` | `ioThen` nodes | The parameters of the final `then` callback. |
| `returnVals` | parser-internal IO state | Arguments of a `return` inside a `do` block. |
| `isSubscript` | member property nodes | Whether the property came from `[...]` (computed) or `.name`. |
| `cursorLoc` | some nodes | Position just after the node, set by `returnRest` when the value is an object. |
| `leadingComments`, `trailingComments` | statements, `Program` | Standard escodegen comment attachment, set by `updateComment.js`. |

These fields appear in `--ast` output and in the golden test files under
`test/assert/`, so adding or renaming one changes many golden files.

## Example

`a = 1 + x` parses to:

```json
{
  "type": "VariableDeclaration",
  "kind": "const",
  "declarations": [{
    "type": "VariableDeclarator",
    "id": { "type": "Identifier", "name": "a" },
    "init": {
      "type": "BinaryExpression",
      "operator": "+",
      "sType": "number",
      "left":  { "type": "Literal", "value": 1, "raw": "1", "sType": "number" },
      "right": { "type": "Identifier", "name": "x" }
    }
  }]
}
```

Use `node bin/command.js file.cl --ast` to see the tree for any file.
