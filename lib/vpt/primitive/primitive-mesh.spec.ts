// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import type { Mesh, Object3D } from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import type { ReadResult, Storage } from '../../io/ole-doc.js'
import { Vertex3D } from '../../math/vector.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import { Table } from '../table/table.js'
import { PrimitiveData } from './primitive-data.js'
import { PrimitiveMeshGenerator } from './primitive-mesh-generator.js'

const three = new ThreeHelper()

describe('The VPinball primitive generator', () => {
	let node: Object3D

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-primitive.vpx')))
		node = await table.generateTableNode(new ThreeRenderApi(), {})
	})

	it('should generate a simple primitive mesh', async () => {
		const cubeMesh = three.find<Mesh>(node, 'primitives', 'Cube', 'primitive-Cube')
		const cubeMeshVertices = three.vertices(cubeMesh)
		const expectedVertices = [
			[600.0, 600.0, 100.0],
			[400.0, 600.0, 100.0],
			[400.0, 600.0, -100.0],
			[600.0, 600.0, -100.0],
			[600.0, 400.0, -100.0],
			[600.0, 600.0, -100.0],
			[400.0, 600.0, -100.0],
			[400.0, 400.0, -100.0],
			[400.0, 400.0, -100.0],
			[400.0, 600.0, -100.0],
			[400.0, 600.0, 100.0],
			[400.0, 400.0, 100.0],
			[400.0, 400.0, 100.0],
			[600.0, 400.0, 100.0],
			[600.0, 400.0, -100.0],
			[400.0, 400.0, -100.0],
			[600.0, 400.0, 100.0],
			[600.0, 600.0, 100.0],
			[600.0, 600.0, -100.0],
			[600.0, 400.0, -100.0],
			[400.0, 400.0, 100.0],
			[400.0, 600.0, 100.0],
			[600.0, 600.0, 100.0],
			[600.0, 400.0, 100.0],
		]
		three.expectVerticesInArray(expectedVertices, cubeMeshVertices)
	})

	it('should generate a simple generated mesh', async () => {
		const triangleMesh = three.find<Mesh>(node, 'primitives', 'Triangle', 'primitive-Triangle')
		const triangleMeshVertices = three.vertices(triangleMesh)
		const expectedVertices = [
			[526.975952, 913.236511, -246.442444],
			[536.197876, 831.975708, -188.895538],
			[479.393341, 907.225647, -334.190735],
			[565.336609, 1000.508118, -216.241028],
			[440.645935, 935.510925, -201.154724],
			[449.867889, 854.250183, -143.607819],
			[393.063324, 929.500061, -288.903015],
			[479.006622, 1022.782532, -170.953308],
			[536.197876, 831.975708, -188.895538],
			[479.393341, 907.225647, -334.190735],
			[565.336609, 1000.508118, -216.241028],
			[449.867889, 854.250183, -143.607819],
			[393.063324, 929.500061, -288.903015],
			[479.006622, 1022.782532, -170.953308],
		]
		three.expectVerticesInArray(expectedVertices, triangleMeshVertices)
	})

	it('should generate an uncompressed mesh', async () => {
		// M3VN + M3DX carry plain vertices (M3CX/M3CI carry zlib-compressed ones).
		const verts = new Float32Array([1, 2, 3, 0, 0, 1, 0.25, 0.75, 4, 5, 6, 0, 1, 0, 0.5, 1])
		const record = new Uint8Array(12 + 72 + 8)
		const view = new DataView(record.buffer)
		view.setInt32(0, 8, true)
		record.set([0x4d, 0x33, 0x56, 0x4e], 4) // M3VN
		view.setInt32(8, 2, true)
		view.setInt32(12, 68, true)
		record.set([0x4d, 0x33, 0x44, 0x58], 16) // M3DX
		record.set(new Uint8Array(verts.buffer), 20)
		view.setInt32(84, 4, true)
		record.set([0x45, 0x4e, 0x44, 0x42], 88) // ENDB
		const storage = {
			async streamFiltered(
				_name: string,
				_offset: number,
				next: (result: ReadResult) => Promise<number | null>,
			): Promise<void> {
				let pos = 0
				while (pos < record.length) {
					const consumed = await next({ data: record.subarray(pos), storageOffset: pos })
					if (consumed === null) break
					pos += consumed
				}
			},
		}
		const data = await PrimitiveData.fromStorage(storage as unknown as Storage, 'Prim', false)
		expect(data.compressedVertices).to.equal(undefined)
		expect(data.mesh.vertices.length).to.equal(2)
		expect(data.mesh.vertices[0]).to.deep.include({ x: 1, y: 2, z: 3, nx: 0, ny: 0, nz: 1, tu: 0.25, tv: 0.75 })
		expect(data.mesh.vertices[1]).to.deep.include({ x: 4, y: 5, z: 6, nx: 0, ny: 1, nz: 0, tu: 0.5, tv: 1 })

		// the decoded vertices feed mesh generation (identity placement)
		data.use3DMesh = true
		data.position = new Vertex3D(0, 0, 0)
		data.size = new Vertex3D(1, 1, 1)
		const mesh = new PrimitiveMeshGenerator(data).getMesh(new TableBuilder().build())
		expect(mesh.vertices.length).to.equal(2)
		expect(mesh.vertices[0]).to.deep.include({ x: 1, y: 2, z: 3 })
		expect(mesh.vertices[1]).to.deep.include({ x: 4, y: 5, z: 6 })
	})

	it('should generate a compressed mesh', async () => {
		const vptSink = await Table.load(new NodeBinaryReader(three.fixturePath('table-sink.vpx')))
		const nodeSink = await vptSink.generateTableNode(new ThreeRenderApi(), {})

		const sinkMesh = three.find<Mesh>(nodeSink, 'primitives', 'Primitive1', 'primitive-Primitive1')
		const sinkMeshVertices = three.vertices(sinkMesh)
		const expectedVertices = [
			[450.063995, 1123.057007, -85.772011],
			[445.540009, 1124.269043, -85.772011],
			[446.127014, 1125.284058, -83.379013],
			[450.063995, 1124.229004, -83.379013],
			[445.540009, 1124.269043, -85.772011],
			[442.229004, 1127.579956, -85.772011],
			[443.243988, 1128.166016, -83.379013],
			[448.869995, 1137.740967, -112.53701],
			[448.154999, 1137.498047, -112.53701],
			[448.346985, 1137.036011, -112.484009],
			[449.0, 1137.258057, -112.484009],
			[447.959015, 1137.969971, -112.56501],
			[448.738007, 1138.234985, -112.56501],
			[450.36499, 1137.937012, -112.53701],
			[449.610992, 1137.888062, -112.53701],
			[449.677002, 1137.391968, -112.484009],
			[450.36499, 1137.437012, -112.484009],
			[449.544006, 1138.39502, -112.56501],
			[450.36499, 1138.448975, -112.56501],
			[451.014008, 1132.209961, -110.806007],
			[451.013, 1132.200073, -110.811012],
			[451.014008, 1132.213013, -110.834007],
			[451.015015, 1132.218018, -110.828011],
			[451.016998, 1132.223999, -110.821007],
			[451.011993, 1132.200073, -110.820007],
			[451.013, 1132.200073, -110.811012],
			[451.007996, 1132.200073, -110.828011],
			[451.005005, 1132.198975, -110.832016],
			[451.013, 1132.207031, -110.835007],
			[451.005005, 1132.209961, -110.832016],
			[451.013, 1132.20105, -110.835007],
			[451.014008, 1132.19397, -110.834007],
			[473.041992, 1098.006958, -4.743007],
			[473.070007, 1098.000977, -4.976007],
			[473.144012, 1098.277954, -4.976007],
			[473.117004, 1098.287964, -4.743007],
			[473.003998, 1097.427002, -4.743007],
			[473.03299, 1097.428955, -4.976007],
			[473.03299, 1097.716064, -4.976007],
			[473.003998, 1097.718018, -4.743007],
			[473.117004, 1096.856934, -4.743007],
			[473.144012, 1096.866943, -4.976007],
			[473.070007, 1097.144043, -4.976007],
			[473.041992, 1097.137939, -4.743007],
			[453.544006, 1103.154053, -187.951019],
			[453.674011, 1103.118042, -187.956024],
			[453.697998, 1103.104004, -187.958008],
			[453.683014, 1103.104004, -187.956024],
			[453.544006, 1103.154053, -187.951019],
			[453.683014, 1103.104004, -187.956024],
			[453.705994, 1103.088989, -187.957016],
			[453.687012, 1103.091064, -187.956024],
			[453.544006, 1103.154053, -187.951019],
			[453.687012, 1103.091064, -187.956024],
			[453.707001, 1103.07605, -187.957016],
			[453.665009, 1103.092041, -187.954025],
			[453.544006, 1103.154053, -187.951019],
		]
		three.expectVerticesInArray(expectedVertices, sinkMeshVertices)
	})

	it('should assign the correct material', () => {
		const table = new TableBuilder().addMaterial('mat').addPrimitive('p', { szMaterial: 'mat' }).build()
		expect(table.primitives.p.getMeshes(table).primitive.material?.name).to.equal('mat')
	})
})
