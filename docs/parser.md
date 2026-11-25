# The parser

Clean's parser is a set of hand-written **parser combinators**. There is no
separate tokenizer: each parser matches an anchored regular expression against
the front of the remaining source text and builds ESTree nodes as it goes.

## The input record and the parser contract

Every parser is a function from an input record to either `null` or a pair:

```js
// input
{ str: 'rest of the source', line: 3, column: 7 }

// output
null                      // did not match
[value, restInputRecord]  // matched: a value and the input after it
```

`value` is usually an ESTree node, but token parsers return the matched string
(for example `'('`, `' '`, `'+'`). Parsers never throw on bad input; they
return `null` and let the caller try something else.

`utilityFunctions.maybe(value, fn)` is the glue used everywhere: it returns
`null` if `value` is `null`, otherwise calls `fn(...value)`. So
`maybe(someParser(input), (node, rest) => ...)` reads as "if it parsed, use
the node and the rest".

`utilityFunctions.returnRest(val, input, rest, field)` builds the next input
record: it copies `input`, replaces `str` with `rest`, and either advances
`column` by `field.value` (`{name: 'column'}`) or adds `field.value` lines and
resets `column` to 0 (`{name: 'return'}`). Positions are only used for error
messages.

## Combinators (`lib/parserObject.js`)

| Combinator | Meaning |
| --- | --- |
| `parser.regex(def)` | Match one token. `def` is `{name, pattern}` from `regexes.js`; the pattern's group 1 is the token and the last group is the rest. Advances `column` by the token length and records progress for error reporting. |
| `parser.all(p1, p2, ...)` | Sequence. All must succeed in order; the value is the array of their values. |
| `parser.any(p1, p2, ...)` | Ordered choice. Returns the first success. Extra arguments are passed through to each parser, which `io.js` uses to thread state (`(input, parentObj, bindBody, mapBody)`). |
| `parser.many(p)` | Zero or more. Applies `p` until it fails; always succeeds with `[values, rest]`. |
| `parser.bind(p, f)` | Monadic bind: run `p`, pass its value to `f`, run the parser `f` returns on the rest. Only `unaryExprParser` uses it. |

There is no backtracking beyond what `any` gives you: once a parser in an
`any` succeeds, the alternatives after it are never tried, even if the overall
parse later fails.

Repetition is always a loop, never self-recursion: simple lists use
`parser.many` (for example `funcParamsParser` in `statements.js`), and the
ones with separators (`argsParser`, `arrayElemsParser`, `objectPropsParser`)
are hand-written `for` loops. V8 does not eliminate tail calls, so a
recursive list parser would overflow the stack on a few thousand items.
`test/performance.test.mjs` checks every list form at that size.

## Tokens (`lib/regexes.js`)

Every token is `{name, pattern}` where `pattern` is anchored and matches only
the token, like `/^(token)/`. `parser.exec(def, str)` runs it and appends the
rest of the input, `str.slice(match[0].length)`, which is O(1) in V8. Do not
add a trailing `([\s\S]*)$` group to capture the rest: that makes every match
scan to the end of the file, and parsing becomes O(n²). (`REGEX`, for regex
literals, is the one pattern with its own tail and its own `exec` call.) The
`name` is used for error messages (below).

A few tokens swallow surrounding whitespace themselves: `EQUAL_SIGN` is
`\s+=\s+`, `THIN_ARROW` is `\s*->\s+`, `REVERSE_BIND` is `\s*<-\s+`, and
`LET`, `IN`, `IF`, `THEN`, `ELSE` require trailing whitespace. Because only
`returnParser` and the comment parsers bump `line`, a newline consumed by one
of these patterns does not advance the line counter, so error line numbers can
drift in that case.

`RETURN` (`returnParser`) matches an optional `// comment`, optional spaces and
one newline. Newlines are significant: they end statements and drive `do`
block parsing.

## Token-level parsers (`lib/basicParsers.js`)

Thin wrappers over `parser.regex` that also convert the token into a node:

