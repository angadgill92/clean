# Testing

```sh
npm test                                   # c8 node --test test/*.test.mjs
node --test test/sourceFiles.test.mjs      # one suite
node --test --test-name-pattern="factorial.cl" test/sourceFiles.test.mjs
npm run lint                               # eslint lib
```

All suites are `node:test` + `node:assert/strict` files (`.mjs`) that load the
CommonJS `lib/` through `createRequire`. CI (`.github/workflows/ci.yml`) runs
`npm install`, `npm run lint` and `npm test` on Node from `.nvmrc`.

## The suites

### `sourceFiles.test.mjs`: golden files

The main suite. For every `test/src/**/*.cl` it:

1. strips the `include` line with `includeParser`,
2. runs `programParser`,
3. runs `typeInference` on the body (if parsing succeeded),

and deep-compares the result with `test/assert/**/<same name>.json`. The
`assert/` tree mirrors `src/`. The result is the `Program` (with `sType` and
other extra fields), a parse error object, or a type error object:

| Folder | Expected JSON |
| --- | --- |
| `test/assert/*.json` | the full AST |
| `test/assert/parseErrors/` | `{line, column, str, error: true, msg}` |
| `test/assert/typeErrors/` | `{error: true, id}` |

Codegen is not tested here; the JSON is the tree escodegen would receive.

**Updating golden files.** There is no regenerate script. When a change
intentionally alters the AST, regenerate the affected file(s) the same way the
test does and review the diff before committing. One way:

```sh
node -e '
const fs = require("fs")
const base = require("./lib/basicParsers")
const parse = require("./lib/parser").programParser
const infer = require("./lib/typeInference")
const [src, out] = process.argv.slice(1)
let input = {str: fs.readFileSync(src, "utf8"), line: 1, column: 0}
const inc = base.includeParser(input); if (inc) input = inc[1]
let tree = parse(input)
if (!tree.error) { const b = infer(tree.body); if (b.error) tree = b; else tree.body = b }
fs.writeFileSync(out, JSON.stringify(tree, null, 2) + "\n")
' test/src/factorial.cl test/assert/factorial.json
```

For a file that parses and type-checks, `node bin/command.js file.cl --ast`
prints the same tree (checked against every current golden file), so
redirecting it into the JSON file also works. For the `parseErrors/` and
`typeErrors/` cases use the script, since the CLI prints a formatted message
instead of the error object.

### `basicParsers.test.mjs`

Data-driven from `test/basicAssertion.json`: for each parser in
`lib/basicParsers.js` that has an entry under `basic`, each key is an input
and the value is the expected `{str, line, column}` after parsing. Parsers
without an entry are not tested.

### `combinationParsers.test.mjs`

Calls statement-level parsers (`declParser`, `fnDeclParser`, `ifExprParser`,
`ioParser`, `doBlockParser`, lambdas, ...) on small inputs and compares the
result with trees built from `estemplate` constructors.

These tests call parsers directly, so `parser.unParsed` (the error tracker)
is not reset between them. See [parser.md](parser.md#syntax-errors).

### `regressions.test.mjs`

One test per fixed bug, named after it. Expression tests compile
`a = <expr>`, run the generated JavaScript, and compare the value with
JavaScript's own evaluation of the same expression, so precedence bugs show
up as wrong values rather than as AST diffs.

### `performance.test.mjs`

Time budgets and stack-depth checks: a 1,500-line file, deeply nested
parentheses, arrays and calls, and every list form (statements, `do` lines,
`let` bindings, operands, array elements, object properties, arguments,
parameters) at several thousand items. Each was sized so that the parser
before the fix failed it clearly (by many times the budget, or with a stack
overflow), while the current parser passes with a wide margin.

### `cli.test.mjs`

Spawns `bin/command.js` as a subprocess: version, help and no-argument
output, compiling and running a single file, `--ast`, `-t -o`, and watch mode
using `test/temp_watch` and `test/temp_out`. It also checks that syntax errors, type errors and a
missing file exit with status 1. It checks the version string
against `package.json`, so update the test's expectation when bumping the
version.

## Adding a test

- New language feature or regression: add `test/src/<name>.cl` and its
  `test/assert/<name>.json` (generated as above, then reviewed).
- Expected syntax error: put the source under `test/src/parseErrors/`.
- Expected type error: put the source under `test/src/typeErrors/`.
- New token-level parser: add cases to `test/basicAssertion.json`.
- Bug fix: add a test to `test/regressions.test.mjs` (or
  `performance.test.mjs` for speed or stack depth) that fails before the fix.
