const { parseArgs } = require('node:util')
const cli = require('./cli')

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    v: { type: 'boolean', default: false },
    h: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
    o: { type: 'string' },
    w: { type: 'string' },
    ast: { type: 'boolean', default: false },
    t: { type: 'boolean', default: false }
  },
  allowPositionals: true,
  strict: false
})

// Build argv object matching the shape cli.js expects
const argv = { ...values, _: positionals }
cli(argv)
