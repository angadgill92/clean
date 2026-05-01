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

  const formBinaryExpr = (opStack, operandStack, input, rest) => {
    const opStackTop = opStack[opStack.length - 1]
    if (opStackTop === '$') {
      const binExpr = operandStack.pop()
      return binExpr.type === 'BinaryExpression' ? [binExpr, input] : null // return final expression
    }
    const [right, left, op] = [operandStack.pop(), operandStack.pop(), opStack.pop()]
    const expr = estemplate.binaryExpression(left, op, right)
    return formBinaryExpr(opStack, operandStack.concat(expr), input, rest)
  }

  const handlePrecAssoc = (opStack, operandStack, current, rest) => {
    const opStackTop = opStack[opStack.length - 1]
    const currentHasHigher = precedence(current) > precedence(opStackTop)
    const currentHasLower = precedence(current) < precedence(opStackTop)
    const currentHasEqual = !currentHasLower && !currentHasHigher
    const isRightAssociative = currentHasEqual && associativity(current) === 'R'
    const isLeftAssociative = currentHasEqual && associativity(current) === 'L'

    if (currentHasHigher || isRightAssociative) return binaryExprParser(rest, opStack.concat(current), operandStack, 'operand')

    if (currentHasLower || isLeftAssociative) {
      const [right, left, op] = [operandStack.pop(), operandStack.pop(), opStack.pop()]
      const expr = estemplate.binaryExpression(left, op, right)
      return binaryExprParser(rest, opStack.concat(current), operandStack.concat(expr), 'operand')
    }
  }

  const binaryExprParser = (input, opStack = ['$'], operandStack = [], expect = 'operand') => {
    let [current, rest] = [null, null] // initialize current and rest of the string to null
    switch (expect) {
      case 'operand': {
        const maybeOperand = parser.any(fnCallParser, lz('expressionParser'))(input);
        [current, rest] = notNull(maybeOperand) ? maybeOperand : [null, null]
        return isNull(current) ? null : binaryExprParser(rest, opStack, operandStack.concat(current), 'operator')
      }
      case 'operator': {
        const maybeOperator = binaryOperatorParser(input);
        [current, rest] = notNull(maybeOperator) ? maybeOperator : [null, null]
        return notNull(current) ? handlePrecAssoc(opStack, operandStack, current, rest)
          : formBinaryExpr(opStack, operandStack, input, rest)
      }
    }
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

  const letParamsParser = (str, letIdArray = [], letLiteralArray = []) => maybe(
    letParamParser(str),
    (val, rest) => {
      const [id,, literal] = val
      return letParamsParser(rest, letIdArray.concat(id), letLiteralArray.concat(literal))
    }) || [[letIdArray, letLiteralArray], str]

  const letExpressionParser = input => maybe(
    parser.all(letParser, letParamsParser, inParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, [letIdArray, letLiteralArray], , expr] = val
      const letExpr = estemplate.letExpression(letIdArray, letLiteralArray, expr)
      return [letExpr, rest]
    }
  )

  const paramsParser = (input, idArray = []) => maybe(
    parser.all(nonReservedIdParser, spaceParser)(input),
    (val, rest) => {
      const [val_] = val
      return paramsParser(rest, idArray.concat(val_))
    }
  ) || [idArray, input]

  const lambdaParser = input => maybe(
    parser.all(slashParser, paramsParser, thinArrowParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, params, , expr] = val
      return [estemplate.lambda(params, expr), rest]
    }
  )

  const argsParser = (input, argArray = []) => {
    const maybeArg = lz('expressionParser')(input)
    if (isNull(maybeArg)) return isEmptyArr(argArray) ? null : [argArray, input]
    const [arg, rest] = maybeArg
    argArray = argArray.concat(arg)
    const result = spaceParser(rest)
    if (isNull(result)) return [argArray, rest]
    const [, _res] = result
    return argsParser(_res, argArray)
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

  const lambdaArgsParser = (input, lambdaArgsArray = []) => maybe(
    parser.all(spaceParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, arg] = val
      return lambdaArgsParser(rest, lambdaArgsArray.concat(arg))
    }
  ) || [lambdaArgsArray, input]

  const lambdaCallParser = input => maybe(
    parser.all(openParensParser, lambdaParser, closeParensParser, lambdaArgsParser)(input),
    (val, rest) => {
      const [, lambdaAst, , argsArr] = val
      const {params, body} = lambdaAst.expression
      const val_ = estemplate.lambdaCall(params, argsArr, body)
      return [val_, rest]
    }
  )

  const commaCheck = (input, propArr) => maybe(
    parser.all(maybeSpace, commaParser)(input),
    (val, rest) => {
      propArr.push(null)
      return arrayElemsParser(rest, propArr)
    }) || [propArr, input]

  const arrayElemParser = input => maybe(
    parser.all(maybeNewLineAndIndent, lz('valueParser'), maybeSpace)(input),
    (val, rest) => {
      const [, value] = val
      return [value, rest]
    }
  )

  const arrayElemsParser = (input, propArr = []) => {
    const result = arrayElemParser(input)
    if (isNull(result)) return commaCheck(input, propArr)
    const [val, rest] = result
    propArr.push(val)
    const comma = commaParser(rest)
    if (isNull(comma)) return [propArr, rest]
    const [, _rest] = comma
    return arrayElemsParser(_rest, propArr)
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

  const objectPropsParser = (input, propArr = []) => {
    const result = objectPropParser(input)
    if (isNull(result)) return [propArr, input]
    let [val, rest] = result
    propArr.push(val)
    const commaResult = commaParser(rest)
    if (isNull(commaResult)) { return [propArr, rest] }
    [, rest] = commaResult
    const closeCurlyBrace = closeCurlyBraceParser(rest)
    if (notNull(closeCurlyBrace)) return null
    return objectPropsParser(rest, propArr)
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
    if (exp.type === 'Identifier') return formMemberExpression(rest, estemplate.memberExpression(obj, exp))
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
      memExpr = memExpr.type === 'ExpressionStatement' ? memExpr.expression : memExpr
      return memExpr.type === 'MemberExpression' ? [memExpr, _rest] : null
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

  const valueParser = input => parser.any(binaryExprParser, fnCallParser, lambdaCallParser, expressionParser)(input)

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
