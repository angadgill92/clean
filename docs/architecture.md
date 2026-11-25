# Architecture

## Entry points

```
bin/command.js        #!/usr/bin/env node, just require('../lib/clean')
lib/clean.js          parses argv with node:util.parseArgs, calls lib/cli.js
lib/cli.js            the driver: read, include, parse, type-check, generate, write, run
```

`lib/clean.js` builds an object shaped like the old `yargs` output
(`{v, h, help, o, w, ast, t, _: positionals}`) so `cli.js` did not have to
change when `yargs` was removed. `strict: false` means unknown flags are
ignored rather than rejected.

## The pipeline in `cli.js`

`evalFunction(argsObj, infile, outfile)` runs one file through five steps.

### 1. Read source

`readSource` returns the **input record** that every parser works on:

```js
{ str: '<the whole file>', line: 1, column: 0 }
```

### 2. Resolve the include

`resolveImports` runs `basicParsers.includeParser` on the input. If the file
starts with `include node-core` or `include browser-core`, it reads
`lib/include/core.js` and `lib/include/<lib>.js` as text and appends
`global.IO = IO` (node) or `window.IO = IO` (browser). This text is the
**prelude**. It is not compiled; it is pasted verbatim in front of the output.
The rest of the input record (after the include line) goes on to the parser.

Only one include is supported, and it must be the very first thing in the
file.

### 3. Parse

`require('./parser').programParser(input)` returns either an ESTree
`Program` or an error object `{error: true, line, column, str, msg}`. On an
error, `makeErrStr` prints a caret under the failing line and exits with
status 1. With
`--ast`, the tree is printed as JSON and the process exits here.

`programParser` (in `lib/parsers/index.js`) repeatedly applies
`statementParser`, pushing each statement onto `ast.body`. When no statement
parser matches, it either has consumed all the input, in which case it runs
`astupdate` on the finished tree and returns it, or it has not, in which
case it builds an error from the furthest point any regex reached. See
[parser.md](parser.md) and [pattern-matching.md](pattern-matching.md).

### 4. Type-check

Unless `-t` was passed, `inferTypes(tree.body)` (`lib/typeInference.js`)
walks the top-level declarations. It returns the body unchanged on success or
`{error: true, id: '<name>'}` naming the first declaration whose type could
not be reconciled. `cli.js` prints that object as JSON and exits with
status 1. Type
inference never rewrites the tree beyond the type annotations it reads. See
[type-inference.md](type-inference.md).

### 5. Generate, write, run

`escodegen.generate(tree, {format, comment: true})` turns the tree into
JavaScript (see [codegen.md](codegen.md)). `writeOutput` writes
`prelude + code + '\n'` to the output file. If `-o` was not given, the output
path is the input path with `.cl` replaced by `.js`, and `executeOutput` runs
it with `execSync('node <outfile> <extra args>')`, passing through any extra
positional arguments. With `-o` the file is only written.

## Watch mode

`clean -w srcDir -o outDir` first walks `srcDir` (`scanInitial`), mirroring
its folder structure into `outDir` and compiling every `.cl` file, then listens
with `fs.promises.watch(srcDir, {recursive: true})`:

- `rename` of something that exists: create the mirrored folder, or compile the file
- `rename` of something that no longer exists: delete the mirrored `.js` file and folder
- `change`: recompile the file

Because watch mode calls the same `evalFunction`, `-o` is set, so files are
compiled but not run. A syntax or type error calls `process.exit`, which
stops the watcher too.

## File map

### Driver

| File | Role |
| --- | --- |
| `bin/command.js` | npm `bin` entry |
| `lib/clean.js` | argv parsing |
| `lib/cli.js` | pipeline, output, watch mode |

### Parsing

| File | Role |
| --- | --- |
| `lib/parserObject.js` | Combinator core: `exec`, `regex`, `all`, `any`, `many`, `bind`, plus the furthest-progress tracker `unParsed` |
| `lib/regexes.js` | Every token as `{name, pattern}` |
| `lib/basicParsers.js` | Token-level parsers (identifiers, literals, punctuation, keywords, comments, `includeParser`) |
| `lib/parsers/expressions.js` | Expressions: binary/unary, `if`, `let ... in`, lambdas, calls, arrays, objects, member access |
| `lib/parsers/io.js` | `do` blocks, IO declarations, bind/let/maybe statements |
| `lib/parsers/statements.js` | Declarations, function declarations, `defineProp`, and the top-level `statementParser` |
| `lib/parsers/index.js` | Builds the merged parser table and memoizes the expression parsers; `programParser`; error objects |
| `lib/parser.js` | Re-exports `parsers/index.js` |
| `lib/operatorPrecedence.js` | Binary operator precedence, associativity and result type |
| `lib/languageConstructs.js` | Reserved words that cannot be used as identifiers |
| `lib/ioMethods.js` | Names of built-in IO functions, `maybe*` methods and DOM helpers (also reserved) |
| `lib/errors.json` | Syntax error messages keyed by regex name |
| `lib/utilityFunctions.js` | `maybe`, `returnRest` (position bookkeeping), lookups, null checks |

### AST and later passes

| File | Role |
| --- | --- |
| `lib/astTypes.js` | ESTree node type names and Clean's internal markers |
| `lib/estemplate.js` | Constructors for every node the parsers build |
| `lib/astupdate.js` | Pattern-matching rewrite; calls `updateComment` |
| `lib/updateComment.js` | Turns comment statements into `leadingComments` / `trailingComments` |
| `lib/typeInference.js` | Type checker |
| `lib/inbuiltMethods.js` | Types of built-in properties/methods on arrays, strings, objects, regexps; `Math` and `console` |
| `lib/jsFunctions.js` | Types of global JS functions (`parseInt`, `String`, `require`, ...) |

### Runtime (emitted, not executed by the compiler)

| File | Role |
| --- | --- |
| `lib/include/core.js` | `IOCore` class: `then`, `map`, `bind`, `createIO`, `timer` |
| `lib/include/node-core.js` | `class IO extends IOCore` with `getLine`, `putLine` |
| `lib/include/browser-core.js` | `class IO extends IOCore` with XHR helpers and DOM events |

These three files are excluded from ESLint because they are snippets meant to
be concatenated (they reference classes defined in each other).
