const AST = require('./astTypes')
/*
  Type inference and type checker for the AST
  IO blocks are termed as type 'IO' and whenever the type could not be inferred it is set to AST.NEEDS_INFERENCE
  globalTypes keeps track of all identifiers and their types, function declarations and their accepted and return types
*/
const inbuiltPropSpec = require('./inbuiltMethods').inbuiltProps
const inbuiltObjects = require('./inbuiltMethods').inbuiltObjects
const jsFunctions = require('./jsFunctions')
const { isEmptyObj, isEmptyArr } = require('./utilityFunctions')

const isFunction = (id, typeObj) => typeObj[id] !== undefined && typeObj[id] !== null && typeObj[id].type === 'function'

const getParamReturnTypes = (id, typeObj) => [typeObj[id.name].paramTypes, typeObj[id.name].returnType]

const returnIdentifierType = (id, typeObj) => {
  if (isFunction(id.name, typeObj)) return getParamReturnTypes(id, typeObj)
  return typeObj[id.name]
}

const identifierType = (id, localTypeObj, globalTypes) => {
  if (localTypeObj[id.name] !== undefined) return returnIdentifierType(id, localTypeObj)
  if (globalTypes[id.name] !== undefined) return returnIdentifierType(id, globalTypes)
  return null
}

const literalType = literal => literal.sType

const unaryExprType = (expr, globalTypes) => {
  if (expr.operator === 'typeof') return 'string'
  if (expr.operator === '!' && exprType(expr.argument, {}, globalTypes) === 'bool') return 'bool'
  if (expr.operator === '-' && exprType(expr.argument, {}, globalTypes) === 'number') return 'number'
  return null
}

const getType = (expr, expectedType, localTypeObj, globalTypes, id) => {
  if (expr !== undefined) {
    const type = exprType(expr, localTypeObj, globalTypes, id)
    return type === expectedType || expectedType === 'bool' ? type : type === AST.NEEDS_INFERENCE ? type : null
  }
}

const checkTypes = (expr, expectedType, localTypeObj, globalTypes, id) => {
  let typeLeft = getType(expr.left, expectedType, localTypeObj, globalTypes, id)
  let typeRight = getType(expr.right, expectedType, localTypeObj, globalTypes, id)
  if (typeLeft === AST.NEEDS_INFERENCE && typeRight !== AST.NEEDS_INFERENCE) {
    assignTypeToUninferredIdentifier(expr, typeRight, localTypeObj)
    typeLeft = typeRight
  }
  if (typeLeft !== AST.NEEDS_INFERENCE && typeRight === AST.NEEDS_INFERENCE) {
    assignTypeToUninferredIdentifier(expr, typeLeft, localTypeObj)
    typeRight = typeLeft
  }
  if (typeLeft === AST.NEEDS_INFERENCE && typeRight === AST.NEEDS_INFERENCE) return expectedType
  return typeLeft === typeRight && (typeLeft === expectedType || expectedType === 'bool') ? expectedType : null
}

const assignTypeToUninferredIdentifier = (expr, inferredType, localTypeObj) => {
  if (isEmptyObj(localTypeObj)) return localTypeObj
  const [left, right] = [expr.left.name, expr.right.name]
  if (left !== undefined && localTypeObj[left] === AST.NEEDS_INFERENCE) localTypeObj[left] = inferredType
  if (right !== undefined && localTypeObj[right] === AST.NEEDS_INFERENCE) localTypeObj[right] = inferredType
}

const binaryExprType = (expr, localTypeObj, globalTypes, id) => {
  const assumedType = expr.sType
  if (assumedType !== 'bool') assignTypeToUninferredIdentifier(expr, assumedType, localTypeObj)
  return checkTypes(expr, assumedType, localTypeObj, globalTypes, id)
}

const compareArrayProps = (array1, array2) => {
  const flag = (array1.isHomogeneous === array2.isHomogeneous &&
              array1.commonType === array2.commonType)
  return flag ? {type: 'array', elemTypes: {}, commonType: array1.commonType, isHomogeneous: array1.isHomogeneous} : null
}

