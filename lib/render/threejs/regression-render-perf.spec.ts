// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix3D } from '../../math/matrix.js'
import { LightState } from '../../vpt/light/light.js'
import { createPrimitiveBdlMaterial } from './nodes/primitive-bdl-node.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

describe('regression: render hotpath zero-allocation', () => {
	it('ThreeRenderApi.applyMatrixToNode must correctly apply Matrix3D to Object3D', () => {
		const api = new ThreeRenderApi()
		const m = Matrix3D.claim()
		m.identity()
		m.elements[12] = 100
		m.elements[13] = 200
		m.elements[14] = 50
		const obj = new THREE.Group()
		api.applyMatrixToNode(m, obj)
		// matrix is applied direct (no SCALE here): translation must land exactly
		expect(obj.position.x).toBe(100)
		expect(obj.position.y).toBe(200)
		expect(obj.position.z).toBe(50)
		expect(obj.quaternion.x).toBe(0)
		expect(obj.quaternion.y).toBe(0)
		expect(obj.quaternion.z).toBe(0)
		expect(obj.quaternion.w).toBe(1)
		expect(obj.scale.x).toBe(1)
		expect(obj.scale.y).toBe(1)
		expect(obj.scale.z).toBe(1)
		// second call must fully overwrite (scratch reuse must not leak)
		const m2 = Matrix3D.claim()
		m2.identity()
		m2.elements[12] = -50
		api.applyMatrixToNode(m2, obj)
		expect(obj.position.x).toBe(-50)
		expect(obj.position.y).toBe(0)
		expect(obj.position.z).toBe(0)
		Matrix3D.release(m, m2)
	})

	it('ThreeLightGenerator.applyLighting must correctly update light/bulb/surface', () => {
		const gen = new ThreeLightGenerator()
		const group = new THREE.Group()
		group.name = 'testLight'
		const point = new THREE.PointLight(0xffffff, 1, 100, 2)
		point.name = 'light'
		// Production bulb/surface glass uses BDL node materials, whose
		// colorNode/emissiveNode ignore the classic slots: lamp state must
		// leave their uniforms untouched (upstream static glass).
		const bulbMat = createPrimitiveBdlMaterial({ albedo: 0x000000, opacity: 0.2 })
		const bulb = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bulbMat as any)
		bulb.name = 'bulb.light'
		const surfMat = createPrimitiveBdlMaterial({ albedo: 0x101010 })
		const surface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), surfMat as any)
		surface.name = 'surface.light'
		group.add(point)
		group.add(bulb)
		group.add(surface)
		gen.applyLighting(LightState.claim('testLight', 2, 0xff0000, 0xff0000), group)
		expect(point.intensity).toBe(2)
		expect(point.color.getHex()).toBe(0xff0000)
		const bulbUd = bulbMat.userData as Record<string, { value: any }>
		expect((bulbUd.__uAlbedo.value as THREE.Color).getHex()).toBe(0x000000)
		expect(bulbUd.__uAlpha.value).toBeCloseTo(0.2, 5)
		const surfUd = surfMat.userData as Record<string, { value: any }>
		expect((surfUd.__uAlbedo.value as THREE.Color).getHex()).toBe(0x101010)
		// verify children iteration works without array alloc — call with single child
		const solo = new THREE.Group()
		solo.name = 'solo'
		const soloLight = new THREE.PointLight(0x00ff00, 5, 100, 2)
		soloLight.name = 'light'
		solo.add(soloLight)
		gen.applyLighting(LightState.claim('solo', 10, 0x00ff00, 0x00ff00), solo)
		expect(soloLight.intensity).toBe(10)
	})
})
