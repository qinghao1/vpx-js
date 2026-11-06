// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Unified E2E — runs all verify-* harnesses with TAP summary.
// Exit codes: 0 all checks pass, 1 any failure (including optional checks that
// ran and failed — only checks that never ran, e.g. missing native binary,
// are reported as SKIP). Child convention: 0 pass, 77 skip, anything else fail.
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'

const SKIP_EXIT = 77

type CheckStatus = 'pass' | 'fail' | 'skip'

export function exitCodeToStatus(exitCode: number | null): CheckStatus {
	if (exitCode === 0) return 'pass'
	if (exitCode === SKIP_EXIT) return 'skip'
	return 'fail'
}

function cpuCount(): number {
	try {
		return Math.max(1, availableParallelism())
	} catch {
		return 4
	}
}

function resolveJobs(): number {
	const argv = process.argv.slice(2)
	let flag: string | undefined
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--jobs' && argv[i + 1]) flag = argv[++i]
		else if (argv[i].startsWith('--jobs=')) flag = argv[i].slice(7)
	}
	const raw = flag ?? process.env.JOBS ?? 'auto'
	if (raw === 'auto') return cpuCount()
	if (raw.trim().endsWith('%')) {
		const pct = Number.parseFloat(raw) / 100
		if (Number.isFinite(pct) && pct > 0) return Math.max(1, Math.round(cpuCount() * pct))
		return cpuCount()
	}
	const n = Number.parseInt(String(raw), 10)
	return Number.isFinite(n) && n > 0 ? n : cpuCount()
}

// Isolation: reap only child legs this process spawned (tracked PIDs), never
// pattern-match host chrome. SIGTERM first so a leg's own utils.mjs cleanup
// reaps its chrome/vite, then SIGKILL stragglers. Parallel runs must not kill
// each other — or any unrelated user process.
const _children = new Set<ReturnType<typeof spawn>>()
function trackChild(child: ReturnType<typeof spawn>): ReturnType<typeof spawn> {
	_children.add(child)
	child.on('close', () => _children.delete(child))
	return child
}
// Children spawn detached (own process group) so a kill takes the whole leg
// subtree — leg chrome, leg vite, tsx wrapper — and nothing else. Signaling
// the direct pid alone orphans grandchildren (verified with `npx vite`).
function killTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
	try {
		if (child.pid) process.kill(-child.pid, signal)
	} catch {}
	try {
		child.kill(signal)
	} catch {}
	try {
		if (child.pid) process.kill(child.pid, signal)
	} catch {}
}
async function killTracked(): Promise<void> {
	for (const c of _children) killTree(c, 'SIGTERM')
	const deadline = Date.now() + 5000
	while (_children.size > 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 100))
	for (const c of _children) killTree(c, 'SIGKILL')
	_children.clear()
}
let _shuttingDown = false
async function shutdown(code: number): Promise<void> {
	if (_shuttingDown) return
	_shuttingDown = true
	await killTracked()
	process.exit(code)
}
process.once('exit', () => {
	for (const c of _children) killTree(c, 'SIGKILL')
})
process.once('SIGINT', () => void shutdown(1))
process.once('SIGTERM', () => void shutdown(1))
process.on('uncaughtException', err => {
	console.error('[verify-all] uncaught', err)
	void shutdown(1)
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

// Browser integration — puppeteer full stack.
export async function verifyBrowser(): Promise<CheckStatus> {
	tapComment('browser — integration (viewer)')
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
			const child = trackChild(spawn('node', [script], { stdio: 'inherit', detached: true }))
			child.on('close', exitCode => resolve(exitCode ?? 1))
			child.on('error', () => resolve(1))
		})
		return exitCodeToStatus(code)
	} catch {
		return 'fail'
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
	{ name: 'table', script: 'test/harness/verify-table.ts' },
	{
		name: 'twd-render',
		script: 'test/harness/verify-twd-render.ts',
		optional: true,
		skipReason: 'VPX not available (child exit 77)',
	},
	{
		name: 'ab',
		script: 'test/harness/verify-ab.mjs',
		optional: true,
		skipReason: 'VPX/ROM or OLD worktree not provisioned (child exit 77)',
	},
	{
		name: 'cadet',
		script: 'test/harness/verify-cadet.mjs',
		optional: true,
		skipReason: 'Space Cadet VPX not provisioned (child exit 77)',
	},
	{
		name: 'pages',
		script: 'test/harness/verify-pages.mjs',
		optional: true,
		skipReason: 'engine artifact not built (child exit 77)',
	},
	{ name: 'browser', run: verifyBrowser, optional: true, skipReason: 'browser not runnable here' },
]

