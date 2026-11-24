const estemplate = require('../estemplate')
const parser = require('../parserObject')
const utils = require('../utilityFunctions')
const errorMsg = require('../errors')

const { isNull, isUndefined } = utils

const expressionsFactory = require('./expressions')
const ioFactory = require('./io')
const statementsFactory = require('./statements')

const makeErrorObj = errObj => {
  errObj.error = true
  const len = errObj.regex.length - 1
  const defaultMsg = errorMsg.default + ': ' + errObj.str
  const regexName = isUndefined(errObj.regex[len]) ? defaultMsg : errObj.regex[len]
  const errorText = isUndefined(errorMsg[regexName]) ? defaultMsg : errorMsg[regexName]
  errObj.msg = errorText
  delete errObj.regex
  return errObj
}

let parsersCache = null

/*
  Memoization (packrat parsing) for the expression parsers.

  valueParser tries several alternatives that share a prefix, so without a
  cache every level of nesting re-parses its contents several times and
  parse time grows exponentially with depth. Results are cached by
  position, measured as the length of the remaining input.

  Positions are only comparable within one parse of one string, so the
  cache lives for one outermost call: it is cleared whenever a memoized
  parser is entered from outside any other memoized parser. Every nested
  call works on a suffix of that outermost input.
*/
const MEMOIZED = ['valueParser', 'expressionParser']
const memoTables = new Map()
let memoDepth = 0

const memoize = (name, parse) => {
  const table = new Map()
  memoTables.set(name, table)
  return input => {
    if (memoDepth === 0) memoTables.forEach(t => t.clear())
    const key = input.str.length
    if (table.has(key)) return table.get(key)
    memoDepth++
    let result
    try {
      result = parse(input)
    } finally {
      memoDepth--
    }
    table.set(key, result)
    return result
  }
}

const getParsers = () => {
  if (parsersCache) return parsersCache

  parsersCache = {} // Prevent infinite loop on first evaluation if any

  const expressions = expressionsFactory(getParsers)
  const io = ioFactory(getParsers)
  const statements = statementsFactory(getParsers)

  Object.assign(parsersCache, expressions, io, statements)
  for (const name of MEMOIZED) parsersCache[name] = memoize(name, parsersCache[name])

  return parsersCache
}

const programParser = (input, ast = estemplate.ast()) => {
  const parsers = getParsers()
  const [, rest] = ['', input]
  const result = parsers.statementParser(rest)
  if (isNull(result)) {
    const errObj = { ...parser.unParsed, regex: [...parser.unParsed.regex] }
    parser.unParsed = {'line': 1, 'column': 0, 'regex': [], 'error': false}
    const updateAst = require('../astupdate')
    if (input.str === '') return updateAst(ast)
    return makeErrorObj(errObj)
  }
  if (typeof result[0] !== 'string') ast.body.push(result[0])
  return programParser(result[1], ast)
}

module.exports = {
  programParser,
  makeErrorObj,
  ...getParsers()
}
