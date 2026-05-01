/*
  Centralized regex definitions for the Clean parser.
  Each export is an object with:
    - name: used for error tracking in parserObject.updateParsed
    - pattern: the compiled RegExp (created once, reused on every parse call)

  All patterns use [\s\S]* instead of (.|\\n)* to avoid catastrophic backtracking.
*/

const SPACE = { name: 'spaceRegex', pattern: /^([ \t]+)([\s\S]*)$/ }
const RETURN = { name: 'returnRegex', pattern: /^((?:\/\/.*)?[ \t]*\n)([\s\S]*)$/ }
const ID = { name: 'idRegex', pattern: /^([_a-zA-Z]+[a-zA-Z0-9_]*)([\s\S]*)$/ }
const NUM = { name: 'numRegex', pattern: /^((?:\d+(?:\.\d*)?|\.\d+)(?:[e][+-]?\d+)?)([\s\S]*)$/ }
const BOOL = { name: 'boolRegex', pattern: /^(true|false)([\s\S]*)$/ }
const STRING = { name: 'stringRegex', pattern: /^('[^\\\n']*(?:\\.[^\\\n']*)*')([\s\S]*)$/ }
const BINARY_OPERATOR = { name: 'binaryOperatorRegex', pattern: /^(\+\+|\+|-|%|\/|\*|<<|<=|<|>>>|>>|>=|>|&&|&|\|\||\||\^|==|!=)([\s\S]*)$/ }
const UNARY_OPERATOR = { name: 'unaryOperatorRegex', pattern: /^(:type|-|!)([\s\S]*)$/ }
const OPEN_CURLY = { name: 'openCurlyRegex', pattern: /^({)([\s\S]*)$/ }
const CLOSE_CURLY = { name: 'closeCurlyRegex', pattern: /^(})([\s\S]*)$/ }
const OPEN_SQUARE_BRACKET = { name: 'openSquareBracketRegex', pattern: /^(\[)([\s\S]*)$/ }
const CLOSE_SQUARE_BRACKET = { name: 'closeSquareBracketRegex', pattern: /^(])([\s\S]*)$/ }
const OPEN_PARENS = { name: 'openParensRegex', pattern: /^(\()([\s\S]*)$/ }
const CLOSE_PARENS = { name: 'closeParensRegex', pattern: /^(\))([\s\S]*)$/ }
const COMMA = { name: 'commaRegex', pattern: /^(,)([\s\S]*)$/ }
const COLON = { name: 'colonRegex', pattern: /^(:)([\s\S]*)$/ }
const SINGLE_LINE_COMMENT = { name: 'singleLineCommentRegex', pattern: /^((\/\/)(.*?)(\n|$))([\s\S]*)$/ }
const MULTI_LINE_COMMENT = { name: 'multiLineCommentRegex', pattern: /^((\/\*)([\s\S]*?)(\*\/))([\s\S]*)$/ }
const NULL = { name: 'nullRegex', pattern: /^(null)([\s\S]*)$/ }
const DELETE = { name: 'deleteRegex', pattern: /^(delete)([\s\S]*)$/ }
// Note: this regex has a unique tail group ((.\n)*) that only matches char+newline pairs — intentionally kept as-is
const REGEX = { name: 'regexRegex', pattern: /^(\/((.)+)\/((?!(?:.\B)*(.)(?:\B.)*\5)[gmuiy]+\b)*)((.\n)*)$/ }
const EQUAL_SIGN = { name: 'equalSignRegex', pattern: /^(\s+=\s+)([\s\S]*)$/ }
const THIN_ARROW = { name: 'thinArrowRegex', pattern: /^(\s*->\s+)([\s\S]*)$/ }
const REVERSE_BIND = { name: 'reverseBindRegex', pattern: /^(\s*<-\s+)([\s\S]*)$/ }
const SLASH = { name: 'slashRegex', pattern: /^(\s*\\)([\s\S]*)$/ }
const LET = { name: 'letRegex', pattern: /^(\s*let\s+)([\s\S]*)$/ }
const IN = { name: 'inRegex', pattern: /^(\s*in\s+)([\s\S]*)$/ }
const DOT = { name: 'dotRegex', pattern: /^(\.)([\s\S]*)$/ }
const IF = { name: 'ifRegex', pattern: /^(if\s+)([\s\S]*)$/ }
const THEN = { name: 'thenRegex', pattern: /^(then\s+)([\s\S]*)$/ }
const ELSE = { name: 'elseRegex', pattern: /^(else\s+)([\s\S]*)$/ }
const DO = { name: 'doRegex', pattern: /^(do)([\s\S]*)$/ }
const RETURN_KEYWORD = { name: 'returnKeywordRegex', pattern: /^(return)([\s\S]*)$/ }
const INCLUDE_KEYWORD = { name: 'includeKeywordRegex', pattern: /^(include)([\s\S]*)$/ }
const DEFINE_PROP = { name: 'definePropRegex', pattern: /^(defineProp)([\s\S]*)$/ }
const LIB_NAME = { name: 'libNameRegex', pattern: /^(node-core|browser-core)([\s\S]*)$/ }

module.exports = {
  SPACE, RETURN, ID, NUM, BOOL, STRING,
  BINARY_OPERATOR, UNARY_OPERATOR,
  OPEN_CURLY, CLOSE_CURLY,
  OPEN_SQUARE_BRACKET, CLOSE_SQUARE_BRACKET,
  OPEN_PARENS, CLOSE_PARENS,
  COMMA, COLON,
  SINGLE_LINE_COMMENT, MULTI_LINE_COMMENT,
  NULL, DELETE, REGEX,
  EQUAL_SIGN, THIN_ARROW, REVERSE_BIND, SLASH,
  LET, IN, DOT,
  IF, THEN, ELSE, DO,
  RETURN_KEYWORD, INCLUDE_KEYWORD, DEFINE_PROP, LIB_NAME
}
