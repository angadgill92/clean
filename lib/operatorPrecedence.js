/*
  Binary operators: result type, precedence (higher binds tighter) and
  associativity. Every operator accepted by BINARY_OPERATOR in regexes.js
  must have an entry here. Relative order follows JavaScript, except that
  ^ is exponentiation and ++ is string concatenation.
*/
const binaryOperators = {
  '.': {
    type: 'function',
    prec: 11,
    assoc: 'R',
    def: 'FunctionComposition'
  },
  '^': {
    type: 'number',
    prec: 10,
    assoc: 'R',
    def: 'Exponentiation'
  },
  '*': {
    type: 'number',
    prec: 9,
    assoc: 'L',
    def: 'Multiplication'
  },
  '%': {
    type: 'number',
    prec: 9,
    assoc: 'L',
    def: 'Remainder'
  },
  '/': {
    type: 'number',
    prec: 9,
    assoc: 'L',
    def: 'Division'
  },
  '+': {
    type: 'number',
    prec: 8,
    assoc: 'L',
    def: 'Addition'
  },
  '-': {
    type: 'number',
    prec: 8,
    assoc: 'L',
    def: 'Subtraction'
  },
  '==': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Equal to'
  },
  '!=': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Not Equal to'
  },
  '<': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Less Than'
  },
  '<=': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Less than or Equal to'
  },
  '>=': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Greater than or Equal to'
  },
  '>': {
    type: 'bool',
    prec: 6,
    assoc: 'L',
    def: 'Greater than'
  },
  '<<': {
    type: 'number',
    prec: 7,
    assoc: 'L',
    def: 'Left shift'
  },
  '>>': {
    type: 'number',
    prec: 7,
    assoc: 'L',
    def: 'Sign-propagating right shift'
  },
  '>>>': {
    type: 'number',
    prec: 7,
    assoc: 'L',
    def: 'Zero-fill right shift'
  },
  '&': {
    type: 'number',
    prec: 5,
    assoc: 'L',
    def: 'Bitwise AND'
  },
  '|': {
    type: 'number',
    prec: 4,
    assoc: 'L',
    def: 'Bitwise OR'
  },
  '&&': {
    type: 'bool',
    prec: 3,
    assoc: 'R',
    def: 'Logical AND'
  },
  '||': {
    type: 'bool',
    prec: 3,
    assoc: 'R',
    def: 'Logical OR'
  },
  '++': {
    type: 'string',
    prec: 12,
    assoc: 'L',
    def: 'Concatenation'
  }
}

module.exports = binaryOperators
