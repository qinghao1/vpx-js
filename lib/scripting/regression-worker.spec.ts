import * as fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import { Transpiler } from './transpiler.js'
import { transpileInWorker } from './transpiler-worker-core.js'
import { getTableDataForWorker } from './transpiler-worker-pool.js'

describe('regression: transpiler must always use worker (no fallback)', () => {
	it('transpiler-worker-pool must not contain fallback to coreTranspile', () => {
		const src = fs.readFileSync('lib/scripting/transpiler-worker-pool.ts', 'utf-8')
		expect(src, 'must not import coreTranspile fallback').not.toMatch(/coreTranspile|transpile.*sync.*fallback/i)
		// old bug had fallback that returned sync result if worker failed
		expect(src, 'must throw if worker not available').toContain('transpiler worker not available')
		expect(src, 'must unref workers to allow exit').toContain('unref')
		expect(src, 'must try .js without tsx first').toContain('./transpiler.worker.node.js')
	})

	it('transpileWithWorker must match sync and not fallback', async () => {
		const table = new TableBuilder().addFlipper('MyFlipper').build()
		const player = new Player(table)
		const vbs = 'MyFlipper.Y = 123\nx = MyFlipper.Y\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const td = getTableDataForWorker(table, player)
		const viaWorkerCore = await transpileInWorker({
			vbs,
			globalFunction: 'play',
			globalObject: 'global',
			tableData: td,
		})
		expect(viaWorkerCore).toEqual(sync)
	})

	it('worker must handle minimal and walking_dead without fallback', async () => {
		const table = new TableBuilder().addFlipper('sw49').build()
		const player = new Player(table)
		const vbs = 'sw49.TimerEnabled = 0\n'
		const td = getTableDataForWorker(table, player)
		const js = await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td })
		expect(js).toContain('TimerEnabled')
	})

	it('transpiler-worker-pool must try browser worker .js before .ts', () => {
		const src = fs.readFileSync('lib/scripting/transpiler-worker-pool.ts', 'utf-8')
		expect(src).toContain('transpiler.worker.browser.js')
		// ensure no fallback to direct transpilation in pool (coreTranspile not imported)
		expect(src, 'pool must not import Transpiler for fallback').not.toMatch(/from.*transpiler\.js.*Transpiler/)
		expect(src).not.toMatch(/coreTranspile/)
	})

	it('hdr worker must be required and unrefed similarly', () => {
		const src = fs.readFileSync('lib/render/threejs/three-texture-loader-node.ts', 'utf-8')
		expect(src).toContain('hdr worker not available')
		expect(src).toContain('unref')
	})
})
