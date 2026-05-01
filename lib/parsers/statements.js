const estemplate = require('../estemplate')
const parser = require('../parserObject')
const utils = require('../utilityFunctions')
const base = require('../basicParsers')

const { maybe } = utils

const {
  returnParser, spaceParser,
  nonReservedIdParser, equalSignParser, stringParser,
  singleLineCommentParser, multiLineCommentParser,
  definePropParser
} = base

module.exports = (getParsers) => {
  const lz = name => input => getParsers()[name](input)

  const declParser = input => maybe(
    parser.all(nonReservedIdParser, equalSignParser, lz('valueParser'))(input),
    (val, rest) => {
      const [id, , value] = val
      return [estemplate.declaration(id, value), rest]
    }
  )

  const funcParamsParser = (input, paramArray = []) => maybe(
    parser.all(spaceParser, parser.any(lz('arrayParser'), lz('objectParser'), nonReservedIdParser, base.numberParser, base.nullParser, stringParser))(input),
    (val, rest) => {
      const [, param] = val
      return funcParamsParser(rest, paramArray.concat(param))
    }) || [paramArray, input]

  const fnDeclParser = input => maybe(
    parser.all(nonReservedIdParser, funcParamsParser, equalSignParser, lz('valueParser'))(input),
    (val, rest) => {
      const [funcID, paramsArr, , body] = val
      return [estemplate.funcDeclaration(funcID, paramsArr, body), rest]
    }
  )

  const defineStmtParser = input => maybe(
    parser.all(definePropParser, spaceParser,
               parser.any(lz('memberExprParser'), nonReservedIdParser), spaceParser,
               parser.any(stringParser, nonReservedIdParser, lz('valueParser')), spaceParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, , objID, , key, , value] = val
      const definePropStmt = estemplate.defineProp(objID, key, value, false)
      return [definePropStmt, rest]
    }
  )

  const statementParser = input => parser.any(multiLineCommentParser, singleLineCommentParser,
                                              returnParser, lz('doBlockParser'), lz('ioParser'),
                                              lz('doFuncParser'), declParser, lz('ifExprParser'),
                                              fnDeclParser, defineStmtParser, lz('fnCallParser'), lz('lambdaParser'),
                                              lz('lambdaCallParser'), spaceParser)(input)

  return {
    statementParser,
    declParser,
    fnDeclParser,
    defineStmtParser,
    funcParamsParser
  }
}
