import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const binPath = path.resolve(__dirname, '../bin/command.js')

const runCommand = (args) => {
  try {
    return execSync(`node ${binPath} ${args}`, { encoding: 'utf8' })
  } catch (err) {
    return err.stdout || err.stderr
  }
}

test('CLI: version flag', () => {
  const out = runCommand('-v')
  assert.match(out, /0\.3\.1/)
})

test('CLI: help flag', () => {
  const out = runCommand('-h')
  assert.match(out, /Usage :/)
})

test('CLI: watch functionality', async () => {
  const watchDir = path.resolve(__dirname, 'temp_watch')
  const outDir = path.resolve(__dirname, 'temp_out')

  await fs.rm(watchDir, { recursive: true, force: true }).catch(() => {})
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(watchDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  let watcher;
  try {
    watcher = spawn('node', [binPath, '-w', watchDir, '-o', outDir])

    let ready = false
    watcher.stdout.on('data', (data) => {
      if (data.toString().includes('initial scan complete')) {
        ready = true
      }
    })
    watcher.stderr.on('data', (data) => {
      console.error('Watcher Error:', data.toString())
    })

    // Wait for watcher to be ready
    for (let i = 0; i < 50; i++) {
      if (ready) break
      await new Promise(r => setTimeout(r, 100))
    }

    assert.ok(ready, 'Watcher did not report ready state')

    // Test adding a directory
    const subDir = path.join(watchDir, 'sub')
    await fs.mkdir(subDir)
    await new Promise(r => setTimeout(r, 500))

    const subDirOut = path.join(outDir, 'sub')
    let subDirStat = await fs.stat(subDirOut).catch(() => null)
    assert.ok(subDirStat && subDirStat.isDirectory(), 'Output subdirectory not created')

    // Test adding a file
    const testFile = path.join(subDir, 'test.cl')
    await fs.writeFile(testFile, 'x = 10\n')
    await new Promise(r => setTimeout(r, 1000))

    const testFileOut = path.join(subDirOut, 'test.js')
    let testFileStat = await fs.stat(testFileOut).catch(() => null)
    assert.ok(testFileStat && testFileStat.isFile(), 'Output file not created')

    // Test modifying a file
    await fs.writeFile(testFile, 'x = 20\n')
    await new Promise(r => setTimeout(r, 1000))
    const contents = await fs.readFile(testFileOut, 'utf8')
    assert.match(contents, /const x = 20/, 'Output file not updated with new contents')

    // Test removing a file
    await fs.rm(testFile)
    await new Promise(r => setTimeout(r, 1000))
    testFileStat = await fs.stat(testFileOut).catch(() => null)
    assert.strictEqual(testFileStat, null, 'Output file not removed')

    // Test removing a directory
    await fs.rm(subDir, { recursive: true, force: true })
    await new Promise(r => setTimeout(r, 1000))
    subDirStat = await fs.stat(subDirOut).catch(() => null)
    assert.strictEqual(subDirStat, null, 'Output subdirectory not removed')
  } finally {
    if (watcher) watcher.kill()
    await fs.rm(watchDir, { recursive: true, force: true }).catch(() => {})
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {})
  }
})

test('CLI: no args', () => {
  const out = runCommand('')
  assert.match(out, /Usage :/)
})

test('CLI: compile single file', async () => {
  const tempFile = path.resolve(__dirname, 'temp_single.cl')
  await fs.writeFile(tempFile, 'x = 10\n')
  
  runCommand(tempFile)
  
  const expectedOutFile = path.resolve(__dirname, 'temp_single.js')
  const outStat = await fs.stat(expectedOutFile).catch(() => null)
  assert.ok(outStat, 'Compiled output file was not created')
  
  const contents = await fs.readFile(expectedOutFile, 'utf8')
  assert.match(contents, /const x = 10/)
  
  await fs.rm(tempFile).catch(() => {})
  await fs.rm(expectedOutFile).catch(() => {})
})

test('CLI: --ast flag', async () => {
  const tempFile = path.resolve(__dirname, 'temp_ast.cl')
  await fs.writeFile(tempFile, 'x = 10\n')
  
  const out = runCommand(`${tempFile} --ast`)
  assert.match(out, /"type": "Program"/)
  
  await fs.rm(tempFile).catch(() => {})
})

test('CLI: -t flag (disable type inference)', async () => {
  const tempFile = path.resolve(__dirname, 'temp_type.cl')
  await fs.writeFile(tempFile, 'x = 10\n')
  
  const expectedOutFile = path.resolve(__dirname, 'temp_type_out.js')
  const out = runCommand(`${tempFile} -t -o ${expectedOutFile}`)
  
  const outStat = await fs.stat(expectedOutFile).catch(() => null)
  assert.ok(outStat, `Compiled output file was not created. Output: ${out}`)
  
  await fs.rm(tempFile).catch(() => {})
  await fs.rm(expectedOutFile).catch(() => {})
})
