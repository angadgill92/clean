/*
  Type inference and type checker for the AST
  IO blocks are termed as type 'IO' and whenever the type could not be inferred it is set to 'needsInference'
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
    let type = exprType(expr, localTypeObj, globalTypes, id)
    return type === expectedType || expectedType === 'bool' ? type : type === 'needsInference' ? type : null
  }
}

const checkTypes = (expr, expectedType, localTypeObj, globalTypes, id) => {
  let typeLeft = getType(expr.left, expectedType, localTypeObj, globalTypes, id)
  let typeRight = getType(expr.right, expectedType, localTypeObj, globalTypes, id)
  if (typeLeft === 'needsInference' && typeRight !== 'needsInference') {
    assignTypeToUninferredIdentifier(expr, typeRight, localTypeObj)
    typeLeft = typeRight
  }
  if (typeLeft !== 'needsInference' && typeRight === 'needsInference') {
    assignTypeToUninferredIdentifier(expr, typeLeft, localTypeObj)
    typeRight = typeLeft
  }
  if (typeLeft === 'needsInference' && typeRight === 'needsInference') return expectedType
  return typeLeft === typeRight && (typeLeft === expectedType || expectedType === 'bool') ? expectedType : null
}

const assignTypeToUninferredIdentifier = (expr, inferredType, localTypeObj) => {
  if (isEmptyObj(localTypeObj)) return localTypeObj
  let [left, right] = [expr.left.name, expr.right.name]
  if (left !== undefined && localTypeObj[left] === 'needsInference') localTypeObj[left] = inferredType
  if (right !== undefined && localTypeObj[right] === 'needsInference') localTypeObj[right] = inferredType
}

const binaryExprType = (expr, localTypeObj, globalTypes, id) => {
  let assumedType = expr.sType
  if (assumedType !== 'bool') assignTypeToUninferredIdentifier(expr, assumedType, localTypeObj)
  return checkTypes(expr, assumedType, localTypeObj, globalTypes, id)
}

const compareArrayProps = (array1, array2) => {
  let flag = (array1.isHomogeneous === array2.isHomogeneous &&
              array1.commonType === array2.commonType)
  return flag ? {type: 'array', elemTypes: {}, commonType: array1.commonType, isHomogeneous: array1.isHomogeneous} : null
}

const conditionalExprType = (expr, localTypeObj, globalTypes, id) => {
  if (exprType(expr.test, localTypeObj, globalTypes, id) !== 'bool') return null
  let [consequentType, alternateType] = [exprType(expr.consequent, localTypeObj, globalTypes, id), exprType(expr.alternate, localTypeObj, globalTypes, id)]
  if (consequentType === 'needsInference' && alternateType !== 'needsInference' && alternateType !== null) {
    consequentType = alternateType
    localTypeObj[expr.consequent.name] = alternateType
  }
  if (consequentType !== 'needsInference' && alternateType === 'needsInference' && consequentType !== null) {
    alternateType = consequentType
    localTypeObj[expr.alternate.name] = consequentType
  }
  if (consequentType === null || alternateType === null) return null
  if (consequentType.type !== undefined && alternateType.type !== undefined) {
    let match = consequentType.type === alternateType.type
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
  let paramTypes = []
  for (let identifier in localTypeObj) {
    if (localTypeObj[identifier].type === undefined) {
      paramTypes.push(localTypeObj[identifier])
    } else {
      paramTypes.push(localTypeObj[identifier].type)
    }
  }
  return paramTypes
}

const arrowFunctionExprType = (expr, localTypeObj, globalTypes, id) => {
  let [params, body] = [expr.params, expr.body]
  params.forEach(param => { localTypeObj[param.name] = 'needsInference' })
  let returnType = exprType(body, localTypeObj, globalTypes, id)
  return returnType === null ? null : {type: 'function', paramTypes: makeParamTypeArray(localTypeObj), returnType}
}

const matchArgTypesToAcceptedTypes = (args, acceptedTypes, localTypeObj, globalTypes, id) => {
  let _args = args.map((arg, index) => {
    let type = exprType(arg, localTypeObj, globalTypes, id)
    if (type !== null && type.type !== undefined) type = type.type
    if (type === 'needsInference' && acceptedTypes[index] !== 'needsInference') {
      type = acceptedTypes[index]
      if (arg.type === 'Identifier') localTypeObj[arg.name] = type
    }
    return (type === 'needsInference' || type === acceptedTypes[index] || (type !== null && acceptedTypes[index] === 'needsInference'))
  })
  return isEmptyArr(_args) ? true : _args.reduce((type1, type2) => type1 === type2)
}

const checkForRecursion = (callee, id, localTypeObj, globalTypes, args) => {
  if (callee === id) { /* recursive call */
    args = args.map(e => exprType(e, localTypeObj, globalTypes, id))
    if (globalTypes[id] !== undefined && globalTypes[id].type === 'function' && globalTypes[id].returnType !== 'needsInference') return {flag: false}
    args = args.map(arg => arg.type !== undefined ? arg.type : arg)
    globalTypes[id] = {type: 'function', paramTypes: args, returnType: 'needsInference'}
    return {flag: true, paramTypes: args}
  }
  return {flag: false}
}

