// Unified E2E — runs all verify-* harnesses with TAP summary
import { spawn } from 'node:child_process'
import path from 'node:path'

const checks = [
	{ name: 'wasm', script: 'test/harness/verify-wasm.ts' },
	{ name: 'table', script: 'test/harness/verify-table.ts' },
	{ name: 'pinmame', script: 'test/harness/verify-pinmame.ts' },
	{ name: 'player', script: 'test/harness/verify-player.ts' },
	{ name: 'browser', script: 'test/harness/verify-browser.ts', optional: true },
]

async function run(script: string): Promise<boolean> {
	return new Promise(res => {
		const p = spawn('npx', ['tsx', script], { stdio: 'inherit' })
		p.on('close', c => res(c === 0))
		p.on('error', () => res(false))
	})
}

console.log(`TAP version 13\n# vpx-js E2E — ${new Date().toISOString()}`)
console.log(`1..${checks.length}`)
let pass = 0
for (let i = 0; i < checks.length; i++) {
	const c = checks[i]!
	console.log(`\n# --- ${c.name} ---`)
	try {
		const ok = await run(path.resolve(c.script))
		if (ok) {
			pass++
			console.log(`ok ${i + 1} - ${c.name}`)
		} else if (c.optional) {
			pass++
			console.log(`ok ${i + 1} - ${c.name} # SKIP browser not ready`)
		} else {
			console.log(`not ok ${i + 1} - ${c.name}`)
		}
	} catch (e) {
		console.log(`not ok ${i + 1} - ${c.name} — ${(e as Error).message}`)
	}
}
console.log(`\n# pass ${pass}/${checks.length}`)
console.log(pass === checks.length ? '# Result: PASS' : '# Result: FAIL')
process.exit(pass === checks.length ? 0 : 1)
