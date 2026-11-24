/*
  Regression tests for specific bugs. Each test names the bug it covers.
*/
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const escodegen = require('escodegen')
const { programParser } = require('../lib/parser')

const compile = src => {
  const tree = programParser({ str: src, line: 1, column: 0 })
  assert.equal(tree.error, undefined, `syntax error: ${tree.msg}`)
  return escodegen.generate(tree)
}

// Compile `a = <expr>` and evaluate the generated JavaScript.
const evalClean = expr => new Function(`${compile(`a = ${expr}\n`)}\nreturn a`)() // eslint-disable-line no-new-func

describe('binary operator precedence and associativity', () => {
  // Bug: only one operator was reduced when a lower-precedence operator
  // arrived, so `1 - 2 * 3 + 4` compiled to `1 - (2 * 3 + 4)` (-9).
  const cases = [
    ['1 - 2 * 3 + 4', 1 - 2 * 3 + 4],
    ['10 - 2 - 3', 10 - 2 - 3],
    ['10 - 2 + 3', 10 - 2 + 3],
    ['2 * 3 - 4 - 1', 2 * 3 - 4 - 1],
    ['100 / 10 / 5', 100 / 10 / 5],
    ['1 + 2 * 3 ^ 2 - 4 / 2', 1 + 2 * 3 ** 2 - 4 / 2],
    ['2 ^ 3 ^ 2', 2 ** 3 ** 2],
    ['20 % 7 * 2 - 1', 20 % 7 * 2 - 1],
    ['1 + 2 < 2 * 3', 1 + 2 < 2 * 3],
    ['1 < 2 == 3 > 4', (1 < 2) === (3 > 4)],
    ['1 - 1 == 0 && 2 * 2 == 4', 1 - 1 === 0 && 2 * 2 === 4],
    ['1 > 2 || 3 - 1 == 2', 1 > 2 || 3 - 1 === 2]
  ]
  for (const [expr, expected] of cases) {
    test(expr, () => assert.equal(evalClean(expr), expected))
  }
})
