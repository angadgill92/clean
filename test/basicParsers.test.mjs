import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* lib files */
const base = require('../lib/basicParsers')
const templ = require('../lib/estemplate')
const utils = require('../lib/utilityFunctions')

/* test file with inputs and expected outputs */
const assertion = require('./basicAssertion')

const initObj = (input, line = 1, column = 0) => ({str: input, line, column})

const output = (input, line, column) => [input, initObj('', line, column)]

describe('basicParsers', () => {
  for (let parser in base) {
    let valid = assertion.basic[parser]
    if (utils.notUndefined(valid)) {
      for (let input in valid) {
        let op = valid[input]
        let value = base[parser](initObj(input))
        let expected = output(op.str, op.line, op.column)
        test(`${parser} - ${input}`, () => {
          assert.deepStrictEqual(value, expected)
        })
      }
    }
    valid = assertion.literal[parser]
    if (utils.notUndefined(valid)) {
      let inpTempl = valid[0]
      let checks = valid[1]
      for (let input in checks) {
        let value = base[parser](initObj(input))
        if (utils.notNull(value)) {
          value = value[0]
          delete value.cursorLoc
        }
        let output = checks[input]
        let expected = utils.isNull(output) ? null : templ[inpTempl](output)
        if (Array.isArray(output)) {
          expected = templ[inpTempl](...output)
        }
        test(`${parser} - ${input}`, () => {
          assert.deepStrictEqual(value, expected)
        })
      }
    }
  }
})
