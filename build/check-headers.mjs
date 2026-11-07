// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Every tracked source file starts with its GPL copyright line(s) (AGENTS.md).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sources = execFileSync(
	'git',
	['ls-files', '*.ts', '*.js', '*.mjs', '*.mts', '*.cts', ':!external', ':!demo-browser/public/wasm'],
	{ encoding: 'utf8' },
)
	.split('\n')
	.filter(Boolean)
const missing = sources.filter(file => !readFileSync(file, 'utf8').startsWith('// Copyright'))
for (const file of missing) console.error(`missing copyright header: ${file}`)
process.exitCode = missing.length > 0 ? 1 : 0
