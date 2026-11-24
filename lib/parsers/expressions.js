const AST = require('../astTypes')
const estemplate = require('../estemplate')
const parser = require('../parserObject')
const base = require('../basicParsers')
const utils = require('../utilityFunctions')

const { maybe, isNull, isEmptyArr, precedence, associativity } = utils

const {
  spaceParser, maybeSpace, maybeNewLineAndIndent,
  numberParser, nonReservedIdParser, identifierParser, nullParser, stringParser, booleanParser, regexParser,
  openParensParser, closeParensParser,
  openCurlyBraceParser, closeCurlyBraceParser,
  openSquareBracketParser, closeSquareBracketParser,
  commaParser, colonParser, equalSignParser, thinArrowParser, dotParser,
  binaryOperatorParser, unaryOperatorParser,
  letParser, inParser,
  ifParser, thenParser, elseParser,
  slashParser, emptyArgsParser
} = base

module.exports = (getParsers) => {
  const lz = name => input => getParsers()[name](input)

  const unaryExprParser = input => parser.bind(
    parser.bind(
      unaryOperatorParser,
      operator => rest => operator === ':type'
        ? notNull(spaceParser(rest)) ? ['typeof', spaceParser(rest)[1]] : null
        : [operator, rest]),
    operator => rest => maybe(lz('expressionParser')(rest),
      (argument, rest) => [estemplate.unaryExpression(operator, argument), rest])
  )(input)

  const notNull = utils.notNull

  /*
    Operator-precedence (shunting-yard) parser for binary expressions.
    Operands and operators are kept on two stacks. Before an operator is
    pushed, every operator on the stack that binds at least as tightly
    (strictly tighter, for a right-associative operator) is reduced into a
    BinaryExpression. Written as a loop so long expressions cannot overflow
    the call stack. Returns null unless at least one operator was parsed,
    so valueParser can fall through to its other alternatives.
  */
  const binaryOperandParser = input => parser.any(fnCallParser, lz('expressionParser'))(input)

  const shouldReduce = (stackTop, current) => {
    const [top, cur] = [precedence(stackTop), precedence(current)]
    return top > cur || (top === cur && associativity(current) === 'L')
  }

  const binaryExprParser = input => {
    const first = binaryOperandParser(input)
    if (isNull(first)) return null
    const operands = [first[0]]
    const operators = []
    let rest = first[1]

    const reduce = () => {
      const [right, left, op] = [operands.pop(), operands.pop(), operators.pop()]
      operands.push(estemplate.binaryExpression(left, op, right))
    }

    for (;;) {
      const maybeOperator = binaryOperatorParser(rest)
      if (isNull(maybeOperator)) break
      const [operator, afterOperator] = maybeOperator
      const maybeOperand = binaryOperandParser(afterOperator)
      if (isNull(maybeOperand)) return null // an operator with no right operand
      while (operators.length > 0 && shouldReduce(operators[operators.length - 1], operator)) reduce()
      operators.push(operator)
      operands.push(maybeOperand[0])
      rest = maybeOperand[1]
    }

    if (operators.length === 0) return null // a lone operand is not a binary expression
    while (operators.length > 0) reduce()
    return [operands[0], rest]
  }

  const ifExprParser = input => maybe(
    parser.all(
      ifParser, lz('valueParser'),
      maybeNewLineAndIndent, thenParser, lz('valueParser'),
      maybeNewLineAndIndent, elseParser, lz('valueParser'))(input),
      (val, rest) => {
        const [, condition, , , consequent, , , alternate] = val
        return [estemplate.ifthenelse(condition, consequent, alternate), rest]
      }
  )

  const letParamParser = input => parser.all(nonReservedIdParser, equalSignParser, lz('valueParser'), maybeSpace)(input)

  const letParamsParser = input => maybe(
    parser.many(letParamParser)(input),
    (vals, rest) => [[vals.map(([id]) => id), vals.map(([, , literal]) => literal)], rest]
  )

  const letExpressionParser = input => maybe(
    parser.all(letParser, letParamsParser, inParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, [letIdArray, letLiteralArray], , expr] = val
      const letExpr = estemplate.letExpression(letIdArray, letLiteralArray, expr)
      return [letExpr, rest]
    }
  )

  const paramsParser = input => maybe(
    parser.many(parser.all(nonReservedIdParser, spaceParser))(input),
    (vals, rest) => [vals.map(([id]) => id), rest]
  )

  const lambdaParser = input => maybe(
    parser.all(slashParser, paramsParser, thinArrowParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, params, , expr] = val
      return [estemplate.lambda(params, expr), rest]
    }
  )

  // One or more space-separated arguments
  const argsParser = input => {
    const argArray = []
    let rest = input
    for (;;) {
      const maybeArg = lz('expressionParser')(rest)
      if (isNull(maybeArg)) return isEmptyArr(argArray) ? null : [argArray, rest]
      argArray.push(maybeArg[0])
      rest = maybeArg[1]
      const space = spaceParser(rest)
      if (isNull(space)) return [argArray, rest]
      rest = space[1]
    }
  }

  const calleeParser = input => parser.any(memberExprParser, nonReservedIdParser)(input)

  const fnArgsParser = input => parser.any(emptyArgsParser, argsParser)(input)

  const fnCallParser = input => maybe(
    parser.all(calleeParser, spaceParser, fnArgsParser)(input),
    (val, rest) => {
      const [callee, , args] = val
      const callExpr = estemplate.fnCall(callee, args)
      const expr = rest.str.startsWith('\n') || /^()()$/.test(rest.str) ? estemplate.expression(callExpr) : callExpr
      return [expr, rest]
    }
  )

  const lambdaArgsParser = input => maybe(
    parser.many(parser.all(spaceParser, lz('valueParser')))(input),
    (vals, rest) => [vals.map(([, arg]) => arg), rest]
  )

  const lambdaCallParser = input => maybe(
    parser.all(openParensParser, lambdaParser, closeParensParser, lambdaArgsParser)(input),
    (val, rest) => {
      const [, lambdaAst, , argsArr] = val
      const {params, body} = lambdaAst.expression
      const val_ = estemplate.lambdaCall(params, argsArr, body)
      return [val_, rest]
    }
  )

  const arrayElemParser = input => maybe(
    parser.all(maybeNewLineAndIndent, lz('valueParser'), maybeSpace)(input),
    (val, rest) => {
      const [, value] = val
      return [value, rest]
    }
  )

  // Comma-separated elements; an empty slot before a comma is a hole (null)
  const arrayElemsParser = input => {
    const propArr = []
    let rest = input
    for (;;) {
      const result = arrayElemParser(rest)
      if (isNull(result)) {
        const hole = parser.all(maybeSpace, commaParser)(rest)
        if (isNull(hole)) return [propArr, rest]
        propArr.push(null)
        rest = hole[1]
        continue
      }
      propArr.push(result[0])
      const comma = commaParser(result[1])
      if (isNull(comma)) return [propArr, result[1]]
      rest = comma[1]
    }
  }

  const arrayParser = input => {
    const openSquareBracket = openSquareBracketParser(input)
    if (isNull(openSquareBracket)) return null
    let [, rest] = openSquareBracket
    const result = arrayElemsParser(rest)
    const [arrayPropAst, arrayPropsRest] = result
    const closeSquareBracket = parser.all(maybeNewLineAndIndent, closeSquareBracketParser)(arrayPropsRest)
    if (isNull(closeSquareBracket)) { return null }
    [, rest] = closeSquareBracket
    return [estemplate.array(arrayPropAst), rest]
  }

  const keyParser = input => parser.any(identifierParser, stringParser, numberParser)(input)

  const objectPropParser = input => maybe(
    parser.all(maybeNewLineAndIndent, keyParser,
               maybeSpace, colonParser,
               maybeSpace, lz('valueParser'), maybeSpace)(input),
    (val, rest) => {
      const [ , key, , , , value, , ] = val
      return [estemplate.objectProperty(key, value), rest]
    }
  )

  // Comma-separated properties; a trailing comma is an error
  const objectPropsParser = input => {
    const propArr = []
    let rest = input
    for (;;) {
      const result = objectPropParser(rest)
      if (isNull(result)) return [propArr, rest]
      propArr.push(result[0])
      const commaResult = commaParser(result[1])
      if (isNull(commaResult)) return [propArr, result[1]]
      rest = commaResult[1]
      if (notNull(closeCurlyBraceParser(rest))) return null
    }
  }

  const objectParser = input => {
    const openCurlyResult = openCurlyBraceParser(input)
    if (isNull(openCurlyResult)) return null
    let [, rest] = openCurlyResult
    const result = objectPropsParser(rest)
    if (isNull(result)) return null
    const [objPropArray, objPropsRest] = result
    const closeCurlyResult = parser.all(maybeSpace, maybeNewLineAndIndent, closeCurlyBraceParser)(objPropsRest)
    if (isNull(closeCurlyResult)) { return null }
    [, rest] = closeCurlyResult
    return [estemplate.object(objPropArray), rest]
  }

  const formMemberExpression = (input, obj) => {
    const prop = parser.any(dotParser, subscriptParser, identifierParser)(input)
    if (isNull(prop)) return [obj, input]
    const [exp, rest] = prop
    if (exp.isSubscript) return formMemberExpression(rest, estemplate.subscriptExpression(obj, exp))
    exp.isSubscript = false
    if (exp.type === AST.IDENTIFIER) return formMemberExpression(rest, estemplate.memberExpression(obj, exp))
    return formMemberExpression(rest, obj)
  }

  const subscriptParser = input => maybe(
    parser.all(openSquareBracketParser, parser.any(lz('memberExprParser'), nonReservedIdParser, numberParser, stringParser),
               closeSquareBracketParser)(input),
    (val, rest) => {
      const [, prop] = val
      prop.isSubscript = true
      return [prop, rest]
    }
  )

  const memberExprParser = input => maybe(
    parser.any(arrayParser, nonReservedIdParser, lz('parenthesesParser'))(input),
    (val, rest) => {
      const obj = val
      const result = formMemberExpression(rest, obj)
      let [memExpr, _rest] = result
      memExpr = memExpr.type === AST.EXPRESSION_STATEMENT ? memExpr.expression : memExpr
      return memExpr.type === AST.MEMBER_EXPRESSION ? [memExpr, _rest] : null
    }
  )

  const parenthesesParser = input => maybe(
    parser.all(openParensParser, maybeNewLineAndIndent, lz('valueParser'), maybeNewLineAndIndent, closeParensParser)(input),
    (val, rest) => {
      const [, , val_] = val
      return [val_, rest]
    }
  )

  const expressionParser = input => parser.any(parenthesesParser, unaryExprParser, lambdaCallParser, lambdaParser,
                                               letExpressionParser, ifExprParser, memberExprParser, arrayParser,
                                               objectParser, booleanParser, nonReservedIdParser, numberParser,
                                               nullParser, stringParser, regexParser)(input)

  const valueParser = input => parser.any(binaryExprParser, fnCallParser, lambdaCallParser, lz('expressionParser'))(input)

  return {
    unaryExprParser,
    binaryExprParser,
    ifExprParser,
    letExpressionParser,
    lambdaParser,
    fnCallParser,
    lambdaCallParser,
    arrayParser,
    objectParser,
    memberExprParser,
    paramsParser,
    argsParser,
    expressionParser,
    parenthesesParser,
    valueParser
  }
}
