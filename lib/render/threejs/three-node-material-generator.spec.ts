// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { DataTexture, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { graphReferences, materialize } from './nodes/tsl-test-harness.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

/** Named-arg helper over getMaterial's positional params for the additive path. */
function additiveMaterial({ mapName }: { mapName: string }): any {
	const tex = new DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1)
	tex.name = mapName
	const generator = new ThreeNodeMaterialGenerator({
		hasTexture: () => true,
		getTexture: () => tex,
	} as any)
	return generator.getMaterial(undefined, mapName, undefined, undefined, undefined, true, 0, undefined, true)
}

describe('additive blend parity (upstream flasher.cpp SetupAddBlendState)', () => {
	it('scales the positive tint/intensity uniforms on plain additive', () => {
		// Without modulateVsAdd, the overlay stays plain additive.
		const add = additiveMaterial({ mapName: 'flashA' })
		const dag = materialize(add.colorNode)
		expect(graphReferences(dag, add.userData.__uTint), 'additive output scales the positive tint').toBe(true)
		expect(graphReferences(dag, add.userData.__uIntensity), 'additive output scales the positive intensity').toBe(
			true,
		)
	})
})

function openWallGenerator(): any {
	return new ThreeNodeMaterialGenerator({ hasTexture: () => false, getTexture: () => null } as any)
}

describe('explicit texture clear (script-emptied image)', () => {
	function clearGenerator(textures: Map<string, DataTexture>): any {
		return new ThreeNodeMaterialGenerator({
			hasTexture: (name: string) => textures.has(name.toLowerCase()),
			getTexture: (name: string) => textures.get(name.toLowerCase()),
		} as any)
	}

	function makeTex(): DataTexture {
		const tex = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
		tex.needsUpdate = true
		return tex
	}

	it('clears the slot and ignores late arrivals of the cleared name', () => {
		const textures = new Map<string, DataTexture>([['d_5', makeTex()]])
		const generator = clearGenerator(textures)
		const mat = new MeshStandardMaterial() as any
		generator.applyMap(mat, 'd_5')
		expect(mat.map, 'map bound').not.toBeNull()
		// `needsUpdate` is setter-only (no readback); the version bump is the observable.
		const version = mat.version
		generator.applyMap(mat, '')
		expect(mat.map, 'slot unbound').toBeNull()
		expect(mat.userData.pendingMap, 'no pending key').toBeUndefined()
		expect(mat.version, 'program invalidated').toBeGreaterThan(version)
		textures.delete('d_5')
		generator.applyMap(mat, 'd_5')
		expect(mat.userData.pendingMap, 'streams').toBe('d_5')
		generator.applyMap(mat, '')
		textures.set('d_5', makeTex())
		const root = new Group()
		const mesh = new Mesh()
		mesh.material = mat
		root.add(mesh)
		expect(generator.resolvePendingInScene(root), 'cleared name stays unbound').toBe(0)
		expect(mat.map, 'slot stays empty').toBeNull()
	})

	it('clears the legacy pending spelling too', () => {
		const textures = new Map<string, DataTexture>()
		const generator = clearGenerator(textures)
		const mat = new MeshStandardMaterial() as any
		mat.userData.pendingmap = 'd_5'
		generator.applyMap(mat, '')
		expect(mat.userData.pendingMap, 'no canonical pending key').toBeUndefined()
		expect(mat.userData.pendingmap, 'no legacy pending key').toBeUndefined()
		textures.set('d_5', makeTex())
		const root = new Group()
		const mesh = new Mesh()
		mesh.material = mat
		root.add(mesh)
		expect(generator.resolvePendingInScene(root), 'legacy spelling stays unbound').toBe(0)
		expect(mat.map, 'slot stays empty').toBeNull()
	})
})

function wallInfo(backfacesEnabled: boolean, indices: number[]): any {
	return {
		material: {
			name: 'wallmat',
			baseColor: 0xffffff,
			isMetal: false,
			roughness: 0.5,
			isOpacityActive: false,
			opacity: 1,
			emissiveIntensity: 0,
		},
		map: undefined,
		normalMap: undefined,
		envMap: undefined,
		isTransparent: false,
		depthBias: 0,
		disableLighting: 0,
		addBlend: false,
		backfacesEnabled,
		mesh: { indices },
	} as any
}

// Open quad (boundary edges on every rim edge) vs closed tetrahedron (every
// edge shared by two triangles): same file material, backfacesEnabled=false.
const OPEN_QUAD = [0, 1, 2, 0, 2, 3]
const CLOSED_TETRA = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]
// Same quad with both windings: every edge has even uses, so the
// drawTexturesInside-style doubling reads closed, not open.
const DOUBLED_QUAD = [0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]

const wallOpts = { applyMaterials: true, applyTextures: true } as any

describe('bulb-glow cache splits by halo profile', () => {
	function bulbInfo(falloff: number): any {
		return {
			bulbGlow: {
				color: 0xffffff,
				color2: 0xffffff,
				centerX: 0,
				centerY: 0,
				falloff,
				falloffPower: 2,
				intensity: 1,
				modulateVsAdd: 0.9,
			},
			material: { name: 'Lamp' },
		}
	}

	it('shares same-profile lamps and splits different falloffs', () => {
		const generator = openWallGenerator()
		const a: any = generator.getInitialMaterial(bulbInfo(50), wallOpts)
		const same: any = generator.getInitialMaterial(bulbInfo(50), wallOpts)
		const other: any = generator.getInitialMaterial(bulbInfo(80), wallOpts)
		expect(same, 'identical profiles share the baked halo').toBe(a)
		expect(other, 'different falloffs must not share the baked halo').not.toBe(a)
	})
})

describe('open-wall primitives render double-sided, closed solids stay single-sided', () => {
	it('renders an open wall-like primitive double-sided despite backfacesEnabled=false', () => {
		const mat: any = openWallGenerator().getInitialMaterial(wallInfo(false, OPEN_QUAD), wallOpts)
		expect(mat.side, 'open sheet must survive outside/behind views').toBe(DoubleSide)
	})

	it('reads a doubled-winding quad as closed (drawTexturesInside composition)', () => {
		const mat: any = openWallGenerator().getInitialMaterial(wallInfo(false, DOUBLED_QUAD), wallOpts)
		expect(mat.side, 'every edge shared by two triangles must stay FrontSide').toBe(FrontSide)
	})

	it('keeps a closed solid single-sided under the same file material (no cache collision)', () => {
		const generator = openWallGenerator()
		const closed: any = generator.getInitialMaterial(wallInfo(false, CLOSED_TETRA), wallOpts)
		expect(closed.side, 'watertight solid must stay FrontSide').toBe(FrontSide)
		const open: any = generator.getInitialMaterial(wallInfo(false, OPEN_QUAD), wallOpts)
		expect(open.side, 'open sheet sharing the material must still double').toBe(DoubleSide)
	})
})
