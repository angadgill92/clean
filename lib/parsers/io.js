const estemplate = require('../estemplate')
const parser = require('../parserObject')
const utils = require('../utilityFunctions')
const base = require('../basicParsers')

const { maybe, isEmptyObj, isEmptyArr, isNull, isUndefined, notNull, notUndefined } = utils

const {
  returnParser, spaceParser, maybeSpace, domMethodParser,
  openParensParser, closeParensParser,
  equalSignParser, reverseBindParser, doParser, ioFuncNameParser, ioMethodNameParser,
  returnKeywordParser, deleteKeywordParser, definePropParser, nonReservedIdParser, stringParser
} = base

module.exports = (getParsers) => {
  const lz = name => input => getParsers()[name](input)

  const makeBlock = (mapBody, cbBody) => estemplate.blockStmt(mapBody.stmts.concat(cbBody))

  const makeReturnArray = val => estemplate.returnStmt(estemplate.array(val))

  const parensDOMStmt = input => maybe(
    parser.all(openParensParser, lz('maybeDOMStmt'), closeParensParser)(input),
    (val, rest) => {
      const [, expr] = val
      return [expr, rest]
    }
  )

  const ioFuncName = input => parser.all(ioFuncNameParser, spaceParser, parser.any(parensDOMStmt, lz('argsParser')))(input)

  const doBlockParser = input => maybe(
    parser.all(doParser, lz('ioBodyParser'))(input),
    (val, rest) => {
      const [, doBlock] = val
      return [estemplate.expression(doBlock), rest]
    }
  )

  const doFuncParser = input => maybe(
    parser.all(nonReservedIdParser, lz('funcParamsParser'), equalSignParser, doBlockParser)(input),
    (val, rest) => {
      let [funcId, params, , funcBody] = val
      funcBody = notUndefined(funcBody.expression) && funcBody.expression.type === 'ArrowFunctionExpression' ? funcBody.expression.body : funcBody
      funcBody.sType = 'IO'
      const val_ = estemplate.funcDeclaration(funcId, params, funcBody)
      return [val_, rest]
    }
  )

  const ioStmtParser = (input, parentObj, mapBody = {stmts: [], propagate: []}) => maybe(
    ioFuncName(input),
    (val, rest) => {
      const [id, , args] = val
      if (isEmptyObj(parentObj)) {
        const val_ = estemplate.ioCall(id, args)
        val_.sType = 'IO'
        return [val_, rest]
      }
      const ioFunc = estemplate.ioFunc(id, args)
      const callBack = isEmptyArr(mapBody.stmts) ? estemplate.lambda(parentObj.nextParams, estemplate.array(parentObj.nextParams.concat(ioFunc)))
          : estemplate.lambda(parentObj.nextParams, makeBlock(mapBody, makeReturnArray(parentObj.nextParams.concat(mapBody.propagate.concat(ioFunc)))))
      parentObj.nextParams = parentObj.nextParams.concat(mapBody.propagate)
      const val_ = estemplate.ioBind(parentObj, callBack, parentObj.nextParams)
      return [val_, rest]
    }
  )

  const noArgsCallParser = input => maybe(
    parser.all(parser.any(lz('memberExprParser'), lz('parenthesesParser'), nonReservedIdParser), spaceParser, openParensParser, closeParensParser)(input),
    (val, rest) => {
      const [callee] = val
      return [estemplate.fnCall(callee, []), rest]
    }
  )

  const bindIDParser = input => {
    const result = lz('paramsParser')(input)
    return isEmptyArr(result[0]) ? null : result
  }

  const maybeDOMStmt = input => maybe(
    parser.all(domMethodParser, spaceParser, lz('argsParser'))(input),
    (val, rest) => {
      const [domFunc, , args] = val
      const callExpr = estemplate.expression(estemplate.fnCall(domFunc, args))
      const expr = rest.str.startsWith('\n') || /^()()$/.test(rest.str) ? estemplate.expression(callExpr) : callExpr
      return [expr, rest]
    }
  )

  const maybeBindStmt = input => (parser.all(bindIDParser, reverseBindParser, parser.any(lz('fnCallParser'), maybeDOMStmt, ioFuncName, nonReservedIdParser))(input))

  const isIOorFuncCall = maybeIOFunc => {
    const isFuncCall = notUndefined(maybeIOFunc.type, maybeIOFunc.expression) && maybeIOFunc.expression.type === 'CallExpression'
    const isIOCall = notUndefined(maybeIOFunc.type) && maybeIOFunc.type === 'Identifier'
    return [isFuncCall, isIOCall]
  }

  const createIOBody = (args, ioFunc) => {
    const [func] = args
    const cb = estemplate.identifier('cb')
    ioFunc.name = 'createIO'
    func.arguments = func.arguments.concat(cb)
    return [estemplate.lambda([cb], func)]
  }

  const makeBind = (isIOorFunc, isIOCall, maybeIOFunc, ioFunc, args, nextParams) => {
    const cbBody = isIOorFunc ? maybeIOFunc : estemplate.ioCall(ioFunc, args, nextParams)
    cbBody.nextParams = isIOCall ? nextParams : cbBody.nextParams
    return cbBody
  }

  const formBindStmt = (cbBody, parentObj, nextParams, rest, bindBody, mapBody) => {
    const cbParams = parentObj.nextParams
    const callBack = isEmptyArr(mapBody.stmts) ? estemplate.lambda(cbParams, estemplate.array(cbParams.concat(cbBody)))
        : estemplate.lambda(cbParams, makeBlock(mapBody, makeReturnArray(cbParams.concat(mapBody.propagate).concat(cbBody))))
    parentObj = estemplate.ioBind(parentObj, callBack, cbParams)
    parentObj.nextParams = nextParams
    return ioBodyParser(rest, parentObj, bindBody)
  }

  const bindStmt = (maybeBind, parentObj, bindBody, mapBody) => {
    let [[bindID, , maybeIOFunc], rest] = maybeBind
    let nextParams = isUndefined(parentObj.nextParams)
          ? bindID
          : isEmptyArr(mapBody.stmts)
          ? parentObj.nextParams.concat(bindID)
          : mapBody.propagate.concat(bindID)

    const [isFuncCall, isIOCall] = isIOorFuncCall(maybeIOFunc)
    const isIOorFunc = isFuncCall || isIOCall
    if (isIOCall) maybeIOFunc = estemplate.fnCall(maybeIOFunc, [])
    let [ioFunc, , args] = isIOorFunc ? [null, null, null] : maybeIOFunc
    args = Array.isArray(args) ? args : [args]
    const isNewIO = notNull(ioFunc) && ioFunc.name === 'IO' && args[0].type === 'CallExpression'
    if (isNewIO) args = createIOBody(args, ioFunc)

    if (isEmptyObj(parentObj)) {
      let val = isIOorFunc ? maybeIOFunc : estemplate.ioCall(ioFunc, args, nextParams)
      if (isFuncCall) val = val.expression
      val.nextParams = isIOorFunc ? nextParams : val.nextParams
      return ioBodyParser(rest, val, bindBody, mapBody)
    }
    if (!isEmptyArr(mapBody.stmts)) nextParams = parentObj.nextParams.concat(nextParams)
    const cbBody = makeBind(isIOorFunc, isIOCall, maybeIOFunc, ioFunc, args, nextParams)
    return formBindStmt(cbBody, parentObj, nextParams, rest, bindBody, mapBody)
  }

  const letParamIOParser = input => parser.all(nonReservedIdParser, equalSignParser, parser.any(maybeDOMStmt, lz('valueParser')), maybeSpace)(input)

  const letParamsIOParser = (str, letStmtsArray = [], nextParams = []) => maybe(
    letParamIOParser(str),
    (val, rest) => {
      const [id, , literal] = val
      return letParamsIOParser(rest, letStmtsArray.concat(estemplate.letDecl(id, literal)), nextParams.concat(id))
    }
  ) || [[letStmtsArray, nextParams], str]

  const maybeLetStmt = (input, parentObj, bindBody, mapBody) => maybe(
    parser.all(base.letParser, letParamsIOParser)(input),
    (val, rest) => {
      const [, [letDeclarations, propagatedVals]] = val
      mapBody.stmts = mapBody.stmts.concat(letDeclarations)
      mapBody.propagate = !isEmptyArr(mapBody.propagate) && (mapBody.propagate[0].name === propagatedVals[0].name)
        ? mapBody.propagate.concat(propagatedVals.slice(1))
        : mapBody.propagate.concat(propagatedVals)
      return ioBodyParser(rest, parentObj, bindBody, mapBody)
    }
  )

  const createIfStmt = (left, op, template, right) =>
        consequent => estemplate.ifStmt(estemplate.binaryExpression(left, op, estemplate[template](right)), consequent)

  const getPredicate = (methodName, value) => {
    const maybeVal = methodName.name.slice(5)
    switch (maybeVal) {
      case 'True':
        return createIfStmt(value, '==', 'boolLiteral', 'true')
      case 'False':
        return createIfStmt(value, '==', 'boolLiteral', 'false')
      case 'Undefined':
        return createIfStmt(value, '==', 'identifier', 'undefined')
      case 'Err':
        return createIfStmt(value, 'instanceof', 'identifier', 'Error')
      case 'Null':
        return createIfStmt(value, '==', 'nullLiteral', 'null')
    }
  }

  const handlerParser = input => maybe(
    parser.all(openParensParser,
               parser.any(lz('fnCallParser'), ioFuncName, lz('lambdaCallParser')),
               closeParensParser)(input),
    (val, rest) => {
      const [, val_] = val
      return [val_, rest]
    }
  )

  const maybeStmtParser = (input, parentObj, bindBody, mapBody) => maybe(
    parser.all(ioMethodNameParser, spaceParser, lz('expressionParser'), spaceParser, handlerParser)(input),
    (val, rest) => maybeStmt(val, rest, parentObj, bindBody, mapBody)
  )

  const maybeStmt = (maybeVal, rest, parentObj, bindBody, mapBody) => {
    let [methodName, , value, , handler] = maybeVal
    let handlerBody = handler
    if (Array.isArray(handler)) {
      const [ioFunc, , args] = handler
      handler = ioFunc
      handlerBody = estemplate.defaultIOThen(estemplate.ioCall(handler, args))
    }
    const val = getPredicate(methodName, value)(handlerBody)
    mapBody.stmts = mapBody.stmts.concat(val)
    return ioBodyParser(rest, parentObj, bindBody, mapBody)
  }

  const makeMap = (parentObj, mapBody) => {
    const nextParams = parentObj.nextParams
    const returnVal = makeReturnArray(nextParams.concat(mapBody.propagate))
    const cbBody = makeBlock(mapBody, returnVal)
    const callBack = estemplate.lambda(nextParams, cbBody)
    const val = estemplate.ioMap(parentObj, callBack, nextParams)
    val.nextParams = nextParams.concat(mapBody.propagate)
    return val
  }

  const maybeDefineStmt = (input, parentObj, bindBody, mapBody) => maybe(
    parser.all(definePropParser, spaceParser,
               parser.any(lz('memberExprParser'), nonReservedIdParser), spaceParser,
               stringParser, spaceParser, lz('valueParser'))(input),
    (val, rest) => {
      const [, , objID, , key, , value] = val
      const definePropTmpl = estemplate.defineProp(objID, key, value, true)
      mapBody.stmts = mapBody.stmts.concat(definePropTmpl)
      return ioBodyParser(rest, parentObj, bindBody, mapBody)
    }
  )

  const maybeDeleteStmt = (input, parentObj, bindBody, mapBody) => maybe(
    parser.all(deleteKeywordParser, spaceParser, parser.any(lz('memberExprParser'), nonReservedIdParser))(input),
    (val, rest) => {
      const [deleteKeyword, , objProp] = val
      const deleteTmpl = estemplate.unaryExpression(deleteKeyword, objProp)
      mapBody.stmts = mapBody.stmts.concat(deleteTmpl)
      return ioBodyParser(rest, parentObj, bindBody, mapBody)
    }
  )

  const getCbBody = (bindBody, parentObj) => {
    if (bindBody.length === 0) {
      if (parentObj.type === 'Identifier') return estemplate.fnCall(parentObj, [])
      return parentObj
    }
    const callBack = estemplate.lambda(parentObj.nextParams, estemplate.array([estemplate.fnCall(bindBody[0], [])]))
    const val = estemplate.ioBind(parentObj, callBack, parentObj.nextParams)
    val.nextParams = parentObj.nextParams
    return getCbBody(bindBody.slice(1), val)
  }

  const makeFinalStmt = (input, rest, parentObj, bindBody, mapBody) => {
    if (isEmptyObj(parentObj)) {
      if (isEmptyArr(bindBody)) return null
      parentObj = getCbBody(bindBody.slice(1), bindBody[0])
      const val = estemplate.defaultIOThen(parentObj)
      return [val, rest]
    }
    const cbParams = isUndefined(parentObj.nextParams) ? [] : parentObj.nextParams
    parentObj = getCbBody(bindBody, parentObj)
    const noReturnStmt = isUndefined(parentObj.returnVals)
    const cbBody = noReturnStmt
        ? isEmptyArr(bindBody) ? bindBody : estemplate.array(bindBody)
        : estemplate.array(parentObj.returnVals)
    let callBack = estemplate.lambda(cbParams, isEmptyArr(mapBody.stmts) ? cbBody : makeBlock(mapBody, cbBody))
    if (isEmptyArr(mapBody.stmts) && isEmptyArr(cbBody)) {
      callBack = estemplate.lambda([], estemplate.array([]))
    }
    let val
    if (isUndefined(parentObj.returnVals)) {
      val = estemplate.ioThen(parentObj, callBack, cbParams)
    } else {
      if (!isEmptyArr(mapBody.stmts) && !isEmptyArr(cbBody)) {
        const cbExpr = callBack.type === 'ArrowFunctionExpression' ? callBack.callee : callBack.expression
        cbExpr.body = makeBlock(mapBody, estemplate.returnStmt(cbBody))
      }
      val = estemplate.lambda([], estemplate.ioMap(parentObj, callBack, cbParams)).expression 
    }
    val.sType = 'IO'
    return [val, rest]
  }

  const maybeFinalStmt = (finalStmt, input, parentObj, bindBody, mapBody) => {
    let [, rest] = finalStmt
    const result = spaceParser(rest)
    if (isNull(result)) {
      return makeFinalStmt(input, rest, parentObj, bindBody, mapBody)
    }
    [, rest] = result
    const maybeReturn = parser.all(returnKeywordParser, spaceParser, lz('argsParser'))(rest)
    if (notNull(maybeReturn)) {
      [[, , parentObj.returnVals], rest] = maybeReturn
    }
    return ioBodyParser(rest, parentObj, bindBody, mapBody)
  }

  const maybeFuncCallStmt = (input, parentObj, bindBody, mapBody) => maybe(
    lz('fnCallParser')(input),
    (fnCall, rest) => {
      mapBody.stmts = mapBody.stmts.concat(fnCall)
      return ioBodyParser(rest, parentObj, bindBody, mapBody)
    }
  )

  const maybeIOCallStmt = (maybeIOCall, parentObj, bindBody, mapBody) => {
    const [ioID, rest] = maybeIOCall
    if (isEmptyObj(parentObj)) ioID.nextParams = []
    const val = ioID
    return isEmptyArr(mapBody.stmts)
      ? ioBodyParser(rest, parentObj, bindBody.concat(val), mapBody)
      : ioBodyParser(rest, makeMap(parentObj, mapBody), bindBody.concat(val))
  }

  const ioBodyParser = (input, parentObj = {}, bindBody = [], mapBody = { stmts: [], propagate: [] }) => {
    const finalStmt = returnParser(input)
    if (notNull(finalStmt)) return maybeFinalStmt(finalStmt, input, parentObj, bindBody, mapBody)

    const bind = maybeBindStmt(input)
    if (notNull(bind)) return bindStmt(bind, parentObj, bindBody, mapBody)

    if (!isEmptyObj(parentObj)) {
      const val = parser.any(maybeDefineStmt, maybeDeleteStmt, maybeLetStmt, maybeStmtParser, maybeFuncCallStmt)(input, parentObj, bindBody, mapBody)
      if (val !== null) return val
    }

    const ioStmt = ioStmtParser(input, parentObj, mapBody)
    if (notNull(ioStmt)) return ioBodyParser(ioStmt[1], ioStmt[0], bindBody)

    const ioCall = nonReservedIdParser(input)
    if (notNull(ioCall)) return maybeIOCallStmt(ioCall, parentObj, bindBody, mapBody)

    return null
  }

  const ioDecl = (isId, maybeDo, doID, input, rest) => {
    let ioBody
    if (maybeDo === 'do') {
      const result = ioBodyParser(rest)
      if (isNull(result)) { return null }
      [ioBody, rest] = result
      ioBody.expression = false
    } else {
      maybeDo = isId ? estemplate.fnCall(maybeDo, []) : maybeDo
      ioBody = estemplate.defaultIOThen(maybeDo)
    }
    ioBody.sType = 'IO'
    const val = estemplate.declaration(doID, ioBody)
    return [val, rest]
  }

  const ioParser = input => maybe(
    parser.all(nonReservedIdParser, equalSignParser,
               parser.any(doParser, noArgsCallParser, ioStmtParser, nonReservedIdParser))(input),
    (initIO, rest) => {
      const [doID, , maybeDo] = initIO
      const isId = notUndefined(maybeDo.type) && maybeDo.type === 'Identifier'
      const idNotMain = isId && doID.name !== 'main'
      if (idNotMain) return null
      const isFunc = notUndefined(maybeDo.type) && maybeDo.type === 'CallExpression'
      const funcNotMain = isFunc && doID.name !== 'main'
      if (funcNotMain) {
        const val = maybeDo
        val.sType = 'IO'
        return [estemplate.declaration(doID, val), rest]
      }
      return ioDecl(isId, maybeDo, doID, input, rest)
    }
  )

  return {
    doBlockParser,
    doFuncParser,
    ioParser,
    ioBodyParser,
    maybeDOMStmt,
    bindIDParser
  }
}
