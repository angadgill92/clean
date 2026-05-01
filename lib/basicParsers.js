const parser = require('./parserObject')
const estemplate = require('./estemplate')

/* Utility Functions */
const {
  maybe,
  isLanguageConstruct,
  isStaticIOMethod,
  isIOMethod,
  isDOMmethod,
  isNull,
  notNull,
  unescape,
  returnRest
} = require('./utilityFunctions')

/* Regex definitions (compiled once, reused) */
const {
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
} = require('./regexes')

/*
  All required parsers are created below
*/
const idParser = input => parser.regex(ID)(input)

const numParser = input => parser.regex(NUM)(input)

const spaceParser = input => parser.regex(SPACE)(input)

const equalSignParser = input => parser.regex(EQUAL_SIGN)(input)

const thinArrowParser = input => parser.regex(THIN_ARROW)(input)

const reverseBindParser = input => parser.regex(REVERSE_BIND)(input)

const slashParser = input => parser.regex(SLASH)(input)

const letParser = input => parser.regex(LET)(input)

const inParser = input => parser.regex(IN)(input)

const dotParser = input => parser.regex(DOT)(input)

const ifParser = input => parser.regex(IF)(input)
const thenParser = input => parser.regex(THEN)(input)
const elseParser = input => parser.regex(ELSE)(input)

const doParser = input => parser.regex(DO)(input)

const returnKeywordParser = input => parser.regex(RETURN_KEYWORD)(input)

const includeKeywordParser = input => parser.regex(INCLUDE_KEYWORD)(input)

const definePropParser = input => parser.regex(DEFINE_PROP)(input)

const returnParser = input => maybe(
  RETURN.pattern.exec(input.str),
  (m, newLine, rest) => returnRest(newLine, input, rest, {'name': 'return', 'value': 1})
)

const numberParser = input => maybe(
  numParser(input),
  (num, rest) => [estemplate.literal(num), rest]
)

const nonReservedIdParser = input => maybe(
  idParser(input),
  (name, rest) => (isLanguageConstruct(name) || isStaticIOMethod(name) || isIOMethod(name) || isDOMmethod(name)) ? null
    : [estemplate.identifier(name), rest]
)

const identifierParser = input => maybe(
  idParser(input),
  (name, rest) => [estemplate.identifier(name), rest]
)

const document_ = id => estemplate.memberExpression(estemplate.identifier('document'), estemplate.identifier(id))

const domMethodParser = input => maybe(
  idParser(input),
  (name, rest) => !(isDOMmethod(name)) ? null : [document_(isDOMmethod(name)), rest]
)

const ioFuncNameParser = input => maybe(
  idParser(input),
  (name, rest) => isStaticIOMethod(name) ? [estemplate.identifier(name), rest] : null
)

const ioMethodNameParser = input => maybe(
  idParser(input),
  (name, rest) => isIOMethod(name) ? [estemplate.identifier(name), rest] : null
)

const nullParser = input => maybe(
  parser.regex(NULL)(input),
  (val, rest) => [estemplate.nullLiteral(val), rest]
)

const stringParser = input => maybe(
  parser.regex(STRING)(input),
  (string, rest) => [estemplate.stringLiteral(unescape(string)), rest]
)

const booleanParser = input => maybe(
  parser.regex(BOOL)(input),
  (bool, rest) => [estemplate.boolLiteral(bool), rest]
)

const regexParser = input => maybe(
  REGEX.pattern.exec(input.str),
  (m, regex, pattern, b, flags, _, rest) => returnRest(estemplate.regex(regex, pattern, flags), input, rest,
                                                    {'name': 'column', 'value': pattern.length})
)

const openParensParser = input => maybe(
  parser.regex(OPEN_PARENS)(input),
  (openParens, rest) => [openParens, rest]
)

const closeParensParser = input => maybe(
  parser.regex(CLOSE_PARENS)(input),
  (closeParens, rest) => [closeParens, rest]
)

const openCurlyBraceParser = input => maybe(
  parser.regex(OPEN_CURLY)(input),
  (openCurlyBrace, rest) => [openCurlyBrace, rest]
)

