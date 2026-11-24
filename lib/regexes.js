/*
  Centralized regex definitions for the Clean parser.
  Each export is an object with:
    - name: used for error tracking in parserObject.updateParsed
    - pattern: the compiled RegExp (created once, reused on every parse call)

  Patterns are anchored with ^ and match only the token itself. The parser
  takes the rest of the input with str.slice(match[0].length), which is O(1)
  in V8. Do not add a trailing ([\s\S]*)$ group to capture the rest: that
  makes every match scan to the end of the file, so parsing becomes O(n^2).
*/

const SPACE = { name: 'spaceRegex', pattern: /^([ \t]+)/ }
const RETURN = { name: 'returnRegex', pattern: /^((?:\/\/.*)?[ \t]*\n)/ }
const ID = { name: 'idRegex', pattern: /^([_a-zA-Z]+[a-zA-Z0-9_]*)/ }
const NUM = { name: 'numRegex', pattern: /^((?:\d+(?:\.\d*)?|\.\d+)(?:[e][+-]?\d+)?)/ }
const BOOL = { name: 'boolRegex', pattern: /^(true|false)/ }
const STRING = { name: 'stringRegex', pattern: /^('[^\\\n']*(?:\\.[^\\\n']*)*')/ }
const BINARY_OPERATOR = { name: 'binaryOperatorRegex', pattern: /^(\+\+|\+|-|%|\/|\*|<<|<=|<|>>>|>>|>=|>|&&|&|\|\||\||\^|==|!=)/ }
const UNARY_OPERATOR = { name: 'unaryOperatorRegex', pattern: /^(:type|-|!)/ }
const OPEN_CURLY = { name: 'openCurlyRegex', pattern: /^({)/ }
const CLOSE_CURLY = { name: 'closeCurlyRegex', pattern: /^(})/ }
const OPEN_SQUARE_BRACKET = { name: 'openSquareBracketRegex', pattern: /^(\[)/ }
const CLOSE_SQUARE_BRACKET = { name: 'closeSquareBracketRegex', pattern: /^(])/ }
const OPEN_PARENS = { name: 'openParensRegex', pattern: /^(\()/ }
const CLOSE_PARENS = { name: 'closeParensRegex', pattern: /^(\))/ }
const COMMA = { name: 'commaRegex', pattern: /^(,)/ }
const COLON = { name: 'colonRegex', pattern: /^(:)/ }
const SINGLE_LINE_COMMENT = { name: 'singleLineCommentRegex', pattern: /^((\/\/)(.*?)(\n|$))/ }
const MULTI_LINE_COMMENT = { name: 'multiLineCommentRegex', pattern: /^((\/\*)([\s\S]*?)(\*\/))/ }
const NULL = { name: 'nullRegex', pattern: /^(null)/ }
const DELETE = { name: 'deleteRegex', pattern: /^(delete)/ }
// Note: this regex has a unique tail group ((.\n)*) that only matches char+newline pairs — intentionally kept as-is
const REGEX = { name: 'regexRegex', pattern: /^(\/((.)+)\/((?!(?:.\B)*(.)(?:\B.)*\5)[gmuiy]+\b)*)((.\n)*)$/ }
const EQUAL_SIGN = { name: 'equalSignRegex', pattern: /^(\s+=\s+)/ }
const THIN_ARROW = { name: 'thinArrowRegex', pattern: /^(\s*->\s+)/ }
const REVERSE_BIND = { name: 'reverseBindRegex', pattern: /^(\s*<-\s+)/ }
const SLASH = { name: 'slashRegex', pattern: /^(\s*\\)/ }
const LET = { name: 'letRegex', pattern: /^(\s*let\s+)/ }
const IN = { name: 'inRegex', pattern: /^(\s*in\s+)/ }
const DOT = { name: 'dotRegex', pattern: /^(\.)/ }
const IF = { name: 'ifRegex', pattern: /^(if\s+)/ }
const THEN = { name: 'thenRegex', pattern: /^(then\s+)/ }
const ELSE = { name: 'elseRegex', pattern: /^(else\s+)/ }
const DO = { name: 'doRegex', pattern: /^(do)/ }
const RETURN_KEYWORD = { name: 'returnKeywordRegex', pattern: /^(return)/ }
const INCLUDE_KEYWORD = { name: 'includeKeywordRegex', pattern: /^(include)/ }
const DEFINE_PROP = { name: 'definePropRegex', pattern: /^(defineProp)/ }
const LIB_NAME = { name: 'libNameRegex', pattern: /^(node-core|browser-core)/ }

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
