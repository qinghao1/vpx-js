// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Unified E2E — runs all verify-* harnesses serially with a TAP summary.
// Exit codes: 0 all checks pass, 1 any failure (including optional checks that
// ran and failed — only checks that never ran, e.g. missing VPX/ROM/engine
// artifact, are reported as SKIP). Child convention: 0 pass, 77 skip,
// anything else fail.
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'

const SKIP_EXIT = 77

type CheckStatus = 'pass' | 'fail' | 'skip'

export function exitCodeToStatus(exitCode: number | null): CheckStatus {
	if (exitCode === 0) return 'pass'
	if (exitCode === SKIP_EXIT) return 'skip'
	return 'fail'
}

interface E2ECheck {
	name: string
	script: string
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
		name: 'headless',
		script: 'test/harness/verify-headless.mjs',
		optional: true,
		skipReason: 'engine artifact not built (child exit 77)',
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
	{
		name: 'browser',
		script: 'demo-browser/e2e/integration.mjs',
		optional: true,
		skipReason: 'browser not runnable here (child exit 77)',
	},
]

// Legs run in this process's children only. Each leg serves its own vite
// in-process and launches piped chrome, so both die with the leg —
// signaling the direct child suffices, no detached process groups.
const _children = new Set<ReturnType<typeof spawn>>()

async function runCheck(check: E2ECheck): Promise<CheckStatus> {
	const scriptPath = path.resolve(check.script)
	if (!fs.existsSync(scriptPath)) return 'skip'
	return new Promise(resolve => {
		const child = spawn(process.execPath, ['--import', 'tsx', scriptPath], { stdio: 'inherit' })
		_children.add(child)
		child.on('close', exitCode => {
			_children.delete(child)
			resolve(exitCodeToStatus(exitCode))
		})
		child.on('error', err => {
			_children.delete(child)
			tapComment(`${check.name} spawn error: ${(err as Error).message}`)
			resolve('fail')
		})
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
	let shuttingDown = false
	const shutdown = async (code: number): Promise<void> => {
		if (shuttingDown) return
		shuttingDown = true
		for (const c of _children) {
			try {
				c.kill('SIGTERM')
			} catch {}
		}
		const deadline = Date.now() + 5000
		while (_children.size > 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 100))
		for (const c of _children) {
			try {
				c.kill('SIGKILL')
			} catch {}
		}
		_children.clear()
		process.exit(code)
	}
	process.once('exit', () => {
		for (const c of _children) {
			try {
				c.kill('SIGKILL')
			} catch {}
		}
	})
	process.once('SIGINT', () => void shutdown(1))
	process.once('SIGTERM', () => void shutdown(1))
	process.on('uncaughtException', err => {
		console.error('[verify-all] uncaught', err)
		void shutdown(1)
	})
	tapHeader('vpx-js E2E')
	tapPlan(checks.length)
	const pass = { n: 0 }
	for (const [index, check] of checks.entries()) {
		console.log('')
		tapComment(`--- ${check.name} ---`)
		try {
			report(index, check, await runCheck(check), pass)
		} catch (err) {
			tapNotOk(index + 1, check.name, `— ${(err as Error).message}`)
		}
	}
	console.log('')
	tapComment(`pass ${pass.n}/${checks.length}`)
	tapComment(pass.n === checks.length ? 'Result: PASS' : 'Result: FAIL')
	process.exit(pass.n === checks.length ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	await main()
}