const getFunctionType = calleeName => jsFunctions[calleeName]

const callExprType = (expr, localTypeObj = {}, globalTypes, id) => {
  if (expr.callee.type === 'Identifier' && globalTypes[expr.callee.name] === undefined) {
    let calleeName = expr.callee.name
    globalTypes[calleeName] = getFunctionType(calleeName)
  }
  let [params, body, args] = [expr.callee.params, expr.callee.body, expr.arguments]
  if (expr.sType !== undefined) return expr.sType // if call has type already set
  if (params !== undefined && body !== undefined && (!(isEmptyObj(localTypeObj)) || expr.callee.id === null)) {
    let typesOfParams = mapArgTypeToParams(params, args, localTypeObj, globalTypes, id)
    args.forEach(arg => exprType(arg, localTypeObj, globalTypes, id))
    params.forEach((param, index) => {
      localTypeObj[param.name] = typesOfParams[index]
    })
    return exprType(body, localTypeObj, globalTypes, id)
  }
  let isRecursive = checkForRecursion(expr.callee.name, id, localTypeObj, globalTypes, args)
  let result = exprType(expr.callee, localTypeObj, globalTypes, id)
  if (result === null) return null
  if (expr.callee.id === null) result = [result.paramTypes, result.returnType]
  let [acceptedTypes, returnType] = result
  if (isRecursive.flag) acceptedTypes = isRecursive.paramTypes
  let match = matchArgTypesToAcceptedTypes(args, acceptedTypes, localTypeObj, globalTypes, id)
  return match ? returnType : null
}

