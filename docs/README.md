# How Clean works

These docs explain the internals of the Clean compiler (`cleanlang`): how a
`.cl` file becomes JavaScript, and where to look when you want to change that.
For build commands and coding conventions, see [`CLAUDE.md`](../CLAUDE.md) at
the repo root. For a user-level introduction to the language, see the
[readme](../readme.md).

## Reading order

| Doc | What it covers |
| --- | --- |
| [language.md](language.md) | The Clean language by example, with the JavaScript each construct compiles to |
| [architecture.md](architecture.md) | The compilation pipeline end to end, the CLI, and a map of every file in `lib/` |
| [parser.md](parser.md) | The parser-combinator core, tokens, the parser table, operator precedence, and syntax errors |
| [ast.md](ast.md) | The ESTree AST the parser builds, `estemplate.js`, and Clean's extra fields (`sType`, `nextParams`, ...) |
| [io-and-do-blocks.md](io-and-do-blocks.md) | The `IO` runtime (`lib/include/`) and how `do` blocks are compiled into `bind` / `map` / `then` chains |
| [pattern-matching.md](pattern-matching.md) | `astupdate.js`: how `factorial 1 = 1` style definitions become a `switch` |
| [type-inference.md](type-inference.md) | `typeInference.js`: the type checker that runs between parsing and codegen |
| [codegen.md](codegen.md) | How `escodegen` turns the tree into JavaScript and how the output file is assembled |
| [testing.md](testing.md) | The test suites, golden files, and how to update them |
| [recipes.md](recipes.md) | Step-by-step guides for common changes, plus known quirks |

## The 30-second version

```
hello.cl
  │
  ├─ includeParser ........ strips "include node-core", picks the runtime prelude
  ├─ programParser ........ parser combinators build an ESTree Program directly
  ├─ astupdate ............ merges pattern-matched function clauses into a switch,
  │                         attaches comments
  ├─ typeInference ........ checks top-level declarations, errors on a mismatch
  └─ escodegen ............ prints JavaScript
        │
        ▼
hello.js = lib/include/core.js + lib/include/node-core.js + "global.IO = IO" + generated code
```

There is no separate lexer and no intermediate representation: parsers match
anchored regexes against the remaining source string and return
[ESTree](https://github.com/estree/estree) nodes, which go straight to
`escodegen`. Clean-specific information rides along on the ESTree nodes as
extra fields that `escodegen` ignores.
