# Pattern matching (`lib/astupdate.js`)

Clean lets you define a function by cases:

```
factorial 1 = 1
factorial n = n * factorial (n - 1)
```

The parser does not know these lines belong together. Each one is parsed by
`fnDeclParser` as an ordinary function declaration, so the tree first holds
two `const factorial = ...` declarations: one whose parameter is the literal
`1`, and one whose parameter is the identifier `n`. `astupdate.js` merges them
after parsing.

## When it runs

`programParser` calls `updateAst(ast)` once, when it has consumed the whole
input. It is the only pass that restructures the tree. It also calls
`updateComment` (below).

## The algorithm

`updateAst` folds over `ast.body` with two accumulators: the new body and a
list of pending **pattern clauses**.

For each statement, `processSubTree` decides:

1. Not a declaration of an arrow function (anything else, including comments):
   keep it as is. Pending clauses stay pending.
2. An arrow-function declaration where **any** parameter is a `Literal`,
   `ArrayExpression` or `ObjectExpression`: it is a pattern clause. Remove it
   from the body and add it to the pending list.
3. An arrow-function declaration whose parameters are all plain identifiers:
   it is a **general clause**. If there are pending clauses, merge them into
   it with `formMultiPatternAst`, then clear the list.

`formMultiPatternAst` replaces the general clause's body with:

```js
{
  switch (<first param>) {
  case <pattern clause 1's first param>: return <its body>;
  case <pattern clause 2's first param>: return <its body>;
  default: return <general clause's body>;
  }
}
```

If any pattern clause's first parameter is an array literal, the switch is on
`<first param>.length` instead, and that clause's case is `0`. In practice
this supports only the empty-array pattern (`sum [] = 0`). The case test is
given an array `sType` so type inference treats it consistently.

## Limitations

These follow from the algorithm and are worth knowing before you rely on
pattern matching or change it:

- **Only the first parameter is matched.** Patterns in later parameters make
  the clause a pattern clause, but their values are never tested.
- **Names are not compared.** Pending clauses merge into the next general
  clause, whatever its name. `foo 0 = 'zero'` followed by `bar n = n + 1`
  produces a `bar` with a `case 0` and no `foo` at all.
- **Pattern clauses with no following general clause are dropped** silently.
- Parameter names come from the general clause. In `f 0 y = y` followed by
  `f n m = m`, the `case 0` body still says `y`, which is not defined in the
  merged function. Pattern clause bodies should use the general clause's
  parameter names.
- Array patterns other than `[]` compile to `case 0` regardless of contents.
- Object patterns are accepted by the parser and treated as pattern clauses,
  but compile to a `case` comparing against a fresh object literal, which
  never matches.

## Comments (`lib/updateComment.js`)

The parser emits comments as statements of type `Line` or `Block` in
`ast.body`. `escodegen` expects comments attached to nodes instead, so
`updateComment(body, ast)` walks the body and:

- collects consecutive comments and attaches them as `leadingComments` of the
  next real statement;
- attaches comments at the end of the file as `trailingComments` of the last
  statement, or as `leadingComments` on the `Program` if the file has only
  comments.

`cli.js` passes `comment: true` to `escodegen`, which prints them.
