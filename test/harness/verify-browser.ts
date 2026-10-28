// Browser integration CLI — primary empty-table leg (verify-all.ts) plus the
// TWD real-content leg (verify-twd-e2e.ts). Any leg that runs and fails fails
// the gate; legs that never ran (missing script/puppeteer/VPX) are honest
// skips, never pseudo-passes.
// Run: npx tsx test/harness/verify-browser.ts [--primary-only] [--vpx=...] [--rom=...] [--url=...] [--gpu=...]
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'
import { exitCodeToStatus, verifyBrowser } from './verify-all.js'

export { exitCodeToStatus, verifyBrowser }

/** Child exit convention (see verify-all.ts): 0 pass, 77 skipped, 1 failure. */
export function browserStatusToExitCode(status: 'pass' | 'fail' | 'skip'): number {
	return status === 'pass' ? 0 : status === 'skip' ? 77 : 1
}

type CheckStatus = 'pass' | 'fail' | 'skip'

// Forward every flag to the TWD leg except --primary-only (which stays local).
// A flag followed by a non-flag token passes through as a pair, so unknown
// --flags keep their values verbatim and new legs need no allowlist update.
export function twdArgs(argv: string[]): string[] {
	const out: string[] = []
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]
		if (token === '--primary-only') continue
		if (!token.startsWith('--')) continue
		out.push(token)
		if (!token.includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
			out.push(argv[++i])
		}
	}
	return out
}

async function runTwdLeg(extraArgs: string[]): Promise<CheckStatus> {
	const script = path.join(process.cwd(), 'test/harness/verify-twd-e2e.ts')
	if (!fs.existsSync(script)) {
		tapComment('browser/twd — leg script not found, not run')
		return 'skip'
	}
	const code = await new Promise<number>(resolve => {
		const child = spawn('npx', ['tsx', script, ...extraArgs], { stdio: 'inherit' })
		child.on('close', exitCode => resolve(exitCode ?? 1))
		child.on('error', () => resolve(1))
	})
	return exitCodeToStatus(code)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	tapHeader('browser e2e')
	const argv = process.argv.slice(2)
	const primaryOnly = argv.includes('--primary-only')
	const primary = await verifyBrowser()
	let twd: CheckStatus = 'skip'
	if (!primaryOnly) {
		tapComment('browser/twd — real-content leg (Walking Dead + ROM when present)')
		twd = await runTwdLeg(twdArgs(argv))
	}
	const ran: Array<[string, CheckStatus]> = primaryOnly
		? [['browser/primary', primary]]
		: [
				['browser/primary', primary],
				['browser/twd', twd],
			]
	tapPlan(ran.length)
	ran.forEach(([name, status], i) => {
		if (status === 'pass') tapOk(i + 1, name)
		else if (status === 'skip') tapSkip(i + 1, name, 'not run here')
		else tapNotOk(i + 1, name)
	})
	const overall: CheckStatus = ran.some(([, s]) => s === 'fail')
		? 'fail'
		: ran.some(([, s]) => s === 'pass')
			? 'pass'
			: 'skip'
	tapComment(`Result: ${overall.toUpperCase()}`)
	process.exit(browserStatusToExitCode(overall))
}
