import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const fs = require('fs')
const path = require('path')

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* lib files */
const base = require('../lib/basicParsers')
const parser = require('../lib/parser').programParser
const typeInfer = require('../lib/typeInference')

/* test and assert files */
const [srcFiles, assertFiles] = [path.join(__dirname, '/src'), path.join(__dirname, '/assert')]

const initObj = (input, line = 1, column = 0) => ({str: input, line, column})

const generateTree = input => {
  const parseResult = base.includeParser(input)
  let rest = input
  if (parseResult !== null) {
    [, rest] = parseResult
  }
  const tree = parser(rest)
  if (tree.error) return tree
  const newTree = typeInfer(tree.body)
  if (newTree.error) return newTree
  tree.body = newTree
  return tree
}

const readFileContent = file => fs.readFileSync(file, 'utf8')

describe('sourceFiles', () => {
  const searchAndTest = (tests, assert_) => {
    if (fs.existsSync(tests)) {
      fs.readdirSync(tests).forEach(function (file, index) {
        const curPath = path.join(tests, '/', file)
        const pathParse = path.parse(curPath)
        if (fs.lstatSync(curPath).isDirectory()) {
          searchAndTest(curPath, path.join(assert_, '/', file))
        } else if (pathParse.ext === '.cl') {
          const input = initObj(readFileContent(path.join(pathParse.dir, `${pathParse.name}.cl`)))
          const assertJson = path.join(assert_, `${pathParse.name}.json`)
          const jsonValue = require(assertJson)
          const tree = generateTree(input)
          test(file, () => {
            assert.deepStrictEqual(tree, jsonValue)
          })
        }
      })
    }
  }
  searchAndTest(srcFiles, assertFiles)
})