- `numberParser`, `stringParser` (unescapes `\n`, `\t`, `\r`, `\'`),
  `booleanParser`, `nullParser`, `regexParser` produce `Literal` nodes via
  `estemplate`, each with an `sType` (see [ast.md](ast.md)).
- `identifierParser` accepts any identifier; `nonReservedIdParser` rejects
  names in `languageConstructs.js` and `ioMethods.js`. Use the latter wherever
  a user-defined name is expected.
- `ioFuncNameParser`, `ioMethodNameParser`, `domMethodParser` accept *only*
  the reserved IO / `maybe*` / DOM names.
- `maybeSpace` always succeeds (with `''` if there is no space).
  `maybeNewLineAndIndent` accepts a newline plus indentation, or optional
  spaces; it is how arrays, objects, and `if/then/else` may span lines.
- `includeParser` matches `include <node-core|browser-core>` and is used by the
  CLI, not by `statementParser`.

## The parser table and lazy references (`lib/parsers/`)

The grammar is mutually recursive (an expression can contain a `do` block
whose statements contain expressions), so the higher-level parsers are split
across three **factories**:

```js
// lib/parsers/expressions.js
module.exports = (getParsers) => {
  const lz = name => input => getParsers()[name](input)
  ...
  return { valueParser, expressionParser, fnCallParser, ... }
}
```

`lib/parsers/index.js` calls each factory once and merges the results into a
cached table (`getParsers()`). Inside a factory, `lz('valueParser')` returns a
function that looks the parser up in the table **at call time**, so a
factory can reference parsers defined in another factory (or later in the same
one) without a circular `require`. Anything a factory returns is reachable by
name through `lz` and is exported from `lib/parser.js`.

## Top level: `statementParser` and `programParser`

`statementParser` (`statements.js`) is an ordered `any` over:

```
multiLineComment, singleLineComment, return (newline),
doBlock, io, doFunc, decl, ifExpr, fnDecl, defineStmt,
fnCall, lambda, lambdaCall, space
```

The first alternative that succeeds wins, so order matters. When you add a
statement form, put it before any alternative that would accept a prefix of
it, and run the full test suite.

`programParser(input, ast)` in `parsers/index.js` loops on
`statementParser`. Values that are plain strings (newlines, spaces) are
dropped; everything else, including comment nodes, is pushed onto
`ast.body`. When `statementParser` returns `null`:

- if the remaining input is empty, the whole file was consumed: run `astupdate` and
  return the `Program`;
- otherwise return a syntax error object (below).

## Statements (`lib/parsers/statements.js`)

| Parser | Shape | Result |
| --- | --- | --- |
| `declParser` | `name = value` | `const name = value` |
| `fnDeclParser` | `name p1 p2 = value` | `const name = (p1, p2) => value` |
| `defineStmtParser` | `defineProp obj key value` | `Object.defineProperty(...)` (read-only) |

Function parameters (`funcParamsParser`) may be identifiers **or** literals,
arrays and objects. Literal parameters are what make a declaration a pattern
clause; see [pattern-matching.md](pattern-matching.md).

## Expressions (`lib/parsers/expressions.js`)

Two layers:

- `expressionParser` is the "atom" level: parentheses, unary, lambda call,
  lambda, `let ... in`, `if ... then ... else`, member expression, array,
  object, boolean, identifier, number, `null`, string, regex.
- `valueParser` is what most places ask for: `any(binaryExpr, fnCall,
  lambdaCall, expression)`.

### Function calls

`fnCallParser` = callee, one space, then either `()` (no arguments) or a
space-separated list of **atoms** (`argsParser` uses `expressionParser`).
So `f g x` is `f(g, x)`, and you need `f (g x)` for `f(g(x))`. The callee
is a member expression or a non-reserved identifier.

When the call is followed by a newline or the end of input, the node is
wrapped in an `ExpressionStatement` so it can stand as a statement.

### Member expressions

