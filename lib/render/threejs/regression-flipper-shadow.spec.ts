// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { PrimitiveState } from '../../vpt/primitive/primitive-state.js'
import { PrimitiveUpdater } from '../../vpt/primitive/primitive-updater.js'
import { ThreeNodeMaterialGenerator } from './three-node-material-generator.js'

function makeGenerator() {
	return new ThreeNodeMaterialGenerator({
		hasTexture: () => false,
		getTexture: () => undefined,
	} as any)
}

// VPT texture record filed before the texture streams in: the file-level alpha
// signal (Texture::IsOpaque) upstream blends on.
function vptMap(isOpaque: boolean) {
	return { isOpaque, getName: () => (isOpaque ? 'opaque-art' : 'flipperbatshadow') }
}

// Walking Dead bat-shadow decal: opacity-active file material at ~1.0 with an
// alpha-carrying image. Upstream blends (primitive.cpp SetMaterial
// `!img->IsOpaque()`); rendering it opaque draws a dark box around the flipper.
function shadowFileMaterial() {
	return {
		name: 'flipperbatshadow',
		baseColor: 0xffffff,
		isOpacityActive: true,
		opacity: 0.99999,
		roughness: 0,
	} as any
}

function renderInfo(material: any, map: any) {
	return {
		material,
		map,
		normalMap: undefined,
		envMap: undefined,
		isTransparent: false,
		depthBias: 0,
		disableLighting: 0,
		addBlend: false,
		backfacesEnabled: true,
		addBlendMode: undefined,
		disableLightingBelow: 0,
		depthWrite: undefined,
	} as any
}

const convertOpts = { applyMaterials: true, applyTextures: true } as any

/**
 * Walking Dead top-down regression: the flipper bat-shadow decals
 * (batleftshadow/batrightshadow, alpha image on an opacity-active ~1.0
 * material) rendered as opaque dark boxes framing both flippers. The bound
 * three.js texture is still null at creation (textures stream later) and
 * carries no isOpaque flag anyway, so creation dropped the file-level alpha
 * signal and never blended. Upstream blends on the image alpha.
 */
describe('regression: alpha-image decals blend from the first frame', () => {
	it('creates a transparent material for an alpha image on an opacity-active material', () => {
		const mat: any = makeGenerator().getInitialMaterial(
			renderInfo(shadowFileMaterial(), vptMap(false)),
			convertOpts,
		)
		expect(mat.transparent, 'alpha image on opacity-active material must blend').toBe(true)
		expect(mat.depthWrite, 'blended decal must not write depth').toBe(false)
	})

	it('keeps an opaque image on a fully-opaque material opaque', () => {
		const mat: any = makeGenerator().getInitialMaterial(
			renderInfo(
				{ name: 'solid', baseColor: 0xffffff, isOpacityActive: true, opacity: 1, roughness: 0 } as any,
				vptMap(true),
			),
			convertOpts,
		)
		expect(mat.transparent, 'opaque image must stay opaque').toBe(false)
	})

	it('keeps an alpha image opaque when the material has opacity inactive (upstream bOpacityActive gate)', () => {
		const mat: any = makeGenerator().getInitialMaterial(
			renderInfo(
				{ name: 'plain', baseColor: 0xffffff, isOpacityActive: false, opacity: 1, roughness: 0 } as any,
				vptMap(false),
			),
			convertOpts,
		)
		expect(mat.transparent, 'opacity-inactive material must stay opaque').toBe(false)
	})

	it('script updates keep the alpha-image decal blended (creation/updater agreement)', () => {
		// Stub BDL node material as creation now yields it (opaque pre-fix state
		// to prove the updater restores blending instead of agreeing with it).
		const stubMat: any = {
			userData: {
				__primitiveKind: 'bdl',
				__primitiveCloned: true,
				__uAlbedo: { value: { set() {}, getHex: () => 0xffffff } },
				__uAlpha: { value: 1 },
				__uBDL: { value: 0 },
				__uLitF: { value: 1 },
				__uCarry: { value: 0 },
			},
			transparent: false,
			depthWrite: true,
		}
		const data = {
			szImage: 'flipperbatshadow',
			szLightmap: 'LM_shlnk',
			color: 0xffffff,
			alpha: 100,
			disableLightingTop: 0,
			disableLightingBelow: 0,
			staticRendering: false,
		} as any
		const updater = new PrimitiveUpdater(data, new PrimitiveState())
		const table = {
			getMaterial: () => shadowFileMaterial(),
			getTexture: (name: string) =>
				name === 'flipperbatshadow' ? { isOpaque: false, getName: () => name } : undefined,
		} as any
		const renderApi = { applyVisibility: () => {} } as any
		updater.applyState({ children: [{ material: stubMat }] } as any, { alpha: 100 } as any, renderApi, table)
		expect(stubMat.transparent, 'updater must blend the alpha-image decal').toBe(true)
		expect(stubMat.depthWrite, 'updater must keep depthWrite off for the decal').toBe(false)
	})
})
