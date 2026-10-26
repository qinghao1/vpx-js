// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import fs from 'node:fs'
import { expect } from 'chai'
import * as THREE from 'three'
import { TableBuilder } from '../../../test/table-builder.js'
import { TestRenderApi } from '../../../test/test-render-api.js'
import {
	createPrimitiveAdditiveMaterial,
	createPrimitiveBdlMaterial,
} from '../../render/threejs/nodes/primitive-bdl-node.js'
import type { Table } from '../table/table.js'
import type { Primitive } from './primitive.js'
import type { PrimitiveState } from './primitive-state.js'

/**
 * Locks PrimitiveUpdater outputs across the vpt/render layering fix: the updater
 * must stop importing render/threejs BDL helpers without changing a single mesh
 * uniform, flag, or fork. Each case below pins the exact post-applyState mesh state.
 */
describe('The VPinball primitive updater regression net', () => {
	let table: Table

	beforeEach(() => {
		table = new TableBuilder()
			.addMaterial('insertOff', { baseColor: 0xc8e1ff })
			.addMaterial('insertOn', { baseColor: 0xffffff })
			.addPrimitive('bevel', { szMaterial: 'insertOff', staticRendering: false, alpha: 100 })
			.addPrimitive('well', { szMaterial: 'insertOn', staticRendering: false, alpha: 100 })
			.addPrimitive('gi', {
				szMaterial: 'insertOn',
				staticRendering: false,
				addBlend: true,
				alpha: 250,
				color: 0x96b4ff,
			})
			.addPrimitive('classic', { szMaterial: 'insertOn', staticRendering: false, alpha: 100 })
			.addPrimitive('staticPrim', {
				szMaterial: 'insertOn',
				staticRendering: true,
				disableLightingBelow: 0,
			})
			.build()
	})

	function whiteTex(): THREE.DataTexture {
		return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
	}

	function apply(name: string, mesh: object, patch: Partial<PrimitiveState>): void {
		const primitive = table.primitives[name] as Primitive | undefined
		if (!primitive) throw new Error(`missing fixture primitive ${name}`)
		primitive.getUpdater().applyState(mesh, patch as PrimitiveState, new TestRenderApi(), table)
	}

	it('pins BDL off-state, HDR overdrive, and undriven uniforms', () => {
		const cases = [
			{
				name: 'bevel',
				patch: { disableLightingTop: 1 },
				albedo: 0xc8e1ff,
				bdl: 1,
				lit: 0,
				carry: 2,
			},
			{
				name: 'well',
				patch: { disableLightingTop: 875 },
				albedo: 0xffffff,
				bdl: 875,
				lit: 0,
				carry: 1750,
			},
			{
				name: 'bevel',
				patch: { disableLightingTop: 0 },
				albedo: 0xc8e1ff,
				bdl: 0,
				lit: 1,
				carry: 0,
			},
		] as const
		for (const c of cases) {
			const mesh = {
				name: c.name,
				material: createPrimitiveBdlMaterial({ map: whiteTex(), albedo: 0xffffff, opacity: 1, bdl: 0 }),
			}
			apply(c.name, mesh, c.patch)
			const mat = mesh.material as any
			expect(mat.userData.__uAlbedo.value.getHex(), `${c.name} BDL=${c.bdl} albedo`).to.equal(c.albedo)
			expect(mat.userData.__uBDL.value, `${c.name} BDL uniform`).to.equal(c.bdl)
			expect(mat.userData.__uDim.value, `${c.name} lit factor`).to.equal(c.lit)
			expect(mat.userData.__uCarry.value, `${c.name} emissive carry`).to.equal(c.carry)
			expect(mat.transparent, `${c.name} stays opaque at alpha 100`).to.equal(false)
			expect(mat.depthWrite, `${c.name} keeps writing depth`).to.equal(true)
		}
	})

	it('pins additive HDR intensity, tint, flags, and empty-add skip', () => {
		const mesh: any = {
			name: 'gi',
			visible: true,
			material: createPrimitiveAdditiveMaterial({ map: whiteTex(), tint: 0xffffff, intensity: 0 }),
		}
		apply('gi', mesh, { alpha: 250 })
		const mat = mesh.material as any
		expect(mat.userData.__uIntensity.value, 'alpha 250 => 2.5x HDR').to.be.closeTo(2.5, 1e-6)
		expect(mat.userData.__uTint.value.getHex(), 'rgb tint stays unscaled').to.equal(0x96b4ff)
		expect(mat.transparent).to.equal(true)
		expect(mat.depthWrite).to.equal(false)
		expect(mat.blending).to.equal(2)
		expect(mesh.visible, 'lit overlay draws').to.equal(true)
		apply('gi', mesh, { alpha: 0 })
		expect(mesh.visible, 'additive with nothing to add skips the draw').to.equal(false)
	})

	it('pins classic-material alpha flags', () => {
		const mesh = { name: 'classic', material: new THREE.MeshStandardMaterial() }
		apply('classic', mesh, { alpha: 50 })
		const mat = mesh.material as any
		expect(mat.opacity, 'alpha 50 => 0.5').to.be.closeTo(0.5, 1e-6)
		expect(mat.transparent).to.equal(true)
		expect(mat.depthWrite).to.equal(false)
	})

	it('pins static below-lighting force-off vs dynamic passthrough', () => {
		const staticMesh = {
			name: 'staticPrim',
			material: createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		apply('staticPrim', staticMesh, { disableLightingBelow: 0 })
		expect((staticMesh.material as any).userData.__below, 'static forces below off').to.equal(1)
		const dynamicMesh = {
			name: 'bevel',
			material: createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 }),
		}
		apply('bevel', dynamicMesh, { disableLightingBelow: 0 })
		expect((dynamicMesh.material as any).userData.__below, 'dynamic keeps authored below').to.equal(0)
	})

	it('pins fork-safe cloning: script writes fork one insert, never its siblings', () => {
		const base = createPrimitiveBdlMaterial({ map: whiteTex(), albedo: 0xffffff, opacity: 1, bdl: 0 })
		const meshA: any = { name: 'bevel', material: base }
		const meshB: any = { name: 'bevel-sibling', material: base }
		apply('bevel', meshA, { color: 0xff0000 })
		expect(meshA.material, 'written insert forks its material').to.not.equal(base)
		expect(meshA.material.userData.__primitiveCloned, 'fork is marked').to.equal(true)
		expect(meshB.material, 'sibling keeps the shared base').to.equal(base)
		expect(base.userData.__uAlbedo.value.getHex(), 'shared base uniforms untouched').to.equal(0xffffff)
		expect((meshA.material as any).userData.__uAlbedo.value.getHex(), 'fork carries base x script tint').to.equal(
			0xc80000,
		)
	})

	it('keeps the updater clear of render/threejs imports (render depends on vpt, never the reverse)', () => {
		const src = fs.readFileSync(new URL('./primitive-updater.ts', import.meta.url), 'utf-8')
		expect(src, 'no value import from the render backend').to.not.match(/from\s+['"]\.\.\/\.\.\/render\/threejs\//)
	})
})
