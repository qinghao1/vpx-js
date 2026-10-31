// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { DataTexture, DoubleSide, FrontSide } from 'three'
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
		// AB_ADD stays plain additive by design; see applyAbsorbBlendState.
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
