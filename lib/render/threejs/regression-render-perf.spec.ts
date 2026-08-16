// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as fs from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Matrix3D } from '../../util/matrix.js'
import { ThreeLightGenerator } from './three-light-generator.js'
import { ThreeRenderApi } from './three-render-api.js'

describe('regression: render hotpath zero-allocation', () => {
	it('ThreeRenderApi.applyMatrixToNode must reuse static _scratchM4 not new Matrix4 per frame', () => {
		const src = fs.readFileSync('lib/render/threejs/three-render-api.ts', 'utf-8')
		expect(src, 'must have static _scratchM4').toContain('private static readonly _scratchM4 = new Matrix4()')
		expect(src, 'applyMatrixToNode must use _scratchM4.set not new Matrix4').toContain(
			'ThreeRenderApi._scratchM4.set(',
		)
		expect(src, 'must copy from _scratchM4').toContain('obj.matrix.copy(ThreeRenderApi._scratchM4)')
		const applySrc = src.slice(src.indexOf('applyMatrixToNode'))
		expect(applySrc, 'must not allocate new Matrix4() inside applyMatrixToNode').not.toMatch(/new Matrix4\(\)\.set/)
		expect(applySrc, 'must not allocate new Matrix4()').not.toMatch(/const m4 = new Matrix4/)
	})

	it('ThreeRenderApi.applyMatrixToNode must correctly apply Matrix3D to Object3D', () => {
		const api = new ThreeRenderApi()
		const m = Matrix3D.claim()
		// identity with scale 0.05? Use simple translation
		m.identity()
		m.elements[12] = 100
		m.elements[13] = 200
		m.elements[14] = 50
		const obj = new THREE.Group()
		api.applyMatrixToNode(m, obj)
		// after decompose, position should reflect translation via Matrix4 conversion
		// ThreeRenderApi SCALE=0.05 but matrix is direct, not scaled here
		// We just verify matrix was applied and decomposes without NaN
		expect(obj.position.x).not.toBeNaN()
		expect(obj.quaternion.length()).toBeCloseTo(1, 2)
		// second call should reuse scratch without leaking
		const m2 = Matrix3D.claim()
		m2.identity()
		m2.elements[12] = -50
		api.applyMatrixToNode(m2, obj)
		expect(obj.position.x).not.toBeNaN()
		Matrix3D.release(m, m2)
	})

	it('ThreeLightGenerator.applyLighting must not allocate [obj, ...children] array', () => {
		const src = fs.readFileSync('lib/render/threejs/three-light-generator.ts', 'utf-8')
		expect(src, 'must have _applyLightToTarget helper').toContain('private _applyLightToTarget')
		expect(src, 'applyLighting must call _applyLightToTarget for obj').toContain(
			'this._applyLightToTarget(obj, state, initial)',
		)
		expect(src, 'must iterate children by index').toMatch(/for \(let i = 0; i < children\.length; i\+\+\)/)
		const applySrc = src.slice(src.indexOf('applyLighting'))
		expect(applySrc, 'must not spread children into array').not.toContain('[obj, ...obj.children]')
		expect(applySrc, 'must not allocate targets array').not.toMatch(/const targets = \[/)
	})

	it('ThreeLightGenerator.applyLighting must correctly update light/bulb/surface', () => {
		const gen = new ThreeLightGenerator()
		const group = new THREE.Group()
		group.name = 'testLight'
		const point = new THREE.PointLight(0xffffff, 1, 100, 2)
		point.name = 'light'
		const bulb = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff }) as any,
		)
		bulb.name = 'bulb.light'
		const surface = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial({ emissive: 0xffffff }) as any,
		)
		surface.name = 'surface.light'
		group.add(point)
		group.add(bulb)
		group.add(surface)
		gen.applyLighting({ intensity: 2, color: 0xff0000 }, 1, group)
		expect(point.intensity).toBe(2)
		expect(point.color.getHex()).toBe(0xff0000)
		const bulbMat = bulb.material as THREE.MeshStandardMaterial
		expect(bulbMat.emissiveIntensity).toBeCloseTo(2, 3)
		expect(bulbMat.color.getHex()).toBe(0xff0000)
		const surfMat = surface.material as THREE.MeshStandardMaterial
		expect(surfMat.emissiveIntensity).toBe(2)
		expect(surfMat.emissive.getHex()).toBe(0xff0000)
		// verify children iteration works without array alloc — call with single child
		const solo = new THREE.Group()
		solo.name = 'solo'
		const soloLight = new THREE.PointLight(0x00ff00, 5, 100, 2)
		soloLight.name = 'light'
		solo.add(soloLight)
		gen.applyLighting({ intensity: 10 }, 1, solo)
		expect(soloLight.intensity).toBe(10)
	})
})