const conditionalExprType = (expr, localTypeObj, globalTypes, id) => {
  if (exprType(expr.test, localTypeObj, globalTypes, id) !== 'bool') return null
  let [consequentType, alternateType] = [exprType(expr.consequent, localTypeObj, globalTypes, id), exprType(expr.alternate, localTypeObj, globalTypes, id)]
  if (consequentType === AST.NEEDS_INFERENCE && alternateType !== AST.NEEDS_INFERENCE && alternateType !== null) {
    consequentType = alternateType
    localTypeObj[expr.consequent.name] = alternateType
  }
  if (consequentType !== AST.NEEDS_INFERENCE && alternateType === AST.NEEDS_INFERENCE && consequentType !== null) {
    alternateType = consequentType
    localTypeObj[expr.alternate.name] = consequentType
  }
  if (consequentType === null || alternateType === null) return null
  if (consequentType.type !== undefined && alternateType.type !== undefined) {
    const match = consequentType.type === alternateType.type
    if (match) {
      return consequentType.type === 'array' ? compareArrayProps(consequentType, alternateType)
        : consequentType.type === 'object' ? {type: 'object', propTypes: {}} : null
    }
    return null
  }
  return consequentType === alternateType ? consequentType : null
}

const mapArgTypeToParams = (params, args, localTypeObj, globalTypes, id) => {
  return params.map((param, index) => args[index].sType === undefined ? exprType(args[index], localTypeObj, globalTypes, id) : args[index].sType)
}

const makeParamTypeArray = (localTypeObj) => {
  const paramTypes = []
  for (const identifier in localTypeObj) {
    if (localTypeObj[identifier].type === undefined) {
      paramTypes.push(localTypeObj[identifier])
    } else {
      paramTypes.push(localTypeObj[identifier].type)
    }
  }
  return paramTypes
}

const arrowFunctionExprType = (expr, localTypeObj, globalTypes, id) => {
  const [params, body] = [expr.params, expr.body]
  params.forEach(param => { localTypeObj[param.name] = AST.NEEDS_INFERENCE })
  const returnType = exprType(body, localTypeObj, globalTypes, id)
  return returnType === null ? null : {type: 'function', paramTypes: makeParamTypeArray(localTypeObj), returnType}
}

const matchArgTypesToAcceptedTypes = (args, acceptedTypes, localTypeObj, globalTypes, id) => {
  const _args = args.map((arg, index) => {
    let type = exprType(arg, localTypeObj, globalTypes, id)
    if (type !== null && type.type !== undefined) type = type.type
    if (type === AST.NEEDS_INFERENCE && acceptedTypes[index] !== AST.NEEDS_INFERENCE) {
      type = acceptedTypes[index]
      if (arg.type === AST.IDENTIFIER) localTypeObj[arg.name] = type
    }
    return (type === AST.NEEDS_INFERENCE || type === acceptedTypes[index] || (type !== null && acceptedTypes[index] === AST.NEEDS_INFERENCE))
  })
  return isEmptyArr(_args) ? true : _args.reduce((type1, type2) => type1 === type2)
}

const checkForRecursion = (callee, id, localTypeObj, globalTypes, args) => {
  if (callee === id) { /* recursive call */
    args = args.map(e => exprType(e, localTypeObj, globalTypes, id))
    if (globalTypes[id] !== undefined && globalTypes[id].type === 'function' && globalTypes[id].returnType !== AST.NEEDS_INFERENCE) return {flag: false}
    args = args.map(arg => arg.type !== undefined ? arg.type : arg)
    globalTypes[id] = {type: 'function', paramTypes: args, returnType: AST.NEEDS_INFERENCE}
    return {flag: true, paramTypes: args}
  }
  return {flag: false}
}

const getFunctionType = calleeName => jsFunctions[calleeName]

