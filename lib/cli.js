const fs = require('fs')
const escodegen = require('escodegen')
const includeParser = require('./basicParsers').includeParser
const parser = require('./parser').programParser
const childProcess = require('child_process')
const inferTypes = require('./typeInference')
const path = require('path')
const version = require(path.join(__dirname, '../package.json')).version
const help = `
  Usage :
  clean <filename.cl>                     Compile and run <filename.cl>
  clean <filename.cl> -o <outputFile.js>  Compiles result to <outputFile.js>
  clean -v                                Version
  clean <filename.cl> --ast               Output AST to the the console
  clean <filename.cl> -t                  Disable type inference

clean@${version}`

const format = {
  indent: {
    style: '  ',
    base: 0,
    adjustMultilineComment: false
  },
  newline: '\n',
  space: ' ',
  json: false,
  renumber: false,
  hexadecimal: false,
  quotes: 'single',
  escapeless: false,
  compact: false,
  parentheses: true,
  semicolons: false,
  safeConcatenation: false
}

const showAndExit = str => {
  console.log(str)
  process.exit()
}

const makeErrStr = (obj, infile) => {
  const strLen = obj.str.length - 1
  const whatErr = `Syntax Error at\n\n${obj.str}\n`
  const whereErr = ' '.repeat(strLen < 0 ? 0 : strLen) + '^'
  const errMsg = `\n ...at line: ${obj.line} column: ${obj.column} msg: ${obj.msg} in ${infile}\n`
  return whatErr + whereErr + errMsg
}

const readSource = infile => {
  if (!fs.existsSync(infile)) showAndExit(`Error: File '${infile}' does not exist.`)
  return {
    'str': fs.readFileSync(infile, 'utf8').toString(),
    'line': 1,
    'column': 0
  }
}

const resolveImports = input => {
  const parseResult = includeParser(input)
  if (parseResult === null) return { importCore: '', input }

  const [libName, newInput] = parseResult
  const importPath = path.join(__dirname, '/include/')
  let importCore = fs.readFileSync(importPath + 'core.js', 'utf8').toString() +
                   fs.readFileSync(importPath + libName + '.js', 'utf8').toString() + '\n'.repeat(2)
  importCore += (libName === 'node-core' ? 'global.IO = IO' : 'window.IO = IO') + '\n'.repeat(2)
  return { importCore, input: newInput }
}

const compile = (input, argsObj, infile) => {
  const tree = parser(input)
  if (tree.error) showAndExit(makeErrStr(tree, infile))
  if (argsObj.ast) showAndExit(JSON.stringify(tree, null, 2))
  
  const maybeTypeErr = argsObj.t ? tree.body : inferTypes(tree.body)
  if (maybeTypeErr.error) showAndExit(JSON.stringify(maybeTypeErr))
  
  return escodegen.generate(tree, { format, comment: true })
}

const writeOutput = (outfile, importCore, outCode) => {
  fs.writeFileSync(outfile, importCore + outCode + '\n', 'utf8')
}

const executeOutput = (outfile, argsObj) => {
  const commandLineArgs = argsObj._.slice(1)
  if (!argsObj.o) {
    const mayBeCliArgs = commandLineArgs.length > 0 ? ' ' + commandLineArgs.join(' ') : ''
    childProcess.execSync('node ' + outfile + mayBeCliArgs, { stdio: 'inherit' })
  }
}

const evalFunction = (argsObj, infile, outfile) => {
  const sourceInput = readSource(infile)
  const { importCore, input } = resolveImports(sourceInput)
  const compiledCode = compile(input, argsObj, infile)
  writeOutput(outfile, importCore, compiledCode)
  executeOutput(outfile, argsObj)
}

const makeDir = folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder)
  }
}

const rmvFile = file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file)
  }
}

const fileWatcher = (argsObj, outfile, changedInpfile, watchBase) => {
  const infilePathObj = path.parse(changedInpfile)
  if (infilePathObj.ext === '.cl') {
    const infilePath = path.join(infilePathObj.dir, infilePathObj.base)
    const subFolder = path.relative(watchBase, infilePathObj.dir)
    const outfolderPath = path.join(outfile, subFolder)
    makeDir(outfolderPath)
    const outfilePath = path.join(outfolderPath, `${infilePathObj.name}.js`)
    evalFunction(argsObj, infilePath, outfilePath)
  }
}

const createFolder = (outfile, changedInpfolder, watchBase) => {
  const subFolder = path.relative(watchBase, changedInpfolder)
  const outFolder = path.join(outfile, subFolder)
  makeDir(outFolder)
}

const rmvDir = (outFolder) => {
  if (fs.existsSync(outFolder)) {
    fs.readdirSync(outFolder).forEach(function (file, _index) {
      const curPath = outFolder + '/' + file
      if (fs.lstatSync(curPath).isDirectory()) {
        rmvDir(curPath)
      } else {
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(outFolder)
  }
}

const removeFolder = (outfile, changedInpfolder, watchBase) => {
  const subFolder = path.relative(watchBase, changedInpfolder)
  const outFolder = path.join(outfile, subFolder)
  rmvDir(outFolder)
}

const removeFile = (outfile, changedInpfile, watchBase) => {
  const rmvfilePathObj = path.parse(changedInpfile)
  if (rmvfilePathObj.ext === '.cl') {
    const subFolder = path.relative(watchBase, rmvfilePathObj.dir)
    const outfilePath = path.join(outfile, subFolder, `${rmvfilePathObj.name}.js`)
    rmvFile(outfilePath)
  }
}

const scanInitial = async (dir, argsObj, outfile, watchBase) => {
  if (!fs.existsSync(dir)) return
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      createFolder(outfile, fullPath, watchBase)
      await scanInitial(fullPath, argsObj, outfile, watchBase)
    } else if (dirent.isFile()) {
      fileWatcher(argsObj, outfile, fullPath, watchBase)
    }
  }
}

const startWatcher = async (watchFolder, argsObj, outfile, watchBase) => {
  await scanInitial(watchFolder, argsObj, outfile, watchBase)
  console.log('initial scan complete && fs.watch Watching files')
  
  const ac = new AbortController()
  const watcher = fs.promises.watch(watchFolder, { recursive: true, signal: ac.signal })
  
  try {
    for await (const event of watcher) {
      if (!event.filename) continue
      const fullPath = path.join(watchBase, event.filename)
      const exists = fs.existsSync(fullPath)
      
      if (event.eventType === 'rename') {
        if (exists) {
          if (fs.lstatSync(fullPath).isDirectory()) {
            createFolder(outfile, fullPath, watchBase)
          } else {
            fileWatcher(argsObj, outfile, fullPath, watchBase)
          }
        } else {
          removeFile(outfile, fullPath, watchBase)
          removeFolder(outfile, fullPath, watchBase)
        }
      } else if (event.eventType === 'change') {
        if (exists && !fs.lstatSync(fullPath).isDirectory()) {
          fileWatcher(argsObj, outfile, fullPath, watchBase)
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return
    console.error('Watcher error:', err)
  }
}

module.exports = argsObj => {
  if (argsObj.v) showAndExit(version)
  if (argsObj.h || argsObj.help) showAndExit(help)
  const infile = argsObj._[0]
  const watchFolder = argsObj.w
  if (!infile && !watchFolder) showAndExit(help)
  const outfile = argsObj.o || (infile ? infile.replace(/\.cl$/, '.js') : undefined)

  if (infile) evalFunction(argsObj, infile, outfile)

  if (watchFolder) {
    const watchBase = path.resolve(watchFolder)
    startWatcher(watchFolder, argsObj, outfile, watchBase)
  }
}
