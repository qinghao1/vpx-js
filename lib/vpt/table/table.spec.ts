// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { Mesh } from '../../refs.node.js'
import { Table } from './table.js'
import { TableExporter } from './table-exporter.js'

const three = new ThreeHelper()

const tableWidth = 1111
const tableHeight = 2222
const tableDepth = 20

describe('The VPinball table generator', () => {
	let gltf: GLTF
	let table: Table

	before(async () => {
		table = await Table.load(new NodeBinaryReader(three.fixturePath('table-empty.vpx')))
		const exporter = new TableExporter(table)
		gltf = await three.loadGlb(await exporter.exportGlb({ exportPlayfieldLights: false }))
	})

	it('should generate the correct playfield mesh', async () => {
		const playfieldMesh = three.first<Mesh>(gltf, 'playfield')
		const playfieldVertices = three.vertices(playfieldMesh)
		const expectedVertices = [
			0,
			0,
			0,
			0,
			tableHeight,
			0,
			tableWidth,
			tableHeight,
			0,
			tableWidth,
			tableHeight,
			0,
			tableWidth,
			0,
			0,
			0,
			0,
			0,
			tableWidth,
			tableHeight,
			tableDepth,
			0,
			tableHeight,
			tableDepth,
			0,
			0,
			tableDepth,
			0,
			0,
			tableDepth,
			tableWidth,
			0,
			tableDepth,
			tableWidth,
			tableHeight,
			tableDepth,
			0,
			0,
			0,
			tableWidth,
			0,
			0,
			0,
			0,
			tableDepth,
			tableWidth,
			0,
			0,
			tableWidth,
			0,
			tableDepth,
			0,
			0,
			tableDepth,
			tableWidth,
			0,
			0,
			tableWidth,
			tableHeight,
			0,
			tableWidth,
			0,
			tableDepth,
			tableWidth,
			tableHeight,
			0,
			tableWidth,
			tableHeight,
			tableDepth,
			tableWidth,
			0,
			tableDepth,
			tableWidth,
			tableHeight,
			0,
			0,
			tableHeight,
			0,
			tableWidth,
			tableHeight,
			tableDepth,
			0,
			tableHeight,
			0,
			0,
			tableHeight,
			tableDepth,
			tableWidth,
			tableHeight,
			tableDepth,
			0,
			tableHeight,
			0,
			0,
			0,
			0,
			0,
			tableHeight,
			tableDepth,
			0,
			0,
			0,
			0,
			0,
			tableDepth,
			0,
			tableHeight,
			tableDepth,
		]
		expect(compareArray(playfieldVertices, expectedVertices)).to.equal(true)
	})

	it('should read the table script correctly', () => {
		const script = table.getTableScript()
		expect(script).to.equal(`Option Explicit\r\n`)
	})

	it('should read the table info correctly', async () => {
		expect(table.info!.TableRules).to.equal('Rules')
		expect(table.info!.AuthorName).to.equal('Table Author')
		expect(table.info!.TableName).to.equal('Table Name')
		expect(table.info!.TableBlurb).to.equal('Short Blurb')
		expect(table.info!.ReleaseDate).to.equal('2019-04-14')
		expect(table.info!.AuthorEmail).to.equal('test@vpdb.io')
		expect(table.info!.customdata1).to.equal('customvalue1')
		expect(table.info!.AuthorWebSite).to.equal('https://vpdb.io')
		expect(table.info!.TableVersion).to.equal('Version')
		expect(table.info!.TableDescription).to.equal('Description')
	})

	it('should not crash when reading a corrupt file', async () => {
		try {
			await Table.load(new NodeBinaryReader(three.fixturePath('table-corrupt.vpx')))
			expect.fail('Exception expected.')
		} catch (err) {
			// we're good in here
		}
	})
})

function compareArray(arr1: any[], arr2: any[]) {
	if (arr1.length !== arr2.length) {
		return false
	}
	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) {
			return false
		}
	}
	return true
}
