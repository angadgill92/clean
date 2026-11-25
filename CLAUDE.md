# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Clean (`cleanlang`) is a small functional language that compiles `.cl` source to JavaScript. It has Haskell-ish syntax: juxtaposition function calls, pattern-matched function definitions (`factorial 1 = 1`), and `do` blocks over an evented `IO` type. The compiler is plain Node.js (CommonJS in `lib/`), with `escodegen` as its only runtime dependency.

## Commands

Node 24 is required (`.nvmrc`; `engines: >=24`). Run `nvm use` first.

```sh
npm install
npm test          # c8 node --test test/*.test.mjs (coverage via c8)
npm run lint      # eslint lib  (test/ and lib/include/*core.js are ignored)

# single test file
node --test test/sourceFiles.test.mjs
# single test by name (source-file tests are named after the .cl file)
node --test --test-name-pattern="factorial.cl" test/sourceFiles.test.mjs

# run the compiler locally
node bin/command.js path/to/file.cl          # compile to file.js next to it, then run it
node bin/command.js file.cl -o out.js        # compile only (no run)
node bin/command.js file.cl --ast            # dump the ESTree AST and exit
node bin/command.js file.cl -t               # skip type inference
node bin/command.js -w srcDir -o outDir      # watch a folder (native fs.watch), mirror .cl -> .js
```

CI (`.github/workflows/ci.yml`) runs `npm install`, `npm run lint`, `npm test` on pushes/PRs to `master`/`main`.

## Compilation pipeline

`bin/command.js` → `lib/clean.js` (argv via `node:util.parseArgs`) → `lib/cli.js`, which does:

1. **Include resolution** (`basicParsers.includeParser`): an optional leading `include node-core` / `include browser-core` line. The runtime prelude `lib/include/core.js` (the `IOCore` class) plus the chosen `<lib>.js` is prepended verbatim to the output, followed by `global.IO = IO` or `window.IO = IO`. These include files are emitted JS, not compiler code.
2. **Parsing** (`lib/parser.js` → `lib/parsers/index.js` `programParser`): produces an ESTree `Program` directly. On failure it returns an error object (`{error, line, column, str, msg}`) instead of throwing; messages come from `lib/errors.json`, keyed by the name of the last regex that made progress.
3. **AST post-processing** (`lib/astupdate.js`): runs once parsing has consumed all input. It merges consecutive pattern-matched function declarations of the same name into one function with a `switch`, and reattaches comments (`updateComment.js`).
4. **Type inference** (`lib/typeInference.js`): walks `tree.body`, returns the body or an `{error: ...}` object. Literals carry a custom `sType` field (`'number'`, `'string'`, `'bool'`, array type objects, or `AST.NEEDS_INFERENCE`). Known method signatures live in `inbuiltMethods.js` and `jsFunctions.js`.
5. **Codegen**: `escodegen.generate(tree, {comment: true, ...})` (format options are in `cli.js`). The output is written to disk and, without `-o`, executed with `execSync('node ...')`.

## Parser architecture

Parsers are hand-written parser combinators over an input record `{str, line, column}`. Each parser returns `null` on failure or `[value, restInput]` on success.

- `lib/parserObject.js` holds the combinator core: `parser.regex(def)`, `parser.all(...)` (sequence), `parser.any(...)` (first match), `parser.bind`. It also holds the **module-level mutable `parser.unParsed`**, which records the furthest position reached for error reporting. `programParser` resets it after each failed parse, so keep that in mind when calling parsers directly in tests.
- `lib/regexes.js` defines every token as `{name, pattern}`. Patterns are anchored and match only the token (`/^(token)/`); `parser.exec` takes the rest with `str.slice`. Never add a `([\s\S]*)$` tail to capture the rest: it makes parsing O(n²). `name` feeds error messages via `errors.json`.
- `lib/basicParsers.js` holds token-level parsers built from those regexes (identifiers, literals, punctuation, keywords, `includeParser`).
- `lib/parsers/{expressions,io,statements}.js` are **factories** taking `getParsers`. They reference each other lazily through `lz('parserName')` to break the mutual recursion. `parsers/index.js` builds and caches the merged parser table. To add a parser, return it from the relevant factory; it is then reachable by name from the others and exported from `lib/parser.js`.
- `statementParser` (in `statements.js`) is the top-level ordered alternation. **Order matters**, because `parser.any` takes the first success.
- `lib/estemplate.js` holds the ESTree node constructors used by all parsers. Node type strings come from `lib/astTypes.js`, so use those constants rather than string literals. Reserved words are in `languageConstructs.js`.

## Tests

All tests use `node:test` + `node:assert/strict` as `.mjs` files that `createRequire` the CommonJS `lib/`.

- `sourceFiles.test.mjs` is golden-file testing. Every `test/src/**/*.cl` is parsed and type-inferred (no codegen), then deep-compared to `test/assert/**/<same name>.json` (the subfolder mirrors `src/`). Expected parse errors and type errors are also golden JSON (`parseErrors/`, `typeErrors/`). There is no script to regenerate these. When a change intentionally alters the AST, produce the new JSON with `--ast` or by calling the parser plus `typeInference` the same way the test's `generateTree` does, and review the diff.
- `basicParsers.test.mjs` is data-driven from `test/basicAssertion.json`. Only parsers with an entry there are tested.
- `combinationParsers.test.mjs` tests statement-level parsers against `estemplate` builders.
- `regressions.test.mjs` holds one test per fixed bug (expressions are compiled, run, and compared with JavaScript's own result); `performance.test.mjs` holds time budgets and stack-depth checks. Every bug fix needs a test that fails before the fix.
- `cli.test.mjs` spawns `bin/command.js`. It asserts the version string from `package.json` (update it when bumping the version) and exercises watch mode in `test/temp_watch` / `test/temp_out`.

## Conventions

- Style is StandardJS-like (no semicolons, 2 spaces, single quotes, camelCase), per `contributing.md`. ESLint enforces `prefer-const` and `no-param-reassign` (props), except in the type inference, parser, and AST-update files, which mutate nodes in place.
- Commits follow the "seven rules" (imperative, capitalized subject ≤50 chars, no trailing period, body wrapped at 72) and should each hold one logical change. Recent history uses a `Refactor: ...` prefix.
