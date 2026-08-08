import { bench, describe } from 'vitest'
import { NodeBinaryReader } from '../../lib/io/binary-reader.node.js'
import { ThreeRenderApi } from '../../lib/render/threejs/three-render-api.js'
import { Table } from '../../lib/vpt/table/table.js'
import { ThreeHelper } from '../three.helper.js'

const three = new ThreeHelper()

describe('viewer', () => {
	bench('load table-empty', async () => {
		await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
	})

	bench('load table-bumper', async () => {
		await Table.load(new NodeBinaryReader(three.fixturePath('table-bumper.vpx')))
	})

	bench('load table-flipper', async () => {
		await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
	})

	bench('generate scene empty', async () => {
		const t = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
		const api = new ThreeRenderApi()
		await t.generateTableNode(api, { exportBloom: false, preloadTextures: false } as any)
	})

	bench('generate scene bumper', async () => {
		const t = await Table.load(new NodeBinaryReader(three.fixturePath('table-bumper.vpx')))
		const api = new ThreeRenderApi()
		await t.generateTableNode(api, { exportBloom: false, preloadTextures: false } as any)
	})
})
