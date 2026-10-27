// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'

function cpuCount() {
	try {
		return Math.max(1, availableParallelism())
	} catch {
		return 4
	}
}

function resolveJobs(argv) {
	let flag
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--jobs' && argv[i + 1]) flag = argv[++i]
		else if (argv[i].startsWith('--jobs=')) flag = argv[i].slice(7)
	}
	const raw = flag ?? process.env.JOBS ?? 'auto'
	if (raw === 'auto') return cpuCount()
	if (typeof raw === 'string' && raw.trim().endsWith('%')) {
		const pct = Number.parseFloat(raw) / 100
		if (Number.isFinite(pct) && pct > 0) return Math.max(1, Math.round(cpuCount() * pct))
		return cpuCount()
	}
	const n = Number.parseInt(String(raw), 10)
	return Number.isFinite(n) && n > 0 ? n : cpuCount()
}

function runOne(cmd) {
	const started = Date.now()
	console.log(`[parallel] start: ${cmd}`)
	return new Promise(resolve => {
		const child = spawn(cmd, { shell: true, stdio: 'inherit' })
		child.on('close', code => {
			const secs = ((Date.now() - started) / 1000).toFixed(1)
			console.log(`[parallel] done (${code ?? 1}, ${secs}s): ${cmd}`)
			resolve(code ?? 1)
		})
		child.on('error', err => {
			console.error(`[parallel] error: ${cmd}: ${err.message}`)
			resolve(1)
		})
	})
}

async function main() {
	const rawArgs = process.argv.slice(2)
	const dash = rawArgs.indexOf('--')
	const args = dash >= 0 ? [...rawArgs.slice(0, dash), ...rawArgs.slice(dash + 1)] : rawArgs
	const cmds = []
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--jobs' || args[i].startsWith('--jobs=')) {
			if (args[i] === '--jobs') i++
			continue
		}
		cmds.push(args[i])
	}
	if (!cmds.length) {
		console.error('Usage: node build/parallel.mjs [--jobs N|auto|50%] -- "cmd1" "cmd2"...')
		process.exit(2)
	}
	const jobs = Math.min(resolveJobs(rawArgs), cmds.length)
	console.log(`[parallel] running ${cmds.length} task(s) with --jobs=${jobs} (cpus=${cpuCount()})`)
	let next = 0
	const codes = new Array(cmds.length).fill(1)
	async function worker() {
		for (;;) {
			const i = next++
			if (i >= cmds.length) return
			codes[i] = await runOne(cmds[i])
		}
	}
	await Promise.all(Array.from({ length: jobs }, worker))
	const failed = cmds.filter((_, i) => codes[i] !== 0)
	if (failed.length) {
		console.error(`[parallel] ${failed.length}/${cmds.length} failed:`)
		for (const c of failed) console.error(`  - ${c}`)
		process.exit(1)
	}
	console.log(`[parallel] all ${cmds.length} task(s) passed`)
}

await main()
