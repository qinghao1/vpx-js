import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { cloneMaterialForWrite } from './material-shared.js'
import { createPrimitiveBdlMaterial } from './nodes/primitive-bdl-node.js'
import { graphReferences, materialize } from './nodes/tsl-test-harness.js'
import { isBakedNodeMaterial } from './nodes/unshaded-baked-node.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'
import { getTransmissionTexture } from './transmission-buffer.js'

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

	it('refreshes the cutout when a script swaps the image on an already-cutout material', () => {
		// Native re-reads img->m_alphaTestValue every frame (primitive.cpp), so a
		// script image swap must follow the arriving image, not the stale stash.
		const tex = makeTex()
		;(tex as any).userData = { alphaTestValue: 0.5 }
		const textures = new Map<string, DataTexture>([['imageb', tex]])
		const generator = makeGenerator(textures)
		const mat = new MeshStandardMaterial({ color: 0x000000 }) as any
		mat.userData.__alphaTestValue = 1 / 255
		mat.alphaTest = 1 / 255
		generator.applyMap(mat, 'imageb')
		expect(mat.map, 'swapped map bound').toBe(tex)
		expect(mat.userData.__alphaTestValue, 'stash follows the arriving image').toBeCloseTo(0.5, 10)
		expect(mat.alphaTest, 'cutout follows the arriving image').toBeCloseTo(0.5, 10)
	})

	it('refreshes the cutout through the node-map route when a script swaps the image', () => {
		// Production script swaps run the node-map route (setPrimitiveMap),
		// not the classic slot — the refresh must work there too.
		const texA = makeTex()
		;(texA as any).userData = { alphaTestValue: 1 / 255 }
		const texB = makeTex()
		;(texB as any).userData = { alphaTestValue: 0.5 }
		const textures = new Map<string, DataTexture>([
			['imagea', texA],
			['imageb', texB],
		])
		const generator = makeGenerator(textures)
		const mat: any = (generator as any).getMaterial(
			{ name: 'NodeSwap', baseColor: 0xffffff } as any,
			'imagea',
			undefined,
			undefined,
			undefined,
			false,
			0,
			undefined,
			false,
			undefined,
			1 / 255,
		)
		expect(mat.alphaTest, 'cutout known at creation').toBeCloseTo(1 / 255, 10)
		generator.applyMap(mat, 'imageb')
		expect(mat.userData.__map, 'swapped map bound').toBe(texB)
		expect(mat.userData.__alphaTestValue, 'stash follows the arriving image').toBeCloseTo(0.5, 10)
		expect(mat.alphaTest, 'cutout follows the arriving image').toBeCloseTo(0.5, 10)
	})

	it('keeps the stale cutout when a script swaps in a cutout-less image', () => {
		// Known native divergence, pinned not fixed: native re-reads
		// img->m_alphaTestValue every frame and would disable the cutout for
		// the new image, while restoreCutout keeps the stale threshold when
		// the arriving image carries no valid cutout.
		const textures = new Map<string, DataTexture>([['imageb', makeTex()]])
		const generator = makeGenerator(textures)
		const mat = new MeshStandardMaterial({ color: 0x000000 }) as any
		mat.userData.__alphaTestValue = 1 / 255
		mat.alphaTest = 1 / 255
		generator.applyMap(mat, 'imageb')
		expect(mat.map, 'swapped map bound').toBe(textures.get('imageb'))
		expect(mat.userData.__alphaTestValue, 'stale stash kept').toBeCloseTo(1 / 255, 10)
		expect(mat.alphaTest, 'stale cutout kept').toBeCloseTo(1 / 255, 10)
	})

	it('restores the file cutout stashed on the arriving texture when creation knew none', () => {
		// Royal Flush 1976 instruction cards: the material is created while the
		// map still streams, so creation stashes 0 ("unknown"). The map
		// generator stashes the file ALTV on the arriving texture; a 0 stash
		// must not shadow it or the transparent texels render black.
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = (generator as any).getMaterial(
			{ name: 'Plastic with an image', baseColor: 0xffffff } as any,
			'instcard5balls',
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
		expect(mat.userData.__alphaTestValue, 'unknown at creation').toEqual(0)
		expect(mat.alphaTest, 'no cutout before arrival').toEqual(0)
		const tex = makeTex()
		;(tex as any).userData = { alphaTestValue: 1 / 255 }
		textures.set('instcard5balls', tex)
		expect(generator.resolvePendingTextures(), 'arrival attaches').toEqual(1)
		expect(mat.alphaTest, 'file cutout must be restored on arrival').to.be.closeTo(1 / 255, 1e-6)
	})

	it('lights mapless bake-named materials with the authored baseColor as albedo (upstream lit parity)', () => {
		// A bake name without a referenced texture has no bake texels to show;
		// the unlit baked path would render the raw author tint flat (near-black
		// for dark bake materials such as VLM.Bake.Active). Upstream renders those
		// live parts lit (src/parts/flipper.cpp Flipper::Render draws through the
		// lit basic shader), so they take the lit primitive path instead.
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = generator.getMaterial({ name: 'VLM.Bake', baseColor: 0xff0000 } as any)
		expect(mat.userData.__primitiveKind, 'mapless bake must take the lit BDL path').toEqual('bdl')
		expect(mat.userData.__uAlbedo.value.getHex(), 'lit albedo must carry baseColor').toEqual(0xff0000)
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

	it('resolves pending maps on forked scene materials the cache never sees', () => {
		// Forked scene materials never enter the cache, so cache-only resolve
		// misses them; stream/demand resolve must go through
		// resolvePendingInScene(tableGroup) (plus cache-only for detached mats).
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = (generator as any).getMaterial(
			{ name: 'Some_Primitive', baseColor: 0xffffff } as any,
			'scriptimage',
		)
		expect(mat.userData.pendingMap).toEqual('scriptimage')
		const fork: any = cloneMaterialForWrite(mat)
		expect(Object.values((generator as any).cachedMaterials)).not.toContain(fork)
		const group = new Group()
		group.add(new Mesh(new BoxGeometry(1, 1, 1), fork))
		textures.set('scriptimage', makeTex())
		generator.resolvePendingTextures()
		expect(fork.userData.pendingMap, 'cache-only resolve misses the fork').toEqual('scriptimage')
		expect(generator.resolvePendingInScene(group), 'scene resolve binds the fork').toEqual(1)
		expect(fork.userData.pendingMap).toBeUndefined()
		expect(fork.userData.__map).toBe(textures.get('scriptimage'))
	})

	it('never stashes pendingEmissiveMap on primitive node materials', () => {
		// Primitives carry no emissive path: the arrival branch deletes this
		// key unbound and no resolver consumes it, so stashing it only makes
		// demandPendingMaps load a texture nobody binds.
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		const mat: any = createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 })
		generator.applyEmissiveMap(mat, { name: 'p', baseColor: 0xffffff } as any, 'emissiveonly')
		expect(mat.userData.pendingEmissiveMap).toBeUndefined()
	})

	it('drops legacy pendingEmissiveMap on primitive node materials instead of binding it', () => {
		// The immediate path ignores primitive emissiveMap (no native slot), so the
		// arrival path must agree: purge the key unbound rather than binding it.
		const tex = makeTex()
		const textures = new Map<string, DataTexture>([['emissiveonly', tex]])
		const generator = makeGenerator(textures)
		const mat: any = createPrimitiveBdlMaterial({ albedo: 0xffffff, opacity: 1, bdl: 0 })
		mat.userData.pendingEmissiveMap = 'emissiveonly'
		const fixed = (generator as any).resolvePendingOnMaterial(mat)
		expect(fixed).toEqual(0)
		expect(mat.emissiveMap ?? null).toBeNull()
		expect(mat.userData.pendingEmissiveMap).toBeUndefined()
	})

	it('routes baked tint refresh through the node rebuild so the bulb lift survives arrival', () => {
		// Hand-building colorNode here would drop the transmission lift; the node
		// branch must rebuild the authored graph (tint uniform + bulb tail) instead.
		const generator = makeGenerator(new Map())
		const mat: any = (generator as any).getMaterial({ name: 'VLM.Bake', baseColor: 0xffffff } as any, 'bakemap')
		expect(isBakedNodeMaterial(mat)).toBe(true)
		const tex = makeTex()
		;(tex as any).name = 'bakemap'
		const changed = (generator as any).refreshBakedMapTint(mat, tex, mat.userData)
		expect(changed).toBe(true)
		expect(mat.userData.__map).toBe(tex)
		const color = materialize(mat.colorNode)
		expect(graphReferences(color, getTransmissionTexture()), 'arrived bake keeps the bulb lift').toBe(true)
	})

	it('resolves script-applied normal/env/emissive maps on baked materials', () => {
		// The arrival path binds these via the classic slots, so resolve must
		// too — otherwise a baked material whose script-applied map arrives via
		// stream/demand stays stranded with its pending key forever.
		const textures = new Map<string, DataTexture>()
		const generator = makeGenerator(textures)
		// A referenced (still streaming) bake texture keeps the material on the
		// unlit baked path; a bake name with no texture reference at all renders
		// lit instead (upstream lit live-part parity).
		const mat: any = (generator as any).getMaterial({ name: 'VLM.Bake', baseColor: 0xffffff } as any, 'bakemap')
		expect(mat.userData.__isBaked).toBe(true)
		generator.applyNormalMap(mat, 'bakenormal')
		generator.applyEnvMap(mat, 'bakeenv')
		generator.applyEmissiveMap(mat, { name: 'VLM.Bake', baseColor: 0xffffff } as any, 'bakeemissive')
		expect(mat.userData.pendingNormalMap).toEqual('bakenormal')
		const tex = makeTex()
		textures.set('bakenormal', tex)
		textures.set('bakeenv', tex)
		textures.set('bakeemissive', tex)
		expect(generator.resolvePendingTextures()).toEqual(3)
		expect(mat.userData.pendingNormalMap).toBeUndefined()
		expect(mat.userData.pendingEnvMap).toBeUndefined()
		expect(mat.userData.pendingEmissiveMap).toBeUndefined()
		expect(mat.normalMap).toBe(tex)
		expect(mat.envMap).toBe(tex)
		expect(mat.emissiveMap).toBe(tex)
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
