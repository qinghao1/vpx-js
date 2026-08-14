import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'chai'
import { TableBuilder } from '../../test/table-builder.js'
import { Player } from '../game/player.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Table } from '../vpt/table/table.js'
import { Transpiler } from './transpiler.js'
import { transpileInWorker } from './transpiler-worker-core.js'
import { getTableDataForWorker } from './transpiler-worker-pool.js'

function findWalkingDead(): string | null {
	const cands = [
		path.resolve('walking_dead.vpx'),
		path.join(process.env.HOME ?? '/home/qinghao1', 'Downloads/walking_dead.vpx'),
	]
	for (const p of cands)
		try {
			if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000) return p
		} catch {}
	return null
}
const walkingDead = findWalkingDead()

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

	it.skipIf(!walkingDead)('should match sync for walking_dead', async () => {
		const table = await Table.load(new NodeBinaryReader(walkingDead! as any) as any, { skipTextures: true } as any)
		const player = new Player(table)
		const vbs = (table as any).tableScript as string
		const sync = new Transpiler(table, player).transpile(vbs, 'play', 'global')
		const td = getTableDataForWorker(table, player)
		expect(
			await transpileInWorker({ vbs, globalFunction: 'play', globalObject: 'global', tableData: td }),
		).to.equal(sync)
		expect(sync.length).to.equal(309376)
	})
})
