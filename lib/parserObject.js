const utils = require('./utilityFunctions')
/* Utility Functions */
const {
  isUndefined,
  maybe,
  returnRest
} = utils

/*
  Parser factory. Used to create parsers
  parser.regex - creates parser for given regex
  parser.bind - applies monadic bind on parsers
  parser.all - All parsers supplied MUST match
  parser.many - zero or more matches of one parser
  parser.any - ANY ONE of the parsers need match
*/

const parser = {unParsed: {'line': 1, 'column': 0, 'regex': []}}

// To keep track of how much of the input has been parsed
const updateParsed = (val, name) => {
  const maxLine = parser.unParsed.line < val.line // if existing parsed line is less than newly parsed line
  const maxColumn = parser.unParsed.line === val.line && parser.unParsed.column < val.column // if lines match then compare column
  if (!maxLine && !maxColumn) return
  // Only the current line is needed; avoid splitting the whole rest of the file
  const lineEnd = val.str.indexOf('\n')
  const currentExpr = lineEnd === -1 ? val.str : val.str.slice(0, lineEnd)
  if (maxLine) {
    [parser.unParsed.str, parser.unParsed.line, parser.unParsed.column, parser.unParsed.regex] = [currentExpr, val.line, val.column, []]
  }
  if (maxColumn) {
    if (isUndefined(parser.unParsed.str)) parser.unParsed.str = currentExpr
    if (name !== 'spaceRegex' && name !== 'equalSignRegex') parser.unParsed.regex.push(name)
    parser.unParsed.column = val.column
  }
}

/*
  Match an anchored token pattern at the start of str.
  Returns null, or the match groups with the rest of the input appended:
  [fullMatch, group1, ..., groupN, rest]
*/
parser.exec = (regexDef, str) => {
  const match = regexDef.pattern.exec(str)
  if (match === null) return null
  return [...match, str.slice(match[0].length)]
}

parser.regex = regexDef => src => maybe(
  parser.exec(regexDef, src.str),
  (m, val, rest) => {
    const result = returnRest(val, src, rest, {'name': 'column', 'value': val.length})
    updateParsed(result[1], regexDef.name)
    return result
  }
)

parser.bind = (mv, mf) => input => maybe(
  mv(input),
  (val, rest) => mf(val)(rest)
)

parser.all = (...parsers) => src => {
  let rest = src
  const values = []
  for (const parser of parsers) {
    const result = parser(rest)
    if (result === null) return null
    values.push(result[0])
    rest = result[1]
  }
  return [values, rest]
}

/*
  Zero or more: apply p repeatedly until it fails. Always succeeds with
  [values, rest]. A loop rather than recursion, so long lists cannot
  overflow the stack.
*/
parser.many = p => input => {
  const values = []
  let rest = input
  for (;;) {
    const result = p(rest)
    if (result === null) return [values, rest]
    values.push(result[0])
    rest = result[1]
  }
}

parser.any = (...parsers) => (...src) => {
  for (const parser of parsers) {
    const result = parser(...src)
    if (result !== null) return result
  }
  return null
}

/* Module exports the parser object along with all its methods */
module.exports = parser
