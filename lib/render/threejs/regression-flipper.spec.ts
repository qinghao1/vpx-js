// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataTexture } from 'three'
import { describe, expect, it } from 'vitest'
import { isPrimitiveNodeMaterial } from './nodes/primitive-bdl-node.js'
import { isBakedNodeMaterial } from './nodes/unshaded-baked-node.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

function makeGenerator(textures: Map<string, DataTexture>) {
	return new ThreeNodeMaterialGenerator({
		hasTexture: (name: string) => textures.has(name.toLowerCase()),
		getTexture: (name: string) => textures.get(name.toLowerCase()),
	} as any)
}

function makeTex() {
	const tex = new DataTexture(new Uint8Array([200, 160, 120, 255]), 1, 1)
	tex.needsUpdate = true
	return tex
}

/**
 * Walking Dead top-down regression: the flipper area around the drain rendered
 * black. The live flipper meshes reference a bake-named material
 * (VLM.Bake.Active, dark baseColor) but carry no image, so the generator took
 * the unlit baked path and rendered the raw dark tint flat. Upstream renders
 * the live flipper lit (src/parts/flipper.cpp Flipper::Render draws the bat
 * and rubber through the lit basic shader with the material color), so a
 * mapless bake reference must fall through to the lit primitive path with the
 * authored color as albedo instead of an unlit flat tint.
 */
describe('regression: mapless bake-named flipper parts stay lit', () => {
	it('routes a mapless bake-named material to the lit primitive path', () => {
		const generator = makeGenerator(new Map())
		const mat: any = (generator as any).getMaterial(
			{ name: 'VLM.Bake.Active', baseColor: 0x323232 } as any,
			undefined,
			undefined,
			undefined,
			undefined,
			false,
			0,
			undefined,
			false,
			undefined,
			0,
		)
		expect(isPrimitiveNodeMaterial(mat), 'mapless bake must render lit, not flat-unlit').toBe(true)
		expect(isBakedNodeMaterial(mat), 'mapless bake must not take the unlit bake path').toBe(false)
		expect(mat.userData.__uAlbedo.value.getHex(), 'authored color survives as lit albedo').toEqual(0x323232)
	})

	it('keeps the unlit bake path while a bake texture is referenced', () => {
		const generator = makeGenerator(new Map())
		const mat: any = (generator as any).getMaterial(
			{ name: 'VLM.Bake.Active', baseColor: 0x323232 } as any,
			'vlm.nestmap0',
			undefined,
			undefined,
			undefined,
			false,
			0,
			undefined,
			false,
			undefined,
			0,
		)
		expect(isBakedNodeMaterial(mat), 'referenced bake texture keeps the unlit bake path').toBe(true)
		expect(mat.userData.pendingMap, 'missing bake still streams').toEqual('vlm.nestmap0')
	})

	it('lights a late-arriving map on a mapless bake reference instead of baking it flat', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = (generator as any).getMaterial(
			{ name: 'VLM.Bake.Active', baseColor: 0x323232 } as any,
			undefined,
			undefined,
			undefined,
			undefined,
			false,
			0,
			undefined,
			false,
			undefined,
			0,
		)
		expect(isPrimitiveNodeMaterial(mat), 'precondition: lit path before the map arrives').toBe(true)
		textures.set('flipperbat', makeTex())
		generator.applyMap(mat, 'flipperbat')
		expect(mat.userData.__map, 'late map binds').toBe(textures.get('flipperbat'))
		expect(isPrimitiveNodeMaterial(mat), 'late map stays on the lit path (upstream lit textured flipper)').toBe(
			true,
		)
		expect(isBakedNodeMaterial(mat), 'late map must not switch to the unlit bake path').toBe(false)
	})
})
