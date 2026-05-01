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

const getParsers = () => {
  if (parsersCache) return parsersCache

  parsersCache = {} // Prevent infinite loop on first evaluation if any

  const expressions = expressionsFactory(getParsers)
  const io = ioFactory(getParsers)
  const statements = statementsFactory(getParsers)

  Object.assign(parsersCache, expressions, io, statements)

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
