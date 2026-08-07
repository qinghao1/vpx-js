const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')
const timestamp = Date.now()
let version = '2.0.0'
try {
	version = require('../package.json').version
} catch {}
let gitHash = 'unknown'
let gitBranch = 'unknown'
try {
	gitHash = childProcess.execSync('git rev-parse --short HEAD').toString().trim()
} catch {}
try {
	gitBranch = childProcess.execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
} catch {}
const targetFile = path.join(__dirname, '..', 'dist', 'build.json')
try {
	fs.mkdirSync(path.dirname(targetFile), { recursive: true })
} catch {}
const buildInformation = { version, timestamp, gitHash, gitBranch }
fs.writeFileSync(targetFile, JSON.stringify(buildInformation))
console.log(`Wrote ${targetFile}`)
