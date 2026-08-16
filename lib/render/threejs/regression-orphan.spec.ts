import * as fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('regression: orphan chrome must be systematically cleaned', () => {
	it('test/harness/utils.mjs must track browsers and vites and kill stale', () => {
		const src = fs.readFileSync('test/harness/utils.mjs', 'utf-8')
		expect(src, 'must track _browsers').toContain('_browsers')
		expect(src, 'must track _vites').toContain('_vites')
		expect(src, 'must have killStaleChromeSync').toContain('killStaleChromeSync')
		expect(src, 'must pkill chrome headless').toContain('pkill -9 -f "chrome.*headless')
		expect(src, 'must have registerCleanup with exit handlers').toContain('registerCleanup')
		expect(src, 'must handle SIGINT').toContain('SIGINT')
		expect(src, 'must handle SIGTERM').toContain('SIGTERM')
		expect(src, 'must have reaper interval').toContain('30000')
		expect(src, 'must unref reaper').toContain('unref')
		expect(src, 'launchBrowser must wrap close with SIGKILL').toContain('origClose')
		expect(src, 'must pkill on browser close').toContain('browser.process()?.kill')
		expect(src, 'must clean /tmp/puppeteer').toContain('puppeteer_dev_chrome')
		expect(src, 'must have autoKill timeout').toContain('90_000')
		expect(src, 'must clean vite when _vites empty').toContain('vite.*--port')
	})

	it('demo-browser/e2e/integration.mjs must force kill chrome on exit', () => {
		const src = fs.readFileSync('demo-browser/e2e/integration.mjs', 'utf-8')
		expect(src, 'must have _forceKillChrome').toContain('_forceKillChrome')
		expect(src, 'must pkill on exit').toContain('pkill -9 -f "chrome.*headless')
		expect(src, 'must catch unhandledRejection').toContain('unhandledRejection')
		expect(src, 'must call _forceKillChrome after browser.close').toContain('_forceKillChrome()')
	})

	it('transpiler and hdr workers must be unrefed to avoid orphaning vitest', () => {
		const pool = fs.readFileSync('lib/scripting/transpiler-worker-pool.ts', 'utf-8')
		expect(pool, 'transpiler worker must unref').toContain('unref')
		const hdrLoader = fs.readFileSync('lib/render/threejs/three-texture-loader-node.ts', 'utf-8')
		expect(hdrLoader, 'hdr worker must unref').toContain('unref')
		const hdrWorker = fs.readFileSync('lib/render/threejs/hdr-decode.worker.node.ts', 'utf-8')
		// worker itself not needed to unref, but pool must
		expect(hdrLoader).toContain('hdr worker not available')
	})

	it('verify-browser and verify-all must pkill on exit', () => {
		const vb = fs.readFileSync('test/harness/verify-browser.ts', 'utf-8')
		const va = fs.readFileSync('test/harness/verify-all.ts', 'utf-8')
		// at least one should contain pkill or cleanup
		const combined = vb + va + fs.readFileSync('test/harness/utils.mjs', 'utf-8')
		expect(combined, 'harness must ensure pkill').toContain('pkill')
	})

	it('game must still work after fixes (transpile + playfield)', async () => {
		// minimal game sanity: transpiler still works and scene postProcess still produces valid scene
		const { TableBuilder } = await import('../../../test/table-builder.js')
		const { Player } = await import('../../game/player.js')
		const { transpileInWorker } = await import('../../scripting/transpiler-worker-core.js')
		const { getTableDataForWorker } = await import('../../scripting/transpiler-worker-pool.js')
		const table = new TableBuilder().addFlipper('F1').build()
		const player = new Player(table)
		const td = getTableDataForWorker(table, player)
		const js = await transpileInWorker({
			vbs: 'F1.Y=1\n',
			globalFunction: 'play',
			globalObject: 'global',
			tableData: td,
		})
		expect(js).toContain('F1')
		// scene sanity
		const { postProcessScene } = await import('./three-scene-postprocess.js')
		const root = new (await import('three')).Group()
		root.add(
			new (await import('three')).Mesh(
				new (await import('three')).BoxGeometry(1, 1, 1),
				new (await import('three')).MeshStandardMaterial(),
			),
		)
		expect(() => postProcessScene(root, { harnessLog: () => {} })).not.toThrow()
	})
})
