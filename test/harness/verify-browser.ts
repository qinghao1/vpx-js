// Browser integration CLI — primary empty-table leg (verify-all.ts) plus the
// TWD real-content leg (verify-twd-e2e.ts). Any leg that runs and fails fails
// the gate; legs that never ran (missing script/puppeteer/VPX) are honest
// skips, never pseudo-passes.
// Run: npx tsx test/harness/verify-browser.ts [--primary-only] [--vpx=...] [--rom=...] [--url=...] [--gpu=...]
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'
import { verifyBrowser } from './verify-all.js'

export { verifyBrowser }

/** Child exit convention (see verify-all.ts): 0 pass, 77 skipped, 1 failure. */
export function browserStatusToExitCode(status: 'pass' | 'fail' | 'skip'): number {
	return status === 'pass' ? 0 : status === 'skip' ? 77 : 1
}

type CheckStatus = 'pass' | 'fail' | 'skip'

function exitCodeToStatus(exitCode: number | null): CheckStatus {
	if (exitCode === 0) return 'pass'
	if (exitCode === 77) return 'skip'
	return 'fail'
}

// Forward only TWD-leg addressing args (both --flag=value and --flag value);
// --primary-only stays local.
function twdArgs(argv: string[]): string[] {
	const out: string[] = []
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]
		if (
			token.startsWith('--vpx=') ||
			token.startsWith('--rom=') ||
			token.startsWith('--url=') ||
			token.startsWith('--gpu=') ||
			token === '--gpu'
		) {
			out.push(token)
		} else if ((token === '--vpx' || token === '--rom' || token === '--url') && argv[i + 1]) {
			out.push(token, argv[++i])
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