const callExprType = (expr, localTypeObj = {}, globalTypes, id) => {
  if (expr.callee.type === AST.IDENTIFIER && globalTypes[expr.callee.name] === undefined) {
    const calleeName = expr.callee.name
    globalTypes[calleeName] = getFunctionType(calleeName)
  }
  const [params, body, args] = [expr.callee.params, expr.callee.body, expr.arguments]
  if (expr.sType !== undefined) return expr.sType // if call has type already set
  if (params !== undefined && body !== undefined && (!(isEmptyObj(localTypeObj)) || expr.callee.id === null)) {
    const typesOfParams = mapArgTypeToParams(params, args, localTypeObj, globalTypes, id)
    args.forEach(arg => exprType(arg, localTypeObj, globalTypes, id))
    params.forEach((param, index) => {
      localTypeObj[param.name] = typesOfParams[index]
    })
    return exprType(body, localTypeObj, globalTypes, id)
  }
  const isRecursive = checkForRecursion(expr.callee.name, id, localTypeObj, globalTypes, args)
  let result = exprType(expr.callee, localTypeObj, globalTypes, id)
  if (result === null) return null
  if (expr.callee.id === null) result = [result.paramTypes, result.returnType]
  let [acceptedTypes, returnType] = result
  if (isRecursive.flag) acceptedTypes = isRecursive.paramTypes
  const match = matchArgTypesToAcceptedTypes(args, acceptedTypes, localTypeObj, globalTypes, id)
  return match ? returnType : null
}

const reduceTypes = (typesArr, localTypeObj, globalTypes, id) => {
  const reducedType = typesArr.map(e => {
    if (e.type !== undefined && e.type === AST.IDENTIFIER) return {id: e.name, type: exprType(e, localTypeObj, globalTypes, id)}
    return {id: null, type: exprType(e, localTypeObj, globalTypes, id)}
  }).reduce((exp1, exp2) => {
    if (exp1.type === AST.NEEDS_INFERENCE && exp2.type !== AST.NEEDS_INFERENCE && exp2.type !== null) {
      localTypeObj[exp1.id] = exp2.type
      exp1.type = exp2.type
    }
    if (exp2.type === AST.NEEDS_INFERENCE && exp1.type !== AST.NEEDS_INFERENCE) {
      exp2.type = exp1.type
      localTypeObj[exp2.id] = exp1.type
    }
    if (typeof exp1.type === 'object' && typeof exp2.type === 'object') {
      return exp1.type.type === exp2.type.type ? exp1.type : false
    }
    return exp1.type === exp2.type ? exp1 : false
  })
  return reducedType !== false ? reducedType.type : false
}

const switchStatementType = (body, localTypeObj, globalTypes, id) => {
  const cases = body.cases
  const [initialPattern] = cases
  let [returnType, acceptedType] = [
    initialPattern.consequent[0].argument,
    initialPattern.test].map(exp => exprType(exp, localTypeObj, globalTypes, id))
  const paramId = body.discriminant.name
  localTypeObj[paramId] = acceptedType
  const [caseArgArray, caseTestArray] = [
    cases.map(c => c.consequent[0].argument),
    cases.map(c => c.test === null ? {type: AST.IDENTIFIER, name: paramId, sType: acceptedType} : c.test)]
  const checkTestType = reduceTypes(caseTestArray, localTypeObj, globalTypes, id)
  const checkArgsType = reduceTypes(caseArgArray, localTypeObj, globalTypes, id)
  if (returnType === AST.NEEDS_INFERENCE) returnType = checkArgsType
  globalTypes[id] = {type: 'function', paramTypes: makeParamTypeArray(localTypeObj, id), returnType}
  return checkArgsType === false || checkTestType === false ? null : returnType
}

const arrayExprType = (expr, localTypeObj, globalTypes, id) => {
  const elementTypeObj = {}
  if (isEmptyArr(expr.elements)) {
    return {
      'type': 'array',
      'elemTypes': {},
      'commonType': AST.NEEDS_INFERENCE,
      'isHomogeneous': true
    }
  }
  const deducedtype = expr.elements.map((e, index) => {
    const elemType = exprType(e, localTypeObj, globalTypes, id)
    elementTypeObj[index] = elemType
    return elemType
  }).reduce((type1, type2) => type1 === type2 ? type1 : AST.NEEDS_INFERENCE)
  const arrayType = {
    'type': 'array',
    'elemTypes': elementTypeObj,
    'commonType': (deducedtype.type !== undefined &&
                  (deducedtype.type === 'object' || deducedtype.type === 'array')
                   ? deducedtype.type : deducedtype),
    'isHomogeneous': true
  }
  if (deducedtype === AST.NEEDS_INFERENCE) {
    arrayType['isHomogeneous'] = false
  }
  return arrayType
}

