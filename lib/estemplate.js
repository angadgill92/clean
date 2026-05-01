const AST = require('./astTypes')
const types = require('./operatorPrecedence')
const notNull = require('./utilityFunctions').notNull
const notUndefined = require('./utilityFunctions').notUndefined
const estemplate = {}

const extractExpr = token => notUndefined(token) && notNull(token) && token.type === AST.EXPRESSION_STATEMENT ? token.expression : token

estemplate.ast = () =>
  ({'type': AST.PROGRAM, 'body': [], 'sourceType': 'script'})

estemplate.literal = value =>
  ({'type': AST.LITERAL, 'value': Number(value), 'raw': value, 'sType': 'number'})

estemplate.nullLiteral = value =>
  ({'type': AST.LITERAL, 'value': null, 'raw': value, 'sType': AST.NEEDS_INFERENCE})

estemplate.boolLiteral = value =>
    ({'type': AST.LITERAL, 'value': !(value === 'false'), 'raw': value, 'sType': 'bool'})

estemplate.stringLiteral = value =>
  ({'type': AST.LITERAL, 'value': value, 'raw': value, 'sType': 'string'})

estemplate.identifier = value =>
  ({'type': AST.IDENTIFIER, 'name': value})

estemplate.regex = (regex, pattern, flags) => ({
  'type': AST.LITERAL,
  'value': new RegExp(pattern, flags),
  'raw': regex,
  'regex': {
    'pattern': pattern,
    'flags': flags
  },
  sType: 'regexp'
})

estemplate.declaration = (id, val) => ({
  'type': AST.VARIABLE_DECLARATION,
  'declarations': [{
    'type': AST.VARIABLE_DECLARATOR,
    id,
    'init': extractExpr(val)
  }],
  'kind': 'const'
})

estemplate.letDecl = (id, val) => ({
  'type': AST.VARIABLE_DECLARATION,
  'declarations': [{
    'type': AST.VARIABLE_DECLARATOR,
    id,
    'init': extractExpr(val)
  }],
  'kind': 'let'
})

estemplate.funcDeclaration = (id, params, body) => ({
  'type': AST.VARIABLE_DECLARATION,
  'declarations': [{
    'type': AST.VARIABLE_DECLARATOR,
    id,
    'init': {
      'type': AST.ARROW_FUNCTION_EXPRESSION,
      'id': null,
      'params': params,
      'body': extractExpr(body) || '',
      'generator': false,
      'expression': (body === undefined || body.type !== AST.BLOCK_STATEMENT)
    }
  }],
  'kind': 'const'
})

estemplate.lambdaCall = (params, args, body) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.ARROW_FUNCTION_EXPRESSION,
    'id': null,
    'params': params,
    'body': extractExpr(body) || '',
    'generator': false,
    'expression': (body === undefined || body.type !== AST.BLOCK_STATEMENT)
  },
  'arguments': args.map(extractExpr)
})

estemplate.letExpression = (params, args, body) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.ARROW_FUNCTION_EXPRESSION,
    'id': null,
    'params': params,
    'body': extractExpr(body) || '',
    'generator': false,
    'expression': true
  },
  'arguments': args.map(extractExpr)
})

estemplate.memberExpression = (obj, prop) => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': extractExpr(obj),
    'property': extractExpr(prop)
  }
})

estemplate.subscriptExpression = (obj, prop) => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': true,
    'object': extractExpr(obj),
    'property': extractExpr(prop)
  }
})

estemplate.printexpression = (args) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': {
      'type': AST.IDENTIFIER,
      'name': 'console'
    },
    'property': {
      'type': AST.IDENTIFIER,
      'name': 'log'
    }
  },
  'arguments': args.map(arg => extractExpr(arg)),
  'sType': 'IO'
})

estemplate.fnCall = (val, args) => val.name === 'print' ? estemplate.printexpression(args)
  : ({
    type: AST.CALL_EXPRESSION,
    callee: extractExpr(val),
    arguments: args.map(extractExpr)
  })

estemplate.lambda = (params, body) => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': {
    'type': AST.ARROW_FUNCTION_EXPRESSION,
    'id': null,
    params,
    'body': extractExpr(body) || '',
    'generator': false,
    'expression': (body === undefined || body.type !== AST.BLOCK_STATEMENT)
  }
})

estemplate.binaryExpression = (left, op, right) => {
  const opType = op === 'instanceof' ? 'any' : types[op].type
  if (op === '^') return binaryExpr(left, '**', right, opType)
  if (op === '++') return binaryExpr(left, '+', right, opType)
  if (op === '==') return binaryExpr(left, '===', right, opType)
  if (op === '!=') return binaryExpr(left, '!==', right, opType)
  return binaryExpr(left, op, right, opType)
}

const binaryExpr = (left, op, right, opType) => ({
  'type': AST.BINARY_EXPRESSION,
  'operator': op,
  'sType': opType,
  'left': extractExpr(left),
  'right': extractExpr(right)
})

estemplate.unaryExpression = (op, arg) => ({
  'type': AST.UNARY_EXPRESSION,
  'operator': op,
  'argument': extractExpr(arg),
  'prefix': true
})

