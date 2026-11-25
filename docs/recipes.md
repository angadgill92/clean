# Recipes and known quirks

## Recipes

### Add a token

1. Add `{name, pattern}` to `lib/regexes.js`. Anchor it and match only the
   token: `/^(token)/`. Never add a tail group that captures the rest of the
   input (see [parser.md](parser.md#tokens-libregexesjs)).
2. Wrap it in `lib/basicParsers.js` (`const fooParser = input => parser.regex(FOO)(input)`)
   and export it.
3. If a missing-`foo` situation deserves its own message, add
   `"fooRegex": "..."` to `lib/errors.json` (see [parser.md](parser.md#syntax-errors)).
4. Add a case to `test/basicAssertion.json`.

### Add a keyword

Do the token steps, then add the word to `lib/languageConstructs.js` so
`nonReservedIdParser` stops accepting it as an identifier.

### Add an expression or statement form

1. Write the parser in the right factory under `lib/parsers/`
   (`expressions.js`, `statements.js` or `io.js`). Build nodes with
   `estemplate` constructors (add one if needed, using `astTypes.js`
   constants). Reference parsers from other factories with `lz('name')`.
2. Return it from the factory. It is now in the parser table and exported
   from `lib/parser.js`.
3. Hook it in: add it to `expressionParser` / `valueParser`
   (expressions) or `statementParser` (statements). Order matters: the first
   alternative that succeeds wins.
4. If it produces a node type the type checker has not seen, add a case to
   `exprType` in `lib/typeInference.js`.
5. Add a `test/src/*.cl` + `test/assert/*.json` pair and run the full suite;
   reordering alternatives can change unrelated golden files.

### Add a binary operator

1. Add it to `BINARY_OPERATOR` in `lib/regexes.js` (longer operators before
   their prefixes, for example `<=` before `<`).
2. Add `{type, prec, assoc}` to `lib/operatorPrecedence.js`. Every operator
   the regex accepts needs an entry.
3. If the JavaScript spelling differs, map it in
   `estemplate.binaryExpression`.
4. Add cases to `test/regressions.test.mjs`.

### Add a built-in IO function

1. Add a static method to `class IO` in `lib/include/node-core.js` and/or
   `browser-core.js`, returning `new IO(cb => ...)`.
2. Add its name to `staticIOMethods` in `lib/ioMethods.js`. The parser then
   compiles `name args` to `IO.name(args)`, and the name becomes reserved.

### Add a built-in method type

See [type-inference.md](type-inference.md#extending-the-checker).

## Known quirks

Verified against the current code; none of these is fixed yet.

- **Binary expressions cannot span lines.** `a = 1 +` followed by an indented
  `2` is a syntax error.
- **Pattern clauses merge by position, not name.** See
  [pattern-matching.md](pattern-matching.md#limitations).
- **Unary minus on a parameter is a type error.** `neg n = -n` fails type
  checking because `unaryExprType` ignores the local scope.
- **`getElemTag` maps to `getElementByTagName`**, which does not exist (the
  DOM method is `getElementsByTagName`).
- **`IO` values are mutable.** `map` and `bind` modify the IO they are called
  on, so reusing an IO value after chaining it changes the original.
- **Line numbers can drift** when a newline is consumed by a token pattern that
  allows `\s` (for example `=` or `->`), since only `returnParser` and comment
  parsers increment `line`.
