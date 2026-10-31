// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { type BufferAttribute, type BufferGeometry, Color, CustomBlending, Group, Mesh, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { getAuthoredVisible, setAuthoredVisible } from '../authored-visible.js'
import { ThreeLightGenerator } from '../three-light-generator.js'
import {
	createBulbGlowNodeMaterial,
	createMergedBulbGlowMaterial,
	isBulbGlowMaterial,
	isMergedBulbGlowMaterial,
	type MergedBulbGlowRef,
	mergeBulbGlowQuads,
	setMergedBulbGlowRangeState,
} from './bulb-glow-node.js'

function glowQuad(color: number, intensity: number): Mesh {
	const geo = new PlaneGeometry(200, 200)
	geo.translate(500, 1000, -5)
	const mat = createBulbGlowNodeMaterial({
		color,
		color2: 0x0000ff,
		centerX: 500,
		centerY: 1000,
		falloff: 200,
		falloffPower: 2,
		intensity,
		modulateVsAdd: 0.9,
	})
	const mesh = new Mesh(geo, mat)
	mesh.name = 'bulb.glow'
	mesh.matrixAutoUpdate = false
	setAuthoredVisible(mesh, true)
	return mesh
}

function tableStub(): unknown {
	const light = (intensity: number) => ({
		data: {
			center: { x: 500, y: 1000 },
			intensity,
			color: 0xff0000,
			color2: 0x0000ff,
			bulbLight: true,
			transmissionScale: 1,
			falloff: 200,
			falloffPower: 2,
			bulbModulateVsAdd: 0.9,
		},
	})
	return { data: { right: 1000, bottom: 2000 }, lights: { lampA: light(10), lampB: light(10) } }
}

function twoLampRoot(): { root: Group; quadA: Mesh; quadB: Mesh } {
	const root = new Group()
	const groupA = new Group()
	groupA.name = 'lampA'
	const groupB = new Group()
	groupB.name = 'lampB'
	const quadA = glowQuad(0xff0000, 10)
	const quadB = glowQuad(0x00ff00, 10)
	groupA.add(quadA)
	groupB.add(quadB)
	root.add(groupA, groupB)
	return { root, quadA, quadB }
}

