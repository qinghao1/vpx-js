import { DataTexture, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { createPrimitiveBdlMaterial } from './nodes/primitive-bdl-node.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

function makeGenerator(textures: Map<string, DataTexture>) {
	return new ThreeNodeMaterialGenerator({
		hasTexture: (name: string) => textures.has(name.toLowerCase()),
		getTexture: (name: string) => textures.get(name.toLowerCase()),
	} as any)
}

function makeTex() {
	const tex = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
	tex.needsUpdate = true
	return tex
}

describe('material arrival: BDL uniforms survive streaming', () => {
	it('attaches the albedo on arrival while uniforms keep script state', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat = createPrimitiveBdlMaterial({ albedo: 0xc8e1ff, opacity: 1, bdl: 7 }) as any
		mat.userData.pendingMap = 'insertrectangle1off'
		;(generator as any).cachedMaterials['k'] = mat
		const fixed = generator.resolvePendingTextures()
		expect(fixed, 'map still streaming').toEqual(0)
		textures.set('insertrectangle1off', makeTex())
		const fixed2 = generator.resolvePendingTextures()
		expect(fixed2, 'arrival attaches').toEqual(1)
		expect(mat.userData.__map, 'map arrived').toBe(textures.get('insertrectangle1off'))
		expect(mat.userData.__uBDL.value, 'script BDL preserved').toEqual(7)
		expect(mat.userData.__uAlbedo.value.getHex(), 'albedo preserved').toEqual(0xc8e1ff)
		expect(mat.emissiveMap, 'BDL shader carries no emissiveMap').toBeNull()
	})

	it('preserves the authored alpha cutout on materials created while streaming', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = (generator as any).getMaterial(
			{ name: 'insertrectangle1off', baseColor: 0xc8e1ff } as any,
			'insertrectangle1off',
			undefined,
			undefined,
			undefined,
			false,
			500,
			undefined,
			false,
			undefined,
			1 / 255,
		)
		expect(mat.userData.__alphaTestValue, 'cutout threshold must be stashed').to.be.closeTo(1 / 255, 1e-6)
		expect(mat.alphaTest, 'cutout must apply even before the map streams').to.be.closeTo(1 / 255, 1e-6)
	})

	it('restores the alpha cutout when the map arrives after the material', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat = new MeshStandardMaterial({ color: 0x000000 }) as any
		mat.userData.__alphaTestValue = 1 / 255
		mat.alphaTest = 0
		generator.applyMap(mat, 'vlm.nestmap0')
		expect(mat.userData.pendingMap).toBe('vlm.nestmap0')
		textures.set('vlm.nestmap0', makeTex())
		generator.applyMap(mat, 'vlm.nestmap0')
		expect(mat.map, 'map arrived').toBe(textures.get('vlm.nestmap0'))
		expect(mat.alphaTest, 'cutout must be restored on arrival').to.be.closeTo(1 / 255, 1e-6)
	})

	it('tints baked node materials with the authored baseColor (classic fixBaked parity)', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = generator.getMaterial({ name: 'VLM.Bake', baseColor: 0xff0000 } as any)
		expect(mat.userData.__isBaked, 'bake name must take the baked path').toBe(true)
		expect(mat.userData.__uTint.value.getHex(), 'baked tint must carry baseColor').toEqual(0xff0000)
	})

	it('threads file metalness/roughness into BDL materials on the creation path', () => {
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = generator.getMaterial({
			name: 'chromeRail',
			baseColor: 0xc0c0c0,
			isMetal: true,
			roughness: 0.2,
		} as any)
		expect(mat.userData.__primitiveKind, 'must take the BDL path').toEqual('bdl')
		expect(mat.metalness, 'file isMetal must survive creation').toEqual(1)
		expect(mat.roughness, 'file roughness must survive creation as 1 - roughness').toBeCloseTo(0.8, 10)
	})

	it('leaves emissiveMap alone without fullbright intent', () => {
		const textures = new Map<string, DataTexture>([['somewall', makeTex()]])
		const generator = makeGenerator(textures)
		const mat = new MeshStandardMaterial() as any
		generator.applyMap(mat, 'somewall')
		expect(mat.map).toBe(textures.get('somewall'))
		expect(mat.emissiveMap, 'no intent, no mirror').toBeNull()
	})

	it('skips dead classic color/opacity writes on BDL node materials', () => {
		const generator = makeGenerator(new Map())
		const mat = createPrimitiveBdlMaterial({ albedo: 0x112233, opacity: 0.5 }) as any
		generator.applyMaterial(mat, {
			name: 'scriptMat',
			baseColor: 0xff0000,
			isMetal: true,
			roughness: 0.25,
			isOpacityActive: true,
			opacity: 0.9,
		} as any)
		expect(mat.name).toBe('material:scriptMat')
		expect(mat.metalness, 'metalness is live').toBe(1)
		expect(mat.roughness, 'roughness is live').toBeCloseTo(0.75, 10)
		expect(mat.userData.__baseColor, 'baseColor stash kept').toBe(0xff0000)
		expect(mat.color.getHex(), 'classic color is shader-dead on BDL').toBe(0xffffff)
		expect(mat.opacity, 'classic opacity is shader-dead on BDL').toBe(1)
		expect(mat.userData.__uAlbedo.value.getHex(), 'albedo uniform untouched').toBe(0x112233)
		expect(mat.userData.__uAlpha.value, 'alpha uniform untouched').toBe(0.5)
	})
})
