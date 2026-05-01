module.exports = {
  PROGRAM: 'Program',
  EXPRESSION_STATEMENT: 'ExpressionStatement',
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  VARIABLE_DECLARATION: 'VariableDeclaration',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
  ARROW_FUNCTION_EXPRESSION: 'ArrowFunctionExpression',
  CALL_EXPRESSION: 'CallExpression',
  MEMBER_EXPRESSION: 'MemberExpression',
  BINARY_EXPRESSION: 'BinaryExpression',
  UNARY_EXPRESSION: 'UnaryExpression',
  BLOCK_STATEMENT: 'BlockStatement',
  CONDITIONAL_EXPRESSION: 'ConditionalExpression',
  IF_STATEMENT: 'IfStatement',
  ARRAY_EXPRESSION: 'ArrayExpression',
  OBJECT_EXPRESSION: 'ObjectExpression',
  PROPERTY: 'Property',
  RETURN_STATEMENT: 'ReturnStatement',
  SWITCH_STATEMENT: 'SwitchStatement',
  
  // Custom Inference Types & Internal Markers
  NEEDS_INFERENCE: 'needsInference',
  TYPE_ERROR: 'typeError',
  LINE_COMMENT: 'Line',
  BLOCK_COMMENT: 'Block'
}
