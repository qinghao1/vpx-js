// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Unified E2E: runs every verify leg in order and prints one TAP summary.
// Child convention: exit 0 pass, 77 skip (prerequisite missing), anything else
// fail. Required legs fail on a skip; optional legs report it as SKIP.
// Exit: 0 when every leg passed or honestly skipped, 1 otherwise.
import { type ChildProcess, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'

const SKIP_EXIT = 77

type CheckStatus = 'pass' | 'fail' | 'skip'

function exitCodeToStatus(exitCode: number | null): CheckStatus {
	if (exitCode === 0) return 'pass'
	if (exitCode === SKIP_EXIT) return 'skip'
	return 'fail'
}

interface Check {
	name: string
	script: string
	/** Why a skip is honest; absent for required legs. */
	skipReason?: string
}

const checks: Check[] = [
	{ name: 'table', script: 'test/harness/verify-table.ts' },
	{ name: 'play-room', script: 'test/harness/verify-play-room.ts' },
	{ name: 'headless', script: 'test/harness/verify-headless.mjs', skipReason: 'engine artifact or Chrome missing' },
	{ name: 'twd-render', script: 'test/harness/verify-twd-render.ts', skipReason: 'Walking Dead VPX not found' },
	{
		name: 'ab',
		script: 'test/harness/verify-ab.mjs',
		skipReason: 'VPX/ROM or OLD worktree not provisioned (child exit 77)',
	},
	{ name: 'cadet', script: 'test/harness/verify-cadet.mjs', skipReason: 'Space Cadet VPX not found' },
	{ name: 'pages', script: 'test/harness/verify-pages.mjs', skipReason: 'engine artifact or Chrome missing' },
	{ name: 'browser', script: 'demo-browser/e2e/integration.mjs', skipReason: 'engine artifact or Chrome missing' },
]

let current: ChildProcess | undefined

function run(script: string): Promise<CheckStatus> {
	const loader = script.endsWith('.ts') ? ['--import', 'tsx'] : []
	return new Promise(resolve => {
		const child = spawn(process.execPath, [...loader, script], { stdio: 'inherit' })
		current = child
		child.once('error', () => resolve('fail'))
		child.once('close', code => {
			current = undefined
			resolve(exitCodeToStatus(code))
		})
	})
}

async function main(): Promise<void> {
	// Ctrl-C reaches the running leg too (same process group), and each leg
	// tears down its own browser and server. Forward the signal for a kill
	// aimed at this process alone, then wait for the leg to finish.
	let interrupted = false
	for (const signal of ['SIGINT', 'SIGTERM'] as const)
		process.on(signal, () => {
			interrupted = true
			current?.kill(signal)
		})
	tapHeader('vpx-js E2E')
	tapPlan(checks.length)
	let failed = 0
	for (const [index, check] of checks.entries()) {
		if (interrupted) break
		console.log('')
		tapComment(`--- ${check.name} ---`)
		const status = await run(check.script)
		if (status === 'pass') tapOk(index + 1, check.name)
		else if (status === 'skip' && check.skipReason) tapSkip(index + 1, check.name, check.skipReason)
		else {
			failed++
			tapNotOk(index + 1, check.name, status === 'skip' ? '— required leg skipped' : undefined)
		}
	}
	console.log('')
	tapComment(interrupted ? 'Result: INTERRUPTED' : failed ? `Result: FAIL (${failed})` : 'Result: PASS')
	process.exit(interrupted ? 130 : failed ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
