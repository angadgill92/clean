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

describe('nested expressions do not backtrack exponentially', () => {
  // Before the fix each nesting level re-parsed its contents several
  // times: parentheses 10 deep took about 13 s, arrays 8 deep about 17 s.
  test('parentheses nested 10 deep', () => {
    const tree = assertParsesWithin(`a = ${'('.repeat(10)}1${')'.repeat(10)}\n`, 500)
    assert.equal(tree.body[0].declarations[0].init.value, 1)
  })

  test('arrays nested 8 deep', () => {
    const tree = assertParsesWithin(`a = ${'['.repeat(8)}1${']'.repeat(8)}\n`, 500)
    let node = tree.body[0].declarations[0].init
    for (let i = 0; i < 8; i++) node = node.elements[0]
    assert.equal(node.value, 1)
  })

  test('function calls nested 12 deep', () => {
    assertParsesWithin(`a = f ${'(g '.repeat(12)}1${')'.repeat(12)}\n`, 500)
  })
})

describe('long input does not overflow the stack', () => {
  // Before the fix these threw "RangeError: Maximum call stack size exceeded".
  test('5,000 operands in one expression', () => {
    const src = 'a = ' + Array.from({ length: 5000 }, (_, i) => String(i)).join(' + ') + '\n'
    assertParsesWithin(src, 5000)
  })
})