describe('merged bulb-glow composite', () => {
	it('creates a flagged native-composite material', () => {
		const mat = createMergedBulbGlowMaterial()
		expect(isMergedBulbGlowMaterial(mat)).to.equal(true)
		expect(isBulbGlowMaterial(mat)).to.equal(false)
		expect(mat.transparent).to.equal(true)
		expect(mat.depthWrite).to.equal(false)
		expect(mat.depthTest).to.equal(true)
		expect(mat.blending).to.equal(CustomBlending)
	})

	it('folds two quads into one draw with per-lamp parameter attributes', () => {
		const { root, quadA, quadB } = twoLampRoot()
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(2)
		const merged = root.getObjectByName('merged:bulb.glow') as Mesh
		expect(merged).toBeDefined()
		expect(merged.renderOrder).to.equal(10)
		const geo = merged.geometry as BufferGeometry
		// 2 planes x 4 verts.
		expect(geo.getAttribute('position').count).to.equal(8)
		expect((geo.getIndex() as BufferAttribute).count).to.equal(12)
		expect(quadA.visible).to.equal(false)
		expect(quadB.visible).to.equal(false)
		const refA = quadA.userData.__mergedGlow as MergedBulbGlowRef
		const refB = quadB.userData.__mergedGlow as MergedBulbGlowRef
		expect(refA.mesh).to.equal(merged)
		expect(refB.mesh).to.equal(merged)
		expect(refB.start).to.equal(refA.start + refA.count)
		// Baked params mirror the per-quad material uniforms: center, inverse
		// falloff, power, linear-space ramp colors, live intensity + modulate m.
		const center = geo.getAttribute('aGlowCenter') as BufferAttribute
		expect(Array.from((center.array as Float32Array).slice(0, 2))).to.deep.equal([500, 1000])
		const params = geo.getAttribute('aGlowParams') as BufferAttribute
		expect((params.array as Float32Array)[0]).to.be.closeTo(1 / 200, 1e-9)
		expect((params.array as Float32Array)[1]).to.equal(2)
		const expectedRed = new Color(0xff0000)
		const color = geo.getAttribute('aGlowColor') as BufferAttribute
		const rangeA = refA
		expect((color.array as Float32Array)[rangeA.start * 3]).to.be.closeTo(expectedRed.r, 1e-6)
		const dyn = geo.getAttribute('aGlowDyn') as BufferAttribute
		expect((dyn.array as Float32Array)[rangeA.start * 2]).to.equal(10)
		// Float32 attribute storage cannot represent 0.9 (error ~1.5e-9), so the
		// tolerance matches the 1e-6 used for colors elsewhere in this file.
		expect((dyn.array as Float32Array)[rangeA.start * 2 + 1]).to.be.closeTo(0.9, 1e-6)
	})

	it('updates live lamp state in place without reallocating', () => {
		const { root, quadA } = twoLampRoot()
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(2)
		const ref = quadA.userData.__mergedGlow as MergedBulbGlowRef
		const geo = ref.mesh.geometry as BufferGeometry
		const dyn = geo.getAttribute('aGlowDyn') as BufferAttribute
		const color = geo.getAttribute('aGlowColor') as BufferAttribute
		const dynArray = dyn.array
		const colorArray = color.array
		const before = (dynArray as Float32Array)[ref.start * 2]
		expect(before).to.equal(10)
		setMergedBulbGlowRangeState(ref.mesh, ref, { intensity: 3, color: 0x0000ff })
		expect(dyn.array).to.equal(dynArray)
		expect(color.array).to.equal(colorArray)
		expect((dynArray as Float32Array)[ref.start * 2]).to.equal(3)
		const expectedBlue = new Color(0x0000ff)
		expect((colorArray as Float32Array)[ref.start * 3]).to.be.closeTo(expectedBlue.r, 1e-6)
		expect((colorArray as Float32Array)[ref.start * 3 + 2]).to.be.closeTo(expectedBlue.b, 1e-6)
	})

	it('routes light-updater state into the merged range and keeps the legacy quad hidden', () => {
		const { root, quadA } = twoLampRoot()
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(2)
		const generator = new ThreeLightGenerator()
		const group = quadA.parent as Group
		generator.applyLighting({ intensity: 5, color: 0xffffff } as never, group)
		const ref = quadA.userData.__mergedGlow as MergedBulbGlowRef
		const dyn = (ref.mesh.geometry as BufferGeometry).getAttribute('aGlowDyn') as BufferAttribute
		expect((dyn.array as Float32Array)[ref.start * 2]).to.equal(5)
		expect(quadA.visible).to.equal(false)
	})

	it('leaves a lone quad on the legacy path', () => {
		const root = new Group()
		const group = new Group()
		group.name = 'lampA'
		const quad = glowQuad(0xff0000, 10)
		group.add(quad)
		root.add(group)
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(0)
		expect(root.getObjectByName('merged:bulb.glow')).toBeUndefined()
		expect(quad.visible).to.equal(true)
	})

	it('skips authored-invisible quads and quads without lamp params', () => {
		const { root, quadA, quadB } = twoLampRoot()
		setAuthoredVisible(quadB, false)
		expect(getAuthoredVisible(quadB)).to.equal(false)
		// Only one mergeable quad remains (quadA); quadB has no table entry either.
		const table = { data: { right: 1000, bottom: 2000 }, lights: {} }
		expect(mergeBulbGlowQuads(root, table)).to.equal(0)
		expect(quadA.visible).to.equal(true)
		expect(quadB.visible).to.equal(true)
	})

	it('skips quads under non-similarity transforms', () => {
		const { root, quadA, quadB } = twoLampRoot()
		// Non-uniform stretch: baking it would warp the radial halo.
		quadB.matrix.makeScale(2, 1, 1)
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(0)
		expect(quadA.visible).to.equal(true)
		expect(quadB.visible).to.equal(true)
	})

	it('bakes a uniform parent scale into positions, center, and falloff', () => {
		const { root, quadA } = twoLampRoot()
		// Converter leaves mesh matrices identity; a scaled light group must
		// still merge, with the similarity baked into vertices and center.
		for (const group of root.children as Group[]) group.scale.setScalar(2)
		expect(mergeBulbGlowQuads(root, tableStub())).to.equal(2)
		const ref = quadA.userData.__mergedGlow as MergedBulbGlowRef
		const geo = ref.mesh.geometry as BufferGeometry
		const center = geo.getAttribute('aGlowCenter') as BufferAttribute
		expect((center.array as Float32Array)[0]).to.equal(1000)
		expect((center.array as Float32Array)[1]).to.equal(2000)
		const params = geo.getAttribute('aGlowParams') as BufferAttribute
		// |2p − 2c| / 400 == |p − c| / 200: the shader sees the same len.
		expect((params.array as Float32Array)[0]).to.be.closeTo(1 / 400, 1e-9)
		const positions = geo.getAttribute('position') as BufferAttribute
		const src = (quadA.geometry as BufferGeometry).getAttribute('position') as BufferAttribute
		expect((positions.array as Float32Array)[ref.start * 3]).to.be.closeTo((src.array as Float32Array)[0] * 2, 1e-6)
	})
})
