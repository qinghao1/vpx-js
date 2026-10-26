// Unified E2E — runs all verify-* harnesses with TAP summary.
// Exit codes: 0 all checks pass, 1 any failure (including optional checks that
// ran and failed — only checks that never ran, e.g. missing native binary,
// are reported as SKIP). Child convention: 0 pass, 77 skip, anything else fail.
import { execSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'

const SKIP_EXIT = 77

type CheckStatus = 'pass' | 'fail' | 'skip'

function exitCodeToStatus(exitCode: number | null): CheckStatus {
	if (exitCode === 0) return 'pass'
	if (exitCode === SKIP_EXIT) return 'skip'
	return 'fail'
}

const killStale = () => {
	try {
		execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', { timeout: 2000, stdio: 'ignore' })
	} catch {}
}
process.once('exit', killStale)
process.once('SIGINT', killStale)
process.once('SIGTERM', killStale)
process.on('uncaughtException', err => {
	console.error('[verify-all] uncaught', err)
	killStale()
	process.exit(1)
})

async function puppeteerAvailable(): Promise<boolean> {
	// Shared probe: utils.mjs loadPuppeteer tries 'puppeteer-core' then 'puppeteer'.
	try {
		const utils: any = await import('./utils.mjs')
		await utils.loadPuppeteer()
		return true
	} catch {
		return false
	}
}

// Browser integration — puppeteer full stack (folded in from verify-browser.ts).
export async function verifyBrowser(): Promise<CheckStatus> {
	tapComment('browser — integration (viewer + physics + DMD)')
	const script = path.join(process.cwd(), 'demo-browser/e2e/integration.mjs')
	if (!fs.existsSync(script)) {
		tapComment('browser — integration script not found, not run')
		return 'skip'
	}
	if (!(await puppeteerAvailable())) {
		tapComment('browser — puppeteer not installed, not run')
		return 'skip'
	}
	try {
		const code = await new Promise<number>(resolve => {
			const child = spawn('node', [script], { stdio: 'inherit' })
			child.on('close', exitCode => resolve(exitCode ?? 1))
			child.on('error', () => resolve(1))
			child.on('close', killStale)
		})
		return exitCodeToStatus(code)
	} catch {
		return 'fail'
	} finally {
		killStale()
	}
}

interface E2ECheck {
	name: string
	script?: string
	run?: () => Promise<CheckStatus>
	optional?: boolean
	skipReason?: string
}

const checks: E2ECheck[] = [
	{ name: 'wasm', script: 'test/harness/verify-wasm.ts' },
	{ name: 'table', script: 'test/harness/verify-table.ts' },
	{ name: 'pinmame', script: 'test/harness/verify-pinmame.ts' },
	{ name: 'player', script: 'test/harness/verify-player.ts' },
	{ name: 'gameplay', script: 'test/harness/harness-gameplay.ts' },
	{ name: 'play-room', script: 'test/harness/verify-play-room.ts' },
	{ name: 'browser', run: verifyBrowser, optional: true, skipReason: 'browser not runnable here' },
	{
		name: 'vpinball-compat',
		script: 'test/harness/verify-vpinball-compat.ts',
		optional: true,
		skipReason: 'native vpinball not found',
	},
	{
		name: 'discrepancies',
		script: 'test/harness/capture-discrepancies.ts',
		optional: true,
		skipReason: 'discrepancies gate skipped by child',
	},
	{
		name: 'twd-render',
		script: 'test/harness/verify-twd-render.ts',
		optional: true,
		skipReason: 'VPX not available (child exit 77)',
	},
]

async function runCheck(check: E2ECheck): Promise<CheckStatus> {
	if (check.run) {
		try {
			return await check.run()
		} catch {
			return 'fail'
		}
	}
	const scriptPath = path.resolve(check.script ?? '')
	if (!fs.existsSync(scriptPath)) return 'skip'
	return new Promise(resolve => {
		const child = spawn('npx', ['tsx', scriptPath], { stdio: 'inherit' })
		child.on('close', exitCode => resolve(exitCodeToStatus(exitCode)))
		child.on('error', () => resolve('fail'))
	})
}

async function main(): Promise<void> {
	tapHeader('vpx-js E2E')
	tapPlan(checks.length)
	let pass = 0
	for (const [index, check] of checks.entries()) {
		console.log('')
		tapComment(`--- ${check.name} ---`)
		try {
			const status = await runCheck(check)
			if (status === 'pass') {
				pass++
				tapOk(index + 1, check.name)
			} else if (status === 'skip') {
				if (check.optional) {
					// Not run (missing prerequisite) — the only honest SKIP.
					pass++
					tapSkip(index + 1, check.name, check.skipReason ?? 'not run')
				} else {
					// A required gate that never ran cannot pass.
					tapSkip(index + 1, check.name, 'required gate did not run')
				}
			} else if (check.optional) {
				// Ran and failed: optional softens nothing — report the failure.
				tapNotOk(index + 1, `${check.name} (optional, ran and failed)`)
			} else {
				tapNotOk(index + 1, check.name)
			}
		} catch (err) {
			tapNotOk(index + 1, check.name, `— ${(err as Error).message}`)
		}
	}
	console.log('')
	tapComment(`pass ${pass}/${checks.length}`)
	tapComment(pass === checks.length ? 'Result: PASS' : 'Result: FAIL')
	killStale()
	process.exit(pass === checks.length ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main()
}
