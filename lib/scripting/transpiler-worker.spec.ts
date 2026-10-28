import { expect } from 'chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import type { Table } from '../vpt/table/table.js'
import { Transpiler } from './transpiler.js'
import { transpileInWorker } from './transpiler-worker-core.js'
import { getTableDataForWorker } from './transpiler-worker-pool.js'

describe('Transpiler worker parity', () => {
	let table: Table
	let player: Player
	let timerTable: Table
	let timerPlayer: Player

	before(() => {
		table = new TableBuilder().addFlipper('MyFlipper').addTrigger('T1').build()
		player = new Player(table)
		timerTable = new TableBuilder().addFlipper('sw49').build()
		timerPlayer = new Player(timerTable)
	})

	it('should match sync for simple script', async () => {
		const vbs = 'MyFlipper.Y = 123\nx = MyFlipper.Y\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const td = getTableDataForWorker(table, player)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})

	it('should preserve TimerEnabled casing', async () => {
		const vbs = 'sw49.TimerEnabled = 0\n'
		const sync = new Transpiler(timerTable, timerPlayer).transpile(vbs, 'play', 'global')
		expect(sync).to.contain('TimerEnabled')
		const td = getTableDataForWorker(timerTable, timerPlayer)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})

	it('should match sync for instance function props', async () => {
		const spinTable = new TableBuilder().addFlipper('MyFlipper').build()
		const spinPlayer = new Player(spinTable)
		const api = spinTable.getElementApis().MyFlipper as any
		// Instance arrow-function prop, reported via the (virtual) _getPropertyNames.
		api.SpinNow = () => {}
		const protoNames = Object.getOwnPropertyNames(Object.getPrototypeOf(api))
		api._getPropertyNames = () => [...protoNames, 'SpinNow']
		const td = getTableDataForWorker(spinTable, spinPlayer)
		expect(td?.elementApiFuncs?.MyFlipper ?? []).to.contain('SpinNow')
		const vbs = 'MyFlipper.SpinNow()\n'
		const sync = new Transpiler(spinTable, spinPlayer).transpile(vbs, 'play', 'global')
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})

	it('should match via worker thread', async () => {
		const vbs = 'MyFlipper.Y = 123\n'
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const asyncJs = await new Transpiler(table, player).transpileAsync(vbs, 'play', 'global')
		expect(asyncJs).to.equal(sync)
	})

	it('should match sync for class, With and Select', async () => {
		const vbs = [
			'Class BallPos',
			'Public X',
			'Public Y',
			'End Class',
			'Set b = New BallPos',
			'With b',
			'.X = 5',
			'.Y = 7',
			'End With',
			'Select Case b.X',
			'Case 5',
			'y = 1',
			'Case Else',
			'y = 2',
			'End Select',
		].join('\n')
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const td = getTableDataForWorker(table, player)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
	})
})
