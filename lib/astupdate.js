const AST = require('./astTypes')
/*
  Functions in this file are used to update the AST to support for pattern matching
*/
const estemplate = require('./estemplate')
const updateComment = require('./updateComment.js')


const buildExplicitCases = (patterndecls) => {
  const patterncases = []
  let flag = false
  for (const pattern of patterndecls) {
    const patterncase = {'type': 'SwitchCase', 'consequent': []}
    const patternParam = pattern.declarations[0].init.params[0]
    patterncase.test = patternParam
    if (patternParam.type === AST.ARRAY_EXPRESSION) {
      patterncase.test = estemplate.literal('0')
      patterncase.test.sType = {
        'type': 'array',
        'elemTypes': {},
        'commonType': AST.NEEDS_INFERENCE,
        'isHomogeneous': false
      }
      flag = true
    }
    const consequent = {'type': AST.RETURN_STATEMENT}
    const arg = pattern.declarations[0].init.body
    consequent.argument = arg.type === AST.EXPRESSION_STATEMENT ? arg.expression : arg
    patterncase.consequent.push(consequent)

    patterncases.push(patterncase)
  }
  return [patterncases, flag]
}

const buildDefaultCase = funcdecl => {
  const defaultcase = {'type': 'SwitchCase', 'test': null, 'consequent': []}
  const consequent = {'type': AST.RETURN_STATEMENT}
  const arg = funcdecl.declarations[0].init.body
  consequent.argument = arg.type === AST.EXPRESSION_STATEMENT ? arg.expression : arg
  defaultcase.consequent.push(consequent)
  return defaultcase
}

const formMultiPatternAst = (funcdecl, patterndecls) => {
  const funcdeclbody = {'type': AST.BLOCK_STATEMENT, 'body': []}
  const blockstmtbody = {'type': AST.SWITCH_STATEMENT, 'cases': []}
  const [cases, flag] = buildExplicitCases(patterndecls)
  const testTempl = funcdecl.declarations[0].init.params[0]
  blockstmtbody.discriminant = testTempl
  if (flag === true) {
    const lengthTempl = estemplate.identifier('length')
    blockstmtbody.discriminant = estemplate.memberExpression(testTempl, lengthTempl).expression
  }
  cases.push(buildDefaultCase(funcdecl))
  blockstmtbody.cases = cases

  funcdeclbody.body.push(blockstmtbody)

  funcdecl.declarations[0].init.body = funcdeclbody
  funcdecl.declarations[0].init.expression = false

  return funcdecl
}

const isArrowFuncDecl = decl => {
  const declarations = decl.declarations

  if (declarations !== undefined && declarations[0].init.type === AST.ARROW_FUNCTION_EXPRESSION) return true
  return false
}

const isFunction = decl => {
  const declarations = decl.declarations
  const funcexp = declarations[0].init
  const params = funcexp.params

  let isFunc = true
  for (const param of params) {
    if (param.type === AST.LITERAL || param.type === AST.ARRAY_EXPRESSION || param.type === AST.OBJECT_EXPRESSION) {
      isFunc = false
      break
    }
  }
  return isFunc
}

const formFunctionAst = (funcdecl, patterndecls) => {
  const patternscount = patterndecls.length
  return patternscount === 0 ? funcdecl : formMultiPatternAst(funcdecl, patterndecls)
}

const processSubTree = (decl, patterns) => {
  if (isArrowFuncDecl(decl)) {
    if (isFunction(decl)) { // funcdeclns
      const funcast = formFunctionAst(decl, patterns)
      return [funcast, []]
    } else { // patternfuncdeclns
      return [null, [...patterns, decl]]
    }
  }
  return [decl, patterns]
}

const updateAst = mayBeAst => {
  const ast = mayBeAst
  const declarations = ast.body

  let [newbody] = declarations.reduce(([bodyAcc, patternsAcc], decl) => {
    const [subtree, newPatterns] = processSubTree(decl, patternsAcc)
    if (subtree !== null) bodyAcc.push(subtree)
    return [bodyAcc, newPatterns]
  }, [[], []])

  newbody = updateComment(newbody, ast)
  ast.body = newbody
  return ast
}

/*  Module Exports estemplate  */
module.exports = updateAst
