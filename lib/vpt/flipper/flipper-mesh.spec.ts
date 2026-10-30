// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Mesh, Object3D } from 'three'
import { rowClose, rowMul, rowRotateZ, rowTranslate, toRow } from '../../../test/row-matrix.js'
import { ThreeHelper } from '../../../test/three.helper'
import { NodeBinaryReader } from '../../io/binary-reader.node.js'
import { Matrix3D } from '../../math/matrix.js'
import { Vertex2D } from '../../math/vector.js'
import { ThreeRenderApi } from '../../render/threejs/three-render-api.js'
import type { Mesh as VpxMesh } from '../mesh.js'
import { Table } from '../table/table.js'
import { FlipperData } from './flipper-data.js'
import { FlipperMesh } from './flipper-mesh.js'

const three = new ThreeHelper()

function meshBounds(vertices: number[]): { min: number[]; max: number[] } {
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i] ?? 0
		const y = vertices[i + 1] ?? 0
		const z = vertices[i + 2] ?? 0
		if (x < minX) minX = x
		if (y < minY) minY = y
		if (z < minZ) minZ = z
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
		if (z > maxZ) maxZ = z
	}
	return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
}

function expectMeshShape(
	actual: number[],
	shape: { count: number; min: number[]; max: number[]; landmarks: number[][] },
): void {
	expect(actual.length / 3).toBe(shape.count)
	const bounds = meshBounds(actual)
	for (let axis = 0; axis < 3; axis++) {
		expect(bounds.min[axis] ?? 0).toBeCloseTo(shape.min[axis] ?? 0, 4)
		expect(bounds.max[axis] ?? 0).toBeCloseTo(shape.max[axis] ?? 0, 4)
	}
	three.expectVerticesInArray(shape.landmarks, actual)
}

