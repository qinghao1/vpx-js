import { bench, describe } from 'vitest'
import { Player } from '../../lib/game/player.js'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Transpiler } from '../../lib/scripting/transpiler.js'
import { getTableDataForWorker, transpileWithWorker } from '../../lib/scripting/transpiler-worker-pool.js'
import { Table } from '../../lib/vpt/table/table.js'
import { findWalkingDead } from '../harness/bench-shared.js'

const vpx = findWalkingDead()
const isWalkingDead = !!vpx && vpx.includes('walking_dead')

describe.skipIf(!isWalkingDead)('transpiler', () => {
	let table: Table
	let player: Player
	let vbs: string
	let tableData: any
	bench(
		'transpile sync',
		async () => {
			if (!table) {
				table = await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
				player = new Player(table)
				vbs = (table as any).tableScript
				tableData = getTableDataForWorker(table, player)
			}
			const transpiler = new Transpiler(table, player)
			transpiler.transpile(vbs, 'play', 'global')
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)

	bench(
		'transpile worker',
		async () => {
			if (!table) {
				table = await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
				player = new Player(table)
				vbs = (table as any).tableScript
				tableData = getTableDataForWorker(table, player)
			}
			await transpileWithWorker(vbs, 'play', 'global', tableData)
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)

	bench(
		'transpile async (yield)',
		async () => {
			if (!table) {
				table = await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
				player = new Player(table)
				vbs = (table as any).tableScript
			}
			const transpiler = new Transpiler(table, player)
			await transpiler.transpileAsync(vbs, 'play', 'global')
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)

	bench(
		'Player.init sync',
		async () => {
			const t = await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
			const p = new Player(t)
			p.init()
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)

	bench(
		'Player.initAsync',
		async () => {
			const t = await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
			const p = new Player(t)
			await p.initAsync()
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)
})
