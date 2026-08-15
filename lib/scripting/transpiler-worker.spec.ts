import { expect } from 'chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import { Transpiler } from './transpiler.js'
import { transpileInWorker } from './transpiler-worker-core.js'
import { getTableDataForWorker } from './transpiler-worker-pool.js'

describe('Transpiler worker parity', () => {
	it('should match sync for simple script', async () => {
		const table = new TableBuilder().addFlipper('MyFlipper').addTrigger('T1').build()
		const player = new Player(table)
		const vbs = 'MyFlipper.Y = 123\nx = MyFlipper.Y\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const td = getTableDataForWorker(table, player)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})

	it('should preserve TimerEnabled casing', async () => {
		const table = new TableBuilder().addFlipper('sw49').build()
		const player = new Player(table)
		const vbs = 'sw49.TimerEnabled = 0\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		expect(sync).to.contain('TimerEnabled')
		const td = getTableDataForWorker(table, player)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})

	it('should match via worker thread', async () => {
		const table = new TableBuilder().addFlipper('MyFlipper').build()
		const player = new Player(table)
		const vbs = 'MyFlipper.Y = 123\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const asyncJs = await new Transpiler(table, player).transpileAsync(vbs, 'play', 'global')
		expect(asyncJs).to.equal(sync)
	})
})