const closeCurlyBraceParser = input => maybe(
  parser.regex(CLOSE_CURLY)(input),
  (closeCurlyBrace, rest) => [closeCurlyBrace, rest]
)

const openSquareBracketParser = input => maybe(
  parser.regex(OPEN_SQUARE_BRACKET)(input),
  (openSquareBracket, rest) => [openSquareBracket, rest]
)

const closeSquareBracketParser = input => maybe(
  parser.regex(CLOSE_SQUARE_BRACKET)(input),
  (closeSquareBracket, rest) => [closeSquareBracket, rest]
)

const commaParser = input => maybe(
  parser.regex(COMMA)(input),
  (comma, rest) => [comma, rest]
)

const colonParser = input => maybe(
  parser.regex(COLON)(input),
  (colon, rest) => [colon, rest]
)

const singleLineCommentParser = input => maybe(
  SINGLE_LINE_COMMENT.pattern.exec(input.str),
  (...vals) => {
    let [, comment, , , , rest] = vals
    let val = comment.slice(2)
    return returnRest(estemplate.comment('Line', val), input, rest, {'name': 'return', 'value': 1})
  }
)

const multiLineCommentParser = input => maybe(
  MULTI_LINE_COMMENT.pattern.exec(input.str),
  (...vals) => {
    let [, comment, , , , rest] = vals
    let lineCount = notNull(comment.match(/\n/g)) ? comment.match(/\n/g).length : 0
    let val = comment.slice(2, comment.length - 2)
    return returnRest(estemplate.comment('Block', val), input, rest, {'name': 'return', 'value': lineCount})
  }
)

const binaryOperatorParser = input => maybe(
  parser.all(maybeSpace, parser.regex(BINARY_OPERATOR), maybeSpace)(input),
  (val, rest) => {
    let [sp1, op, sp2] = val
    return returnRest(op, input, rest.str, {'name': 'column', 'value': (sp1 + op + sp2).length})
  })

const unaryOperatorParser = input => maybe(
  parser.regex(UNARY_OPERATOR)(input),
  (operator, rest) => [operator, rest]
)

const maybeSpace = input => {
  let val = ''
  let space = spaceParser(input)
  let rest = input
  if (notNull(space)) [val, rest] = space
  return returnRest(val, input, rest.str, {name: 'column', value: val.length})
}

const maybeNewLine = input => maybe(
  parser.all(returnParser, spaceParser)(input),
  (val, rest) => [val, rest]
)

const maybeNewLineAndIndent = input => parser.any(maybeNewLine, maybeSpace)(input)

const libNameParser = input => maybe(
  parser.regex(LIB_NAME)(input),
  (val, rest) => [val, rest]
)

const includeParser = input => maybe(
  parser.all(includeKeywordParser, spaceParser, libNameParser)(input),
  (val, rest) => [val[2], rest]
)

const deleteKeywordParser = input => maybe(
  parser.regex(DELETE)(input),
  (operator, rest) => [operator, rest]
)

const emptyArgsParser = input => {
  let result = parser.all(openParensParser, maybeSpace, closeParensParser)(input)
  if (isNull(result)) return null
  let [, rest] = result
  return [[], rest]
}
/* Module exports all basic parsers */
module.exports = {
  returnParser,
  spaceParser,
  maybeSpace,
  maybeNewLineAndIndent,
  numberParser,
  nonReservedIdParser,
  identifierParser,
  domMethodParser,
  ioFuncNameParser,
  ioMethodNameParser,
  nullParser,
  stringParser,
  booleanParser,
  regexParser,
  openParensParser,
  closeParensParser,
  openCurlyBraceParser,
  closeCurlyBraceParser,
  openSquareBracketParser,
  closeSquareBracketParser,
  commaParser,
  colonParser,
  singleLineCommentParser,
  multiLineCommentParser,
  binaryOperatorParser,
  unaryOperatorParser,
  letParser,
  inParser,
  dotParser,
  thinArrowParser,
  reverseBindParser,
  ifParser,
  thenParser,
  elseParser,
  doParser,
  equalSignParser,
  slashParser,
  returnKeywordParser,
  includeParser,
  deleteKeywordParser,
  emptyArgsParser,
  definePropParser
}
