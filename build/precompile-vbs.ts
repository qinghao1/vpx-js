// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Player } from '../lib/game/player.js'
import { NodeBinaryReader } from '../lib/io/binary-reader.node.js'
import { Transpiler } from '../lib/scripting/transpiler.js'
import { getTableDataForWorker, cacheKey as workerCacheKey } from '../lib/scripting/transpiler-worker-pool.js'
import { vbsCacheKey } from '../lib/util/idb-cache.js'
import { Table } from '../lib/vpt/table/table.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function hashStr(s: string): string {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
	return (h >>> 0).toString(36)
}

function tableHashForTranspiler(table: Table): string {
	try {
		const els = Object.keys((table as any).getElements?.() ?? {})
			.sort()
			.join(',')
		return hashStr(els)
	} catch {
		return 'notable'
	}
}

function parseCliVpxArgs(argv: string[]): string[] {
	const out: string[] = []
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i]
		if (a.startsWith('--vpx=')) out.push(a.slice(6))
		else if (a === '--vpx' && argv[i + 1]) out.push(argv[++i])
		else if (a.endsWith('.vpx')) out.push(a)
	}
	return out
}

function discoverVpxFiles(): string[] {
	const cliFiles = parseCliVpxArgs(process.argv).filter(p => existsSync(p))
	if (cliFiles.length) return cliFiles
	try {
		const env = process.env.VPX_PRECOMPILE
		if (env) {
			const envFiles = env.split(':').filter(p => p && existsSync(p))
			if (envFiles.length) return [...new Set(envFiles)]
		}
	} catch {}
	const scanDirs = [join(repoRoot, 'test/fixtures'), join(repoRoot, 'demo-browser/public')]
	const found: string[] = []
	for (const dir of scanDirs) {
		try {
			for (const f of readdirSync(dir)) if (f.endsWith('.vpx')) found.push(join(dir, f))
		} catch {}
	}
	return [...new Set(found)]
}

async function precompileOne(vpxPath: string): Promise<{ keys: string[]; out: string } | null> {
	if (!existsSync(vpxPath)) return null
	try {
		if (statSync(vpxPath).size < 1024) return null
	} catch {
		return null
	}
	const reader = new NodeBinaryReader(vpxPath)
	let table: Table
	try {
		table = await Table.load(reader, { skipTextures: true })
	} catch (e) {
		console.warn(`[precompile] failed to load ${vpxPath}: ${(e as Error).message}`)
		try {
			await (reader as any).release?.()
		} catch {}
		return null
	}
	try {
		await (reader as any).release?.()
	} catch {}
	try {
		await reader.close()
	} catch {}
	const script = (table as any).tableScript as string | undefined
	if (!script || script.length < 500) {
		console.log(`[precompile] skip ${basename(vpxPath)} — no script (${script?.length ?? 0})`)
		return null
	}
	let js: string
	const keys: string[] = []
	try {
		const player = new Player(table as any)
		const transpiler = new Transpiler(table as any, player as any)
		js = transpiler.transpile(script, 'play', 'globalThis')
		const syncKey = `${vbsCacheKey(script)}:${tableHashForTranspiler(table)}:play:globalThis`
		keys.push(syncKey)
		try {
			const td = getTableDataForWorker(table as any, player as any)
			const wk = workerCacheKey(script, 'play', 'globalThis', td)
			if (wk !== syncKey) keys.push(wk)
		} catch {}
	} catch (e) {
		console.warn(`[precompile] transpile failed ${basename(vpxPath)}: ${(e as Error).message}`)
		return null
	}
	return { keys, out: js }
}

async function main() {
	const vpxFiles = discoverVpxFiles()
	if (!vpxFiles.length) {
		console.log(
			'[precompile] no VPX files found — skipping (generic: pass --vpx=/path/to/table.vpx or place .vpx in test/fixtures or demo-browser/public)',
		)
		return
	}
	console.log(`[precompile] found ${vpxFiles.length} VPX file(s)`)
	const outputs: Array<{ src: string; keys: string[]; js: string }> = []
	for (const vpx of vpxFiles) {
		const res = await precompileOne(vpx)
		if (!res) continue
		outputs.push({ src: vpx, keys: res.keys, js: res.out })
		console.log(
			`[precompile] ${basename(vpx)} → ${res.keys[0].slice(0, 40)}... (${res.keys.length} keys) ${(res.out.length / 1024).toFixed(1)} KB`,
		)
	}
	if (!outputs.length) {
		console.log('[precompile] nothing to write')
		return
	}
	const targets = [
		join(repoRoot, 'dist/precompiled'),
		join(repoRoot, 'dist-esm/precompiled'),
		join(repoRoot, 'demo-browser/public/precompiled'),
	]
	for (const dir of targets) mkdirSync(dir, { recursive: true })
	for (const { keys, js } of outputs) {
		for (const key of keys) {
			for (const dir of targets) {
				const file = join(dir, `${key}.js`)
				writeFileSync(file, js, 'utf-8')
			}
		}
	}
	const manifest = Object.fromEntries(outputs.map(o => [basename(o.src), o.keys[0]]))
	for (const dir of targets) {
		const mf = join(dir, 'manifest.json')
		try {
			writeFileSync(mf, JSON.stringify(manifest, null, 2), 'utf-8')
		} catch {}
	}
	console.log(
		`[precompile] wrote ${outputs.length} table(s) ${outputs.flatMap(o => o.keys).length} keys to ${targets.join(', ')}`,
	)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
