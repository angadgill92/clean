const {staticIOMethods, ioMethods, domMethods} = require('./ioMethods')
const languageConstruct = require('./languageConstructs')
const opSpec = require('./operatorPrecedence')

/* Utility helpers */
const lookup = obj => id => obj[id]
const getOpProp = prop => operator => opSpec[operator]?.[prop]

/* Utility functions */
const maybe = (value, func) => value === null ? null : func(...value)
const isLanguageConstruct = lookup(languageConstruct)
const isStaticIOMethod = lookup(staticIOMethods)
const isIOMethod = lookup(ioMethods)
const isDOMmethod = lookup(domMethods)

const unescape = str => str.replace(/(^')|('$)/g, '').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\'/g, '\'')

const returnRest = (val, input, rest, field) => {
  const output = { ...input }
  if (field) {
    if (field.name === 'return') {
      output.column = 0
      output.line += field.value
    } else if (field.name === 'column') {
      output.column += field.value
    }
  }
  output.str = rest
  val.cursorLoc = {line: output.line, column: output.column}
  return [val, output]
}

const isEmptyObj = obj => obj == null || Object.keys(obj).length === 0
const isEmptyArr = arr => arr == null || arr.length === 0

const isNull = (...vals) => vals.every(v => v === null)
const isUndefined = (...vals) => vals.some(v => v === undefined)
const notNull = (...vals) => vals.every(v => v !== null)
const notUndefined = (...vals) => vals.every(v => v !== undefined)

/* Functions for the binary expression parser */
const precedence = getOpProp('prec')
const associativity = getOpProp('assoc')

module.exports = {
  maybe,
  isLanguageConstruct,
  isStaticIOMethod,
  isIOMethod,
  isDOMmethod,
  unescape,
  returnRest,
  isEmptyObj,
  isEmptyArr,
  isNull,
  isUndefined,
  notNull,
  notUndefined,
  precedence,
  associativity
}
