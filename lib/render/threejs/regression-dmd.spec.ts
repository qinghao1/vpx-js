// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { ThreeRenderApi } from './three-render-api.js'

function mockDocument() {
	if ((global as unknown as Record<string, unknown>).document) return
	const fakeCanvas = () => {
		const c: Record<string, unknown> = {
			width: 128,
			height: 32,
			getContext: () => ({
				createImageData: (w: number, h: number) => ({
					data: new Uint8ClampedArray(w * h * 4),
					width: w,
					height: h,
				}),
				putImageData: () => {},
				imageSmoothingEnabled: false,
			}),
		}
		return c
	}
	;(global as unknown as Record<string, unknown>).document = {
		createElement: (tag: string) => (tag === 'canvas' ? fakeCanvas() : {}),
	} as unknown as Document
}

/** Mirror of FlasherData.getCenter(): bbox midpoint over the drag points. */
function bboxCenter(pts: Array<{ vertex: { x: number; y: number } }>) {
	const xs = pts.map(p => p.vertex.x)
	const ys = pts.map(p => p.vertex.y)
	return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

describe('regression: DMD placement and VR selection (walking_dead)', () => {
	beforeAll(() => mockDocument())

	it('DMD world position must be above playfield (height sign correct) per ThreeRenderApi SCALE', async () => {
		const { DmdRenderer } = await import('../../../demo-browser/src/dmd/dmd-renderer.js')
		mockDocument()
		const tableGroup = new THREE.Group()
		tableGroup.name = 'tableGroup'
		const cabMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), cabMat)
		cab.name = 'VRCab_Backbox'
		tableGroup.add(cab)

		const desktopDragPoints = [
			{ vertex: { x: 135.66, y: -53.49 } },
			{ vertex: { x: 800.66, y: -53.49 } },
			{ vertex: { x: 800.66, y: 127.75 } },
			{ vertex: { x: 135.66, y: 127.75 } },
		]
		const vrDragPoints = [
			{ vertex: { x: 165, y: 133.95 } },
			{ vertex: { x: 790, y: 133.95 } },
			{ vertex: { x: 790, y: 299.57 } },
			{ vertex: { x: 165, y: 299.57 } },
		]
		const table: Record<string, unknown> = {
			data: { left: 0, right: 952, top: 0, bottom: 2247 },
			getDimensions: () => ({ width: 952, height: 2247 }),
			flashers: {
				DMD: {
					getName: () => 'DMD',
					data: {
						isDMD: true,
						isVisible: true,
						// Real FlasherData shape: center is a method, not a property.
						getCenter: () => bboxCenter(desktopDragPoints),
						height: 635,
						rotX: -87,
						rotY: 0,
						rotZ: 0,
						depthBias: 1,
						dragPoints: desktopDragPoints,
					},
				},
				VR_DMD: {
					getName: () => 'VR_DMD',
					data: {
						isDMD: true,
						isVisible: false,
						// Real FlasherData shape: center is a method, not a property.
						getCenter: () => bboxCenter(vrDragPoints),
						height: 620.21,
						rotX: -88,
						rotY: 0,
						rotZ: 0,
						depthBias: 1,
						dragPoints: vrDragPoints,
					},
				},
			},
			textboxes: {},
		}

		const viewer = {
			tableGroup,
			table,
			viewerMode: 'play',
			log: () => {},
			player: null,
			dmdTexture: null,
			_dmdOffscreen: null,
			_dmdOffCtx: null,
			dmdMeshes: [] as THREE.Mesh[],
		} as unknown as Record<string, unknown>

		const renderer = new DmdRenderer(viewer as never)
		const scene = new THREE.Group()
		scene.add(tableGroup)
		const api = new ThreeRenderApi()
		api.transformScene(scene as unknown as THREE.Group, table as unknown as never)
		renderer.findMeshes()
		const meshes = (renderer as unknown as { meshes: THREE.Mesh[] }).meshes
		expect(meshes.length, 'should create 1 procedural DMD (VR preferred when cab exists)').toEqual(1)
		const mesh = meshes[0]
		expect(mesh.name, 'VR_DMD must be chosen when VRCab exists (even in play mode)').toMatch(/VR_DMD/)
		expect(
			(mesh.material as THREE.MeshBasicMaterial).depthTest,
			'DMD depth-tests like upstream flasher.cpp so the floor occludes it from below',
		).toEqual(true)
		expect((mesh.material as THREE.MeshBasicMaterial).depthWrite, 'depthWrite false').toEqual(false)
		expect((mesh.material as THREE.MeshBasicMaterial).polygonOffset, 'polygonOffset true').toEqual(true)
		expect((mesh.material as THREE.MeshBasicMaterial).polygonOffsetFactor, 'factor -4').toEqual(-4)
		expect((mesh.material as THREE.MeshBasicMaterial).polygonOffsetUnits, 'units -8').toEqual(-8)
		expect(mesh.renderOrder, 'renderOrder 20').toEqual(20)
		expect(mesh.userData.isProceduralDMD, 'isProceduralDMD flag').toEqual(true)

		scene.updateMatrixWorld(true)
		const worldPos = new THREE.Vector3()
		mesh.getWorldPosition(worldPos)
		expect(worldPos.y, 'DMD world Y must be positive above playfield (height negated)').toBeGreaterThan(20)
		expect(worldPos.y, 'DMD world Y ~31 for height 620').toBeCloseTo(31, 1)
		expect(worldPos.z, 'VR_DMD world Z must be > -50 (more south than desktop -54)').toBeGreaterThan(-50)
		expect(worldPos.z, 'VR_DMD world Z ~ -45').toBeCloseTo(-45, 0)

		const box = new THREE.Box3().setFromObject(mesh)
		expect(box.isEmpty(), 'box not empty').toEqual(false)
		expect(box.min.y, 'DMD box min Y must be > 20 (above playfield)').toBeGreaterThan(20)
	})

	it('without cab must prefer desktop DMD', async () => {
		const { DmdRenderer } = await import('../../../demo-browser/src/dmd/dmd-renderer.js')
		mockDocument()
		const tableGroup = new THREE.Group()
		tableGroup.name = 'tableGroup'

		const desktopDragPoints = [
			{ vertex: { x: 0, y: 0 } },
			{ vertex: { x: 600, y: 0 } },
			{ vertex: { x: 600, y: 160 } },
			{ vertex: { x: 0, y: 160 } },
		]
		const vrDragPoints = [
			{ vertex: { x: 0, y: 0 } },
			{ vertex: { x: 600, y: 0 } },
			{ vertex: { x: 600, y: 160 } },
			{ vertex: { x: 0, y: 160 } },
		]
		const table: Record<string, unknown> = {
			data: { left: 0, right: 952, top: 0, bottom: 2247 },
			getDimensions: () => ({ width: 952, height: 2247 }),
			flashers: {
				DMD: {
					getName: () => 'DMD',
					data: {
						isDMD: true,
						isVisible: true,
						// Real FlasherData shape: center is a method, not a property.
						getCenter: () => bboxCenter(desktopDragPoints),
						height: 635,
						rotX: -87,
						rotY: 0,
						rotZ: 0,
						dragPoints: desktopDragPoints,
					},
				},
				VR_DMD: {
					getName: () => 'VR_DMD',
					data: {
						isDMD: true,
						isVisible: false,
						// Real FlasherData shape: center is a method, not a property.
						getCenter: () => bboxCenter(vrDragPoints),
						height: 620.21,
						rotX: -88,
						rotY: 0,
						rotZ: 0,
						dragPoints: vrDragPoints,
					},
				},
			},
			textboxes: {},
		}
		const viewer = {
			tableGroup,
			table,
			viewerMode: 'play',
			log: () => {},
			player: null,
			dmdMeshes: [] as THREE.Mesh[],
		} as unknown as Record<string, unknown>
		const renderer = new DmdRenderer(viewer as never)
		const scene = new THREE.Group()
		scene.add(tableGroup)
		const api = new ThreeRenderApi()
		api.transformScene(scene as unknown as THREE.Group, table as unknown as never)
		renderer.findMeshes()
		const meshes = (renderer as unknown as { meshes: THREE.Mesh[] }).meshes
		expect(meshes.length).toEqual(1)
		expect(meshes[0].name, 'without cab should pick desktop DMD').toMatch(/^DMD_DMD$/)
	})

	it('pins procedural DMD placement to the true flasher center (never a hardcoded point)', async () => {
		const { DmdRenderer, getFlasherCenter } = await import('../../../demo-browser/src/dmd/dmd-renderer.js')
		mockDocument()
		const tableGroup = new THREE.Group()
		tableGroup.name = 'tableGroup'

		// Bbox center (200, 900): far from both the old (470, 40) mesh fallback and the old (0, 0) getPos fallback.
		const dragPoints = [
			{ vertex: { x: 100, y: 800 } },
			{ vertex: { x: 300, y: 800 } },
			{ vertex: { x: 300, y: 1000 } },
			{ vertex: { x: 100, y: 1000 } },
		]
		const table: Record<string, unknown> = {
			data: { left: 0, right: 600, top: 0, bottom: 1200 },
			getDimensions: () => ({ width: 600, height: 1200 }),
			flashers: {
				DMD: {
					getName: () => 'DMD',
					data: {
						isDMD: true,
						isVisible: true,
						// Real FlasherData shape: center is a method, not a property.
						getCenter: () => bboxCenter(dragPoints),
						height: 100,
						rotX: 0,
						rotY: 0,
						rotZ: 0,
						dragPoints,
					},
				},
			},
			textboxes: {},
		}
		const viewer = {
			tableGroup,
			table,
			viewerMode: 'play',
			log: () => {},
			player: null,
			dmdMeshes: [] as THREE.Mesh[],
		} as unknown as Record<string, unknown>
		const renderer = new DmdRenderer(viewer as never)
		renderer.findMeshes()
		const meshes = (renderer as unknown as { meshes: THREE.Mesh[] }).meshes
		expect(meshes.length).toEqual(1)
		expect(meshes[0].position.x, 'procedural DMD x pins to getCenter()').toBeCloseTo(200, 6)
		expect(meshes[0].position.y, 'procedural DMD y pins to getCenter()').toBeCloseTo(900, 6)
		expect(
			meshes[0].position.x === 470 && meshes[0].position.y === 40,
			'must not use the hardcoded (470, 40) fallback',
		).toEqual(false)

		// Helper contract: data.getCenter() wins; then drag-point bbox; then textbox v1/v2; then table center.
		expect(getFlasherCenter({ data: { getCenter: () => ({ x: 1, y: 2 }) } }, { x: 9, y: 9 })).toEqual({
			x: 1,
			y: 2,
		})
		expect(getFlasherCenter({ data: { dragPoints } }, { x: 9, y: 9 })).toEqual({ x: 200, y: 900 })
		expect(getFlasherCenter({ data: { v1: { x: 0, y: 0 }, v2: { x: 100, y: 50 } } }, { x: 9, y: 9 })).toEqual({
			x: 50,
			y: 25,
		})
		expect(getFlasherCenter({ data: {} }, { x: 300, y: 600 })).toEqual({ x: 300, y: 600 })
	})
})