// Node-only checks safe for parallel spawn: script-driven, non-optional gates
// (no shared chrome/display). Derived from the gate table above so adding a
// serial (in-process `run` or optional chrome/native) leg cannot silently join
// the parallel pool.
const PARALLEL_NAMES = new Set(checks.filter(c => !c.run && !c.optional).map(c => c.name))

interface CheckResult {
	status: CheckStatus
	output: string
}

// Single spawn path: capture=false streams to the console (serial legs),
// capture=true buffers for ordered replay (parallel legs).
async function runCheck(check: E2ECheck, opts: { capture?: boolean } = {}): Promise<CheckResult> {
	if (check.run) {
		try {
			const status = await check.run()
			return { status, output: '' }
		} catch {
			return { status: 'fail', output: '' }
		}
	}
	const scriptPath = path.resolve(check.script ?? '')
	if (!fs.existsSync(scriptPath)) return { status: 'skip', output: '' }
	return new Promise(resolve => {
		const child = trackChild(
			spawn('npx', ['tsx', scriptPath], {
				stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
				detached: true,
			}),
		)
		let out = ''
		if (opts.capture) {
			child.stdout?.on('data', d => {
				out += d.toString()
			})
			child.stderr?.on('data', d => {
				out += d.toString()
			})
		}
		child.on('close', exitCode => resolve({ status: exitCodeToStatus(exitCode), output: out }))
		child.on('error', err => resolve({ status: 'fail', output: out + String(err) }))
	})
}

function report(index: number, check: E2ECheck, status: CheckStatus, passCount: { n: number }): void {
	if (status === 'pass') {
		passCount.n++
		tapOk(index + 1, check.name)
	} else if (status === 'skip') {
		if (check.optional) {
			passCount.n++
			tapSkip(index + 1, check.name, check.skipReason ?? 'not run')
		} else {
			// A required gate that never ran is a fail-fast breach, not an
			// honest skip: report not-ok so the gate fails loudly.
			tapNotOk(index + 1, check.name, '— required gate did not run')
		}
	} else if (check.optional) {
		tapNotOk(index + 1, `${check.name} (optional, ran and failed)`)
	} else {
		tapNotOk(index + 1, check.name)
	}
}

async function main(): Promise<void> {
	const jobs = Math.max(1, resolveJobs())
	const serial = process.argv.includes('--serial') || jobs === 1
	tapHeader('vpx-js E2E')
	tapPlan(checks.length)
	tapComment(`jobs=${serial ? 1 : jobs} cpus=${cpuCount()}`)
	const pass = { n: 0 }
	if (serial) {
		for (const [index, check] of checks.entries()) {
			console.log('')
			tapComment(`--- ${check.name} ---`)
			try {
				report(index, check, (await runCheck(check)).status, pass)
			} catch (err) {
				tapNotOk(index + 1, check.name, `— ${(err as Error).message}`)
			}
		}
	} else {
		const parallel = checks.filter(c => PARALLEL_NAMES.has(c.name))
		const serialTail = checks.filter(c => !PARALLEL_NAMES.has(c.name))
		const results = new Array<CheckResult | undefined>(checks.length)
		let next = 0
		async function worker(): Promise<void> {
			for (;;) {
				const i = next++
				if (i >= parallel.length) return
				const globalIndex = checks.indexOf(parallel[i])
				try {
					results[globalIndex] = await runCheck(parallel[i], { capture: true })
				} catch {
					results[globalIndex] = { status: 'fail', output: '' }
				}
			}
		}
		tapComment(`phase 1: ${parallel.length} node checks in parallel (jobs=${Math.min(jobs, parallel.length)})`)
		await Promise.all(Array.from({ length: Math.min(jobs, parallel.length) }, worker))
		for (const check of parallel) {
			const index = checks.indexOf(check)
			const r = results[index] ?? { status: 'fail' as CheckStatus, output: '' }
			console.log('')
			tapComment(`--- ${check.name} ---`)
			if (r.output) process.stdout.write(r.output.endsWith('\n') ? r.output : `${r.output}\n`)
			report(index, check, r.status, pass)
		}
		for (const check of serialTail) {
			const index = checks.indexOf(check)
			console.log('')
			tapComment(`--- ${check.name} --- (serial: shares chrome/display)`)
			try {
				report(index, check, (await runCheck(check)).status, pass)
			} catch (err) {
				tapNotOk(index + 1, check.name, `— ${(err as Error).message}`)
			}
		}
	}
	console.log('')
	tapComment(`pass ${pass.n}/${checks.length}`)
	tapComment(pass.n === checks.length ? 'Result: PASS' : 'Result: FAIL')
	process.exit(pass.n === checks.length ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main()
}
