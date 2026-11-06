import { describe } from 'vitest'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'
import { findWalkingDead } from '../harness/bench-shared.js'

const bench: any = (globalThis as any).bench ?? ((_name: string, fn: () => void) => fn())

const vpx = findWalkingDead()

describe.skipIf(!vpx)('walking_dead loading', () => {
	bench(
		'Table.load walking_dead',
		async () => {
			await Table.load(new NodeBinaryReader(vpx!))
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)

	bench(
		'Table.load walking_dead (skipTextures)',
		async () => {
			await Table.load(new NodeBinaryReader(vpx!), { skipTextures: true } as any)
		},
		{ iterations: 1, warmupIterations: 0 } as any,
	)
})