const objectExprType = (expr, localTypeObj, globalTypes, id) => {
  const propertyTypeObj = {}
  expr.properties.forEach((prop) => {
    if (prop.key.value === undefined) {
      propertyTypeObj[prop.key.name] = exprType(prop.value, localTypeObj, globalTypes, id)
    } else {
      propertyTypeObj[prop.key.value] = exprType(prop.value, localTypeObj, globalTypes, id)
    }
  })
  return {'type': 'object', 'propTypes': propertyTypeObj}
}

const getParentTypes = (propSpec, propName, parentId, localTypeObj) => {
  const supportedTypes = []
  for (const type in propSpec) {
    if (propSpec[type][propName] !== undefined) supportedTypes.push(type)
  }
  if (supportedTypes.length === 1) {
    localTypeObj[parentId.name] = supportedTypes[0]
  }
  return localTypeObj[parentId.name]
}

const getPropName = prop => prop.type === AST.IDENTIFIER ? prop.name
                          : prop.type === AST.LITERAL ? prop.raw : null

const getPropReturnType = (propSpec, propName) => {
  if (propSpec === undefined) return {type: false, id: propName} // allow
  if (propSpec.isMutative) return {type: null, id: propName} // block
  if (propSpec.isMethod) return {type: 'function', paramTypes: propSpec.paramTypes, returnType: propSpec.returnType, id: propName} // handle no params
  if (propSpec.isProp) return {type: propSpec.returnType, id: propName}
}

const checkForInbuiltProp = (parentType, prop, parentId, localTypeObj) => {
  const propName = getPropName(prop)
  if (propName === null) return {type: AST.NEEDS_INFERENCE, id: propName}
  if (parentType === AST.NEEDS_INFERENCE) {
    const propSpec = inbuiltPropSpec[parentType][propName]
    if (propSpec === undefined) return {type: AST.NEEDS_INFERENCE, id: propName}
    localTypeObj[parentId.name] = propSpec.parentType
    return getPropReturnType(propSpec.spec, propName)
  }
  const propSpec = inbuiltPropSpec[parentType][propName]
  return getPropReturnType(propSpec, propName)
}

const getTypeOfChild = (parentObj, propsArray, parentId, localTypeObj, globalTypes, id) => {
  if (isEmptyArr(propsArray)) return parentObj
  const [prop] = propsArray
  const propSpec = checkForInbuiltProp(parentObj.type, prop, parentId, localTypeObj)
  const propId = propSpec.id
  switch (propSpec.type) {
    case AST.NEEDS_INFERENCE: {
      const type = getParentTypes(inbuiltPropSpec, prop.name, parentId, localTypeObj)
      if (type === AST.NEEDS_INFERENCE) return AST.NEEDS_INFERENCE
      if (typeof type === 'string') {
        localTypeObj[parentId] = type
        return getTypeOfChild({type: type}, propsArray, parentId, localTypeObj, globalTypes, id)
      }
      return AST.NEEDS_INFERENCE
    }
    case null: return null // block mutative methods
    case false:
      {
        if (parentObj.type === 'object') {
          if (prop.type !== AST.LITERAL && prop.isSubscript) {
            const expType = exprType(prop, localTypeObj, globalTypes, id)
            return expType !== 'string' && expType !== undefined ? null : AST.NEEDS_INFERENCE
          }
          if (prop.sType !== undefined && prop.sType !== 'string') return null
          if (parentObj.propTypes === AST.NEEDS_INFERENCE) return AST.NEEDS_INFERENCE
          return getTypeOfChild(parentObj.propTypes[propId], propsArray.slice(1), propsArray[0], localTypeObj, globalTypes, id)
        }
        if (parentObj.type === 'array') {
          if (prop.type !== AST.LITERAL) {
            return propsArray.length === 1 ? parentObj.commonType : AST.NEEDS_INFERENCE
          }
          if (prop.sType === 'number') { // check prop is string for string in subscripts
            if (isEmptyObj(parentObj.elemTypes)) return parentObj.commonType
            return getTypeOfChild(parentObj.elemTypes[propId], propsArray.slice(1), propsArray[0], localTypeObj, globalTypes, id)
          }
          return null // return type error : subscript value must be a number for array
        }
        return null // return on such property for strings, numbers, and bool
      }
    case 'function':
      {
        if (parentObj.type === 'array' && parentObj.isHomogeneous && propSpec.returnType.type === 'array') {
          propSpec.returnType.isHomogeneous = propId !== 'concat'
        }
        return [propSpec.paramTypes, propSpec.returnType]
      }
    default:
      return propSpec.type
  }
}