estemplate.blockStmt = body => ({
  'type': AST.BLOCK_STATEMENT,
  'body': body
})

estemplate.ifthenelse = (condition, result1, result2) => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': {
    'type': AST.CONDITIONAL_EXPRESSION,
    'test': extractExpr(condition),
    'consequent': extractExpr(result1),
    'alternate': extractExpr(result2)
  }
})

estemplate.ifStmt = (predicate, consequent) => ({
  'type': AST.IF_STATEMENT,
  'test': predicate,
  'consequent': {
    'type': AST.BLOCK_STATEMENT,
    'body': [
      consequent,
      estemplate.returnStmt(null)
    ]
  },
  'alternate': null
})

estemplate.array = elements => ({'type': AST.ARRAY_EXPRESSION, 'elements': elements.map(extractExpr)})

estemplate.object = value => ({
  'type': AST.OBJECT_EXPRESSION,
  'properties': extractExpr(value)
})

estemplate.objectProperty = (key, val) => ({
  'type': AST.PROPERTY,
  'key': key,
  'computed': false,
  'value': extractExpr(val),
  'kind': 'init',
  'method': false,
  'shorthand': false
})

estemplate.comment = (type, val) => ({
  'type': type,
  'value': val
})

estemplate.ioCall = (ioFunc, args, nextParams = []) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': {
      'type': AST.IDENTIFIER,
      'name': 'IO'
    },
    'property': ioFunc
  },
  'arguments': args.map(extractExpr),
  nextParams
})

estemplate.ioBind = (parentIO, ioCall, nextParams = []) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': parentIO,
    'property': {
      'type': AST.IDENTIFIER,
      'name': 'bind'
    }
  },
  'arguments': [ioCall].map(extractExpr),
  nextParams
})

estemplate.ioMap = (parentIO, pureFunc, nextParams = []) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': parentIO,
    'property': {
      'type': AST.IDENTIFIER,
      'name': 'map'
    }
  },
  'arguments': [pureFunc].map(extractExpr),
  nextParams
})

estemplate.ioThen = (parentIO, func, ioParams) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': parentIO,
    'property': {
      'type': AST.IDENTIFIER,
      'name': 'then'
    }
  },
  'arguments': [func].map(extractExpr),
  ioParams
})

estemplate.ioFunc = (id, args) => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': {
      'type': AST.IDENTIFIER,
      'name': 'IO'
    },
    'property': id
  },
  'arguments': args.map(extractExpr)
})

estemplate.defineProp = (objID, key, val, mutable) => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': {
    'type': AST.CALL_EXPRESSION,
    'callee': {
      'type': AST.MEMBER_EXPRESSION,
      'computed': false,
      'object': {
        'type': AST.IDENTIFIER,
        'name': 'Object'
      },
      'property': {
        'type': AST.IDENTIFIER,
        'name': 'defineProperty'
      }
    },
    'arguments': [
      objID,
      key,
      {
        'type': AST.OBJECT_EXPRESSION,
        'properties': [
          {
            'type': AST.PROPERTY,
            'key': {
              'type': AST.IDENTIFIER,
              'name': 'value'
            },
            'computed': false,
            'value': val,
            'kind': 'init',
            'method': false,
            'shorthand': false
          },
          {
            'type': AST.PROPERTY,
            'key': {
              'type': AST.IDENTIFIER,
              'name': 'enumerable'
            },
            'computed': false,
            'value': {
              'type': AST.LITERAL,
              'value': true,
              'raw': 'true'
            },
            'kind': 'init',
            'method': false,
            'shorthand': false
          },
          {
            'type': AST.PROPERTY,
            'key': {
              'type': AST.IDENTIFIER,
              'name': 'writable'
            },
            'computed': false,
            'value': {
              'type': AST.LITERAL,
              'value': mutable,
              'raw': mutable.toString()
            },
            'kind': 'init',
            'method': false,
            'shorthand': false
          },
          {
            'type': AST.PROPERTY,
            'key': {
              'type': AST.IDENTIFIER,
              'name': 'configurable'
            },
            'computed': false,
            'value': {
              'type': AST.LITERAL,
              'value': mutable,
              'raw': mutable.toString()
            },
            'kind': 'init',
            'method': false,
            'shorthand': false
          }
        ]
      }
    ]
  }
})

estemplate.returnStmt = (args) => ({
  'type': AST.RETURN_STATEMENT,
  'argument': args
})

estemplate.defaultIOThen = parentObj => ({
  'type': AST.CALL_EXPRESSION,
  'callee': {
    'type': AST.MEMBER_EXPRESSION,
    'computed': false,
    'object': parentObj,
    'property': {
      'type': AST.IDENTIFIER,
      'name': 'then'
    }
  },
  'arguments': [
    {
      'type': AST.ARROW_FUNCTION_EXPRESSION,
      'id': null,
      'params': [],
      'body': {
        'type': AST.LITERAL,
        'value': null,
        'raw': 'null'
      },
      'generator': false,
      'expression': true
    }
  ]
})

estemplate.expression = expr => ({
  'type': AST.EXPRESSION_STATEMENT,
  'expression': expr
})

/*  Module Exports estemplate  */
module.exports = estemplate