const reduceTypes = (typesArr, localTypeObj, globalTypes, id) => {
  let reducedType = typesArr.map(e => {
    if (e.type !== undefined && e.type === 'Identifier') return {id: e.name, type: exprType(e, localTypeObj, globalTypes, id)}
    return {id: null, type: exprType(e, localTypeObj, globalTypes, id)}
  }).reduce((exp1, exp2) => {
    if (exp1.type === 'needsInference' && exp2.type !== 'needsInference' && exp2.type !== null) {
      localTypeObj[exp1.id] = exp2.type
      exp1.type = exp2.type
    }
    if (exp2.type === 'needsInference' && exp1.type !== 'needsInference') {
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
  let cases = body.cases
  let [initialPattern] = cases
  let [returnType, acceptedType] = [
    initialPattern.consequent[0].argument,
    initialPattern.test].map(exp => exprType(exp, localTypeObj, globalTypes, id))
  let paramId = body.discriminant.name
  localTypeObj[paramId] = acceptedType
  let [caseArgArray, caseTestArray] = [
    cases.map(c => c.consequent[0].argument),
    cases.map(c => c.test === null ? {type: 'Identifier', name: paramId, sType: acceptedType} : c.test)]
  let checkTestType = reduceTypes(caseTestArray, localTypeObj, globalTypes, id)
  let checkArgsType = reduceTypes(caseArgArray, localTypeObj, globalTypes, id)
  if (returnType === 'needsInference') returnType = checkArgsType
  globalTypes[id] = {type: 'function', paramTypes: makeParamTypeArray(localTypeObj, id), returnType}
  return checkArgsType === false || checkTestType === false ? null : returnType
}

const arrayExprType = (expr, localTypeObj, globalTypes, id) => {
  let elementTypeObj = {}
  if (isEmptyArr(expr.elements)) {
    return {
      'type': 'array',
      'elemTypes': {},
      'commonType': 'needsInference',
      'isHomogeneous': true
    }
  }
  let deducedtype = expr.elements.map((e, index) => {
    let elemType = exprType(e, localTypeObj, globalTypes, id)
    elementTypeObj[index] = elemType
    return elemType
  }).reduce((type1, type2) => type1 === type2 ? type1 : 'needsInference')
  let arrayType = {
    'type': 'array',
    'elemTypes': elementTypeObj,
    'commonType': (deducedtype.type !== undefined &&
                  (deducedtype.type === 'object' || deducedtype.type === 'array')
                   ? deducedtype.type : deducedtype),
    'isHomogeneous': true
  }
  if (deducedtype === 'needsInference') {
    arrayType['isHomogeneous'] = false
  }
  return arrayType
}

const objectExprType = (expr, localTypeObj, globalTypes, id) => {
  let propertyTypeObj = {}
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
  let supportedTypes = []
  for (let type in propSpec) {
    if (propSpec[type][propName] !== undefined) supportedTypes.push(type)
  }
  if (supportedTypes.length === 1) {
    localTypeObj[parentId.name] = supportedTypes[0]
  }
  return localTypeObj[parentId.name]
}

const getPropName = prop => prop.type === 'Identifier' ? prop.name
                          : prop.type === 'Literal' ? prop.raw : null

const getPropReturnType = (propSpec, propName) => {
  if (propSpec === undefined) return {type: false, id: propName} // allow
  if (propSpec.isMutative) return {type: null, id: propName} // block
  if (propSpec.isMethod) return {type: 'function', paramTypes: propSpec.paramTypes, returnType: propSpec.returnType, id: propName} // handle no params
  if (propSpec.isProp) return {type: propSpec.returnType, id: propName}
}

const checkForInbuiltProp = (parentType, prop, parentId, localTypeObj) => {
  let propName = getPropName(prop)
  if (propName === null) return {type: 'needsInference', id: propName}
  if (parentType === 'needsInference') {
    let propSpec = inbuiltPropSpec[parentType][propName]
    if (propSpec === undefined) return {type: 'needsInference', id: propName}
    localTypeObj[parentId.name] = propSpec.parentType
    return getPropReturnType(propSpec.spec, propName)
  }
  let propSpec = inbuiltPropSpec[parentType][propName]
  return getPropReturnType(propSpec, propName)
}

const getTypeOfChild = (parentObj, propsArray, parentId, localTypeObj, globalTypes, id) => {
  if (isEmptyArr(propsArray)) return parentObj
  let [prop] = propsArray
  let propSpec = checkForInbuiltProp(parentObj.type, prop, parentId, localTypeObj)
  let propId = propSpec.id
  switch (propSpec.type) {
    case 'needsInference':
      let type = getParentTypes(inbuiltPropSpec, prop.name, parentId, localTypeObj)
      if (type === 'needsInference') return 'needsInference'
      if (typeof type === 'string') {
        localTypeObj[parentId] = type
        return getTypeOfChild({type: type}, propsArray, parentId, localTypeObj, globalTypes, id)
      }
      return 'needsInference'
    case null: return null // block mutative methods
    case false:
      {
        if (parentObj.type === 'object') {
          if (prop.type !== 'Literal' && prop.isSubscript) {
            let expType = exprType(prop, localTypeObj, globalTypes, id)
            return expType !== 'string' && expType !== undefined ? null : 'needsInference'
          }
          if (prop.sType !== undefined && prop.sType !== 'string') return null
          if (parentObj.propTypes === 'needsInference') return 'needsInference'
          return getTypeOfChild(parentObj.propTypes[propId], propsArray.slice(1), propsArray[0], localTypeObj, globalTypes, id)
        }
        if (parentObj.type === 'array') {
          if (prop.type !== 'Literal') {
            return propsArray.length === 1 ? parentObj.commonType : 'needsInference'
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
  if (obj.type !== undefined && obj.type !== 'MemberExpression') {
    path.unshift(obj)
    return path
  }
  if (obj.property.type === 'Identifier' || obj.property.type === 'Literal') path.unshift(obj.property)
  // Handle binary and function calls inside member expressions
  return getPathToProp(obj.object, path)
}

const memberExprType = (expr, localTypeObj, globalTypes, id) => {
  let object = expr.object
  let property = expr.property
  let pathToProp = getPathToProp(object)
  pathToProp.push(property)
  let [parentId] = pathToProp
  let parentType = exprType(parentId, localTypeObj, globalTypes, id) // Handle cases other than object and arrays and strings
  if (parentType === null) return 'needsInference'
  if (parentType !== undefined) {
    return parentType.type === undefined ? getTypeOfChild({type: parentType}, pathToProp.slice(1), pathToProp[0], localTypeObj, globalTypes, id)
    : getTypeOfChild(parentType, pathToProp.slice(1), pathToProp[0], localTypeObj, globalTypes, id)
  }
  return null // accessing parentType undefined
}

const blockStatementType = (stmnt, localTypeObj, globalTypes, id) => {
  let [expr] = stmnt.body
  return exprType(expr, localTypeObj, globalTypes, id)
}

const exprType = (expr, localTypeObj = {}, globalTypes, id = null) => {
  if (expr !== null && expr.sType !== undefined && expr.sType === 'IO') return 'IO'
  if (expr === null) return 'needsInference'
  if (expr.type === 'ExpressionStatement') expr = expr.expression
  let type = expr.type
  switch (type) {
    case 'Literal':
      return literalType(expr)
    case 'Identifier':
      return identifierType(expr, localTypeObj, globalTypes)
    case 'UnaryExpression':
      return unaryExprType(expr, globalTypes)
    case 'BinaryExpression':
      return binaryExprType(expr, localTypeObj, globalTypes, id)
    case 'CallExpression':
      return callExprType(expr, localTypeObj, globalTypes, id)
    case 'ConditionalExpression':
      return conditionalExprType(expr, localTypeObj, globalTypes, id)
    case 'ArrowFunctionExpression':
      return arrowFunctionExprType(expr, localTypeObj, globalTypes, id)
    case 'BlockStatement':
      return blockStatementType(expr, localTypeObj, globalTypes, id)
    case 'SwitchStatement':
      return switchStatementType(expr, localTypeObj, globalTypes, id)
    case 'ArrayExpression':
      return arrayExprType(expr, localTypeObj, globalTypes, id)
    case 'ObjectExpression':
      return objectExprType(expr, localTypeObj, globalTypes, id)
    case 'MemberExpression':
      return memberExprType(expr, localTypeObj, globalTypes, id)
    default:
      return expr
  }
}

const declTypeExtract = (stmnt, globalTypes) => {
  let [decl] = stmnt.declarations
  let [id, exp] = [decl.id.name, decl.init]
  if ((exp.sType !== undefined && exp.sType === 'IO') || id === 'IO') {
    globalTypes[id] = 'IO'
  } else {
    let type = exprType(exp, {}, globalTypes, id)
    globalTypes[id] = type
  }
}

const loadInbuiltObjects = (globalTypes) => {
  for (let obj in inbuiltObjects) {
    globalTypes[obj] = inbuiltObjects[obj]
  }
}

const types = body => {
  const globalTypes = {}
  loadInbuiltObjects(globalTypes)
  body.forEach(expr => {
    let type = expr.type
    if (type === 'VariableDeclaration') declTypeExtract(expr, globalTypes)
  })
  const errorObj = {'error': false}
  for (let decl in globalTypes) {
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