const getPathToProp = (obj, path = []) => {
  if (obj.type !== undefined && obj.type !== AST.MEMBER_EXPRESSION) {
    path.unshift(obj)
    return path
  }
  if (obj.property.type === AST.IDENTIFIER || obj.property.type === AST.LITERAL) path.unshift(obj.property)
  // Handle binary and function calls inside member expressions
  return getPathToProp(obj.object, path)
}

const memberExprType = (expr, localTypeObj, globalTypes, id) => {
  const object = expr.object
  const property = expr.property
  const pathToProp = getPathToProp(object)
  pathToProp.push(property)
  const [parentId] = pathToProp
  const parentType = exprType(parentId, localTypeObj, globalTypes, id) // Handle cases other than object and arrays and strings
  if (parentType === null) return AST.NEEDS_INFERENCE
  if (parentType !== undefined) {
    return parentType.type === undefined ? getTypeOfChild({type: parentType}, pathToProp.slice(1), pathToProp[0], localTypeObj, globalTypes, id)
    : getTypeOfChild(parentType, pathToProp.slice(1), pathToProp[0], localTypeObj, globalTypes, id)
  }
  return null // accessing parentType undefined
}

const blockStatementType = (stmnt, localTypeObj, globalTypes, id) => {
  const [expr] = stmnt.body
  return exprType(expr, localTypeObj, globalTypes, id)
}

const exprType = (expr, localTypeObj = {}, globalTypes, id = null) => {
  if (expr !== null && expr.sType !== undefined && expr.sType === 'IO') return 'IO'
  if (expr === null) return AST.NEEDS_INFERENCE
  if (expr.type === AST.EXPRESSION_STATEMENT) expr = expr.expression
  const type = expr.type
  switch (type) {
    case AST.LITERAL:
      return literalType(expr)
    case AST.IDENTIFIER:
      return identifierType(expr, localTypeObj, globalTypes)
    case AST.UNARY_EXPRESSION:
      return unaryExprType(expr, globalTypes)
    case AST.BINARY_EXPRESSION:
      return binaryExprType(expr, localTypeObj, globalTypes, id)
    case AST.CALL_EXPRESSION:
      return callExprType(expr, localTypeObj, globalTypes, id)
    case AST.CONDITIONAL_EXPRESSION:
      return conditionalExprType(expr, localTypeObj, globalTypes, id)
    case AST.ARROW_FUNCTION_EXPRESSION:
      return arrowFunctionExprType(expr, localTypeObj, globalTypes, id)
    case AST.BLOCK_STATEMENT:
      return blockStatementType(expr, localTypeObj, globalTypes, id)
    case 'SwitchStatement':
      return switchStatementType(expr, localTypeObj, globalTypes, id)
    case AST.ARRAY_EXPRESSION:
      return arrayExprType(expr, localTypeObj, globalTypes, id)
    case AST.OBJECT_EXPRESSION:
      return objectExprType(expr, localTypeObj, globalTypes, id)
    case AST.MEMBER_EXPRESSION:
      return memberExprType(expr, localTypeObj, globalTypes, id)
    default:
      return expr
  }
}

const declTypeExtract = (stmnt, globalTypes) => {
  const [decl] = stmnt.declarations
  const [id, exp] = [decl.id.name, decl.init]
  if ((exp.sType !== undefined && exp.sType === 'IO') || id === 'IO') {
    globalTypes[id] = 'IO'
  } else {
    const type = exprType(exp, {}, globalTypes, id)
    globalTypes[id] = type
  }
}

const loadInbuiltObjects = (globalTypes) => {
  for (const obj in inbuiltObjects) {
    globalTypes[obj] = inbuiltObjects[obj]
  }
}

const types = body => {
  const globalTypes = {}
  loadInbuiltObjects(globalTypes)
  body.forEach(expr => {
    const type = expr.type
    if (type === AST.VARIABLE_DECLARATION) declTypeExtract(expr, globalTypes)
  })
  const errorObj = {'error': false}
  for (const decl in globalTypes) {
    if (globalTypes[decl] === null) {
      errorObj.error = true
      errorObj.id = decl
      break
    }
  }
  return errorObj.error ? errorObj : body
}

/*  Module Exports types  */
module.exports = types