`memberExprParser` parses a base (array literal, identifier or parenthesised
value) then loops in `formMemberExpression` over `.name` and `[subscript]`.
It only succeeds if at least one member access was formed, so a bare
identifier falls through to `nonReservedIdParser`.

### Binary expressions

`binaryExprParser` is a shunting-yard parser written as a loop over two
stacks, operands and operators. It reads an operand (`fnCallParser` or
`expressionParser`), then repeatedly an operator (`binaryOperatorParser`,
which also eats spaces around it) and another operand. Before pushing an
operator it reduces, into `BinaryExpression`s, every operator on the stack
that binds tighter, or equally tight when the new operator is
left-associative. At the end it reduces whatever is left.

An operator with no operand after it makes the whole parse fail. If no
operator was found at all (a lone operand) it returns `null`, so that
`valueParser` falls through to `fnCallParser` / `expressionParser`.

Precedence, associativity and result type come from
`lib/operatorPrecedence.js`:

| Operator | Prec | Assoc | Result `sType` | Emitted as |
| --- | --- | --- | --- | --- |
| `++` | 12 | L | string | `+` |
| `.` | 11 | R | function | (not produced by the operator regex) |
| `^` | 10 | R | number | `**` |
| `*` `/` `%` | 9 | L | number | same |
| `+` `-` | 8 | L | number | same |
| `<<` `>>` `>>>` | 7 | L | number | same |
| `==` `!=` `<` `<=` `>` `>=` | 6 | L | bool | `===`, `!==`, same |
| `&` | 5 | L | number | same |
| `\|` | 4 | L | number | same |
| `&&` `\|\|` | 3 | R | bool | same |

Every operator the regex accepts must have an entry. Binary expressions
cannot span lines. `test/regressions.test.mjs` checks precedence by
compiling expressions and comparing their values with JavaScript's.

### Memoization

`valueParser` tries several alternatives that start the same way, and
without a cache each nesting level would re-parse its contents several times
(exponential in depth: parentheses 10 deep used to take 13 s).
`parsers/index.js` therefore wraps `valueParser` and `expressionParser` in
a cache keyed by position (the remaining input's length). The cache is
cleared whenever one of them is entered from outside any other, so a position
is always measured against the same input. Because cached nodes can be
returned more than once, parsers should not mutate nodes they did not build.

### Other expression parsers

- `lambdaParser`: `\a b -> body` becomes an arrow function.
- `lambdaCallParser`: `(\a b -> body) x y` becomes an immediately-invoked arrow.
- `letExpressionParser`: `let a = 1 b = 2 in body` becomes
  `((a, b) => body)(1, 2)`.
- `ifExprParser`: `if c then a else b` (may break lines before `then`/`else`)
  becomes a `ConditionalExpression`.
- `unaryExprParser`: `-x`, `!x`, `:type x` (→ `typeof x`).
- `arrayParser` / `objectParser`: comma-separated, may span lines. Object keys
  are identifiers, strings or numbers. A trailing comma in an object fails the
  parse.

## Syntax errors

`parserObject.js` keeps one module-level object, `parser.unParsed`, which
records the **furthest position** any `parser.regex` call has reached
(`line`, `column`, the text of that line as `str`) and the names of the
regexes that matched at that furthest column (ignoring `spaceRegex` and
`equalSignRegex`).

When `programParser` fails, `makeErrorObj` takes the **last** regex name in
that list and looks it up in `lib/errors.json`:

```json
{
  "openParensRegex": "Missing expression",
  "binaryOperatorRegex": "Missing operand",
  "unaryOperatorRegex": "Missing operand",
  "stringRegex": "String error",
  "doRegex": "Looks like you missed an action after the 'do'",
  "default": "Expected expression, found"
}
```

The idea: the last thing that matched before parsing got stuck says what was
expected next. For `a = 1 +` the last token matched is the `+`, so the message
is "Missing operand". Anything without an entry gets the default message plus
the text of the line.

`programParser` resets `parser.unParsed` every time `statementParser` returns
`null`, which includes normal end-of-input. If you call individual parsers
directly (as tests do), `unParsed` is not reset between calls.
