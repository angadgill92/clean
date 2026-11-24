/*
  Performance and stack-depth regression tests.

  Each test is sized so that the parser before the fix fails it clearly
  (by many times the budget, or with a stack overflow), while the fixed
  parser passes it with a wide margin.
*/
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const { programParser } = require('../lib/parser')

const parse = str => programParser({ str, line: 1, column: 0 })

const timeParse = str => {
  const start = process.hrtime.bigint()
  const tree = parse(str)
  const ms = Number(process.hrtime.bigint() - start) / 1e6
  return [tree, ms]
}

const assertParsesWithin = (str, budgetMs) => {
  const [tree, ms] = timeParse(str)
  assert.equal(tree.error, undefined, `unexpected syntax error: ${tree.msg}`)
  assert.equal(tree.type, 'Program')
  assert.ok(ms < budgetMs, `took ${ms.toFixed(0)} ms, budget ${budgetMs} ms`)
  return tree
}

const lines = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('\n') + '\n'

describe('parse time grows linearly with file size', () => {
  // Before the fix every token re-scanned the rest of the file (O(n^2)):
  // this file took about 3 s to parse.
  test('1,500 lines of long string declarations', () => {
    const src = lines(1500, i => `s${i} = '${'x'.repeat(300)}' ++ 'y${i}'`)
    assertParsesWithin(src, 500)
  })
})

describe('long input does not overflow the stack', () => {
  // Before the fix these threw "RangeError: Maximum call stack size exceeded".
  test('5,000 operands in one expression', () => {
    const src = 'a = ' + Array.from({ length: 5000 }, (_, i) => String(i)).join(' + ') + '\n'
    assertParsesWithin(src, 5000)
  })
})
