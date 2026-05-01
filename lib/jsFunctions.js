const AST = require('./astTypes')
/* This file contains JavaScript inbuilt functions, their accepted types and return types */
const jsFunctions = {
  'Number': {
    'type': 'function',
    'paramTypes': ['string'],
    'returnType': 'number'
  },
  'require': {
    'type': 'function',
    'paramTypes': ['string'],
    'returnType': AST.NEEDS_INFERENCE
  },
  'parseInt': {
    'type': 'function',
    'paramTypes': [AST.NEEDS_INFERENCE],
    'returnType': 'number'
  },
  'parseFloat': {
    'type': 'function',
    'paramTypes': [AST.NEEDS_INFERENCE],
    'returnType': 'number'
  },
  'String': {
    'type': 'function',
    'paramTypes': [AST.NEEDS_INFERENCE],
    'returnType': 'string'
  },
  'Object': {
    'type': 'function',
    'paramTypes': [AST.NEEDS_INFERENCE],
    'returnType': 'object'
  },
  'RegExp': {
    'type': 'function',
    'paramTypes': ['string'],
    'returnType': 'object'
  },
  'Date': {
    'type': 'function',
    'paramTypes': [],
    'returnType': 'string'
  },
  'isFinite': {
    'type': 'function',
    'paramTypes': ['number'],
    'returnType': 'boolean'
  },
  'isNaN': {
    'type': 'function',
    'paramTypes': ['number'],
    'returnType': 'boolean'
  }
}

/* Module exports jsFunctions */
module.exports = jsFunctions
