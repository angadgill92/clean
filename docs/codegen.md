# Code generation

Clean does not have its own code generator. Because the parser builds an
ESTree `Program`, `cli.js` hands the tree straight to
[escodegen](https://github.com/estools/escodegen):

```js
escodegen.generate(tree, { format, comment: true })
```

`escodegen` is the compiler's only runtime dependency.

## Format options

`format` is defined at the top of `lib/cli.js`. The notable choices:

| Option | Value | Effect |
| --- | --- | --- |
| `indent.style` | two spaces | |
| `quotes` | `'single'` | strings print with single quotes |
| `semicolons` | `false` | semicolons are omitted where escodegen can omit them; some still appear between statements |
| `parentheses` | `true` | keep parentheses escodegen considers optional |
| `compact` | `false` | readable, multi-line output |

`comment: true` makes escodegen print the `leadingComments` /
`trailingComments` that `updateComment.js` attached (see
[pattern-matching.md](pattern-matching.md#comments-libupdatecommentjs)).

## Clean-only fields

The tree carries fields escodegen does not know about (`sType`,
`nextParams`, `cursorLoc`, ...). escodegen ignores unknown fields, so they
are never stripped. See [ast.md](ast.md#cleans-extra-fields).

## Assembling the output file

`writeOutput` writes:

```
<prelude>          lib/include/core.js + lib/include/<lib>.js + "global.IO = IO" or "window.IO = IO"
<generated code>
```

The prelude is empty if the source has no `include` line. Without `-o` the
output is written next to the source as `<name>.js` and run with
`node <name>.js [extra args]`; with `-o <file>` it is only written.

## Inspecting output

```sh
node bin/command.js file.cl -o /tmp/out.js   # compile only
node bin/command.js file.cl --ast            # tree before type inference and codegen
node bin/command.js file.cl -t -o out.js     # skip type checking
```

`--ast` prints the tree after `astupdate` (pattern clauses already merged) but
before type inference.
