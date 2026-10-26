import { describe, expect, it } from 'vitest'

describe('regression: orphan chrome must be systematically cleaned', () => {
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
