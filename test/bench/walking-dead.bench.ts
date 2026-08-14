import fs from 'node:fs'
import path from 'node:path'
import { bench, describe } from 'vitest'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { Table } from '../../lib/vpt/table/table.js'

const home = process.env.HOME ?? '/home/qinghao1'
const candidates = [path.resolve('walking_dead.vpx'), path.join(home, 'Downloads/walking_dead.vpx')]

function exists(p: string): boolean {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024
	} catch {
		return false
	}
}

const vpx = candidates.find(exists) ?? null
const isWalkingDead = !!vpx && vpx.includes('walking_dead')

describe.skipIf(!isWalkingDead)('walking_dead loading', () => {
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
