// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
/**
 * Regression: ball not appearing on Walking Dead (transpiler worker `process is not defined`).
 * Browser worker must polyfill Node globals before dynamically importing transpiler-worker-core.
 * See fix for lib/scripting/transpiler.worker.browser.ts lazy import + globalThis.process.
 */
import * as fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import { Transpiler } from './transpiler.js'
import { transpileInWorker } from './transpiler-worker-core.js'
import { getTableDataForWorker } from './transpiler-worker-pool.js'

describe('regression: transpiler browser worker must polyfill process (ball missing)', () => {
	it('browser worker source must polyfill process/global before lazy import', () => {
		const src = fs.readFileSync('lib/scripting/transpiler.worker.browser.ts', 'utf-8')
		expect(src, 'must polyfill globalThis.process').toContain('(globalThis as any).process')
		expect(src, 'must polyfill self.process').toContain('(self as any).process')
		expect(src, 'must polyfill self.global').toContain('(self as any).global')
		expect(src, 'must provide env/cwd/nextTick/on').toContain('nextTick')
		// polyfill must appear before core import
		const polyIdx = src.indexOf('(globalThis as any).process')
		const coreIdx = src.indexOf('transpiler-worker-core')
		expect(polyIdx, 'polyfill before core import').toBeGreaterThan(-1)
		expect(coreIdx, 'core import present').toBeGreaterThan(-1)
		expect(polyIdx).toBeLessThan(coreIdx)
		// must be lazy import inside onmessage, not static top-level import
		expect(src, 'must not have static top-level import of transpiler-core').not.toMatch(
			/^import\s+.*from\s+['"]\.\/transpiler-worker-core\.js['"]/m,
		)
		expect(src, 'must lazy import inside onmessage').toContain("await import('./transpiler-worker-core.js')")
		expect(src, 'must use let transpileInWorker lazy binding').toContain('let transpileInWorker')
		expect(src, 'must cache transpileInWorker').toContain('if (!transpileInWorker)')
	})

	it('dist-esm browser worker must contain polyfill', () => {
		const src = fs.readFileSync('dist-esm/lib/scripting/transpiler.worker.browser.js', 'utf-8')
		expect(src).toContain('globalThis.process')
		expect(src).toContain('transpiler-worker-core')
	})

	it('transpiler core must handle Walking Dead-like script without process global (worker parity)', async () => {
		// This script uses typical Walking Dead patterns (collections, timers) that previously
		// failed when worker threw `process is not defined` and left player with 0 balls.
		const table = new TableBuilder().addFlipper('Flipper1').addKicker('Kicker1', 500, 500).build()
		const player = new Player(table)
		const vbs = `
			Sub Table1_Init()
				Flipper1.TimerEnabled = 1
			End Sub
			Sub Flipper1_Timer()
				Dim x : x = Flipper1.Y
			End Sub
		`
		const td = getTableDataForWorker(table, player)
		const viaCore = await transpileInWorker({
			vbs,
			globalFunction: 'init',
			globalObject: 'global',
			tableData: td,
		})
		const sync = new Transpiler(table, player).transpile(vbs, 'init', 'global')
		expect(viaCore).toEqual(sync)
		expect(viaCore, 'transpiled must contain TimerEnabled').toContain('TimerEnabled')
	})

	it('transpiler worker pool must still use browser worker .js (not fallback)', () => {
		const src = fs.readFileSync('lib/scripting/transpiler-worker-pool.ts', 'utf-8')
		expect(src).toContain('transpiler.worker.browser.js')
		// ensure pool does not fallback to sync transpile (old bug would hide worker failure and ball missing)
		expect(src, 'pool must throw if worker unavailable').toContain('transpiler worker not available')
	})

	it('player must log stack on table script failure (diagnostics for ball missing)', () => {
		const src = fs.readFileSync('lib/game/player.ts', 'utf-8')
		expect(src).toContain("Table script failed %s\\n%s")
		expect(src).toContain('Error).stack')
	})
})
