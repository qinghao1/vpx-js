// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { execSync } from 'node:child_process'

const files = execSync("git ls-files | grep -E '^(lib|demo-browser/src|test)/.*\\.(ts|js|mjs|mts|cts)$'", {
	encoding: 'utf8',
})
	.split('\n')
	.filter(Boolean)
const missing = files.filter(f => {
	const first = execSync(`head -1 ${JSON.stringify(f)}`, { encoding: 'utf8' })
	return !first.startsWith('// Copyright')
})
if (missing.length > 0) {
	for (const f of missing) console.error(`missing copyright header: ${f}`)
	process.exit(1)
}
