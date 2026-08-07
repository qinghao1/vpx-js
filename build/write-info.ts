import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
const timestamp = Date.now()
const version: string = pkg.version
let gitHash = 'unknown'
let gitBranch = 'unknown'
try {
	gitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {}
try {
	gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
} catch {}
const targetFile = join(__dirname, '..', 'dist', 'build.json')
mkdirSync(dirname(targetFile), { recursive: true })
const buildInformation = { version, timestamp, gitHash, gitBranch }
writeFileSync(targetFile, JSON.stringify(buildInformation))
console.log(`Wrote ${targetFile}`)
