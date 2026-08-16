// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as fs from 'node:fs'
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

describe('regression: DMD placement and VR selection (walking_dead)', () => {
	beforeAll(() => mockDocument())

	it('DMD file must be generic — hasCab detection, not viewerMode hack', () => {
		const src = fs.readFileSync('demo-browser/src/dmd/dmd-renderer.ts', 'utf-8')
		expect(src, 'must detect VRCab/cabinet generically (not hardcoded walking_dead)').toMatch(
			/hasCab|VRCab|RE_CAB|\/vrcab/i,
		)
		expect(src, 'must not use viewerMode !== .play. for DMD filtering (was wrong VR_DMD in play)').not.toMatch(
			/wantVR\s*=\s*this\.viewer\.viewerMode/,
		)
		expect(src, 'must reference flasher.cpp height/rot and depthBias -10000 generically').toMatch(/flasher\.cpp/)
		expect(src, 'must negate height via -(d\\.height').toMatch(/-\(d\.height/)
	})

	it('DMD procedural material must emulate vpinball ZWRITE false depthBias -10000 without overlay show-through', () => {
		const src = fs.readFileSync('demo-browser/src/dmd/dmd-renderer.ts', 'utf-8')
		expect(src, 'must use depthTest true depthWrite false').toMatch(/depthTest:\s*true[\s\S]*depthWrite:\s*false/)
		expect(src, 'must not use depthTest: false overlay (caused apron show-through)').not.toMatch(
			/depthTest:\s*false[\s\S]*renderOrder:\s*1000/,
		)
		expect(src, 'polygonOffset must be -4/-8 (stronger than -1, matches -10000)').toMatch(
			/polygonOffsetFactor:\s*-4/,
		)
		expect(src, 'polygonOffsetUnits must be -8').toMatch(/polygonOffsetUnits:\s*-8/)
		expect(src, 'renderOrder must be 20 (after cab 0, before overlay 1000)').toMatch(/renderOrder\s*[:=]\s*20/)
		expect(src, 'must be DoubleSide').toMatch(/DoubleSide/)
	})

	it('DMD world position must be above playfield (height sign correct) per ThreeRenderApi SCALE', async () => {
		const { DmdRenderer } = await import('../../../demo-browser/src/dmd/dmd-renderer.js')
		mockDocument()
		const tableGroup = new THREE.Group()
		tableGroup.name = 'tableGroup'
		const cabMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
		const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), cabMat)
		cab.name = 'VRCab_Backbox'
		tableGroup.add(cab)

		const table: Record<string, unknown> = {
			data: { left: 0, right: 952, top: 0, bottom: 2247 },
			getDimensions: () => ({ width: 952, height: 2247 }),
			flashers: {
				DMD: {
					getName: () => 'DMD',
					data: {
						isDMD: true,
						isVisible: true,
						center: { x: 470.5, y: 37.3785 },
						height: 635,
						rotX: -87,
						rotY: 0,
						rotZ: 0,
						depthBias: 1,
						dragPoints: [
							{ vertex: { x: 135.66, y: -53.49 } },
							{ vertex: { x: 800.66, y: -53.49 } },
							{ vertex: { x: 800.66, y: 127.75 } },
							{ vertex: { x: 135.66, y: 127.75 } },
						],
					},
				},
				VR_DMD: {
					getName: () => 'VR_DMD',
					data: {
						isDMD: true,
						isVisible: false,
						center: { x: 477.5, y: 222.6759 },
						height: 620.21,
						rotX: -88,
						rotY: 0,
						rotZ: 0,
						depthBias: 1,
						dragPoints: [
							{ vertex: { x: 165, y: 133.95 } },
							{ vertex: { x: 790, y: 133.95 } },
							{ vertex: { x: 790, y: 299.57 } },
							{ vertex: { x: 165, y: 299.57 } },
						],
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
		expect(renderer.meshes.length, 'should create 1 procedural DMD (VR preferred when cab exists)').toEqual(1)
		const mesh = renderer.meshes[0] as THREE.Mesh
		expect(mesh.name, 'VR_DMD must be chosen when VRCab exists (even in play mode)').toMatch(/VR_DMD/)
		expect((mesh.material as THREE.MeshBasicMaterial).depthTest, 'material depthTest true').toEqual(true)
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

		const table: Record<string, unknown> = {
			data: { left: 0, right: 952, top: 0, bottom: 2247 },
			getDimensions: () => ({ width: 952, height: 2247 }),
			flashers: {
				DMD: {
					getName: () => 'DMD',
					data: {
						isDMD: true,
						isVisible: true,
						center: { x: 470.5, y: 37.3785 },
						height: 635,
						rotX: -87,
						rotY: 0,
						rotZ: 0,
						dragPoints: [
							{ vertex: { x: 0, y: 0 } },
							{ vertex: { x: 600, y: 0 } },
							{ vertex: { x: 600, y: 160 } },
							{ vertex: { x: 0, y: 160 } },
						],
					},
				},
				VR_DMD: {
					getName: () => 'VR_DMD',
					data: {
						isDMD: true,
						isVisible: false,
						center: { x: 477.5, y: 222.6759 },
						height: 620.21,
						rotX: -88,
						rotY: 0,
						rotZ: 0,
						dragPoints: [
							{ vertex: { x: 0, y: 0 } },
							{ vertex: { x: 600, y: 0 } },
							{ vertex: { x: 600, y: 160 } },
							{ vertex: { x: 0, y: 160 } },
						],
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
		expect(renderer.meshes.length).toEqual(1)
		expect(renderer.meshes[0].name, 'without cab should pick desktop DMD').toMatch(/^DMD_DMD$/)
	})

	it('framing must still keep DMD visible at all aspects (existing regression)', async () => {
		const src = fs.readFileSync('lib/render/threejs/three-camera-framing.ts', 'utf-8')
		expect(src, 'framing must reference ViewSetup FitCameraToVertices').toMatch(/FitCameraToVertices/)
		expect(src, 'framing must keep DMD in size (include VRCab_Cabinet, exclude only legs/VR non-cab)').toMatch(
			/excludeLegsForPlay/,
		)
	})
})