describe('The VPinball flipper generator', () => {
	let node: Object3D

	before(async () => {
		const table = await Table.load(new NodeBinaryReader(three.fixturePath('table-flipper.vpx')))
		node = await table.generateTableNode(new ThreeRenderApi(), {})
	})

	it('should generate a default flipper mesh', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'DefaultFlipper', 'flipperbase-DefaultFlipper')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [258.5001525878906, 1606.5269775390625, -50.212650299072266],
			max: [390.4271240234375, 1693.952880859375, -0.18764999508857727],
			landmarks: [
				[381.108154, 1693.057495, -0.18765],
				[381.108154, 1693.057495, -50.21265],
				[382.565002, 1693.690918, -50.21265],
				[382.565002, 1693.690918, -0.18765],
				[387.192688, 1693.163696, -0.18765],
				[387.192688, 1693.163696, -50.21265],
				[388.469788, 1692.21875, -50.21265],
				[388.469788, 1692.21875, -0.18765],
			],
		})

		const flipperRubberMesh = three.find<Mesh>(node, 'flippers', 'DefaultFlipper', 'flipperrubber-DefaultFlipper')
		const flipperRubberMeshVertices = three.vertices(flipperRubberMesh)
		expectMeshShape(flipperRubberMeshVertices, {
			count: 104,
			min: [251.5001983642578, 1599.5400390625, -43.102073669433594],
			max: [397.4217224121094, 1700.9505615234375, -19.090072631835938],
			landmarks: [
				[377.230652, 1699.010498, -19.090073],
				[377.230652, 1699.010498, -43.102074],
				[380.387146, 1700.382935, -43.102074],
				[380.387146, 1700.382935, -19.090073],
				[390.413788, 1699.240601, -19.090073],
				[390.413788, 1699.240601, -43.102074],
				[393.180786, 1697.193237, -43.102074],
				[393.180786, 1697.193237, -19.090073],
			],
		})
	})

	it('should generate a rotated flipper mesh', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'FlipperR', 'flipperbase-FlipperR')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [614.8919067382812, 1584.510009765625, -50.212650299072266],
			max: [733.423828125, 1690.2562255859375, -0.18764999508857727],
			landmarks: [
				[617.062012, 1679.549927, -0.18765],
				[617.062012, 1679.549927, -50.21265],
				[616.009338, 1680.739746, -50.21265],
				[616.009338, 1680.739746, -0.18765],
				[615.08075, 1685.303833, -0.18765],
				[615.08075, 1685.303833, -50.21265],
				[615.584778, 1686.810425, -50.21265],
				[615.584778, 1686.810425, -0.18765],
			],
		})

		const flipperRubberMesh = three.find<Mesh>(node, 'flippers', 'FlipperR', 'flipperrubber-FlipperR')
		const flipperRubberMeshVertices = three.vertices(flipperRubberMesh)
		expectMeshShape(flipperRubberMeshVertices, {
			count: 104,
			min: [607.896728515625, 1577.5147705078125, -43.102073669433594],
			max: [740.3870849609375, 1697.2193603515625, -19.090072631835938],
			landmarks: [
				[612.598633, 1674.022705, -19.090073],
				[612.598633, 1674.022705, -43.102074],
				[610.317932, 1676.600586, -43.102074],
				[610.317932, 1676.600586, -19.090073],
				[608.305908, 1686.489502, -19.090073],
				[608.305908, 1686.489502, -43.102074],
				[609.398071, 1689.753662, -43.102074],
				[609.398071, 1689.753662, -19.090073],
			],
		})
	})

	it('should generate a resized flipper mesh', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'FatFlipper', 'flipperbase-FatFlipper')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [246.00025939941406, 1278.0440673828125, -70.2977066040039],
			max: [410.5648498535156, 1391.2509765625, -0.26271000504493713],
			landmarks: [
				[390.374023, 1389.311279, -0.26271],
				[390.374023, 1389.311279, -70.297714],
				[393.530487, 1390.683716, -70.297714],
				[393.530487, 1390.683716, -0.26271],
				[403.557129, 1389.541382, -0.26271],
				[403.557129, 1389.541382, -70.297714],
				[406.324127, 1387.494019, -70.297714],
				[406.324127, 1387.494019, -0.26271],
			],
		})

		const flipperRubberMesh = three.find<Mesh>(node, 'flippers', 'FatFlipper', 'flipperrubber-FatFlipper')
		const flipperRubberMeshVertices = three.vertices(flipperRubberMesh)
		expectMeshShape(flipperRubberMeshVertices, {
			count: 104,
			min: [239.00033569335938, 1271.0574951171875, -43.102073669433594],
			max: [417.5593566894531, 1398.2484130859375, -19.090072631835938],
			landmarks: [
				[388.440125, 1396.047607, -19.090073],
				[388.440125, 1396.047607, -43.102074],
				[391.352631, 1397.37561, -43.102074],
				[391.352631, 1397.37561, -19.090073],
				[406.778259, 1395.618164, -19.090073],
				[406.778259, 1395.618164, -43.102074],
				[411.035156, 1392.468384, -43.102074],
				[411.035156, 1392.468384, -19.090073],
			],
		})
	})

	it('should generate a flipper mesh with a thick rubber', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'FatRubberFlipper', 'flipperbase-FatRubberFlipper')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [586.6524658203125, 1278.5120849609375, -50.212650299072266],
			max: [705.4999389648438, 1353.5982666015625, -0.18764999508857727],
			landmarks: [
				[588.549866, 1353.731567, -0.18765],
				[588.549866, 1353.731567, -50.21265],
				[588.964294, 1353.401978, -50.21265],
				[588.964294, 1353.401978, -0.18765],
				[589.533325, 1351.95752, -0.18765],
				[589.533325, 1351.95752, -50.21265],
				[589.455078, 1351.433716, -50.21265],
				[589.455078, 1351.433716, -0.18765],
			],
		})

		const flipperRubberMesh = three.find<Mesh>(
			node,
			'flippers',
			'FatRubberFlipper',
			'flipperrubber-FatRubberFlipper',
		)
		const flipperRubberMeshVertices = three.vertices(flipperRubberMesh)
		expectMeshShape(flipperRubberMeshVertices, {
			count: 104,
			min: [574.5782470703125, 1263.5400390625, -45.17012023925781],
			max: [720.4998168945312, 1364.9505615234375, -5.150119781494141],
			landmarks: [
				[581.1875, 1340.406494, -5.15012],
				[581.1875, 1340.406494, -45.17012],
				[578.493835, 1342.549194, -45.17012],
				[578.493835, 1342.549194, -5.15012],
				[574.795227, 1351.938477, -5.15012],
				[574.795227, 1351.938477, -45.17012],
				[575.303955, 1355.342773, -45.17012],
				[575.303955, 1355.342773, -5.15012],
			],
		})
	})

	it('should generate a flipper mesh with no rubber', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'NoRubberFlipper', 'flipperbase-NoRubberFlipper')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [243.5001983642578, 1031.5400390625, -50.212650299072266],
			max: [389.4217224121094, 1132.9505615234375, -0.18764999508857727],
			landmarks: [
				[369.230652, 1131.010498, -0.18765],
				[369.230652, 1131.010498, -50.21265],
				[372.387146, 1132.382935, -50.21265],
				[372.387146, 1132.382935, -0.18765],
				[382.413788, 1131.240601, -0.18765],
				[382.413788, 1131.240601, -50.21265],
				[385.180786, 1129.193237, -50.21265],
				[385.180786, 1129.193237, -0.18765],
			],
		})
		three.expectNoObject(node, 'flippers', 'NoRubberFlipper', 'flipperrubber-NoRubberFlipper')
	})

	it('should not generate an invisible flipper', async () => {
		three.expectNoObject(node, 'flippers', 'InvisibleFlipper')
	})

	it('should generate a flipper located on a surface', async () => {
		const flipperBaseMesh = three.find<Mesh>(node, 'flippers', 'SurfaceFlipper', 'flipperbase-SurfaceFlipper')
		const flipperBaseMeshVertices = three.vertices(flipperBaseMesh)
		expectMeshShape(flipperBaseMeshVertices, {
			count: 104,
			min: [358.5001525878906, 678.5270385742188, -100.212646484375],
			max: [490.4271240234375, 765.952880859375, -50.18764877319336],
			landmarks: [
				[481.108154, 765.057495, -50.187649],
				[481.108154, 765.057495, -100.212646],
				[482.565002, 765.690918, -100.212646],
				[482.565002, 765.690918, -50.187649],
				[487.192688, 765.163696, -50.187649],
				[487.192688, 765.163696, -100.212646],
				[488.469788, 764.21875, -100.212646],
				[488.469788, 764.21875, -50.187649],
			],
		})

		const flipperRubberMesh = three.find<Mesh>(node, 'flippers', 'SurfaceFlipper', 'flipperrubber-SurfaceFlipper')
		const flipperRubberMeshVertices = three.vertices(flipperRubberMesh)
		expectMeshShape(flipperRubberMeshVertices, {
			count: 104,
			min: [351.5002136230469, 671.5401000976562, -93.1020736694336],
			max: [497.4217224121094, 772.9505004882812, -69.09007263183594],
			landmarks: [
				[477.230652, 771.010437, -69.090073],
				[477.230652, 771.010437, -93.102074],
				[480.387146, 772.382935, -93.102074],
				[480.387146, 772.382935, -69.090073],
				[490.413788, 771.240601, -69.090073],
				[490.413788, 771.240601, -93.102074],
				[493.180786, 769.193176, -93.102074],
				[493.180786, 769.193176, -69.090073],
			],
		})
	})
})

describe('The VPinball flipper arc reconstruction', () => {
	const table = { getSurfaceHeight: () => 0, getScaleZ: () => 1 } as unknown as Table

	function generateMeshes() {
		const data = new FlipperData('ArcFlipper')
		data.center = new Vertex2D(0, 0)
		return new FlipperMesh().generateMeshes(data, table)
	}

	function hasVertexNear(mesh: VpxMesh, x: number, y: number, tolerance: number): boolean {
		return mesh.vertices.some(vertex => Math.hypot(vertex.x - x, vertex.y - y) < tolerance)
	}

	it('should reconstruct the tip arc at exactly the end radius', () => {
		const { base } = generateMeshes()
		const minY = Math.min(...base.vertices.map(vertex => vertex.y))
		// upstream ApplyFix (src/parts/flipper.cpp) places the tip apex at flipperRadius + endRadius - rubberThickness
		expect(minY).toBeCloseTo(-(130 + 13 - 7), 6)
	})

	it('should reconstruct the base arc at exactly the base radius', () => {
		const { base } = generateMeshes()
		const maxY = Math.max(...base.vertices.map(vertex => vertex.y))
		expect(maxY).toBeCloseTo(21.5 - 7, 6)
	})

	it('should reconstruct rubber arcs at exactly the outer radii', () => {
		const { rubber } = generateMeshes()
		if (!rubber) throw new Error('Expected rubber mesh for default flipper.')
		const ys = rubber.vertices.map(vertex => vertex.y)
		expect(Math.min(...ys)).toBeCloseTo(-(130 + 13), 6)
		expect(Math.max(...ys)).toBeCloseTo(21.5, 6)
	})

	it('should shift arc endpoints by the taper correction', () => {
		const { base } = generateMeshes()
		// oracle values from upstream ApplyFix for default geometry (baseRadius 21.5, endRadius 13, length 130)
		expect(hasVertexNear(base, 5.987161, -130.392308, 1e-3)).toBe(true)
		expect(hasVertexNear(base, 14.468972, -0.948077, 1e-3)).toBe(true)
	})
})

describe('flipper bat matrix order', () => {
	it('composes m0*Mr*m1*Mt around the flipper center', () => {
		const center = { x: 100, y: 200 }
		const dx = 5,
			dy = -3,
			h = 10
		const m0 = new Matrix3D().setTranslation(-center.x, -center.y, h)
		const m1 = new Matrix3D().setTranslation(center.x, center.y, -h)
		const mr = new Matrix3D().rotateZMatrix(0.5)
		const mt = new Matrix3D().setTranslation(dx, dy, 0)
		const row = rowMul(
			rowMul(
				rowMul(rowTranslate(-center.x, -center.y, h), rowRotateZ(0.5)),
				rowTranslate(center.x, center.y, -h),
			),
			rowTranslate(dx, dy, 0),
		)
		const m = m0.clone().multiply(mr).multiply(m1).multiply(mt)
		expect(rowClose(toRow(m), row)).toBe(true)
	})
})
